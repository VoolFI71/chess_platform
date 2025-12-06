package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/yourorg/email_service_go/internal/config"
	"github.com/yourorg/email_service_go/internal/handlers"
)

func main() {
	// Загрузка конфигурации
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	log.Printf("Email service configuration loaded:")
	log.Printf("  Port: %d", cfg.Port)
	log.Printf("  SMTP Host: %s", cfg.SMTPHost)
	log.Printf("  SMTP Port: %d", cfg.SMTPPort)
	log.Printf("  From Email: %s", cfg.SMTPFromEmail)
	log.Printf("  Provider: %s", cfg.EmailProvider)

	// Создание HTTP роутера (Gin)
	router := handlers.NewRouter(cfg)

	// Создание HTTP сервера
	// Gin роутер реализует интерфейс http.Handler,
	// поэтому его можно передать в http.Server
	srv := &http.Server{
		Addr:         fmt.Sprintf(":%d", cfg.Port),
		Handler:      router, // ← Gin роутер как http.Handler
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Graceful shutdown
	go func() {
		log.Printf("Email service starting on port %d", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server failed: %v", err)
		}
	}()

	// Ожидание сигнала завершения
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down server...")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}

	log.Println("Server exited")
}
