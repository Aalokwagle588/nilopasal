/**
 * Cloudflare Pages Function: /health proxy
 */
export async function onRequest(context) {
  const { request, env } = context;
  const backendOrigin = env?.BACKEND_API_ORIGIN || 'https://nilopasal-api.onrender.com';
  const targetUrl = `${backendOrigin}/health`;

  try {
    const response = await fetch(targetUrl, {
      method: request.method,
      headers: request.headers,
    });
    return response;
  } catch (err) {
    return new Response(
      JSON.stringify({
        success: false,
        status: 'offline',
        message: 'Backend server not responding',
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
