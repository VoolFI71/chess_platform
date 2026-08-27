package middleware

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

func MetricsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		path := c.FullPath()
		if path == "" {
			path = c.Request.URL.Path
		}

		c.Next()

		duration := time.Since(start).Seconds()
		method := c.Request.Method
		status := strconv.Itoa(c.Writer.Status())
		sc := StatusClass(status)
		handler := NormalizePath(path)

		httpRequestsTotal.WithLabelValues(method, sc, handler).Inc()
		httpRequestDurationSeconds.WithLabelValues(method, handler).Observe(duration)
	}
}

func NormalizePath(path string) string {
	if path == "" {
		return "none"
	}
	return path
}

func StatusClass(status string) string {
	if len(status) < 1 {
		return "unknown"
	}
	switch status[0] {
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
