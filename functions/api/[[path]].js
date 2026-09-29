/**
 * Cloudflare Pages Function: /api/* reverse proxy
 * Automatically routes all /api/* requests on nilopasal.com to the backend API.
 */
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // Backend URL can be set in Cloudflare Pages Environment Variables as BACKEND_API_ORIGIN
  // Defaults to production Render deployment
  const backendOrigin = env?.BACKEND_API_ORIGIN || 'https://nilopasal-api.onrender.com';
  const targetUrl = `${backendOrigin}${url.pathname}${url.search}`;

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
          code: 'API_BACKEND_UNAVAILABLE',
          message: 'The Nilopasal API backend server is currently starting up or offline. Please retry in a few moments.',
        },
      }),
      {
        status: 502,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Allow-Origin': url.origin,
        },
      }
    );
  }
}
