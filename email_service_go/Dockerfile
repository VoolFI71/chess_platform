# Multi-stage build для оптимизации размера
FROM golang:1.21-alpine AS builder

WORKDIR /app

# Копируем go.mod
COPY go.mod ./

# Копируем исходники (нужно для go mod tidy)
COPY . .

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
COPY --from=builder /app/internal/templates ./templates

EXPOSE 8000

CMD ["./server"]

