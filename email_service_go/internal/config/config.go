package config

import (
	"fmt"
	"os"
	"strconv"
)

type Config struct {
	// Server
	Port int

	// Database (для логирования, опционально)
	DatabaseURL string

	// Internal Auth
	InternalToken string

	// SMTP Configuration
	SMTPHost      string
	SMTPPort      int
	SMTPUser      string
	SMTPPassword  string
	SMTPFromEmail string
	SMTPFromName  string

	// Email Provider (smtp, sendgrid, ses)
	EmailProvider string

	// Frontend URLs (для ссылок в письмах)
	FrontendURL               string
	FrontendResetPasswordPath string

	// SendGrid (опционально)
	SendGridAPIKey string

	// AWS SES (опционально)
	AWSRegion          string
	AWSAccessKeyID     string
	AWSSecretAccessKey string

	// Logging
	MetricsEnabled bool
}

func Load() (*Config, error) {
	// Port
	port := 8000
	if portStr := os.Getenv("PORT"); portStr != "" {
		if p, err := strconv.Atoi(portStr); err == nil {
			port = p
		}
	}

	// SMTP Configuration
	smtpHost := getEnvOrDefault("SMTP_HOST", "smtp.gmail.com")
	smtpPort := 587
	if portStr := os.Getenv("SMTP_PORT"); portStr != "" {
		if p, err := strconv.Atoi(portStr); err == nil {
			smtpPort = p
		}
	}

	smtpUser := os.Getenv("SMTP_USER")
	smtpPassword := os.Getenv("SMTP_PASSWORD")
	smtpFromEmail := getEnvOrDefault("SMTP_FROM_EMAIL", "noreply@power-chess.ru")
	smtpFromName := getEnvOrDefault("SMTP_FROM_NAME", "Power Chess")

	// Email Provider
	emailProvider := getEnvOrDefault("EMAIL_PROVIDER", "smtp")

	// Frontend URLs
	frontendURL := getEnvOrDefault("FRONTEND_URL", "http://localhost:8080")
	frontendResetPasswordPath := getEnvOrDefault("FRONTEND_RESET_PASSWORD_PATH", "/reset-password")

	// Internal Token
	internalToken := os.Getenv("INTERNAL_TOKEN")
	if internalToken == "" {
		return nil, fmt.Errorf("INTERNAL_TOKEN is required")
	}

	cfg := &Config{
		Port:                      port,
		DatabaseURL:               os.Getenv("DATABASE_URL"), // опционально
		InternalToken:             internalToken,
		SMTPHost:                  smtpHost,
		SMTPPort:                  smtpPort,
		SMTPUser:                  smtpUser,
		SMTPPassword:              smtpPassword,
		SMTPFromEmail:             smtpFromEmail,
		SMTPFromName:              smtpFromName,
		EmailProvider:             emailProvider,
		FrontendURL:               frontendURL,
		FrontendResetPasswordPath: frontendResetPasswordPath,
		SendGridAPIKey:            os.Getenv("SENDGRID_API_KEY"),
		AWSRegion:                 os.Getenv("AWS_REGION"),
		AWSAccessKeyID:            os.Getenv("AWS_ACCESS_KEY_ID"),
		AWSSecretAccessKey:        os.Getenv("AWS_SECRET_ACCESS_KEY"),
		MetricsEnabled:            getEnvOrDefault("METRICS_ENABLED", "false") == "true",
	}

	// Валидация обязательных полей для SMTP
	if emailProvider == "smtp" {
		if smtpUser == "" {
			return nil, fmt.Errorf("SMTP_USER is required when EMAIL_PROVIDER=smtp")
		}
		if smtpPassword == "" {
			return nil, fmt.Errorf("SMTP_PASSWORD is required when EMAIL_PROVIDER=smtp")
		}
	}

	return cfg, nil
}

func getEnvOrDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
