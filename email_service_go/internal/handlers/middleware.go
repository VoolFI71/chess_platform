package handlers

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

func internalAuthMiddleware(token string) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		
		if authHeader == "" {
			c.JSON(http.StatusUnauthorized, gin.H{
				"error": "Authorization header required",
			})
			c.Abort()
			return
		}

		// Проверка формата: "Bearer <token>" или просто "<token>"
		parts := strings.Split(authHeader, " ")
		var providedToken string
		if len(parts) == 2 && parts[0] == "Bearer" {
			providedToken = parts[1]
		} else if len(parts) == 1 {
			providedToken = parts[0]
		} else {
			c.JSON(http.StatusUnauthorized, gin.H{
				"error": "Invalid authorization header format",
			})
			c.Abort()
			return
		}

		if providedToken != token {
			c.JSON(http.StatusUnauthorized, gin.H{
				"error": "Invalid token",
			})
			c.Abort()
			return
		}

		c.Next()
	}
}

