package config

import (
	"fmt"
	"os"
	"strconv"
)

type Config struct {
	Port         int
	DatabaseURL  string
	JWTSecret    string
	JWTAlgorithm string
	InternalToken string
}

func Load() (*Config, error) {
	port := 8000
	if portStr := os.Getenv("PORT"); portStr != "" {
		if p, err := strconv.Atoi(portStr); err == nil {
			port = p
		}
	}

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		return nil, fmt.Errorf("DATABASE_URL is required")
	}

	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		return nil, fmt.Errorf("JWT_SECRET is required")
	}

	cfg := &Config{
		Port:          port,
		DatabaseURL:   dbURL,
		JWTSecret:     jwtSecret,
		JWTAlgorithm:  getEnvOrDefault("JWT_ALGORITHM", "HS256"),
		InternalToken: os.Getenv("GAMES_INTERNAL_TOKEN"),
	}

	return cfg, nil
}

func getEnvOrDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

