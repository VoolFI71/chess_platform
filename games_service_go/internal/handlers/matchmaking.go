package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/yourorg/games_service_go/internal/models"
	"github.com/yourorg/games_service_go/internal/services"
)

type matchmakingJoinRequest struct {
	TimeControl struct {
		InitialMs   int64 `json:"initial_ms" binding:"required"`
		IncrementMs int64 `json:"increment_ms"`
	} `json:"time_control" binding:"required"`
	Rated bool `json:"rated"`
}

func matchmakingJoin(svc *services.MatchmakingService) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, ok := c.Get("user_id")
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required for matchmaking"})
			return
		}
		uid, ok := userID.(int)
		if !ok {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "invalid user_id type"})
			return
		}

		var req matchmakingJoinRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		tc := &models.TimeControl{
			InitialMs:   req.TimeControl.InitialMs,
			IncrementMs: req.TimeControl.IncrementMs,
			Type:        "STANDARD",
		}

		result, err := svc.Join(c.Request.Context(), uid, tc, req.Rated)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, result)
	}
}

func matchmakingLeave(svc *services.MatchmakingService) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, ok := c.Get("user_id")
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
			return
		}
		uid, ok := userID.(int)
		if !ok {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "invalid user_id type"})
			return
		}

		if err := svc.Leave(c.Request.Context(), uid); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"status": "left"})
	}
}

func matchmakingStatus(svc *services.MatchmakingService) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, ok := c.Get("user_id")
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
			return
		}
		uid, ok := userID.(int)
		if !ok {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "invalid user_id type"})
			return
		}

		result, err := svc.Status(c.Request.Context(), uid)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, result)
	}
}
