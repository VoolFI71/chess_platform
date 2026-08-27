# Multi-stage build для оптимизации размера
FROM golang:1.24-alpine AS builder

WORKDIR /app

# Копируем shared модуль и сервис
COPY go_shared ./go_shared
COPY email_service_go ./email_service_go

WORKDIR /app/email_service_go

# Обновляем go.sum и загружаем зависимости
RUN go mod tidy && go mod download

# Собираем бинарник
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o /app/server ./cmd/server

# Финальный образ
FROM alpine:latest

RUN apk --no-cache add ca-certificates

WORKDIR /root/

# Копируем бинарник из builder
COPY --from=builder /app/server .

# Копируем шаблоны писем
COPY --from=builder /app/email_service_go/internal/templates ./templates

EXPOSE 8000

CMD ["./server"]
