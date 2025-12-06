package handlers

import (
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/yourorg/games_service_go/internal/services"
)

func createGame(service *services.GameService) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req services.CreateGameRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		userID, ok := c.Get("user_id")
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}
		creatorID, ok := userID.(int)
		if !ok {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "invalid user_id type"})
			return
		}

		game, err := service.CreateGame(c.Request.Context(), creatorID, &req)
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

		game, err := service.JoinGame(c.Request.Context(), gameID, playerID)
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
		games, err := service.ListGames(c.Request.Context(), 25, 0)
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
