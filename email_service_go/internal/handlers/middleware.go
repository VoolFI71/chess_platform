package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func internalAuthMiddleware(token string) gin.HandlerFunc {
	return func(c *gin.Context) {
		providedToken := c.GetHeader("X-Internal-Token")
		if providedToken == "" {
			c.JSON(http.StatusUnauthorized, gin.H{
				"error": "X-Internal-Token header required",
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
