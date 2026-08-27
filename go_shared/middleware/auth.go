package middleware

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

type AuthConfig struct {
	JWTSecret    string
	JWTAlgorithm string
}

// ValidateJWT validates an access JWT token and returns the user ID.
// Supports both "sub" (Python auth service) and "user_id" claims,
// with string, float64 and int types.
func ValidateJWT(tokenString, secret, expectedAlgorithm string) (int, error) {
	tokenString = strings.TrimPrefix(tokenString, "Bearer ")
	tokenString = strings.TrimSpace(tokenString)
	if expectedAlgorithm == "" {
		expectedAlgorithm = "HS256"
	}

	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		if token.Method.Alg() != expectedAlgorithm {
			return nil, fmt.Errorf("unexpected JWT signing algorithm: %s", token.Method.Alg())
		}
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, jwt.ErrSignatureInvalid
		}
		return []byte(secret), nil
	}, jwt.WithValidMethods([]string{expectedAlgorithm}))

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

	tokenType, ok := claims["type"].(string)
	if !ok || tokenType != "access" {
		return 0, fmt.Errorf("access token type required")
	}

	var userID int
	var found bool

	// Try "sub" first (Python auth service convention)
	if subStr, ok := claims["sub"].(string); ok {
		if parsed, err := strconv.Atoi(subStr); err == nil {
			userID = parsed
			found = true
		}
	} else if subFloat, ok := claims["sub"].(float64); ok {
		userID = int(subFloat)
		found = true
	} else if subInt, ok := claims["sub"].(int); ok {
		userID = subInt
		found = true
	}

	// Fallback to "user_id"
	if !found {
		if uidStr, ok := claims["user_id"].(string); ok {
			if parsed, err := strconv.Atoi(uidStr); err == nil {
				userID = parsed
				found = true
			}
		} else if uidFloat, ok := claims["user_id"].(float64); ok {
			userID = int(uidFloat)
			found = true
		} else if uidInt, ok := claims["user_id"].(int); ok {
			userID = uidInt
			found = true
		}
	}

	if !found {
		return 0, fmt.Errorf("user_id not found in token claims (sub or user_id)")
	}

	return userID, nil
}

// AuthMiddleware requires a valid JWT token. Returns 401 if missing or invalid.
func AuthMiddleware(cfg *AuthConfig) gin.HandlerFunc {
	return func(c *gin.Context) {
		tokenString := c.GetHeader("Authorization")
		if tokenString == "" {
			tokenString = c.Query("token")
		}

		if tokenString == "" {
			c.JSON(401, gin.H{"error": "unauthorized"})
			c.Abort()
			return
		}

		userID, err := ValidateJWT(tokenString, cfg.JWTSecret, cfg.JWTAlgorithm)
		if err != nil {
			c.JSON(401, gin.H{"error": "invalid token"})
			c.Abort()
			return
		}

		c.Set("user_id", userID)
		c.Next()
	}
}

// OptionalAuthMiddleware tries JWT first, then falls back to X-Session-ID / session_id query.
// If neither is provided, continues without authentication (for public endpoints).
func OptionalAuthMiddleware(cfg *AuthConfig) gin.HandlerFunc {
	return func(c *gin.Context) {
		tokenString := c.GetHeader("Authorization")
		if tokenString == "" {
			tokenString = c.Query("token")
		}

		if tokenString != "" {
			userID, err := ValidateJWT(tokenString, cfg.JWTSecret, cfg.JWTAlgorithm)
			if err == nil {
				c.Set("user_id", userID)
				c.Next()
				return
			}
		}

		// Fallback: session_id for anonymous users
		sessionID := c.GetHeader("X-Session-ID")
		if sessionID == "" {
			sessionID = c.Query("session_id")
		}
		if sessionID != "" {
			if _, err := uuid.Parse(sessionID); err == nil {
				c.Set("session_id", sessionID)
				c.Next()
				return
			}
		}

		c.Next()
	}
}
