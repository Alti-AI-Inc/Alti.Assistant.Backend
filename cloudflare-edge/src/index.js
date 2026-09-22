export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const clientIP = request.headers.get('CF-Connecting-IP') || '';
    const country = request.cf?.country || 'US';

    // 1. CORS Preflight Handling
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
          'Access-Control-Max-Age': '86400',
        }
      });
    }

    // 2. Geo-Routing and Upstream Selection
    let upstream = env.FRONTEND_URL;
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) {
      upstream = env.BACKEND_URL;
    }

    const proxyUrl = new URL(url.pathname + url.search, upstream);
    const proxyRequest = new Request(proxyUrl, request);
    
    // Inject edge headers
    proxyRequest.headers.set('X-Aphura-Edge-Country', country);
    proxyRequest.headers.set('X-Aphura-Edge-IP', clientIP);

    // 3. Edge Caching for Static Assets / Read-only API
    const cache = caches.default;
    const isCacheable = request.method === 'GET' && 
                        (url.pathname.match(/\.(js|css|png|jpg|svg|ico)$/) || 
                         url.pathname.startsWith('/api/v1/api-map'));
    
    if (isCacheable) {
      let response = await cache.match(request);
      if (!response) {
        response = await fetch(proxyRequest);
        response = new Response(response.body, response);
        response.headers.set('Cache-Control', 'public, max-age=86400');
        ctx.waitUntil(cache.put(request, response.clone()));
      }
      return response;
    }

    // 4. Pass-through for dynamic content
    return fetch(proxyRequest);
  }
};
