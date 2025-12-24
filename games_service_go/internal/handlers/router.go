package handlers

import (
	"os"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/prometheus/client_golang/prometheus/promhttp"

	"github.com/yourorg/games_service_go/internal/config"
	"github.com/yourorg/games_service_go/internal/database"
	"github.com/yourorg/games_service_go/internal/realtime"
	"github.com/yourorg/games_service_go/internal/services"
)

func NewRouter(db *database.DB, wsManager *realtime.ConnectionManager, statsManager *realtime.StatsConnectionManager, cfg *config.Config) *gin.Engine {
	router := gin.New()
	router.Use(gin.Logger())
	router.Use(gin.Recovery())
	router.Use(MetricsMiddleware()) // Добавляем метрики для всех запросов

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
	api := router.Group("/api/games")
	{
		api.POST("", optionalAuthMiddleware(cfg), createGame(gameService))
		api.POST("/", optionalAuthMiddleware(cfg), createGame(gameService))
		api.GET("", listGames(gameService))
		api.GET("/", listGames(gameService))
		api.GET("/:game_id", getGame(gameService))
		api.POST("/:game_id/join", optionalAuthMiddleware(cfg), joinGame(gameService))
		api.POST("/:game_id/resign", optionalAuthMiddleware(cfg), resignGame(gameService, wsManager))
		api.POST("/:game_id/timeout", authMiddleware(cfg), timeoutGame(gameService))
		api.GET("/:game_id/moves", getMoves(gameService))
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
	router.GET("/ws/games/:game_id", handleWebSocketWithUpgrader(db, wsManager, cfg, wsUpgrader))

	// WebSocket endpoint для статистики онлайн
	router.GET("/ws/stats", handleStatsWebSocket(statsManager, wsManager, wsUpgrader))

	return router
}

func authMiddleware(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		// JWT аутентификация
		tokenString := c.GetHeader("Authorization")
		if tokenString == "" {
			tokenString = c.Query("token")
		}

		if tokenString == "" {
			// No token provided
			c.JSON(401, gin.H{"error": "unauthorized"})
			c.Abort()
			return
		}

		// Валидация JWT токена
		userID, err := validateJWT(tokenString, cfg.JWTSecret)
		if err != nil {
			// Token validation failed
			c.JSON(401, gin.H{"error": "invalid token"})
			c.Abort()
			return
		}

		c.Set("user_id", userID)
		c.Next()
	}
}

// optionalAuthMiddleware - опциональный middleware, который позволяет анонимных пользователей через X-Session-ID
func optionalAuthMiddleware(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Проверяем JWT токен
		tokenString := c.GetHeader("Authorization")
		if tokenString == "" {
			tokenString = c.Query("token")
		}

		if tokenString != "" {
			// Валидация JWT токена
			userID, err := validateJWT(tokenString, cfg.JWTSecret)
			if err == nil {
				c.Set("user_id", userID)
				c.Next()
				return
			}
		}

		// Если нет токена, проверяем session_id для анонимных пользователей
		sessionID := c.GetHeader("X-Session-ID")
		if sessionID != "" {
			// Валидируем формат UUID
			if _, err := uuid.Parse(sessionID); err == nil {
				c.Set("session_id", sessionID)
				c.Next()
				return
			}
		}

		// Если нет ни токена, ни session_id - продолжаем без аутентификации (для просмотра)
		c.Next()
	}
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
