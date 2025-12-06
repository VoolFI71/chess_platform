.PHONY: build run test clean docker-build docker-run

build:
	go build -o server ./cmd/server

run:
	go run ./cmd/server/main.go

test:
	go test -v ./...

clean:
	rm -f server
	go clean

docker-build:
	docker build -t games-service-go:latest .

docker-run:
	docker run -p 8001:8000 \
		-e DATABASE_URL="postgresql://chess_user:chess_password@host.docker.internal:5432/chess_db" \
		-e JWT_SECRET="your-secret-key" \
		-e GAMES_INTERNAL_TOKEN="internal-token" \
		games-service-go:latest

deps:
	go mod download
	go mod tidy

fmt:
	go fmt ./...

lint:
	golangci-lint run

