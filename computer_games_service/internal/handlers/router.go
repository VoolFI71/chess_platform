package handlers

import (
	"github.com/gin-gonic/gin"
	"github.com/prometheus/client_golang/prometheus/promhttp"

	"github.com/yourorg/computer_games_service/internal/config"
	"github.com/yourorg/computer_games_service/internal/realtime"
	"github.com/yourorg/computer_games_service/internal/services"
)

func NewRouter(cfg *config.Config, computerGameService *services.ComputerGameService, wsManager *realtime.Manager) *gin.Engine {
	router := gin.New()
	router.Use(gin.Logger())
	router.Use(gin.Recovery())
	router.Use(MetricsMiddleware()) // Добавляем метрики для всех запросов

	// Отключаем автоматические редиректы для trailing slash (как в games_service_go)
	router.RedirectTrailingSlash = false
	router.RedirectFixedPath = false

	// Health check
	router.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})

	// Metrics для Prometheus
	router.GET("/metrics", gin.WrapH(promhttp.Handler()))

	// API endpoints для компьютерных игр
	api := router.Group("/api/computer-games")
	{
		api.POST("", optionalAuthMiddleware(cfg), createComputerGame(computerGameService))
		api.POST("/", optionalAuthMiddleware(cfg), createComputerGame(computerGameService))
		api.GET("/:game_id", getComputerGame(computerGameService))
		api.GET("/:game_id/moves", getMoves(computerGameService))
	}

	// WebSocket endpoint
	router.GET("/ws/computer-games/:game_id", handleWebSocket(cfg, computerGameService, wsManager))

	return router
}
