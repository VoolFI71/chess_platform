// Управление именами игроков
(() => {
  const playerUsernames = new Map();
  const { normalizeUserId } = window.MatchUtils || {};
  const MatchApi = window.MatchApi;

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
        // Используем buildUrl и authedFetch из MatchApi, если доступны
        const url = MatchApi?.buildUrl ? MatchApi.buildUrl(`/api/users/${userId}`) : `/api/users/${userId}`;
        const res = MatchApi?.authedFetch ? await MatchApi.authedFetch(`/api/users/${userId}`) : await fetch(url);
        if (!res.ok) return null;
        const user = await res.json();
        const username = user?.username || user?.display_name || user?.name || user?.handle || user?.login || null;
        utils.storeUsername(userId, username);
        return username;
      } catch (err) {
        console.error('Failed to fetch username:', err);
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

