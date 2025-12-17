package handlers

import (
	"github.com/gin-gonic/gin"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/yourorg/email_service_go/internal/config"
)

func NewRouter(cfg *config.Config) *gin.Engine {
	router := gin.Default()

	// Добавляем middleware для метрик
	router.Use(MetricsMiddleware())

	// Health check
	router.GET("/health", handleHealth)

	// Metrics для Prometheus
	if cfg.MetricsEnabled {
		router.GET("/metrics", gin.WrapH(promhttp.Handler()))
	}

	// API routes
	api := router.Group("/api/emails")
	{
		// Middleware для внутренней авторизации
		api.Use(internalAuthMiddleware(cfg.InternalToken))

		// Эндпоинты для отправки email
		api.POST("/send-welcome", handleSendWelcome(cfg))
		api.POST("/send-password-reset", handleSendPasswordReset(cfg))
		api.POST("/send-verification-code", handleSendVerificationCode(cfg))
	}

	return router
}
