package services

import (
	"context"
	"fmt"
	"log"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"

	"github.com/yourorg/games_service_go/internal/database"
	"github.com/yourorg/games_service_go/internal/models"
)

// MatchNotifier уведомляет пользователя о найденной паре (например, через WebSocket).
type MatchNotifier interface {
	NotifyMatch(userID int, gameID uuid.UUID)
}

type MatchmakingService struct {
	rdb         *redis.Client
	db          *database.DB
	gameService *GameService
	notifier    MatchNotifier
}

type MatchResult struct {
	Status string    `json:"status"`
	GameID uuid.UUID `json:"game_id,omitempty"`
}

func NewMatchmakingService(rdb *redis.Client, db *database.DB, gameService *GameService) *MatchmakingService {
	return &MatchmakingService{
		rdb:         rdb,
		db:          db,
		gameService: gameService,
	}
}

func (ms *MatchmakingService) SetNotifier(n MatchNotifier) {
	ms.notifier = n
}

func (ms *MatchmakingService) queueKey(tc *models.TimeControl) string {
	format := ms.gameService.getGameFormat(tc)
	timeKey := fmt.Sprintf("%d_%d", tc.InitialMs, tc.IncrementMs)
	return fmt.Sprintf("matchmaking:%s:%s", format, timeKey)
}

func (ms *MatchmakingService) getUserRating(ctx context.Context, userID int, tc *models.TimeControl) (int, error) {
	format := ms.gameService.getGameFormat(tc)

	ratingColumns := map[string]string{
		"bullet":    "bullet_rating",
		"blitz":     "blitz_rating",
		"rapid":     "rapid_rating",
		"classical": "rapid_rating",
	}

	col, ok := ratingColumns[format]
	if !ok {
		col = "rapid_rating"
	}

	var rating int
	query := fmt.Sprintf("SELECT %s FROM users WHERE id = ?", col)
	if err := ms.db.WithContext(ctx).Raw(query, userID).Scan(&rating).Error; err != nil {
		return 0, fmt.Errorf("failed to get user rating: %w", err)
	}
	if rating == 0 {
		rating = 1200
	}
	return rating, nil
}

// Lua script: atomically add player, find closest opponent, remove both if matched.
// KEYS[1] = queue key
// ARGV[1] = member (user:{id})
// ARGV[2] = score (rating)
// Returns: "nil" if no match, or "user:{opponentID}" if matched
var matchmakingLua = redis.NewScript(`
local queue = KEYS[1]
local member = ARGV[1]
local score = tonumber(ARGV[2])

redis.call('ZADD', queue, score, member)

local all = redis.call('ZRANGE', queue, 0, -1, 'WITHSCORES')
if #all < 4 then
    return "nil"
end

local bestMatch = nil
local bestDiff = math.huge

for i = 1, #all, 2 do
    local m = all[i]
    local s = tonumber(all[i+1])
    if m ~= member then
        local diff = math.abs(s - score)
        if diff < bestDiff then
            bestDiff = diff
            bestMatch = m
        end
    end
end

if bestMatch == nil then
    return "nil"
end

redis.call('ZREM', queue, member, bestMatch)
return bestMatch
`)

func (ms *MatchmakingService) Join(ctx context.Context, userID int, tc *models.TimeControl, rated bool) (*MatchResult, error) {
	rating, err := ms.getUserRating(ctx, userID, tc)
	if err != nil {
		return nil, err
	}

	queueKey := ms.queueKey(tc)
	member := fmt.Sprintf("user:%d", userID)

	result, err := matchmakingLua.Run(ctx, ms.rdb, []string{queueKey}, member, rating).Text()
	if err != nil {
		return nil, fmt.Errorf("matchmaking lua error: %w", err)
	}

	if result == "nil" {
		ms.rdb.Expire(ctx, queueKey, 5*time.Minute)
		return &MatchResult{Status: "searching"}, nil
	}

	opponentID, err := parseUserID(result)
	if err != nil {
		return nil, fmt.Errorf("failed to parse opponent id: %w", err)
	}

	gameDetail, err := ms.createMatchedGame(ctx, userID, opponentID, tc, rated)
	if err != nil {
		ms.rdb.ZAdd(ctx, queueKey, redis.Z{Score: float64(rating), Member: member})
		oppRating, _ := ms.getUserRating(ctx, opponentID, tc)
		ms.rdb.ZAdd(ctx, queueKey, redis.Z{Score: float64(oppRating), Member: result})
		return nil, fmt.Errorf("failed to create matched game: %w", err)
	}

	log.Printf("Matchmaking: matched user:%d (rating %d) with user:%d → game %s", userID, rating, opponentID, gameDetail.ID)

	// Notify the opponent via WebSocket
	if ms.notifier != nil {
		ms.notifier.NotifyMatch(opponentID, gameDetail.ID)
	}

	return &MatchResult{Status: "matched", GameID: gameDetail.ID}, nil
}

func (ms *MatchmakingService) Leave(ctx context.Context, userID int) error {
	member := fmt.Sprintf("user:%d", userID)

	iter := ms.rdb.Scan(ctx, 0, "matchmaking:*", 100).Iterator()
	for iter.Next(ctx) {
		ms.rdb.ZRem(ctx, iter.Val(), member)
	}
	if err := iter.Err(); err != nil {
		return fmt.Errorf("failed to leave matchmaking: %w", err)
	}

	return nil
}

func (ms *MatchmakingService) Status(ctx context.Context, userID int) (*MatchResult, error) {
	member := fmt.Sprintf("user:%d", userID)
	iter := ms.rdb.Scan(ctx, 0, "matchmaking:*", 100).Iterator()
	for iter.Next(ctx) {
		_, err := ms.rdb.ZScore(ctx, iter.Val(), member).Result()
		if err == nil {
			return &MatchResult{Status: "searching"}, nil
		}
	}

	return &MatchResult{Status: "idle"}, nil
}

func (ms *MatchmakingService) createMatchedGame(ctx context.Context, playerOneID, playerTwoID int, tc *models.TimeControl, rated bool) (*models.GameDetail, error) {
	var whiteID, blackID int
	if time.Now().UnixNano()%2 == 0 {
		whiteID = playerOneID
		blackID = playerTwoID
	} else {
		whiteID = playerTwoID
		blackID = playerOneID
	}

	creatorColor := "white"
	req := &CreateGameRequest{
		InitialFen:   "startpos",
		CreatorColor: creatorColor,
		TimeControl:  tc,
		Metadata: map[string]interface{}{
			"variant":     "standard",
			"rated":       rated,
			"matchmaking": true,
		},
	}

	gameDetail, err := ms.gameService.CreateGame(ctx, &whiteID, nil, req)
	if err != nil {
		return nil, fmt.Errorf("failed to create game: %w", err)
	}

	gameDetail, err = ms.gameService.JoinGame(ctx, gameDetail.ID, &blackID, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to join game: %w", err)
	}

	return gameDetail, nil
}

func parseUserID(member string) (int, error) {
	parts := strings.SplitN(member, ":", 2)
	if len(parts) != 2 {
		return 0, fmt.Errorf("invalid member format: %s", member)
	}
	id, err := strconv.Atoi(parts[1])
	if err != nil {
		return 0, fmt.Errorf("invalid user id: %s", parts[1])
	}
	return id, nil
}
