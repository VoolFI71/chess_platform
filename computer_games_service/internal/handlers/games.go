package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/yourorg/computer_games_service/internal/realtime"
	"github.com/yourorg/computer_games_service/internal/services"
)

// createComputerGame создает новую игру с компьютером
func createComputerGame(service *services.ComputerGameService) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req services.CreateComputerGameRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Валидация
		if req.AISkillLevel < 0 || req.AISkillLevel > 20 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "ai_skill_level must be between 0 and 20"})
			return
		}

		if req.CreatorColor != "white" && req.CreatorColor != "black" && req.CreatorColor != "random" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "creator_color must be 'white', 'black', or 'random'"})
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

		// Если нет ни user_id, ни session_id - автоматически генерируем session_id для анонимной игры
		if creatorID == nil && creatorSessionID == nil {
			// Генерируем новый session_id для анонимного игрока
			newSessionID := uuid.New().String()
			creatorSessionID = &newSessionID
		}

		var game *services.GameDetail
		var err error

		if creatorID != nil {
			game, err = service.CreateComputerGame(c.Request.Context(), creatorID, nil, &req)
		} else {
			game, err = service.CreateComputerGame(c.Request.Context(), nil, creatorSessionID, &req)
		}

		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusCreated, game)
	}
}

// getComputerGame получает игру по ID
func getComputerGame(service *services.ComputerGameService) gin.HandlerFunc {
	return func(c *gin.Context) {
		gameIDStr := c.Param("game_id")
		gameID, err := uuid.Parse(gameIDStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid game_id"})
			return
		}

		game, err := service.GetGame(c.Request.Context(), gameID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, game)
	}
}

// getMoves получает ходы игры
func getMoves(service *services.ComputerGameService) gin.HandlerFunc {
	return func(c *gin.Context) {
		gameIDStr := c.Param("game_id")
		gameID, err := uuid.Parse(gameIDStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid game_id"})
			return
		}

		moves, err := service.GetMoves(c.Request.Context(), gameID, 200)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, moves)
	}
}

// resignComputerGame сдаётся в партии с компьютером
func resignComputerGame(service *services.ComputerGameService, wsManager *realtime.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		gameIDStr := c.Param("game_id")
		gameID, err := uuid.Parse(gameIDStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid game_id"})
			return
		}

		var playerID *int
		var playerSessionID *string

		if userID, ok := c.Get("user_id"); ok {
			if id, ok := userID.(int); ok {
				playerID = &id
			}
		}
		if sessionID, ok := c.Get("session_id"); ok {
			if sid, ok := sessionID.(string); ok {
				playerSessionID = &sid
			}
		}

		if playerID == nil && playerSessionID == nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication or session_id required"})
			return
		}

		game, err := service.Resign(c.Request.Context(), gameID, playerID, playerSessionID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Broadcast через WebSocket для обновления у всех подключённых клиентов
		if wsManager != nil {
			wsManager.Broadcast(gameID.String(), map[string]interface{}{
				"type": "game_update",
				"game": game,
			})
		}

		c.JSON(http.StatusOK, game)
	}
}
