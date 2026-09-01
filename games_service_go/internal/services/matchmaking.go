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

const matchmakingUsersKey = "matchmaking:users"

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

func (ms *MatchmakingService) queueKey(tc *models.TimeControl, rated bool) string {
	format := ms.gameService.getGameFormat(tc)
	timeKey := fmt.Sprintf("%d_%d", tc.InitialMs, tc.IncrementMs)
	mode := "casual"
	if rated {
		mode = "rated"
	}
	return fmt.Sprintf("matchmaking:%s:%s:%s", mode, format, timeKey)
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

// Lua script atomically inserts a player and considers only the nearest ratings
// above and below their score. It also maintains a direct user-to-queue index.
// KEYS[1] = queue key, KEYS[2] = matchmaking users hash
// ARGV[1] = member (user:{id})
// ARGV[2] = score (rating)
// Returns: "nil" if no match, or "user:{opponentID}" if matched
var matchmakingLua = redis.NewScript(`
local queue = KEYS[1]
local users = KEYS[2]
local member = ARGV[1]
local score = tonumber(ARGV[2])

local previousQueue = redis.call('HGET', users, member)
if previousQueue and previousQueue ~= queue then
    redis.call('ZREM', previousQueue, member)
end
redis.call('ZADD', queue, score, member)
redis.call('HSET', users, member, queue)

local bestMatch = nil
local bestDiff = math.huge

local function consider(candidates)
    for i = 1, #candidates, 2 do
        local candidate = candidates[i]
        local candidateScore = tonumber(candidates[i + 1])
        if candidate ~= member then
            local diff = math.abs(candidateScore - score)
            if diff < bestDiff then
                bestDiff = diff
                bestMatch = candidate
            end
        end
    end
end

consider(redis.call('ZREVRANGEBYSCORE', queue, score, '-inf', 'WITHSCORES', 'LIMIT', 0, 2))
consider(redis.call('ZRANGEBYSCORE', queue, score, '+inf', 'WITHSCORES', 'LIMIT', 0, 2))

if bestMatch == nil then
    return "nil"
end

redis.call('ZREM', queue, member, bestMatch)
redis.call('HDEL', users, member, bestMatch)
return bestMatch
`)

func (ms *MatchmakingService) Join(ctx context.Context, userID int, tc *models.TimeControl, rated bool) (*MatchResult, error) {
	rating, err := ms.getUserRating(ctx, userID, tc)
	if err != nil {
		return nil, err
	}

	queueKey := ms.queueKey(tc, rated)
	member := fmt.Sprintf("user:%d", userID)

	result, err := matchmakingLua.Run(ctx, ms.rdb, []string{queueKey, matchmakingUsersKey}, member, rating).Text()
	if err != nil {
		return nil, fmt.Errorf("matchmaking lua error: %w", err)
	}

	if result == "nil" {
		if err := ms.rdb.Expire(ctx, queueKey, 5*time.Minute).Err(); err != nil {
			return nil, fmt.Errorf("failed to set matchmaking queue expiry: %w", err)
		}
		return &MatchResult{Status: "searching"}, nil
	}

	opponentID, err := parseUserID(result)
	if err != nil {
		return nil, fmt.Errorf("failed to parse opponent id: %w", err)
	}

	gameDetail, err := ms.createMatchedGame(ctx, userID, opponentID, tc, rated)
	if err != nil {
		pipe := ms.rdb.TxPipeline()
		pipe.ZAdd(ctx, queueKey, redis.Z{Score: float64(rating), Member: member})
		pipe.HSet(ctx, matchmakingUsersKey, member, queueKey)
		oppRating, _ := ms.getUserRating(ctx, opponentID, tc)
		pipe.ZAdd(ctx, queueKey, redis.Z{Score: float64(oppRating), Member: result})
		pipe.HSet(ctx, matchmakingUsersKey, result, queueKey)
		_, _ = pipe.Exec(ctx)
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
	queueKey, err := ms.rdb.HGet(ctx, matchmakingUsersKey, member).Result()
	if err == redis.Nil {
		return nil
	}
	if err != nil {
		return fmt.Errorf("failed to get matchmaking queue: %w", err)
	}
	pipe := ms.rdb.TxPipeline()
	pipe.ZRem(ctx, queueKey, member)
	pipe.HDel(ctx, matchmakingUsersKey, member)
	if _, err := pipe.Exec(ctx); err != nil {
		return fmt.Errorf("failed to leave matchmaking: %w", err)
	}

	return nil
}

func (ms *MatchmakingService) Status(ctx context.Context, userID int) (*MatchResult, error) {
	member := fmt.Sprintf("user:%d", userID)
	queueKey, err := ms.rdb.HGet(ctx, matchmakingUsersKey, member).Result()
	if err == redis.Nil {
		return &MatchResult{Status: "idle"}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get matchmaking status: %w", err)
	}
	if _, err := ms.rdb.ZScore(ctx, queueKey, member).Result(); err == nil {
		return &MatchResult{Status: "searching"}, nil
	} else if err != redis.Nil {
		return nil, fmt.Errorf("failed to read matchmaking status: %w", err)
	}
	_ = ms.rdb.HDel(ctx, matchmakingUsersKey, member).Err()

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
