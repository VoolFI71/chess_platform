package handlers

import (
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

var (
	httpRequestsTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "http_requests_total",
			Help: "Total number of requests by method, status and handler.",
		},
		[]string{"method", "status", "handler"},
	)

	httpRequestDurationSeconds = promauto.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "http_request_duration_seconds",
			Help:    "Latency with only few buckets by handler. Made to be only used if aggregation by handler is important.",
			Buckets: []float64{0.1, 0.5, 1.0},
		},
		[]string{"method", "handler"},
	)
)

// MetricsMiddleware добавляет метрики для всех HTTP запросов
func MetricsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		path := c.FullPath()
		if path == "" {
			path = c.Request.URL.Path
		}

		// Обрабатываем запрос
		c.Next()

		// Записываем метрики после обработки
		duration := time.Since(start).Seconds()
		method := c.Request.Method
		status := strconv.Itoa(c.Writer.Status())
		statusClass := statusClass(status)

		// Используем handler как метку (путь без параметров)
		handler := normalizePath(path)

		httpRequestsTotal.WithLabelValues(method, statusClass, handler).Inc()
		httpRequestDurationSeconds.WithLabelValues(method, handler).Observe(duration)
	}
}

// normalizePath нормализует путь для использования в метриках
func normalizePath(path string) string {
	if path == "" {
		return "none"
	}
	// Убираем параметры из пути для группировки
	// Например: /api/computer-games/:game_id -> /api/computer-games/{game_id}
	return path
}

// statusClass возвращает класс статуса (2xx, 3xx, 4xx, 5xx)
func statusClass(status string) string {
	if len(status) < 1 {
		return "unknown"
	}
	firstDigit := status[0]
	switch firstDigit {
	case '2':
		return "2xx"
	case '3':
		return "3xx"
	case '4':
		return "4xx"
	case '5':
		return "5xx"
	default:
		return "unknown"
	}
}
