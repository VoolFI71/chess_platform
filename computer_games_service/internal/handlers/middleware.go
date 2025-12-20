package handlers

import (
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"

	"github.com/yourorg/computer_games_service/internal/config"
)

// optionalAuthMiddleware проверяет JWT токен, но не требует его наличия
func optionalAuthMiddleware(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		tokenString := c.GetHeader("Authorization")
		if tokenString == "" {
			tokenString = c.Query("token")
		}

		// Если токен есть - валидируем, если нет - продолжаем без user_id
		if tokenString != "" {
			// Убираем "Bearer " префикс если есть
			tokenString = strings.TrimPrefix(tokenString, "Bearer ")
			tokenString = strings.TrimSpace(tokenString)

			userID, err := validateJWT(tokenString, cfg.JWTSecret)
			if err == nil {
				c.Set("user_id", userID)
			}
		}

		// Проверяем session_id из query параметров или headers
		sessionID := c.Query("session_id")
		if sessionID == "" {
			sessionID = c.GetHeader("X-Session-ID")
		}
		if sessionID != "" {
			c.Set("session_id", sessionID)
		}

		c.Next()
	}
}

// validateJWT валидирует JWT токен и возвращает user_id
func validateJWT(tokenString, secret string) (int, error) {
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, jwt.ErrSignatureInvalid
		}
		return []byte(secret), nil
	})

	if err != nil {
		return 0, err
	}

	if !token.Valid {
		return 0, jwt.ErrSignatureInvalid
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return 0, jwt.ErrInvalidKey
	}

	userIDFloat, ok := claims["user_id"].(float64)
	if !ok {
		return 0, jwt.ErrInvalidKey
	}

	return int(userIDFloat), nil
}
