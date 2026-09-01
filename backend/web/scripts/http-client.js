(() => {
  'use strict';

  const API_ENDPOINTS = {
    REFRESH: '/api/auth/refresh',
  };
  let refreshPromise = null;

  function createHeaders(options = {}) {
    const headers = new Headers(options.headers);
    if (options.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    return headers;
  }

  async function refreshSession() {
    if (refreshPromise) return refreshPromise;

    refreshPromise = (async () => {
      try {
        const response = await fetch(API_ENDPOINTS.REFRESH, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        });
        return response.ok;
      } catch {
        return false;
      } finally {
        refreshPromise = null;
      }
    })();

    return refreshPromise;
  }

  async function apiFetch(path, options = {}) {
    if (typeof path !== 'string' || path.length === 0) {
      throw new Error('HTTP request path is required');
    }
    const requestOptions = {
      ...options,
      credentials: options.credentials || 'include',
      headers: createHeaders(options),
    };

    const response = await fetch(path, requestOptions);
    if (response.status !== 401 && response.status !== 403) return response;
    if (!await refreshSession()) return response;

    return fetch(path, {
      ...requestOptions,
      headers: createHeaders(options),
    });
  }

  async function errorMessage(response) {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const payload = await response.json();
      if (payload && typeof payload === 'object') {
        return payload.detail || payload.message || payload.error || response.statusText;
      }
    }
    const text = await response.text();
    return text || response.statusText;
  }

  if (!window.App) window.App = {};
  window.App.Http = {
    apiFetch,
    errorMessage,
    refreshSession,
  };
})();
