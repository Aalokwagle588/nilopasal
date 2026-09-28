/**
 * Nilopasal API Configuration
 * Supports production reverse-proxy (nilopasal.com/api), local dev (localhost:4000),
 * meta tag overrides, or localStorage override.
 */
(function (global) {
  function getApiBase() {
    if (global.NILOPASAL_API_BASE) return global.NILOPASAL_API_BASE;

    const meta = document.querySelector('meta[name="nilopasal-api-base"]');
    if (meta && meta.content) return meta.content.trim();

    const stored = localStorage.getItem('nilopasal-api-base');
    if (stored) return stored.trim();

    const hostname = global.location ? global.location.hostname : '';
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://localhost:4000';
    }

    // In production on nilopasal.com or reverse-proxied domains, use relative base URL
    return '';
  }

  const API_BASE = getApiBase();
  global.NILOPASAL_API_BASE = API_BASE;

  global.nilopasalApiRequest = async function (path, options = {}) {
    const url = `${API_BASE}${path}`;
    let response;
    try {
      response = await fetch(url, {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {}),
        },
        ...options,
      });
    } catch (err) {
      throw new Error(
        location.hostname === 'localhost' || location.hostname === '127.0.0.1'
          ? 'Cannot reach Nilopasal API. Ensure backend is running on port 4000.'
          : 'Could not connect to the Nilopasal API service. Please try again shortly.'
      );
    }

    const payload = await response.json().catch(() => null);
    if (!payload) {
      throw new Error('Invalid response received from Nilopasal API.');
    }

    if (!response.ok || payload.success === false) {
      const error = new Error(payload.error?.message || 'API request failed.');
      error.code = payload.error?.code;
      error.status = response.status;
      error.payload = payload;
      throw error;
    }

    return payload.data;
  };
})(typeof window !== 'undefined' ? window : this);
