(() => {
  const isLocalHost = (hostname) => hostname === '127.0.0.1' || hostname === 'localhost';

  const computeApiBase = () => {
    const { protocol, hostname, port } = window.location;
    if (isLocalHost(hostname)) {
      return `${protocol}//${hostname}:8080`;
    }
    return `${protocol}//${hostname}${port ? `:${port}` : ''}`;
  };

  const API_BASE = computeApiBase();

  const buildUrl = (path) => {
    if (!path) return '';
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    if (path.startsWith('/')) return path;
    return `${API_BASE}/${path.replace(/^\/+/, '')}`;
  };

  // Используем функции из auth.js, если доступны, с fallback на локальные
  const getAccessToken = () => {
    if (window.getAccessToken && typeof window.getAccessToken === 'function') {
      return window.getAccessToken();
    }
    try {
      return localStorage.getItem('access_token') || '';
    } catch {
      return '';
    }
  };

  const getRefreshToken = () => {
    try {
      return localStorage.getItem('refresh_token') || '';
    } catch {
      return '';
    }
  };

  const setTokens = (access, refresh) => {
    if (window.setTokens && typeof window.setTokens === 'function') {
      window.setTokens(access, refresh);
      return;
    }
    try {
      if (access) localStorage.setItem('access_token', access);
      if (refresh) localStorage.setItem('refresh_token', refresh);
    } catch {
      // ignore storage errors
    }
  };

  const clearTokens = () => {
    if (window.clearTokens && typeof window.clearTokens === 'function') {
      window.clearTokens();
      return;
    }
    try {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
    } catch {
      // ignore storage errors
    }
  };

  async function refreshAccessToken() {
    const rt = getRefreshToken();
    if (!rt) return false;
    try {
      const refreshRes = await fetch(buildUrl('/api/auth/refresh'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: rt }),
      });
      if (!refreshRes.ok) return false;
      const data = await refreshRes.json();
      setTokens(data.access_token, data.refresh_token);
      return true;
    } catch {
      return false;
    }
  }

  // Используем единую apiFetch из auth.js с кастомным buildUrl
  async function authedFetch(path, options = {}) {
    if (window.apiFetch && typeof window.apiFetch === 'function') {
      return window.apiFetch(path, { ...options, buildUrl });
    }
    // Fallback если apiFetch не загружен (не должен происходить в нормальных условиях)
    console.warn('apiFetch not available, using direct fetch');
    const headers = new Headers(options.headers || {});
    const token = getAccessToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    return fetch(buildUrl(path), { ...options, headers });
  }

  window.MatchApi = {
    buildUrl,
    // Используем единую apiFetch из auth.js с кастомным buildUrl
    authedFetch: (path, options = {}) => {
      if (window.apiFetch && typeof window.apiFetch === 'function') {
        return window.apiFetch(path, { ...options, buildUrl });
      }
      return authedFetch(path, options);
    },
    getAccessToken,
    getRefreshToken,
    setTokens,
    clearTokens,
    refreshAccessToken,
  };
})();

