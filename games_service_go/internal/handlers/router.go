package handlers

import (
	"os"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/prometheus/client_golang/prometheus/promhttp"

	"github.com/yourorg/games_service_go/internal/config"
	"github.com/yourorg/games_service_go/internal/database"
	"github.com/yourorg/games_service_go/internal/realtime"
	"github.com/yourorg/games_service_go/internal/services"
	"github.com/yourorg/go_shared/middleware"
)

func NewRouter(db *database.DB, wsManager *realtime.ConnectionManager, statsManager *realtime.StatsConnectionManager, cfg *config.Config, matchmakingSvc *services.MatchmakingService, mmConnManager *realtime.MatchmakingConnectionManager) *gin.Engine {
	router := gin.New()
	router.Use(gin.Logger())
	router.Use(gin.Recovery())
	router.Use(middleware.MetricsMiddleware())

	// Отключаем автоматические редиректы для trailing slash (как в FastAPI)
	router.RedirectTrailingSlash = false
	router.RedirectFixedPath = false

	// GZip сжатие обрабатывается nginx на уровне gateway

	// Health check
	router.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})

	// Metrics для Prometheus
	router.GET("/metrics", gin.WrapH(promhttp.Handler()))

	// Сервис для бизнес-логики
	gameService := services.NewGameService(db)

	// API endpoints
	// Nginx проксирует /api/games/ на http://games:8000, передавая путь как /api/games/
	// Поэтому обрабатываем маршруты с префиксом /api/games/
	authCfg := &middleware.AuthConfig{JWTSecret: cfg.JWTSecret, JWTAlgorithm: cfg.JWTAlgorithm}

	api := router.Group("/api/games")
	{
		api.POST("", middleware.OptionalAuthMiddleware(authCfg), createGame(gameService))
		api.POST("/", middleware.OptionalAuthMiddleware(authCfg), createGame(gameService))
		api.GET("", listGames(gameService))
		api.GET("/", listGames(gameService))
		api.GET("/:game_id", getGame(gameService))
		api.POST("/:game_id/join", middleware.OptionalAuthMiddleware(authCfg), joinGame(gameService))
		api.POST("/:game_id/resign", middleware.OptionalAuthMiddleware(authCfg), resignGame(gameService, wsManager))
		api.POST("/:game_id/timeout", middleware.AuthMiddleware(authCfg), timeoutGame(gameService))
		api.GET("/:game_id/moves", getMoves(gameService))
	}

	if matchmakingSvc != nil {
		mm := router.Group("/api/matchmaking")
		mm.Use(middleware.AuthMiddleware(authCfg))
		{
			mm.POST("/join", matchmakingJoin(matchmakingSvc))
			mm.POST("/leave", matchmakingLeave(matchmakingSvc))
			mm.GET("/status", matchmakingStatus(matchmakingSvc))
		}
	}

	// Internal endpoints
	internal := router.Group("/internal")
	{
		internal.GET("/stats/:user_id", internalAuthMiddleware(cfg), getUserStats(gameService))
		internal.GET("/stats/online", internalAuthMiddleware(cfg), getOnlineStats(wsManager))
	}

	// WebSocket endpoints
	// Получаем список разрешенных origins из переменной окружения
	allowedOrigins := []string{}
	if originsStr := os.Getenv("WS_ALLOWED_ORIGINS"); originsStr != "" {
		allowedOrigins = strings.Split(originsStr, ",")
		for i := range allowedOrigins {
			allowedOrigins[i] = strings.TrimSpace(allowedOrigins[i])
		}
	}
	wsUpgrader := createUpgrader(allowedOrigins)
	router.GET("/ws/games/:game_id", handleWebSocketWithUpgrader(gameService, wsManager, cfg, wsUpgrader))

	// WebSocket endpoint для статистики онлайн
	router.GET("/ws/stats", handleStatsWebSocket(statsManager, wsManager, wsUpgrader))

	// WebSocket endpoint для matchmaking
	if matchmakingSvc != nil && mmConnManager != nil {
		router.GET("/ws/matchmaking", handleMatchmakingWebSocket(matchmakingSvc, mmConnManager, cfg, wsUpgrader))
	}

	return router
}

func internalAuthMiddleware(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		token := c.GetHeader("X-Internal-Token")
		if token == "" || token != cfg.InternalToken {
			c.JSON(403, gin.H{"error": "forbidden"})
			c.Abort()
			return
		}
		c.Next()
	}
}
