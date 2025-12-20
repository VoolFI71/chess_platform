// WebSocket utilities - общая логика для WebSocket подключений
(() => {
  'use strict';

  /**
   * Создает и управляет WebSocket подключением с автоматическим переподключением
   * @param {Object} options - Опции подключения
   * @param {string} options.url - WebSocket URL
   * @param {Function} options.onMessage - Обработчик входящих сообщений
   * @param {Function} [options.onConnect] - Callback при подключении
   * @param {Function} [options.onDisconnect] - Callback при отключении
   * @param {Function} [options.onError] - Callback при ошибке
   * @param {number} [options.maxReconnectAttempts=5] - Максимальное количество попыток переподключения
   * @param {number} [options.baseDelay=1000] - Базовая задержка переподключения (мс)
   * @param {number} [options.maxDelay=30000] - Максимальная задержка переподключения (мс)
   * @returns {Object} - Объект с методами управления подключением
   */
  function createWebSocketConnection(options) {
    const {
      url,
      onMessage,
      onConnect,
      onDisconnect,
      onError,
      maxReconnectAttempts = 5,
      baseDelay = 1000,
      maxDelay = 30000,
    } = options;

    let ws = null;
    let reconnectAttempts = 0;
    let reconnectTimer = null;
    let isManualDisconnect = false;

    function connect() {
      if (ws && ws.readyState === WebSocket.OPEN) {
        return;
      }

      if (isManualDisconnect) {
        return;
      }

      try {
        ws = new WebSocket(url);

        ws.onopen = () => {
          reconnectAttempts = 0;
          isManualDisconnect = false;
          if (onConnect) {
            onConnect(ws);
          }
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            if (onMessage) {
              onMessage(message, ws);
            }
          } catch (error) {
            // Failed to parse message
            if (onError) {
              onError(error, 'parse');
            }
          }
        };

        ws.onerror = (error) => {
          if (onError) {
            onError(error, 'connection');
          }
        };

        ws.onclose = (event) => {
          ws = null;

          if (onDisconnect) {
            onDisconnect(event);
          }

          // Пытаемся переподключиться если не было нормального закрытия и не было ручного отключения
          if (
            !isManualDisconnect &&
            event.code !== 1000 &&
            reconnectAttempts < maxReconnectAttempts
          ) {
            scheduleReconnect();
          }
        };
      } catch (error) {
        if (onError) {
          onError(error, 'connection');
        }
        if (reconnectAttempts < maxReconnectAttempts) {
          scheduleReconnect();
        }
      }
    }

    function scheduleReconnect() {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }

      reconnectAttempts++;
      const delay = Math.min(
        baseDelay * Math.pow(2, reconnectAttempts - 1),
        maxDelay
      );

      reconnectTimer = setTimeout(() => {
        connect();
      }, delay);
    }

    function disconnect() {
      isManualDisconnect = true;

      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }

      if (ws) {
        ws.close(1000, 'User disconnect');
        ws = null;
      }

      reconnectAttempts = 0;
    }

    function send(data) {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        throw new Error('WebSocket is not connected');
      }
      ws.send(typeof data === 'string' ? data : JSON.stringify(data));
    }

    function isConnected() {
      return ws && ws.readyState === WebSocket.OPEN;
    }

    function getWebSocket() {
      return ws;
    }

    // Автоматически подключаемся при создании
    connect();

    return {
      connect,
      disconnect,
      send,
      isConnected,
      getWebSocket,
    };
  }

  /**
   * Создает WebSocket URL на основе текущего протокола и хоста
   * @param {string} path - Путь WebSocket (например, '/ws/games/123')
   * @param {Object} [params] - Query параметры
   * @returns {string} - Полный WebSocket URL
   */
  function createWebSocketUrl(path, params = {}) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    let url = `${protocol}//${host}${path}`;

    const queryString = Object.entries(params)
      .filter(([_, value]) => value != null && value !== '')
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&');

    if (queryString) {
      url += `?${queryString}`;
    }

    return url;
  }

  // Export
  window.WebSocketUtils = {
    createWebSocketConnection,
    createWebSocketUrl,
  };
})();
