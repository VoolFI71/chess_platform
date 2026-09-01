// WebSocket utilities - общая логика для WebSocket подключений
(() => {
  'use strict';

  const lifecycle = window.App?.Utils?.PageLifecycle;
  if (!lifecycle) {
    throw new Error('PageLifecycle is not initialized');
  }

  /**
   * Создает и управляет WebSocket подключением с автоматическим переподключением
   * @param {Object} options - Опции подключения
   * @param {string} options.url - WebSocket URL
   * @param {Function} options.onMessage - Обработчик входящих сообщений
   * @param {Function} [options.onConnect] - Callback при подключении
   * @param {Function} [options.onDisconnect] - Callback при отключении
   * @param {Function} [options.onError] - Callback при ошибке
   * @param {number} [options.maxReconnectAttempts=Infinity] - Максимальное количество попыток переподключения
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
      maxReconnectAttempts = Infinity,
      baseDelay = 1000,
      maxDelay = 30000,
      jitter = 0.25,
    } = options;

    let ws = null;
    let reconnectAttempts = 0;
    let reconnectTimer = null;
    let isManualDisconnect = false;
    let unregisterCleanup = null;

    function connect() {
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        return;
      }

      if (isManualDisconnect) {
        return;
      }

      try {
        const socket = new WebSocket(url);
        ws = socket;

        socket.onopen = () => {
          reconnectAttempts = 0;
          isManualDisconnect = false;
          if (onConnect) {
            onConnect(socket);
          }
        };

        socket.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            if (onMessage) {
              onMessage(message, socket);
            }
          } catch (error) {
            // Failed to parse message
            if (onError) {
              onError(error, 'parse');
            }
          }
        };

        socket.onerror = (error) => {
          if (onError) {
            onError(error, 'connection');
          }
        };

        socket.onclose = (event) => {
          // An old socket must not tear down a newer connection.
          if (ws !== socket) return;
          ws = null;

          if (onDisconnect) {
            onDisconnect(event);
          }

          // Пытаемся переподключиться если не было нормального закрытия и не было ручного отключения
          if (
            !isManualDisconnect &&
            event.code !== 1000 &&
            (maxReconnectAttempts === Infinity || reconnectAttempts < maxReconnectAttempts)
          ) {
            scheduleReconnect();
          }
        };
      } catch (error) {
        if (onError) {
          onError(error, 'connection');
        }
        if (maxReconnectAttempts === Infinity || reconnectAttempts < maxReconnectAttempts) {
          scheduleReconnect();
        }
      }
    }

    function scheduleReconnect() {
      if (reconnectTimer) {
        lifecycle.clearTimeout(reconnectTimer);
      }

      reconnectAttempts++;
      const delay = Math.min(
        baseDelay * Math.pow(2, reconnectAttempts - 1),
        maxDelay
      );
      const jitteredDelay = Math.max(
        0,
        Math.round(delay * (1 + (Math.random() * 2 - 1) * jitter))
      );

      reconnectTimer = lifecycle.setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, jitteredDelay);
    }

    function disconnect() {
      isManualDisconnect = true;

      if (reconnectTimer) {
        lifecycle.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }

      if (ws) {
        ws.close(1000, 'User disconnect');
        ws = null;
      }

      reconnectAttempts = 0;

      if (unregisterCleanup) {
        unregisterCleanup();
        unregisterCleanup = null;
      }
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

    unregisterCleanup = lifecycle.onCleanup(disconnect);

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

  // Создаем неймспейс App если его еще нет
  if (!window.App) {
    window.App = {};
  }
  if (!window.App.WS) {
    window.App.WS = {};
  }

  // Export в новый неймспейс
  window.App.WS = {
    createWebSocketConnection,
    createWebSocketUrl,
  };

})();
