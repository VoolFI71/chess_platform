package config

import (
	"fmt"
	"os"

	sharedcfg "github.com/yourorg/go_shared/config"
)

type Config struct {
	Port          int
	DatabaseURL   string
	JWTSecret     string
	JWTAlgorithm  string
	InternalToken string
	RedisURL      string
}

func Load() (*Config, error) {
	port := sharedcfg.ParsePort(8000)

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
		JWTAlgorithm:  sharedcfg.GetEnvOrDefault("JWT_ALGORITHM", "HS256"),
		InternalToken: os.Getenv("GAMES_INTERNAL_TOKEN"),
		RedisURL:      sharedcfg.GetEnvOrDefault("REDIS_URL", "redis://localhost:6379/0"),
	}

	return cfg, nil
}

