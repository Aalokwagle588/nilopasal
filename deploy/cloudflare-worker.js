/**
 * Nilopasal Cloudflare Worker — Production API Reverse Proxy
 *
 * Routes all /api/* and /health traffic on nilopasal.com directly to the
 * backend cloud service (e.g. Render / Railway / VPS), while allowing all
 * static HTML/CSS/JS assets to pass through seamlessly.
 *
 * Setup in Cloudflare Dashboard:
 * 1. Workers & Pages -> Create Application -> Create Worker
 * 2. Paste this code
 * 3. Set BACKEND_API_ORIGIN in Settings -> Variables (or edit default below)
 * 4. Add Route: `nilopasal.com/api/*` and `nilopasal.com/health` -> this worker
 */

const DEFAULT_BACKEND_ORIGIN = 'https://nilopasal-api.onrender.com';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const backendOrigin = env?.BACKEND_API_ORIGIN || DEFAULT_BACKEND_ORIGIN;

    // Check if path is an API endpoint or health check
    if (url.pathname.startsWith('/api') || url.pathname === '/health') {
      const targetUrl = `${backendOrigin}${url.pathname}${url.search}`;

      // Clone original headers and append forward proxy metadata
      const headers = new Headers(request.headers);
      headers.set('X-Forwarded-Host', url.host);
      headers.set('X-Forwarded-Proto', url.protocol.replace(':', ''));

      const clientIp = request.headers.get('cf-connecting-ip');
      if (clientIp) {
        headers.set('X-Forwarded-For', clientIp);
      }

      const proxyRequest = new Request(targetUrl, {
        method: request.method,
        headers,
        body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
        redirect: 'manual',
      });

      try {
        const response = await fetch(proxyRequest);

        // Copy response with CORS headers if needed
        const newHeaders = new Headers(response.headers);
        newHeaders.set('Access-Control-Allow-Credentials', 'true');
        newHeaders.set('Access-Control-Allow-Origin', url.origin);

        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: newHeaders,
        });
      } catch (err) {
        return new Response(
          JSON.stringify({
            success: false,
            error: {
              code: 'BAD_GATEWAY',
              message: 'Unable to reach Nilopasal backend service. Please check server status.',
            },
          }),
          {
            status: 502,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      }
    }

    // Pass through non-API requests (HTML, JS, CSS, images) to default origin
    return fetch(request);
  },
};
