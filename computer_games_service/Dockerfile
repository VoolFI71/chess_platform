# Multi-stage build для оптимизации размера
FROM golang:1.24-alpine AS builder

WORKDIR /app

# go_shared подключается через replace в go.mod
COPY go_shared ./go_shared
COPY computer_games_service ./computer_games_service

WORKDIR /app/computer_games_service
RUN go mod download
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o /app/server ./cmd/server

FROM alpine:latest

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
    && apk del .build-deps

WORKDIR /root/
COPY --from=builder /app/server .

EXPOSE 8000

CMD ["./server"]
