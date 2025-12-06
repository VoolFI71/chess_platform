package handlers

import (
	"context"
	"log"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/yourorg/email_service_go/internal/config"
	"github.com/yourorg/email_service_go/internal/services"
)

// SendWelcomeRequest - запрос для отправки приветственного письма
type SendWelcomeRequest struct {
	Email             string `json:"email" binding:"required,email"`
	Username          string `json:"username" binding:"required"`
	VerificationToken string `json:"verification_token,omitempty"`
}

// SendPasswordResetRequest - запрос для отправки письма восстановления пароля
type SendPasswordResetRequest struct {
	Email      string `json:"email" binding:"required,email"`
	Username   string `json:"username" binding:"required"`
	ResetToken string `json:"reset_token" binding:"required"`
	ExpiresAt  string `json:"expires_at" binding:"required"`
}

// SendVerificationCodeRequest - запрос для отправки письма с кодом верификации
type SendVerificationCodeRequest struct {
	Email            string `json:"email" binding:"required,email"`
	Username         string `json:"username" binding:"required"`
	Code             string `json:"code" binding:"required,len=6"`                      // 6-значный код
	Purpose          string `json:"purpose,omitempty"`                                  // Назначение кода (опционально)
	ExpiresInMinutes int    `json:"expires_in_minutes" binding:"required,min=1,max=60"` // Время действия в минутах
}

// EmailResponse - ответ об отправке письма
type EmailResponse struct {
	MessageID string    `json:"message_id"`
	Status    string    `json:"status"`
	SentAt    time.Time `json:"sent_at"`
}

func handleSendWelcome(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req SendWelcomeRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "Invalid request: " + err.Error(),
			})
			return
		}

		// Создаём email сервис
		emailService, err := services.NewEmailService(cfg)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Failed to initialize email service: " + err.Error(),
			})
			return
		}

		// Отправляем письмо
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		if err := emailService.SendWelcomeEmail(ctx, req.Email, req.Username, req.VerificationToken); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Failed to send email: " + err.Error(),
			})
			return
		}

		messageID := uuid.New().String()
		c.JSON(http.StatusOK, EmailResponse{
			MessageID: messageID,
			Status:    "sent",
			SentAt:    time.Now(),
		})
	}
}

func handleSendPasswordReset(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req SendPasswordResetRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "Invalid request: " + err.Error(),
			})
			return
		}

		// Создаём email сервис
		emailService, err := services.NewEmailService(cfg)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Failed to initialize email service: " + err.Error(),
			})
			return
		}

		// Отправляем письмо
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		if err := emailService.SendPasswordResetEmail(ctx, req.Email, req.Username, req.ResetToken, req.ExpiresAt); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Failed to send email: " + err.Error(),
			})
			return
		}

		messageID := uuid.New().String()
		c.JSON(http.StatusOK, EmailResponse{
			MessageID: messageID,
			Status:    "sent",
			SentAt:    time.Now(),
		})
	}
}

func handleSendVerificationCode(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req SendVerificationCodeRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "Invalid request: " + err.Error(),
			})
			return
		}

		// Валидация кода (должен быть 6 цифр)
		if len(req.Code) != 6 {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "Code must be exactly 6 digits",
			})
			return
		}

		// Проверка что код состоит только из цифр
		for _, char := range req.Code {
			if char < '0' || char > '9' {
				c.JSON(http.StatusBadRequest, gin.H{
					"error": "Code must contain only digits",
				})
				return
			}
		}

		// Создаём email сервис
		emailService, err := services.NewEmailService(cfg)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Failed to initialize email service: " + err.Error(),
			})
			return
		}

		// Устанавливаем purpose по умолчанию, если не указан
		purpose := req.Purpose
		if purpose == "" {
			purpose = "Для подтверждения операции используйте следующий код:"
		}

		// Отправляем письмо
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		if err := emailService.SendVerificationCodeEmail(ctx, req.Email, req.Username, req.Code, purpose, req.ExpiresInMinutes); err != nil {
			// Логируем детали ошибки для отладки
			log.Printf("Error sending verification code email to %s: %v", req.Email, err)
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Failed to send email: " + err.Error(),
			})
			return
		}

		messageID := uuid.New().String()
		c.JSON(http.StatusOK, EmailResponse{
			MessageID: messageID,
			Status:    "sent",
			SentAt:    time.Now(),
		})
	}
}
