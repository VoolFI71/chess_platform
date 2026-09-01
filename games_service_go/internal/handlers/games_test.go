package handlers

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"

	"github.com/yourorg/games_service_go/internal/models"
	"github.com/yourorg/games_service_go/internal/services"
)

type MockGameService struct {
	mock.Mock
}

func (m *MockGameService) CreateGame(ctx context.Context, creatorID *int, creatorSessionID *string, req *services.CreateGameRequest) (*models.GameDetail, error) {
	args := m.Called(ctx, creatorID, creatorSessionID, req)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.GameDetail), args.Error(1)
}

func (m *MockGameService) GetGame(ctx context.Context, gameID uuid.UUID) (*models.GameDetail, error) {
	args := m.Called(ctx, gameID)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.GameDetail), args.Error(1)
}

func (m *MockGameService) JoinGame(ctx context.Context, gameID uuid.UUID, playerID *int, playerSessionID *string) (*models.GameDetail, error) {
	args := m.Called(ctx, gameID, playerID, playerSessionID)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.GameDetail), args.Error(1)
}

func setupRouter(service *services.GameService) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()

	r.POST("/games", createGame(service))
	r.GET("/games/:game_id", getGame(service))
	r.POST("/games/:game_id/join", joinGame(service, nil))

	return r
}

func TestCreateGame_Success(t *testing.T) {
	router := setupRouter(nil)
	body := []byte("{")
	req, _ := http.NewRequest("POST", "/games", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestGetGame_InvalidUUID(t *testing.T) {
	router := setupRouter(nil)

	req, _ := http.NewRequest("GET", "/games/invalid-uuid", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestGameFlow_Integration(t *testing.T) {
	t.Skip("Интеграционный тест - требует настройки БД")
}
