// lib/flaresolverr.js
// FlareSolverr client — bypasses Cloudflare's anti-bot challenge.
//
// FlareSolverr is a proxy server that runs a real Chromium browser
// to solve Cloudflare challenges and returns the cookies + HTML.
//
// Docker setup (1 line):
//   docker run -d --name flaresolverr -p 8191:8191 ghcr.io/flaresolverr/flaresolverr:latest
//
// Or Railway/Hetzner deploy:
//   see docker-compose.yml in repo root
//
// Set FLARESOLVERR_URL env var to enable, e.g.:
//   FLARESOLVERR_URL=http://localhost:8191/v1

const FS_URL = process.env.FLARESOLVERR_URL || '';
const FS_TIMEOUT = parseInt(process.env.FLARESOLVERR_TIMEOUT || '30000', 10);
const FS_MAX_RETRIES = parseInt(process.env.FLARESOLVERR_RETRIES || '2', 10);

export function isFlareSolverrEnabled() {
  return FS_URL && FS_URL.length > 0;
}

/**
 * Make a request via FlareSolverr — solves Cloudflare challenge.
 * Returns the same shape as fetch():
 *   { ok, status, statusText, text(), json(), headers }
 *
 * @param {string} url - URL to fetch
 * @param {object} options - { method, headers, body, maxTimeout }
 * @returns {Promise<object>} fetch-like response
 */
export async function fetchViaFlareSolverr(url, options = {}) {
  if (!isFlareSolverrEnabled()) {
    throw new Error('FlareSolverr not configured. Set FLARESOLVERR_URL env var.');
  }

  const method = (options.method || 'GET').toUpperCase();
  const maxTimeout = options.maxTimeout || FS_TIMEOUT;

  // FlareSolverr v2/v3 API request payload
  const payload = {
    cmd: 'request.get',
    url: url,
    maxTimeout: maxTimeout,
  };

  if (method === 'POST') {
    payload.cmd = 'request.post';
    payload.postData = options.body || '';
  }

  if (options.headers) {
    // FlareSolverr accepts a single User-Agent in payload
    const ua = options.headers['User-Agent'] || options.headers['user-agent'];
    if (ua) payload.userAgent = ua;
  }

  let lastErr;
  for (let attempt = 1; attempt <= FS_MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), maxTimeout + 5000);
      const res = await fetch(`${FS_URL}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) {
        throw new Error(`FlareSolverr HTTP ${res.status}: ${await res.text().catch(() => '')}`);
      }

      const data = await res.json();

      // FlareSolverr always returns 200, with status in body
      if (data.status !== 'ok') {
        throw new Error(`FlareSolverr error: ${data.message || 'unknown'}`);
      }

      // Solution contains: url, status, headers, response (HTML body), cookies
      const sol = data.solution;
      if (!sol) {
        throw new Error('FlareSolverr returned no solution');
      }

      // Return fetch-like response object
      const responseBody = sol.response || '';
      return {
        ok: sol.status >= 200 && sol.status < 400,
        status: sol.status || 200,
        statusText: sol.statusText || 'OK',
        url: sol.url,
        headers: new Map(Object.entries(sol.headers || {})),
        _body: responseBody,
        async text() { return responseBody; },
        async json() { return JSON.parse(responseBody); },
        // Expose cookies for callers that need them
        cookies: sol.cookies || [],
        userAgent: sol.userAgent || '',
      };
    } catch (err) {
      lastErr = err;
      console.warn(`[flaresolverr] attempt ${attempt}/${FS_MAX_RETRIES} failed: ${err.message}`);
      // Wait before retry (exponential backoff)
      if (attempt < FS_MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 500 * attempt));
      }
    }
  }
  throw lastErr || new Error('FlareSolverr failed after retries');
}

/**
 * Smart fetch — tries direct fetch first, falls back to FlareSolverr
 * if Cloudflare challenge detected (403 + cf-mitigated header or
 * challenge HTML body).
 *
 * @param {string} url - URL to fetch
 * @param {object} options - fetch options
 * @returns {Promise<object>} fetch-like response
 */
export async function smartFetch(url, options = {}) {
  const headers = {
    'User-Agent': options.headers?.['User-Agent'] || options.headers?.['user-agent'] ||
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9,hi;q=0.8',
    ...(options.headers || {}),
  };

  // If FlareSolverr not configured, just do a direct fetch
  if (!isFlareSolverrEnabled()) {
    const res = await fetch(url, { ...options, headers });
    return res;
  }

  // Try direct fetch first
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, { ...options, headers, signal: controller.signal });
    clearTimeout(timer);

    // If 403/503 with Cloudflare challenge indicators, retry via FlareSolverr
    if ((res.status === 403 || res.status === 503) && isFlareSolverrEnabled()) {
      const body = await res.text().catch(() => '');
      if (body.includes('cf-mitigated') || body.includes('challenge-platform') ||
          body.includes('Just a moment') || body.includes('cf-challenge') ||
          body.includes('__cf_chl_jschl_tk__')) {
        console.warn(`[smartFetch] Cloudflare challenge detected for ${url}, retrying via FlareSolverr`);
        return await fetchViaFlareSolverr(url, options);
      }
    }

    // No Cloudflare challenge — return direct response
    return res;
  } catch (err) {
    // Direct fetch failed entirely — fall back to FlareSolverr
    if (isFlareSolverrEnabled()) {
      console.warn(`[smartFetch] Direct fetch failed (${err.message}), retrying via FlareSolverr`);
      return await fetchViaFlareSolverr(url, options);
    }
    throw err;
  }
}

/**
 * Health check for FlareSolverr — useful for /health endpoint
 */
export async function checkFlareSolverrHealth() {
  if (!isFlareSolverrEnabled()) return { configured: false, healthy: false };
  try {
    const res = await fetch(`${FS_URL}`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    return {
      configured: true,
      healthy: res.ok,
      url: FS_URL,
    };
  } catch (err) {
    return { configured: true, healthy: false, error: err.message, url: FS_URL };
  }
}
