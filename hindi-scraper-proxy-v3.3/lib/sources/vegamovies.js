// lib/sources/vegamovies.js
// Vegamovies scraper (vegamoviespro.in)
// Bollywood + South Hindi Dubbed + Hollywood Hindi + Web Series.
// Note: Vegamovies uses AllMovieLand as backend player, but they ALSO have
// direct download links (GDrive, GDTot, etc.) which we try to scrape.

import { get, matchAll, matchFirst, decodeEntities, stripHtml } from '../http.js';

const DOMAINS = [
  'https://vegamoviespro.in',
  'https://vegamovies.racing',
  'https://vegamoviesfree.xyz',
];

export const id = 'vegamovies';
export const name = 'Vegamovies';
export const enabled = () => process.env.ENABLE_VEGAMOVIES !== 'false';

export async function search(query, yearHint) {
  for (const base of DOMAINS) {
    try {
      // Vegamovies uses DLE-style search: /index.php?do=search&subaction=search&story={query}
      const searchUrl = `${base}/index.php?do=search&subaction=search&story=${encodeURIComponent(query)}`;
      const { status, html } = await get(searchUrl);
      if (status !== 200 || !html) continue;

      const results = [];
      const seenUrls = new Set();

      // Search results have links like <a href="https://vegamoviespro.in/{id}-{slug}.html" title="...">
      const linkRegex = /<a[^>]+href="(https?:\/\/[^"']+\/\d+-[^"']+\.html)"[^>]*(?:title="([^"]+)")?[^>]*>([\s\S]*?)<\/a>/gi;
      let m;
      while ((m = linkRegex.exec(html)) !== null) {
        const url = m[1];
        if (seenUrls.has(url)) continue;
        seenUrls.add(url);

        const titleFromAttr = m[2] || '';
        const titleFromText = stripHtml(decodeEntities(m[3] || ''));
        const titleRaw = titleFromAttr || titleFromText;

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

    // 1. Direct .mp4 / .mkv links
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

    // 3. Common file hosting embeds
    const embedRegex = /https?:\/\/(?:drive\.google\.com|streamwish\.to|dood\.so|doodstream\.com|mixdrop\.co|voe\.sx|upstream\.to|streamlare\.com|gdtot\.com|gdflix\.com|fastserver\.tv|hubcloud\.day|filepress\.top|krakenfiles\.com|send\.cm|mirrorace\.com|bowfile\.com|gdbot\.com|filecrypt\.cc)\/[^"'\s<>]+/gi;
    for (const u of matchAll(html, embedRegex)) {
      const clean = decodeEntities(u);
      if (!seen.has(clean)) {
        seen.add(clean);
        streams.push({ quality: 'embed', url: clean, size: '' });
      }
    }

    // 4. AllMovieLand embed (Vegamovies uses this as primary player)
    const amlMatch = html.match(/src:\s*['"](tt\d+)['"]/);
    if (amlMatch && amlMatch[1]) {
      const amlUrl = `https://slast430did.com/play/${amlMatch[1]}`;
      if (!seen.has(amlUrl)) {
        seen.add(amlUrl);
        streams.push({ quality: 'auto', url: amlUrl, size: '', isEmbed: true });
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
