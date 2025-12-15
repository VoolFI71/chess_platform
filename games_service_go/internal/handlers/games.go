package handlers

import (
	"fmt"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/yourorg/games_service_go/internal/models"
	"github.com/yourorg/games_service_go/internal/realtime"
	"github.com/yourorg/games_service_go/internal/services"
)

func createGame(service *services.GameService) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req services.CreateGameRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		var creatorID *int
		var creatorSessionID *string

		// Проверяем авторизованного пользователя
		if userID, ok := c.Get("user_id"); ok {
			if id, ok := userID.(int); ok {
				creatorID = &id
			}
		}

		// Проверяем анонимного пользователя через session_id
		if sessionID, ok := c.Get("session_id"); ok {
			if sid, ok := sessionID.(string); ok {
				creatorSessionID = &sid
			}
		}

		// Если нет ни user_id, ни session_id - требуем аутентификацию
		if creatorID == nil && creatorSessionID == nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Authentication or session_id required"})
			return
		}

		var game *models.GameDetail
		var err error

		if creatorID != nil {
			game, err = service.CreateGame(c.Request.Context(), creatorID, nil, &req)
		} else {
			game, err = service.CreateGame(c.Request.Context(), nil, creatorSessionID, &req)
		}

		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusCreated, game)
	}
}

func getGame(service *services.GameService) gin.HandlerFunc {
	return func(c *gin.Context) {
		gameIDStr := c.Param("game_id")
		gameID, err := uuid.Parse(gameIDStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid game_id"})
			return
		}

		game, err := service.GetGame(c.Request.Context(), gameID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "game not found"})
			return
		}

		c.JSON(http.StatusOK, game)
	}
}

func joinGame(service *services.GameService) gin.HandlerFunc {
	return func(c *gin.Context) {
		gameIDStr := c.Param("game_id")
		gameID, err := uuid.Parse(gameIDStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid game_id"})
			return
		}

		var playerID *int
		var playerSessionID *string

		// Проверяем авторизованного пользователя
		if userID, ok := c.Get("user_id"); ok {
			if id, ok := userID.(int); ok {
				playerID = &id
			}
		}

		// Проверяем анонимного пользователя через session_id
		if sessionID, ok := c.Get("session_id"); ok {
			if sid, ok := sessionID.(string); ok {
				playerSessionID = &sid
			}
		}

		// Если нет ни user_id, ни session_id - требуем аутентификацию
		if playerID == nil && playerSessionID == nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Authentication or session_id required"})
			return
		}

		var game *models.GameDetail
		if playerID != nil {
			game, err = service.JoinGame(c.Request.Context(), gameID, playerID, nil)
		} else {
			game, err = service.JoinGame(c.Request.Context(), gameID, nil, playerSessionID)
		}

		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, game)
	}
}

func resignGame(service *services.GameService) gin.HandlerFunc {
	return func(c *gin.Context) {
		gameIDStr := c.Param("game_id")
		gameID, err := uuid.Parse(gameIDStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid game_id"})
			return
		}

		userID, ok := c.Get("user_id")
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}
		playerID, ok := userID.(int)
		if !ok {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "invalid user_id type"})
			return
		}

		game, err := service.Resign(c.Request.Context(), gameID, playerID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, game)
	}
}

func timeoutGame(service *services.GameService) gin.HandlerFunc {
	return func(c *gin.Context) {
		gameIDStr := c.Param("game_id")
		gameID, err := uuid.Parse(gameIDStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid game_id"})
			return
		}

		var req struct {
			LoserColor string `json:"loser_color" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		userID, ok := c.Get("user_id")
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}
		playerID, ok := userID.(int)
		if !ok {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "invalid user_id type"})
			return
		}

		game, err := service.Timeout(c.Request.Context(), gameID, playerID, req.LoserColor)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, game)
	}
}

func getMoves(service *services.GameService) gin.HandlerFunc {
	return func(c *gin.Context) {
		gameIDStr := c.Param("game_id")
		gameID, err := uuid.Parse(gameIDStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid game_id"})
			return
		}

		moves, err := service.GetMoves(c.Request.Context(), gameID, 200)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "game not found"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"items": moves})
	}
}

func listGames(service *services.GameService) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Получаем параметры из query string
		limitStr := c.DefaultQuery("limit", "25")
		offsetStr := c.DefaultQuery("offset", "0")
		statusStr := c.Query("status")

		// Валидация и парсинг limit
		limit, err := strconv.Atoi(limitStr)
		if err != nil || limit < 1 || limit > 100 {
			limit = 25
		}

		// Валидация и парсинг offset
		offset, err := strconv.Atoi(offsetStr)
		if err != nil || offset < 0 {
			offset = 0
		}

		// Валидация status (если указан)
		var status *models.GameStatus
		if statusStr != "" {
			validStatus := models.GameStatus(statusStr)
			// Проверяем, что статус валидный
			switch validStatus {
			case models.GameStatusCreated, models.GameStatusActive, models.GameStatusPaused, models.GameStatusFinished:
				status = &validStatus
			default:
				c.JSON(http.StatusBadRequest, gin.H{"error": "invalid status. Valid values: CREATED, ACTIVE, PAUSED, FINISHED"})
				return
			}
		}

		games, err := service.ListGames(c.Request.Context(), limit, offset, status)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, games)
	}
}

func getUserStats(service *services.GameService) gin.HandlerFunc {
	return func(c *gin.Context) {
		userIDStr := c.Param("user_id")
		var userID int
		if _, err := fmt.Sscanf(userIDStr, "%d", &userID); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid user_id"})
			return
		}

		stats, err := service.GetUserGameStats(c.Request.Context(), userID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, stats)
	}
}

func getOnlineStats(wsManager *realtime.ConnectionManager) gin.HandlerFunc {
	return func(c *gin.Context) {
		onlinePlayers, activeGames := wsManager.GetOnlineStats()
		c.JSON(http.StatusOK, gin.H{
			"online_players": onlinePlayers,
			"active_games":   activeGames,
		})
	}
}
