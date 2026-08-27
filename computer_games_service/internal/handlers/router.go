package handlers

import (
	"net/http"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"github.com/prometheus/client_golang/prometheus/promhttp"

	"github.com/yourorg/computer_games_service/internal/config"
	"github.com/yourorg/computer_games_service/internal/realtime"
	"github.com/yourorg/computer_games_service/internal/services"
	"github.com/yourorg/go_shared/middleware"
)

func NewRouter(cfg *config.Config, computerGameService *services.ComputerGameService, wsManager *realtime.Manager) *gin.Engine {
	router := gin.New()
	router.Use(gin.Logger())
	router.Use(gin.Recovery())
	router.Use(middleware.MetricsMiddleware())

	router.RedirectTrailingSlash = false
	router.RedirectFixedPath = false

	router.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})

	router.GET("/metrics", gin.WrapH(promhttp.Handler()))

	authCfg := &middleware.AuthConfig{JWTSecret: cfg.JWTSecret, JWTAlgorithm: cfg.JWTAlgorithm}
	allowedOrigins := parseAllowedOrigins(os.Getenv("WS_ALLOWED_ORIGINS"))
	wsUpgrader := createUpgrader(allowedOrigins)

	api := router.Group("/api/computer-games")
	{
		api.POST("", middleware.OptionalAuthMiddleware(authCfg), createComputerGame(computerGameService))
		api.POST("/", middleware.OptionalAuthMiddleware(authCfg), createComputerGame(computerGameService))
		api.GET("/:game_id", getComputerGame(computerGameService))
		api.GET("/:game_id/moves", getMoves(computerGameService))
		api.POST("/:game_id/resign", middleware.OptionalAuthMiddleware(authCfg), resignComputerGame(computerGameService, wsManager))
	}

	router.GET("/ws/computer-games/:game_id", handleWebSocket(cfg, computerGameService, wsManager, wsUpgrader))

	return router
}

func parseAllowedOrigins(value string) []string {
	var origins []string
	for _, origin := range strings.Split(value, ",") {
		origin = strings.TrimRight(strings.TrimSpace(origin), "/")
		if origin != "" {
			origins = append(origins, origin)
		}
	}
	return origins
}

func createUpgrader(allowedOrigins []string) websocket.Upgrader {
	allowedSet := make(map[string]struct{}, len(allowedOrigins))
	for _, origin := range allowedOrigins {
		allowedSet[strings.TrimRight(strings.TrimSpace(origin), "/")] = struct{}{}
	}

	return websocket.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
		CheckOrigin: func(r *http.Request) bool {
			origin := strings.TrimRight(strings.TrimSpace(r.Header.Get("Origin")), "/")
			if origin == "" {
				return true
			}
			_, allowed := allowedSet[origin]
			return allowed
		},
	}
}
