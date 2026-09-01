(() => {
  'use strict';

  const API_BASE = '/api/computer-games';
  const http = window.App?.Http;
  if (!http || typeof http.apiFetch !== 'function') {
    throw new Error('App.Http is not initialized');
  }

  // Построить URL
  function buildUrl(path) {
    return `${API_BASE}${path}`;
  }

  // Используем единую apiFetch из auth.js
  async function authedFetch(url, options = {}) {
    const response = await http.apiFetch(url, options);
    if (!response.ok) {
      const error = await response.json();
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
    authedFetch: (url, options = {}) => authedFetch(url, options),
  };
})();

