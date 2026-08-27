package config

import (
	"fmt"
	"os"
	"strconv"

	sharedcfg "github.com/yourorg/go_shared/config"
)

type Config struct {
	Port                 int
	DatabaseURL          string
	JWTSecret            string
	JWTAlgorithm         string
	InternalToken        string
	StockfishPath        string
	StockfishPoolSize    int // Размер пула процессов Stockfish
	AIDefaultSkillLevel  int
	AIDefaultTimeLimitMs int
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

	stockfishPath := sharedcfg.GetEnvOrDefault("STOCKFISH_PATH", "/usr/bin/stockfish")

	// Размер пула Stockfish (по умолчанию 4 процесса)
	// Рекомендуется: количество ядер CPU или немного больше (для 3 ядер = 3-4 процесса)
	stockfishPoolSize := 4
	if poolStr := os.Getenv("STOCKFISH_POOL_SIZE"); poolStr != "" {
		if p, err := strconv.Atoi(poolStr); err == nil && p > 0 {
			stockfishPoolSize = p
		}
	}

	// AI настройки
	aiSkillLevel := 5
	if skillStr := os.Getenv("AI_DEFAULT_SKILL_LEVEL"); skillStr != "" {
		if s, err := strconv.Atoi(skillStr); err == nil {
			aiSkillLevel = s
		}
	}

	aiTimeLimit := 2000
	if timeStr := os.Getenv("AI_DEFAULT_TIME_LIMIT_MS"); timeStr != "" {
		if t, err := strconv.Atoi(timeStr); err == nil {
			aiTimeLimit = t
		}
	}

	cfg := &Config{
		Port:                 port,
		DatabaseURL:          dbURL,
		JWTSecret:            jwtSecret,
		JWTAlgorithm:         sharedcfg.GetEnvOrDefault("JWT_ALGORITHM", "HS256"),
		InternalToken:        os.Getenv("COMPUTER_GAMES_INTERNAL_TOKEN"),
		StockfishPath:        stockfishPath,
		StockfishPoolSize:    stockfishPoolSize,
		AIDefaultSkillLevel:  aiSkillLevel,
		AIDefaultTimeLimitMs: aiTimeLimit,
	}

	return cfg, nil
}
