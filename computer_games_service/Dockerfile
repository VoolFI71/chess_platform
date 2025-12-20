# Multi-stage build для оптимизации размера
FROM golang:1.21-alpine AS builder

WORKDIR /app

# Копируем go.mod и go.sum
COPY go.mod go.sum ./

# Загружаем зависимости
RUN go mod download

# Копируем исходники
COPY . .

# Собираем бинарник
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o /app/server ./cmd/server

# Финальный образ
FROM alpine:latest

# Устанавливаем необходимые зависимости для компиляции Stockfish
# Оставляем libstdc++ и libgcc для runtime (нужны для выполнения бинарника Stockfish)
RUN apk --no-cache add \
    ca-certificates \
    libstdc++ \
    libgcc \
    && apk --no-cache add --virtual .build-deps \
    wget \
    unzip \
    make \
    g++ \
    && wget -q https://github.com/official-stockfish/Stockfish/archive/refs/heads/master.zip -O /tmp/stockfish.zip \
    && unzip -q /tmp/stockfish.zip -d /tmp \
    && cd /tmp/Stockfish-master/src \
    && make -j$(nproc) build ARCH=x86-64-modern \
    && mv stockfish /usr/bin/stockfish \
    && chmod +x /usr/bin/stockfish \
    && cd / \
    && rm -rf /tmp/Stockfish-master /tmp/stockfish.zip \
    && apk del .build-deps \
    && stockfish --help > /dev/null 2>&1 || true

WORKDIR /root/

# Копируем бинарник из builder
COPY --from=builder /app/server .

EXPOSE 8000

CMD ["./server"]

