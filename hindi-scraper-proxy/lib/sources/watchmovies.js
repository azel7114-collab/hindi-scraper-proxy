// lib/sources/watchmovies.js
// WatchMovies / Hindilinks4u scraper
// Hindi movies + TV shows online streaming.
//
// Hindilinks4u.cool is the main site but often Cloudflare-blocked.
// Also tries alternative domains.

import { get, matchAll, matchFirst, decodeEntities, stripHtml } from '../http.js';

const DOMAINS = [
  'https://hindilinks4u.cool',
  'https://ww1.watchmovieshd.com',
];

export const id = 'watchmovies';
export const name = 'WatchMovies (Hindilinks4u)';
export const enabled = () => process.env.ENABLE_WATCHMOVIES !== 'false';

export async function search(query, yearHint) {
  for (const base of DOMAINS) {
    try {
      const searchUrl = `${base}/?s=${encodeURIComponent(query)}`;
      const { status, html } = await get(searchUrl, {
        headers: { 'Referer': 'https://www.google.com/' },
      });
      if (status !== 200 || !html) continue;

      const results = [];
      const seenUrls = new Set();

      // WordPress-style search results
      const linkRegex = /<a[^>]+href="(https?:\/\/[^"'\/]+\/[^"']+)"[^>]*>([\s\S]*?)<\/a>/gi;
      let m;
      while ((m = linkRegex.exec(html)) !== null) {
        const url = m[1];
        if (url.includes('/category/') || url.includes('/tag/') || url.includes('/page/')) continue;
        if (seenUrls.has(url)) continue;
        seenUrls.add(url);

        const titleRaw = stripHtml(decodeEntities(m[2]));
        if (!titleRaw || titleRaw.length < 2) continue;

        const yearMatch = titleRaw.match(/\b(19|20)\d{2}\b/);
        const year = yearMatch ? yearMatch[0] : '';
        const title = titleRaw.replace(/\s*\(?\b(19|20)\d{2}\b\)?\s*$/, '').trim();

        if (title && title.length > 1) {
          results.push({ title, url, year });
        }
      }

      if (results.length > 0) {
        if (yearHint) {
          const exact = results.filter(r => r.year === yearHint);
          if (exact.length > 0) return exact;
        }
        return results.slice(0, 10);
      }
    } catch {
      continue;
    }
  }
  return [];
}

export async function getStreams(movieUrl) {
  try {
    const { status, html } = await get(movieUrl, {
      headers: { 'Referer': 'https://www.google.com/' },
    });
    if (status !== 200) return [];

    const streams = [];
    const seen = new Set();

    // 1. Direct .mp4 / .mkv / .webm links
    const mp4Regex = /https?:\/\/[^"'\s<>]+\.(?:mp4|mkv|webm)[^"'\s<>]*/gi;
    for (const u of matchAll(html, mp4Regex)) {
      const clean = decodeEntities(u).replace(/\\u002F/g, '/');
      if (!seen.has(clean)) {
        seen.add(clean);
        streams.push({ quality: 'mp4', url: clean, size: '' });
      }
    }

    // 2. m3u8 streams
    const m3u8Regex = /https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*/gi;
    for (const u of matchAll(html, m3u8Regex)) {
      const clean = decodeEntities(u).replace(/\\u002F/g, '/');
      if (!seen.has(clean)) {
        seen.add(clean);
        streams.push({ quality: 'HLS', url: clean, size: '' });
      }
    }

    // 3. iframe embed URLs
    const iframeRegex = /<iframe[^>]+src="(https?:\/\/[^"']+)"/gi;
    let m;
    while ((m = iframeRegex.exec(html)) !== null) {
      const url = decodeEntities(m[1]);
      // Filter out tracking / ads
      if (url.includes('google') || url.includes('facebook') || url.includes('youtube.com/embed')) continue;
      if (!seen.has(url)) {
        seen.add(url);
        streams.push({ quality: 'embed', url, size: '' });
      }
    }

    // 4. Common file hosting embeds
    const embedRegex = /https?:\/\/(?:streamwish\.to|dood\.so|doodstream\.com|mixdrop\.co|voe\.sx|upstream\.to|streamlare\.com|krakenfiles\.com|send\.cm|bowfile\.com|streamtape\.com|streamhub\.gg|wolfstream\.tv|streamvid\.net|filemoon\.sx|hydrax\.net)\/[^"'\s<>]+/gi;
    for (const u of matchAll(html, embedRegex)) {
      const clean = decodeEntities(u);
      if (!seen.has(clean)) {
        seen.add(clean);
        streams.push({ quality: 'embed', url: clean, size: '' });
      }
    }

    return streams;
  } catch {
    return [];
  }
}

export async function resolve(meta) {
  const results = await search(meta.title, meta.year);
  if (results.length === 0) return [];

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
