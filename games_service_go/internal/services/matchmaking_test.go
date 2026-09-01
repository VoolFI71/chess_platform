package services

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/yourorg/games_service_go/internal/models"
)

func TestQueueKeySeparatesRatedAndCasualGames(t *testing.T) {
	service := NewMatchmakingService(nil, nil, NewGameService(nil))
	timeControl := &models.TimeControl{InitialMs: 180000, IncrementMs: 2000}

	rated := service.queueKey(timeControl, true)
	casual := service.queueKey(timeControl, false)

	require.NotEqual(t, rated, casual)
	require.Contains(t, rated, "rated")
	require.Contains(t, casual, "casual")
}
