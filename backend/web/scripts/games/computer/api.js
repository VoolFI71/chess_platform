(() => {
  'use strict';

  const API_BASE = '/api/computer-games';

  // Получить токен доступа
  function getAccessToken() {
    try {
      return localStorage.getItem('access_token');
    } catch {
      return null;
    }
  }

  // Получить session ID
  function getSessionID() {
    try {
      return localStorage.getItem('session_id') || sessionStorage.getItem('session_id');
    } catch {
      return null;
    }
  }

  // Построить URL
  function buildUrl(path) {
    return `${API_BASE}${path}`;
  }

  // Используем единую apiFetch из auth.js
  async function authedFetch(url, options = {}) {
    if (window.apiFetch && typeof window.apiFetch === 'function') {
      const response = await window.apiFetch(url, options);
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(error.error || `HTTP ${response.status}`);
      }
      return response.json();
    }
    // Fallback если apiFetch не загружен
    console.warn('apiFetch not available, using direct fetch');
    const token = getAccessToken();
    const sessionID = getSessionID();
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    } else if (sessionID) {
      headers['X-Session-ID'] = sessionID;
    }
    const response = await fetch(url, { ...options, headers });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }
    return response.json();
  }

  // Создать игру с компьютером
  async function createComputerGame(playerColor, aiLevel) {
    const url = buildUrl('');
    const body = {
      creator_color: playerColor,
      ai_skill_level: aiLevel,
      time_control: {
        initial_ms: 0, // Без контроля времени для компьютерных игр
        increment_ms: 0,
        type: 'unlimited',
      },
    };

    return authedFetch(url, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  // Получить игру
  async function getGame(gameId) {
    const url = buildUrl(`/${gameId}`);
    return authedFetch(url);
  }

  // Получить ходы игры
  async function getMoves(gameId) {
    const url = buildUrl(`/${gameId}/moves`);
    return authedFetch(url);
  }

  // Сдаться в партии
  async function resign(gameId) {
    const url = buildUrl(`/${gameId}/resign`);
    return authedFetch(url, { method: 'POST' });
  }

  // Export
  window.ComputerGameApi = {
    createComputerGame,
    getGame,
    getMoves,
    resign,
    buildUrl,
    getAccessToken,
    getSessionID,
    // Используем единую apiFetch из auth.js
    authedFetch: (url, options = {}) => {
      if (window.apiFetch && typeof window.apiFetch === 'function') {
        return window.apiFetch(url, options).then(response => {
          if (!response.ok) {
            return response.json().then(error => {
              throw new Error(error.error || `HTTP ${response.status}`);
            }).catch(() => {
              throw new Error(`HTTP ${response.status}`);
            });
          }
          return response.json();
        });
      }
      return authedFetch(url, options);
    },
  };
})();

