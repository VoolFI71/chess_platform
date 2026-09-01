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

	"github.com/redis/go-redis/v9"

	"github.com/yourorg/games_service_go/internal/config"
	"github.com/yourorg/games_service_go/internal/database"
	"github.com/yourorg/games_service_go/internal/handlers"
	"github.com/yourorg/games_service_go/internal/realtime"
	"github.com/yourorg/games_service_go/internal/services"
	"github.com/yourorg/games_service_go/internal/watchdog"
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

	// Инициализация менеджера WebSocket соединений для игр
	wsManager := realtime.NewConnectionManager()

	// Инициализация менеджера WebSocket соединений для статистики
	statsManager := realtime.NewStatsConnectionManager()

	// Связываем ConnectionManager со StatsConnectionManager для автоматической отправки обновлений
	realtime.SetStatsBroadcaster(func(onlinePlayers int, activeGames int) error {
		return statsManager.BroadcastStats(onlinePlayers, activeGames)
	})

	// Запуск watchdog для проверки таймаутов
	wd := watchdog.New(db, wsManager)
	go wd.Start()
	defer wd.Stop()

	// Initialize Redis and Matchmaking
	var matchmakingSvc *services.MatchmakingService
	mmConnManager := realtime.NewMatchmakingConnectionManager()
	realtimeCtx, cancelRealtime := context.WithCancel(context.Background())
	defer cancelRealtime()
	if cfg.RedisURL != "" {
		opts, err := redis.ParseURL(cfg.RedisURL)
		if err != nil {
			log.Printf("Warning: failed to parse REDIS_URL: %v", err)
		} else {
			rdb := redis.NewClient(opts)
			if err := rdb.Ping(context.Background()).Err(); err != nil {
				log.Printf("Warning: failed to connect to Redis: %v", err)
			} else {
				log.Println("Connected to Redis successfully")
				eventBus := realtime.NewRedisEventBus(rdb)
				wsManager.SetPublisher(eventBus)
				wsManager.SetViewerPublisher(eventBus)
				go wsManager.StartViewerPresence(realtimeCtx)
				go func() {
					if err := eventBus.Subscribe(realtimeCtx, wsManager.BroadcastRemote, mmConnManager.NotifyMatch, wsManager.UpdateRemoteViewerCount); err != nil && realtimeCtx.Err() == nil {
						log.Printf("Warning: realtime Redis subscription stopped: %v", err)
					}
				}()
				gameService := services.NewGameService(db)
				matchmakingSvc = services.NewMatchmakingService(rdb, db, gameService)
				matchmakingSvc.SetNotifier(eventBus)
				defer rdb.Close()
			}
		}
	}

	// Создание HTTP роутера
	router := handlers.NewRouter(db, wsManager, statsManager, cfg, matchmakingSvc, mmConnManager)

	// Создание HTTP сервера
	srv := &http.Server{
		Addr:         fmt.Sprintf(":%d", cfg.Port),
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Graceful shutdown
	go func() {
		log.Printf("Games service (Go) starting on port %d", cfg.Port)
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
