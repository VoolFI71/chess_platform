(() => {
  'use strict';

  let wsConnection = null;

  // Получить WebSocket URL с token/session_id для аутентификации
  function getWSUrl(gameId) {
    const api = window.ComputerGameApi;
    const params = {};
    if (api && api.getAccessToken) {
      const token = api.getAccessToken();
      if (token) params.token = token;
    }
    if (api && api.getSessionID) {
      const sessionId = api.getSessionID();
      if (sessionId) params.session_id = sessionId;
    }
    return window.WebSocketUtils.createWebSocketUrl(`/ws/computer-games/${gameId}`, params);
  }

  // Подключиться к WebSocket
  function connect(gameId) {
    const state = window.ComputerGameState;
    if (!state) {
      return;
    }

    // Отключаемся от предыдущего подключения, если есть
    if (wsConnection) {
      disconnect();
    }

    const url = getWSUrl(gameId);

    wsConnection = window.WebSocketUtils.createWebSocketConnection({
      url,
      onMessage: handleMessage,
      onConnect: (ws) => {
        state.setWS(ws);
        state.setWSConnected(true);
        onConnect();
      },
      onDisconnect: (event) => {
        state.setWS(null);
        state.setWSConnected(false);
      },
      onError: (error, type) => {
        // WebSocket error
      },
      maxReconnectAttempts: 5,
      baseDelay: 1000,
      maxDelay: 30000,
    });
  }

  // Обработка подключения
  function onConnect() {
    const state = window.ComputerGameState;
    if (!state) return;

    // Запрашиваем текущее состояние игры
    const game = state.getGame();
    if (game) {
      // Можно отправить запрос на получение обновлений
    }
  }

  // Обработка сообщений
  function handleMessage(message) {
    const state = window.ComputerGameState;
    if (!state) return;

    switch (message.type) {
      case 'game_update':
        if (message.game) {
          state.setGame(message.game);
          state.updatePlayerTurn();
          
          // Загружаем ходы если есть
          if (message.game.moves) {
            state.setMoves(message.game.moves);
          }
          
          // Предгенерируем ходы перед обновлением UI
          if (window.ComputerGameBoard && window.ComputerGameBoard.updateLegalMoves) {
            window.ComputerGameBoard.updateLegalMoves();
          }
          
          // Обновляем UI
          updateUI();
        }
        break;

      case 'move':
        // Ход был применен
        if (message.move) {
          state.addMove(message.move);
          state.updatePlayerTurn();
          // Предгенерируем ходы перед обновлением UI
          if (window.renderComputerGameBoard && window.ComputerGameBoard && window.ComputerGameBoard.updateLegalMoves) {
            window.ComputerGameBoard.updateLegalMoves();
          }
          updateUI();
        }
        break;

      case 'error':
        showToast(message.error || 'Произошла ошибка', 'error');
        break;

      default:
        }
  }

  // Отправить ход
  function sendMove(uci) {
    if (!wsConnection || !wsConnection.isConnected()) {
      showToast('Нет соединения с сервером', 'error');
      return;
    }

    const message = {
      type: 'move',
      uci: uci,
    };

    try {
      wsConnection.send(message);
    } catch (error) {
      showToast('Не удалось отправить ход', 'error');
    }
  }

  // Отключиться
  function disconnect() {
    if (wsConnection) {
      wsConnection.disconnect();
      wsConnection = null;
    }

    const state = window.ComputerGameState;
    if (state) {
      state.setWS(null);
      state.setWSConnected(false);
    }
  }

  // Обновить UI
  function updateUI() {
    // Обновляем доску
    if (window.renderComputerGameBoard) {
      window.renderComputerGameBoard();
    }

    // Обновляем список ходов
    if (window.updateComputerGameMoves) {
      window.updateComputerGameMoves();
    }

    // Обновляем информацию об игре
    if (window.updateComputerGameInfo) {
      window.updateComputerGameInfo();
    }
  }

  // Показать уведомление
  function showToast(message, type = 'info') {
    const toast = document.getElementById('gamesToast');
    if (!toast) return;
    toast.textContent = message;
    toast.className = `toast show ${type === 'error' ? 'error' : ''}`;
    setTimeout(() => {
      toast.className = 'toast';
    }, 4000);
  }

  // Export
  window.ComputerGameWebSocket = {
    connect,
    disconnect,
    sendMove,
    isConnected: () => wsConnection && wsConnection.isConnected(),
  };
})();

