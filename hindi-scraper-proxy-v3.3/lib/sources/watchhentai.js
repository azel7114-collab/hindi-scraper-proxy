// lib/sources/watchhentai.js
// WatchHentai scraper (watchhentai.net)
// Hentai / anime streaming site (Hindi-dubbed anime also available).
// Note: Adult content — disabled by default. Set ENABLE_WATCHHENTAI=true to enable.

import { get, matchAll, matchFirst, decodeEntities, stripHtml } from '../http.js';

const DOMAINS = [
  'https://watchhentai.net',
];

export const id = 'watchhentai';
export const name = 'WatchHentai';
export const enabled = () => process.env.ENABLE_WATCHHENTAI === 'true';

export async function search(query, yearHint) {
  for (const base of DOMAINS) {
    try {
      const searchUrl = `${base}/?s=${encodeURIComponent(query)}`;
      const { status, html } = await get(searchUrl);
      if (status !== 200 || !html) continue;

      const results = [];
      const seenUrls = new Set();

      // Watchhentai uses WordPress-style search results
      // Links like <a href="https://watchhentai.net/{slug}/">
      const linkRegex = /<a[^>]+href="(https?:\/\/watchhentai\.net\/[a-z0-9][a-z0-9-]+\/)"[^>]*>([\s\S]*?)<\/a>/gi;
      let m;
      while ((m = linkRegex.exec(html)) !== null) {
        const url = m[1];
        // Skip category/tag/genre URLs
        if (url.includes('/genre/') || url.includes('/tag/') || url.includes('/category/')) continue;
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
    const { status, html } = await get(movieUrl);
    if (status !== 200) return [];

    const streams = [];
    const seen = new Set();

    // 1. Direct .mp4 / .webm / .mkv links
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

    // 3. Common embeds
    const embedRegex = /https?:\/\/(?:streamwish\.to|dood\.so|doodstream\.com|mixdrop\.co|voe\.sx|upstream\.to|streamlare\.com|krakenfiles\.com|send\.cm|bowfile\.com|streamtape\.com|streamhub\.gg|wolfstream\.tv|streamvid\.net|filemoon\.sx)\/[^"'\s<>]+/gi;
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
