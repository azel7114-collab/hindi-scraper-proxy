// lib/sources/fzmovies.js
// Fzmovies scraper
// Site structure (as of late 2026, may change):
//   - Search: https://fzmovies.net/search.php?q={query}
//   - Movie page: https://fzmovies.net/moviedetails.php?id={id}
//   - Download page: https://fzmovies.net/download.php?id={id}
// Stream URLs are typically .mp4 on fzmovies.host / fzmovies.cdn
//
// Multiple domain mirrors:
//   fzmovies.net, fzmovies.host, fzmovies.in, fzmovies.com
// We try them in order.

import { get, head, matchFirst, matchAll, decodeEntities, stripHtml } from '../http.js';

const DOMAINS = [
  'https://fzmovies.net',
  'https://fzmovies.host',
  'https://fzmovies.in',
  'https://fzmovies.com',
];

export const id = 'fzmovies';
export const name = 'Fzmovies';
export const enabled = () => process.env.ENABLE_FZMOVIES !== 'false';

/**
 * Search fzmovies for a title.
 * @param {string} query - movie title
 * @param {string} [yearHint] - optional year to disambiguate
 * @returns {Promise<{title: string, url: string, year: string}[]}>}
 */
export async function search(query, yearHint) {
  for (const base of DOMAINS) {
    try {
      const searchUrl = `${base}/search.php?q=${encodeURIComponent(query)}`;
      const { status, html } = await get(searchUrl);
      if (status !== 200 || !html) continue;

      // Fzmovies search results have links like:
      // <a href="moviedetails.php?id=12345&...">Title (Year)</a>
      // Or list items with class
      const results = [];

      // Pattern 1: moviedetails.php?id=...
      const linkRegex = /<a[^>]+href="(moviedetails\.php\?id=[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
      let m;
      while ((m = linkRegex.exec(html)) !== null) {
        const url = `${base}/${m[1]}`;
        const titleRaw = stripHtml(decodeEntities(m[2]));
        const yearMatch = titleRaw.match(/\((\d{4})\)/);
        const year = yearMatch ? yearMatch[1] : '';
        const title = titleRaw.replace(/\s*\(\d{4}\)\s*$/, '').trim();
        if (title) results.push({ title, url, year });
      }

      if (results.length > 0) {
        // Filter by year if hint provided
        if (yearHint) {
          const exact = results.filter(r => r.year === yearHint);
          if (exact.length > 0) return exact;
        }
        return results;
      }
    } catch (err) {
      // Try next domain
      continue;
    }
  }
  return [];
}

/**
 * Scrape a movie page to find stream URLs.
 * Fzmovies typically has a "Download" page with multiple quality options.
 * Each quality has a redirect to the actual .mp4 URL.
 *
 * @param {string} movieUrl - moviedetails.php URL
 * @returns {Promise<Array<{quality: string, url: string, size: string}>>}
 */
export async function getStreams(movieUrl) {
  try {
    const { status, html, url: finalUrl } = await get(movieUrl);
    if (status !== 200) return [];

    const base = finalUrl.replace(/\/[^/]*$/, '');

    // Find download links
    // Pattern 1: <a href="download.php?id=...&q=H|L|...">
    // Pattern 2: direct mp4 link
    const streams = [];
    const seen = new Set();

    // Look for download.php links
    const dlRegex = /<a[^>]+href="(download\.php\?[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = dlRegex.exec(html)) !== null) {
      const dlUrl = `${base}/${m[1]}`;
      const label = stripHtml(decodeEntities(m[2]));

      // Quality detection
      let quality = 'unknown';
      if (/HD|1080|720|hq/i.test(label)) quality = '720p+';
      else if (/SD|480|360|lq|low/i.test(label)) quality = '480p';
      else if (/mp4/i.test(label)) quality = 'mp4';

      // Resolve the download.php redirect to get actual MP4 URL
      const mp4Url = await resolveDownloadPage(dlUrl);
      if (mp4Url && !seen.has(mp4Url)) {
        seen.add(mp4Url);
        streams.push({ quality, url: mp4Url, size: '' });
      }
    }

    // Pattern 2: Direct .mp4 links in HTML/JS
    const mp4Regex = /https?:\/\/[^"'\s]+\.mp4[^"'\s]*/gi;
    const directMp4s = matchAll(html, mp4Regex);
    for (const u of directMp4s) {
      const clean = decodeEntities(u).replace(/\\u002F/g, '/');
      if (!seen.has(clean)) {
        seen.add(clean);
        streams.push({ quality: 'mp4', url: clean, size: '' });
      }
    }

    return streams;
  } catch (err) {
    return [];
  }
}

/**
 * Resolve a download.php link to the actual .mp4 URL.
 * download.php typically has a button/form that redirects to the CDN.
 */
async function resolveDownloadPage(dlUrl) {
  try {
    const { status, html, url: finalUrl } = await get(dlUrl);
    if (status !== 200) return null;

    // If final URL is itself a .mp4, return it
    if (finalUrl.match(/\.mp4(\?|$)/i)) return finalUrl;

    // Look for direct .mp4 URL in page
    const mp4Match = html.match(/https?:\/\/[^"'\s]+\.mp4[^"'\s]*/i);
    if (mp4Match) {
      return decodeEntities(mp4Match[0]).replace(/\\u002F/g, '/');
    }

    // Look for meta refresh redirect
    const metaRefresh = html.match(/<meta[^>]+http-equiv=["']refresh["'][^>]+url=([^"'\s>]+)/i);
    if (metaRefresh) {
      const target = decodeEntities(metaRefresh[1]);
      if (target.match(/\.mp4/i)) return target;
      // Recurse one level
      if (target.startsWith('http')) return await resolveDownloadPage(target);
    }

    // Look for window.location redirect
    const jsRedirect = html.match(/(?:window\.)?location(?:\.href)?\s*=\s*["']([^"']+)["']/i);
    if (jsRedirect) {
      const target = decodeEntities(jsRedirect[1]);
      if (target.match(/\.mp4/i)) return target;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Full flow: query -> streams
 * @param {object} meta - { title, year }
 * @returns {Promise<Array<{quality: string, url: string}>>}
 */
export async function resolve(meta) {
  const results = await search(meta.title, meta.year);
  if (results.length === 0) return [];

  // Try top 3 results
  for (const r of results.slice(0, 3)) {
    const streams = await getStreams(r.url);
    if (streams.length > 0) {
      return streams.map(s => ({
        ...s,
        source: name,
        sourceUrl: r.url,
      }));
    }
  }
  return [];
}
