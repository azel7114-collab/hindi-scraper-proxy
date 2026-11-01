// lib/http.js
// Common HTTP client with browser-like headers to bypass simple bot detection.
// All scrapers use this so they share the same fingerprint strategy.

const DEFAULT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

const DEFAULT_HEADERS = {
  'User-Agent': DEFAULT_UA,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9,hi;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
};

/**
 * GET request with browser headers.
 * @param {string} url
 * @param {object} [opts]
 * @param {object} [opts.headers] - extra headers to merge
 * @param {number} [opts.timeout] - ms
 * @param {string} [opts.userAgent] - 'desktop' | 'mobile' | custom string
 * @returns {Promise<{status: number, html: string, headers: object, url: string}>}
 */
export async function get(url, opts = {}) {
  const headers = { ...DEFAULT_HEADERS };
  if (opts.headers) Object.assign(headers, opts.headers);
  if (opts.userAgent === 'mobile') headers['User-Agent'] = MOBILE_UA;
  else if (typeof opts.userAgent === 'string') headers['User-Agent'] = opts.userAgent;

  const timeout = opts.timeout || parseInt(process.env.SCRAPER_TIMEOUT || '15000', 10);

  const res = await fetch(url, {
    method: 'GET',
    headers,
    redirect: 'follow',
    signal: AbortSignal.timeout(timeout),
  });

  const html = await res.text();
  return {
    status: res.status,
    html,
    headers: Object.fromEntries(res.headers.entries()),
    url: res.url, // final URL after redirects
  };
}

/**
 * HEAD request — used to verify stream URLs are reachable
 */
export async function head(url, opts = {}) {
  const headers = { ...DEFAULT_HEADERS };
  if (opts.headers) Object.assign(headers, opts.headers);
  headers['User-Agent'] = opts.userAgent === 'mobile' ? MOBILE_UA : DEFAULT_UA;
  delete headers['Sec-Fetch-User'];
  delete headers['Upgrade-Insecure-Requests'];

  try {
    const res = await fetch(url, {
      method: 'HEAD',
      headers,
      redirect: 'follow',
      signal: AbortSignal.timeout(opts.timeout || 8000),
    });
    return { ok: res.ok, status: res.status, headers: Object.fromEntries(res.headers.entries()) };
  } catch (err) {
    return { ok: false, status: 0, error: err.message };
  }
}

/**
 * Extracts the first regex match from HTML; returns null if no match.
 */
export function matchFirst(html, regex, group = 1) {
  const m = html.match(regex);
  return m && m[group] ? m[group] : null;
}

/**
 * Extracts all regex matches from HTML
 */
export function matchAll(html, regex, group = 1) {
  const out = [];
  const re = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : regex.flags + 'g');
  let m;
  while ((m = re.exec(html)) !== null) {
    if (m[group]) out.push(m[group]);
  }
  return out;
}

/**
 * Decodes HTML entities (&amp; -> &, &#39; -> ', etc)
 */
export function decodeEntities(s = '') {
  return String(s)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

/**
 * Strips HTML tags from a string
 */
export function stripHtml(s = '') {
  return String(s).replace(/<[^>]*>/g, '').trim();
}
