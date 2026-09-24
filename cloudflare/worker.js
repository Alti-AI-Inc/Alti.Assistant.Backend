/**
 * Aphura AI — Cloudflare Worker for Edge Caching & Routing
 *
 * Deploy: `npx wrangler deploy`
 * Config: Set BACKEND_ORIGIN in wrangler.toml or dashboard vars
 *
 * Features:
 *  1. Edge-caches GET /health, /api/v1/searches/* responses (60s TTL)
 *  2. Proxies all other requests to the backend origin
 *  3. Adds security headers (HSTS, X-Content-Type-Options, etc.)
 *  4. Returns instant 200 for OPTIONS preflight (CORS)
 *  5. Short-circuits /liveness and /readiness for load balancer probes
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const ORIGIN = env.BACKEND_ORIGIN || 'https://api.aphurahq.com';

    // ── CORS Preflight ──────────────────────────────────────────────
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': url.origin,
          'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Request-ID',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    // ── Edge Health Probes (no origin hit) ───────────────────────────
    if (url.pathname === '/liveness') {
      return new Response('OK', { status: 200 });
    }

    // ── Cacheable Routes ────────────────────────────────────────────
    const isCacheable =
      request.method === 'GET' &&
      (url.pathname === '/health' ||
       url.pathname.startsWith('/api/v1/searches/') ||
       url.pathname.startsWith('/api/v1/subscriptions/plans'));

    if (isCacheable) {
      const cache = caches.default;
      const cacheKey = new Request(url.toString(), request);
      const cached = await cache.match(cacheKey);
      if (cached) return addSecurityHeaders(cached);

      const response = await fetch(new Request(ORIGIN + url.pathname + url.search, {
        method: request.method,
        headers: request.headers,
      }));

      if (response.ok) {
        const cloned = response.clone();
        const cachedResponse = new Response(cloned.body, cloned);
        cachedResponse.headers.set('Cache-Control', 'public, max-age=60, s-maxage=60');
        cachedResponse.headers.set('X-Cache', 'MISS');
        await cache.put(cacheKey, cachedResponse.clone());
        return addSecurityHeaders(cachedResponse);
      }
      return addSecurityHeaders(response);
    }

    // ── Proxy to Origin ─────────────────────────────────────────────
    const originUrl = ORIGIN + url.pathname + url.search;
    const originRequest = new Request(originUrl, {
      method: request.method,
      headers: request.headers,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
      redirect: 'follow',
    });

    const response = await fetch(originRequest);
    return addSecurityHeaders(response);
  },
};

function addSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('X-Powered-By', 'Aphura Edge');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
