// lib/sources/hiiduba.js
// Hiiduba scraper (Hindi dubbed movies)
// Site structure (as of late 2026, may change):
//   - Search: https://hiiduba.com/?s={query}
//   - Movie page: https://hiiduba.com/{slug}/

import { get, matchAll, matchFirst, decodeEntities, stripHtml } from '../http.js';

const DOMAINS = [
  'https://hiiduba.com',
  'https://hiiduba.in',
  'https://hiiduba.co',
];

export const id = 'hiiduba';
export const name = 'Hiiduba';
export const enabled = () => process.env.ENABLE_HIIDUBA !== 'false';

export async function search(query, yearHint) {
  for (const base of DOMAINS) {
    try {
      const searchUrl = `${base}/?s=${encodeURIComponent(query)}`;
      const { status, html } = await get(searchUrl);
      if (status !== 200 || !html) continue;

      const results = [];
      const seenUrls = new Set();

      const linkRegex = /<a[^>]+href="(https?:\/\/[^"'\/]+\/[^"']+)"[^>]*>([\s\S]*?)<\/a>/gi;
      let m;
      while ((m = linkRegex.exec(html)) !== null) {
        const url = m[1];
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

    // Direct .mp4
    const mp4Regex = /https?:\/\/[^"'\s<>]+\.mp4[^"'\s<>]*/gi;
    for (const u of matchAll(html, mp4Regex)) {
      const clean = decodeEntities(u).replace(/\\u002F/g, '/');
      if (!seen.has(clean)) {
        seen.add(clean);
        streams.push({ quality: 'mp4', url: clean, size: '' });
      }
    }

    // m3u8
    const m3u8Regex = /https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*/gi;
    for (const u of matchAll(html, m3u8Regex)) {
      const clean = decodeEntities(u).replace(/\\u002F/g, '/');
      if (!seen.has(clean)) {
        seen.add(clean);
        streams.push({ quality: 'HLS', url: clean, size: '' });
      }
    }

    // Common hosting embeds
    const embedRegex = /https?:\/\/(?:drive\.google\.com|streamwish\.to|dood\.so|doodstream\.com|mixdrop\.co|voe\.sx|upstream\.to|streamlare\.com|gdtot\.com|gdflix\.com)\/[^"'\s<>]+/gi;
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
