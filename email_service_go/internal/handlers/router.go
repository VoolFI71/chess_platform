package handlers

import (
	"github.com/gin-gonic/gin"
	"github.com/yourorg/email_service_go/internal/config"
)

func NewRouter(cfg *config.Config) *gin.Engine {
	router := gin.Default()

	// Health check
	router.GET("/health", handleHealth)

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
