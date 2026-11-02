// lib/sources/moviesflix.js
// MoviesFlix scraper (a.k.a. TheMoviesFlix, MoviesFlixPro)
// Site structure (as of late 2026, may change):
//   - Search: https://moviesflix.net/?s={query}
//   - Movie page: https://moviesflix.net/{slug}/
// Stream URLs are typically GDrive, FastServer, GDTot, etc.

import { get, matchAll, matchFirst, decodeEntities, stripHtml } from '../http.js';

const DOMAINS = [
  'https://themoviesflix.co',
  'https://moviesflix.net',
  'https://moviesflix.bid',
  'https://moviesflix.online',
];

export const id = 'moviesflix';
export const name = 'MoviesFlix';
export const enabled = () => process.env.ENABLE_MOVIESFLIX !== 'false';

export async function search(query, yearHint) {
  for (const base of DOMAINS) {
    try {
      const searchUrl = `${base}/?s=${encodeURIComponent(query)}`;
      const { status, html } = await get(searchUrl);
      if (status !== 200 || !html) continue;

      const results = [];
      const seenUrls = new Set();

      // WordPress-style search results
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

    // 1. Direct .mp4
    const mp4Regex = /https?:\/\/[^"'\s<>]+\.mp4[^"'\s<>]*/gi;
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

    // 3. Common hosting embeds
    const embedRegex = /https?:\/\/(?:drive\.google\.com|streamwish\.to|dood\.so|doodstream\.com|mixdrop\.co|voe\.sx|upstream\.to|streamlare\.com|gdtot\.com|gdflix\.com|fastserver\.tv)\/[^"'\s<>]+/gi;
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
