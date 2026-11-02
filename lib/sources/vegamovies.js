// lib/sources/vegamovies.js
// Real scraper for vegamovies.racing (DLE-based, uses vegasit.co.in for movie pages)
//
// Strategy (v4.0 verified working Nov 2026):
//   1. GET search to https://vegamovies.racing/?do=search&subaction=search&story={query}
//      (POST triggers Cloudflare challenge, GET works fine)
//   2. Parse search results — find movie links (typically at vegasit.co.in/<slug>.html)
//   3. Fetch movie page (vegasit.co.in is NOT Cloudflare-protected)
//   4. Extract IMDb ID from `amPlayerConfigs = { src: 'ttXXXXXXX' }`
//   5. Build AllMovieLand URL: https://slast430did.com/play/{imdb_id}
//
// Verified:
//   - vegamovies.racing GET search → 11 articles for "dangal" ✅
//   - vegasit.co.in movie page → amPlayerConfigs.src = 'tt35538033' for Resident Evil ✅
//   - Final URL https://slast430did.com/play/tt35538033 → AllMovieLand plays ✅
//
// FlareSolverr support: optional. vegamovies.racing doesn't need it for GET search,
// but if Cloudflare is enabled in future, FLARESOLVERR_URL will auto-bypass.

import { smartFetch, isFlareSolverrEnabled } from '../flaresolverr.js';

const BASE_URL = 'https://vegamovies.racing';
// DLE search URL — GET-based (POST triggers Cloudflare)
const SEARCH_URL = `${BASE_URL}/`;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36';

export const name = 'Vegamovies (Real Scraper)';
export const id = 'vegamovies_real';

export function enabled() {
  const flag = (process.env.ENABLE_VEGAMOVIES_REAL || 'true').toLowerCase();
  return flag === 'true' || flag === '1' || flag === 'yes';
}

/**
 * Search vegamovies for a movie/show
 * @param {object} meta - { title, year, type, season?, episode? }
 * @returns {Promise<Array>} - array of { quality, url, source, isEmbed }
 */
export async function resolve({ title, year, type = 'movie', season = 1, episode = 1 }) {
  if (!title) return [];

  // Clean title for search query
  const query = title.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim();
  console.log(`[vegamovies] searching for: "${query}" (type=${type})`);

  // Step 1: GET search (POST triggers Cloudflare challenge)
  const searchUrl = `${SEARCH_URL}?do=search&subaction=search&story=${encodeURIComponent(query)}`;
  let searchHtml;
  try {
    const res = await smartFetch(searchUrl, {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': BASE_URL + '/',
      },
    });
    if (!res.ok) {
      console.warn(`[vegamovies] search HTTP ${res.status}`);
      return [];
    }
    searchHtml = await res.text();

    // Detect Cloudflare challenge (will only happen if FlareSolverr is not configured)
    if (searchHtml.includes('Just a moment') || searchHtml.includes('challenge-platform')) {
      console.warn(`[vegamovies] Cloudflare challenge detected on search page. Set FLARESOLVERR_URL to bypass.`);
      return [];
    }
  } catch (err) {
    console.warn(`[vegamovies] search failed: ${err.message}`);
    return [];
  }

  // Step 2: parse search results — find movie URLs (typically at vegasit.co.in/<slug>.html)
  const movieUrls = extractMovieUrls(searchHtml, title, year);
  console.log(`[vegamovies] found ${movieUrls.length} candidate movies`);

  if (movieUrls.length === 0) return [];

  // Step 3: fetch top 3 candidates in parallel, extract IMDb IDs
  const candidates = movieUrls.slice(0, 3);
  const results = await Promise.all(
    candidates.map(c => fetchMovieAndExtractImdb(c.url, c.title))
  );

  const streams = [];
  const seenImdbIds = new Set();
  for (const r of results) {
    if (r && r.imdbId && !seenImdbIds.has(r.imdbId)) {
      seenImdbIds.add(r.imdbId);
      // Build AllMovieLand URL using the IMDb ID we scraped
      const allmovielandUrl = type === 'tv'
        ? `https://slast430did.com/play/${r.imdbId}?season=${season}&episode=${episode}`
        : `https://slast430did.com/play/${r.imdbId}`;

      streams.push({
        quality: type === 'tv' ? `S${season}E${episode}` : 'auto',
        url: allmovielandUrl,
        source: `Vegamovies (IMDb: ${r.imdbId})`,
        sourceUrl: r.pageUrl,
        isEmbed: true,
        providerId: 'vegamovies_real',
        imdbId: r.imdbId,
      });
      console.log(`[vegamovies] ✓ found IMDb ID ${r.imdbId} for "${r.pageTitle}"`);
    }
  }

  return streams;
}

/**
 * Extract movie URLs from search results HTML
 */
function extractMovieUrls(html, queryTitle, queryYear) {
  const urls = [];

  // DLE-style: <a href="...vegasit.co.in/<slug>.html" ...> inside <article class="post-item">
  // Look for h3/h2 entry-title with anchor
  const articleRegex = /<article[^>]*class="[^"]*post-item[^"]*"[^>]*>([\s\S]*?)<\/article>/gi;
  const titleLinkRegex = /<h[2-4][^>]*class="[^"]*entry-title[^"]*"[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*title="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i;

  let m;
  while ((m = articleRegex.exec(html)) !== null) {
    const articleHtml = m[1];
    const linkMatch = articleHtml.match(titleLinkRegex);
    if (linkMatch) {
      const url = linkMatch[1];
      const titleAttr = (linkMatch[2] || '').trim();
      const innerText = stripTags(linkMatch[3] || '').trim();
      const displayTitle = titleAttr || innerText;
      if (url && displayTitle) {
        // Filter by query — fuzzy match against the query title
        const score = titleSimilarity(displayTitle, queryTitle, queryYear);
        if (score > 0.4) {
          urls.push({ url, title: displayTitle, score });
        }
      }
    }
  }

  // Also try generic links to vegasit.co.in (in case article parsing fails)
  const directRegex = /href="(https?:\/\/(?:www\.)?vegasit\.co\.in\/[^"]+\.html)"/gi;
  const seen = new Set(urls.map(u => u.url));
  while ((m = directRegex.exec(html)) !== null) {
    if (!seen.has(m[1])) {
      urls.push({ url: m[1], title: '', score: 0.5 });
      seen.add(m[1]);
    }
  }

  // Sort by score descending
  return urls.sort((a, b) => b.score - a.score);
}

/**
 * Fetch movie page and extract IMDb ID from amPlayerConfigs
 */
async function fetchMovieAndExtractImdb(pageUrl, pageTitle) {
  try {
    const res = await smartFetch(pageUrl, {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Referer': BASE_URL + '/',
      },
    });
    if (!res.ok) {
      console.warn(`[vegamovies] movie page ${pageUrl} HTTP ${res.status}`);
      return null;
    }
    const html = await res.text();

    // Look for amPlayerConfigs = { src: 'ttXXXXXXX', ... }
    const playerRegex = /amPlayerConfigs\s*=\s*\{[^}]*src\s*:\s*['"]([^'"]+)['"][^}]*\}/i;
    const m = html.match(playerRegex);
    if (m && m[1]) {
      const imdbId = m[1].trim();
      // Validate IMDb ID format
      if (/^tt\d{6,12}$/.test(imdbId)) {
        return { imdbId, pageUrl, pageTitle };
      }
    }

    // Fallback: look for any ttXXXX pattern in the page (less reliable)
    const ttRegex = /\b(tt\d{7,10})\b/;
    const tm = html.match(ttRegex);
    if (tm && tm[1]) {
      console.log(`[vegamovies] fallback IMDb ID found: ${tm[1]} (page: ${pageUrl})`);
      return { imdbId: tm[1], pageUrl, pageTitle };
    }

    return null;
  } catch (err) {
    console.warn(`[vegamovies] fetchMovie failed: ${err.message}`);
    return null;
  }
}

/**
 * Strip HTML tags and decode basic entities
 */
function stripTags(html) {
  return String(html)
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

/**
 * Simple fuzzy title similarity score (0-1)
 */
function titleSimilarity(candidate, query, queryYear) {
  if (!candidate || !query) return 0;
  const c = candidate.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim();
  const q = query.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim();

  // Word overlap score
  const cWords = new Set(c.split(/\s+/).filter(w => w.length > 2));
  const qWords = new Set(q.split(/\s+/).filter(w => w.length > 2));
  let common = 0;
  for (const w of qWords) if (cWords.has(w)) common++;
  const baseScore = qWords.size > 0 ? common / qWords.size : 0;

  // Year bonus
  let yearBonus = 0;
  if (queryYear && candidate.includes(String(queryYear))) {
    yearBonus = 0.2;
  }

  return Math.min(1, baseScore + yearBonus);
}
