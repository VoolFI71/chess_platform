(() => {
  const http = window.App?.Http;
  if (!http || typeof http.apiFetch !== 'function') {
    throw new Error('App.Http is not initialized');
  }

  const refreshAccessToken = () => http.refreshSession();

  async function authedFetch(path, options = {}) {
    return http.apiFetch(path, options);
  }

  window.MatchApi = {
    authedFetch,
    refreshAccessToken,
  };
})();

