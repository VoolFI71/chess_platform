# Multi-stage build для оптимизации размера
FROM golang:1.24-alpine AS builder

WORKDIR /app

# Копируем shared модуль и сервис
COPY go_shared ./go_shared
COPY games_service_go ./games_service_go

WORKDIR /app/games_service_go

# Загружаем зависимости
RUN go mod download

# Собираем бинарник
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o /app/server ./cmd/server

# Финальный образ
FROM alpine:latest

RUN apk --no-cache add ca-certificates

WORKDIR /root/

# Копируем бинарник из builder
COPY --from=builder /app/server .

EXPOSE 8000

CMD ["./server"]
