package config

import (
	"os"
	"strconv"
)

func GetEnvOrDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func ParsePort(defaultPort int) int {
	if portStr := os.Getenv("PORT"); portStr != "" {
		if p, err := strconv.Atoi(portStr); err == nil {
			return p
		}
	}
	return defaultPort
}
