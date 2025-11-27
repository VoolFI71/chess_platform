// Управление именами игроков
(() => {
  const playerUsernames = new Map();
  const { normalizeUserId } = window.MatchUtils || {};

  window.MatchPlayerNames = playerUsernames;

  window.MatchPlayerNamesUtils = {
    usernameFromCache(id) {
      const key = normalizeUserId ? normalizeUserId(id) : (id !== null && id !== undefined ? Number(id) : null);
      if (key === null) return null;
      return playerUsernames.has(key) ? playerUsernames.get(key) : null;
    },

    storeUsername(id, username) {
      const key = normalizeUserId ? normalizeUserId(id) : (id !== null && id !== undefined ? Number(id) : null);
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
      const cached = this.usernameFromCache(userId);
      if (cached) return cached;
      try {
        const res = await fetch(`/api/users/${userId}`);
        if (!res.ok) return null;
        const user = await res.json();
        const username = user?.username || null;
        this.storeUsername(userId, username);
        return username;
      } catch (err) {
        console.error('Failed to fetch username:', err);
        return null;
      }
    },

    async ensurePlayerUsernames(game) {
      if (!game) return;
      const promises = [];
      if (game.white_id) promises.push(this.fetchUsername(game.white_id));
      if (game.black_id) promises.push(this.fetchUsername(game.black_id));
      await Promise.all(promises);
    },
  };
})();

