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

	"github.com/yourorg/computer_games_service/internal/ai"
	"github.com/yourorg/computer_games_service/internal/config"
	"github.com/yourorg/computer_games_service/internal/database"
	"github.com/yourorg/computer_games_service/internal/handlers"
	"github.com/yourorg/computer_games_service/internal/realtime"
	"github.com/yourorg/computer_games_service/internal/services"
	"github.com/yourorg/computer_games_service/internal/watchdog"
)

func main() {
	// Загрузка конфигурации
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	// Подключение к БД
	db, err := database.NewDB(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()

	log.Println("Connected to database successfully")

	// Инициализация пула процессов Stockfish
	stockfishPool, err := ai.NewStockfishPool(cfg.StockfishPath, cfg.StockfishPoolSize)
	if err != nil {
		log.Fatalf("Failed to initialize Stockfish pool: %v", err)
	}
	defer stockfishPool.Close()

	log.Printf("Stockfish pool initialized successfully with %d processes", stockfishPool.GetPoolSize())

	// Инициализация WebSocket менеджера
	wsManager := realtime.NewManager()

	// Создание сервисов
	// Используем пул вместо одного процесса для параллельной обработки
	aiService := services.NewAIService(stockfishPool)
	computerGameService := services.NewComputerGameService(db, aiService, wsManager)

	// Создание роутера
	router := handlers.NewRouter(cfg, computerGameService, wsManager)

	// Watchdog для завершения заброшенных AI-партий
	wd := watchdog.New(db, wsManager, computerGameService)
	go wd.Start()
	defer wd.Stop()

	// Настройка HTTP сервера
	srv := &http.Server{
		Addr:    fmt.Sprintf(":%d", cfg.Port),
		Handler: router,
	}

	// Запуск сервера в горутине
	go func() {
		log.Printf("Starting computer games service on port %d", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Failed to start server: %v", err)
		}
	}()

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down server...")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}

	log.Println("Server exited")
}
