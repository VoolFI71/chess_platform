// Управление именами игроков
(() => {
  const playerUsernames = new Map();
  const { normalizeUserId } = window.MatchUtils || {};
  const MatchApi = window.MatchApi;
  if (!MatchApi || typeof MatchApi.authedFetch !== 'function') {
    throw new Error('MatchApi is not initialized');
  }

  window.MatchPlayerNames = playerUsernames;

  // Вспомогательные функции для работы с ключами
  function getKey(id) {
    return normalizeUserId ? normalizeUserId(id) : (id !== null && id !== undefined ? Number(id) : null);
  }

  // Создаем объект с методами
  const utils = {
    usernameFromCache(id) {
      const key = getKey(id);
      if (key === null) return null;
      return playerUsernames.has(key) ? playerUsernames.get(key) : null;
    },

    storeUsername(id, username) {
      const key = getKey(id);
      if (key === null) return;
      if (typeof username === 'string') {
        const trimmed = username.trim();
        playerUsernames.set(key, trimmed.length ? trimmed : null);
        return;
      }
      playerUsernames.set(key, null);
    },

    async fetchUsername(userId) {
      if (!userId) return null;
      const cached = utils.usernameFromCache(userId);
      if (cached) return cached;
      try {
        const res = await MatchApi.authedFetch(`/api/users/${userId}`);
        if (!res.ok) return null;
        const user = await res.json();
        const username = user?.username || user?.display_name || user?.name || user?.handle || user?.login || null;
        utils.storeUsername(userId, username);
        return username;
      } catch (err) {
        return null;
      }
    },

    async ensurePlayerUsernames(game) {
      if (!game) return;
      const promises = [];
      if (game.white_id) promises.push(utils.fetchUsername(game.white_id));
      if (game.black_id) promises.push(utils.fetchUsername(game.black_id));
      await Promise.all(promises);
    },
  };

  // Экспортируем объект
  window.MatchPlayerNamesUtils = utils;
})();

