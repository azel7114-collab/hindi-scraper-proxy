// lib/sources/bollyflix.js
// BollyFlix scraper
// Site structure (as of late 2026, may change):
//   - Search: https://bollyflix.net/?s={query}
//   - Movie page: https://bollyflix.net/{slug}/
// Stream URLs are typically on multiple CDNs (GDrive, FastServer, etc.)
// Each "server" is a button that leads to another page with the actual stream URL.

import { get, matchAll, matchFirst, decodeEntities, stripHtml } from '../http.js';

const DOMAINS = [
  'https://bollyflix.net',
  'https://bollyflix.band',
  'https://bollyflix.vip',
];

export const id = 'bollyflix';
export const name = 'BollyFlix';
export const enabled = () => process.env.ENABLE_BOLLYFLIX !== 'false';

export async function search(query, yearHint) {
  for (const base of DOMAINS) {
    try {
      const searchUrl = `${base}/?s=${encodeURIComponent(query)}`;
      const { status, html } = await get(searchUrl);
      if (status !== 200 || !html) continue;

      const results = [];

      // BollyFlix search results: <h3 class="entry-title"><a href="...">Title</a></h3>
      // Or: <a class="ml-mask" href="...">
      const linkRegex = /<a[^>]+href="(https?:\/\/[^"'\/]+\/[^"']+)"[^>]*>([\s\S]*?)<\/a>/gi;
      const seenUrls = new Set();
      let m;
      while ((m = linkRegex.exec(html)) !== null) {
        const url = m[1];
        // Skip pagination, category, tag URLs
        if (url.includes('/page/') || url.includes('/category/') || url.includes('/tag/')) continue;
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

    // BollyFlix uses multiple "servers" — each is a link to another page
    // Pattern: <a class="lnk-btn" href="https://...">Server Name</a>
    // Or: <a href="https://drive.google.com/...">
    // Or: direct .mp4 in source

    // 1. Direct .mp4 links
    const mp4Regex = /https?:\/\/[^"'\s<>]+\.mp4[^"'\s<>]*/gi;
    const directMp4s = matchAll(html, mp4Regex);
    for (const u of directMp4s) {
      const clean = decodeEntities(u).replace(/\\u002F/g, '/');
      if (!seen.has(clean)) {
        seen.add(clean);
        streams.push({ quality: 'mp4', url: clean, size: '' });
      }
    }

    // 2. m3u8 links
    const m3u8Regex = /https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*/gi;
    const m3u8s = matchAll(html, m3u8Regex);
    for (const u of m3u8s) {
      const clean = decodeEntities(u).replace(/\\u002F/g, '/');
      if (!seen.has(clean)) {
        seen.add(clean);
        streams.push({ quality: 'HLS', url: clean, size: '' });
      }
    }

    // 3. GDrive / streamwish / doodstream / mixdrop embeds
    const embedRegexes = [
      /https?:\/\/(?:drive\.google\.com|streamwish\.to|dood\.so|doodstream\.com|mixdrop\.co|voe\.sx|upstream\.to|streamlare\.com|vtbe\.to)\/[^"'\s<>]+/gi,
    ];
    for (const re of embedRegexes) {
      const embeds = matchAll(html, re);
      for (const u of embeds) {
        const clean = decodeEntities(u);
        if (!seen.has(clean)) {
          seen.add(clean);
          streams.push({ quality: 'embed', url: clean, size: '' });
        }
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
