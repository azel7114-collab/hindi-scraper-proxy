// lib/scraper.js
// Parallel orchestrator
//
// STRATEGY (v4.0):
//   1. Build ALL 14 embed provider URLs in parallel (instant — just URL construction)
//   2. ADDITIONALLY run real scrapers in parallel (Vegamovies.racing etc.)
//      - These scrape search results → movie pages → extract IMDb ID → build AllMovieLand URL
//      - Use FlareSolverr if FLARESOLVERR_URL is configured (for Cloudflare-protected sites)
//   3. Combine all streams — player UI shows them all, auto-fallback handles switching
//
// This way, even if a movie is missing from TMDB's imdb_id field (rare but possible
// for regional content), the real scrapers can find the IMDb ID from vegamovies directly.

import NodeCache from 'node-cache';
import { PROVIDERS, getMovieUrl, getSeriesUrl, getUsableProviders } from './providers.js';
import { isFlareSolverrEnabled } from './flaresolverr.js';

// Real scrapers (Option B) — actually scrape HTML pages
// Note: lib/sources/vegamovies.js IS the real scraper (overwritten in v4.0)
import * as vegamoviesReal from './sources/vegamovies.js';

// Legacy placeholder scrapers — kept disabled by default, mostly dead sites.
// These are old stub implementations from v3.1; the only real working one
// (vegamovies) was promoted to vegamoviesReal above.
import * as fzmovies from './sources/fzmovies.js';
import * as bollyflix from './sources/bollyflix.js';
import * as moviesflix from './sources/moviesflix.js';
import * as hiiduba from './sources/hiiduba.js';
import * as mlsbd from './sources/mlsbd.js';
import * as mkvcinemas from './sources/mkvcinemas.js';
import * as minoplres from './sources/minoplres.js';
import * as watchhentai from './sources/watchhentai.js';
import * as watchmovies from './sources/watchmovies.js';

const cache = new NodeCache({
  stdTTL: parseInt(process.env.CACHE_TTL || '1800', 10),
});

// Real scrapers (Option B) — these actually do HTML scraping.
// Run in PARALLEL with the embed providers so we get both fast URLs AND
// real-scraped IMDb IDs.
const REAL_SCRAPERS = [
  vegamoviesReal,   // vegamovies.racing → search → IMDb ID → AllMovieLand URL
];

// Legacy placeholder scrapers — kept for backward compat but most are dead sites.
// Only run these as truly last resort if everything else fails.
const LEGACY_SCRAPERS = [
  mlsbd,
  watchmovies,
  mkvcinemas,
  minoplres,
  watchhentai,
  fzmovies,
  bollyflix,
  moviesflix,
  hiiduba,
];

/**
 * Resolve a movie — collect ALL provider URLs + real scraper results in parallel
 *
 * @param {object} meta - { title, year, tmdbId, imdbId, type: 'movie' }
 */
export async function resolveMovie(meta) {
  const cacheKey = `resolve:movie:${meta.tmdbId}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const usable = getUsableProviders(meta);
  console.log(`[scraper] movie tmdb_id=${meta.tmdbId} imdb_id=${meta.imdbId || 'n/a'} - ${usable.length} embed providers + ${REAL_SCRAPERS.length} real scrapers (FlareSolverr: ${isFlareSolverrEnabled() ? 'on' : 'off'})`);

  const streams = [];
  const sourcesTried = [];

  // ---- Phase 1: Build all embed provider URLs (instant, no I/O) ----
  for (const p of usable) {
    const url = getMovieUrl(p.id, meta);
    if (url) {
      streams.push({
        quality: 'auto',
        url,
        source: p.name,
        sourceUrl: url,
        isEmbed: true,
        providerId: p.id,
      });
      sourcesTried.push({
        source: p.name,
        ok: true,
        streamCount: 1,
        error: null,
      });
    }
  }

  // ---- Phase 2: Run REAL scrapers in PARALLEL with embed providers ----
  // (Don't wait — kick these off, return embed URLs immediately, and let
  //  scraper results add as additional streams. But for simplicity here,
  //  we wait with a timeout so the player gets all streams at once.)
  const realScraperResults = await Promise.all(
    REAL_SCRAPERS.map(async s => {
      try {
        const startTime = Date.now();
        const timeout = parseInt(process.env.REAL_SCRAPER_TIMEOUT || '15000', 10);
        const streams = await Promise.race([
          s.resolve({ title: meta.title, year: meta.year, type: 'movie' }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('scraper timeout')), timeout)),
        ]);
        console.log(`[scraper] real scraper "${s.name}" returned ${streams.length} streams in ${Date.now() - startTime}ms`);
        return { source: s.name, streams, ok: streams.length > 0 };
      } catch (err) {
        console.warn(`[scraper] real scraper "${s.name}" failed: ${err.message}`);
        return { source: s.name, streams: [], ok: false, error: err.message };
      }
    })
  );

  // Add real scraper results as additional streams
  for (const r of realScraperResults) {
    sourcesTried.push({
      source: r.source + ' (real)',
      ok: r.ok,
      streamCount: r.streams.length,
      error: r.error || null,
    });
    if (r.ok) {
      streams.push(...r.streams);
    }
  }

  // ---- Phase 3: If we have ANY streams (embed or scraped), return ----
  if (streams.length > 0) {
    console.log(`[scraper] movie tmdb_id=${meta.tmdbId} - returning ${streams.length} total streams (${usable.length} embed + ${streams.length - usable.length} scraped)`);
    const out = {
      streams,
      sourcesTried,
      succeededSource: 'Multi-Provider + Real Scrapers',
      usedFallback: false,
    };
    cache.set(cacheKey, out);
    return out;
  }

  // ---- Phase 4: Last resort — try LEGACY scrapers (mostly dead sites) ----
  console.log(`[scraper] movie tmdb_id=${meta.tmdbId} - no streams found, trying legacy scrapers`);
  const enabledLegacy = LEGACY_SCRAPERS.filter(s => s.enabled && s.enabled());
  const legacyResults = await Promise.all(
    enabledLegacy.map(async s => {
      try {
        const streams = await s.resolve({ title: meta.title, year: meta.year });
        return { source: s.name, streams, ok: streams.length > 0 };
      } catch (err) {
        return { source: s.name, streams: [], ok: false, error: err.message };
      }
    })
  );

  for (const r of legacyResults) {
    sourcesTried.push({
      source: r.source + ' (legacy)',
      ok: r.ok,
      streamCount: r.streams.length,
      error: r.error || null,
    });
    if (r.ok) {
      streams.push(...r.streams);
    }
  }

  const out = {
    streams,
    sourcesTried,
    succeededSource: streams.length > 0 ? 'Legacy scrapers' : 'None',
    usedFallback: true,
  };
  cache.set(cacheKey, out);
  return out;
}

/**
 * Resolve a TV episode — same pattern: embed providers + real scrapers in parallel
 *
 * @param {object} meta - { name, year, tmdbId, imdbId, type: 'tv' }
 * @param {object} mediaInfo - { season, episode }
 */
export async function resolveTv(meta, mediaInfo) {
  const cacheKey = `resolve:tv:${meta.tmdbId}:${mediaInfo.season}:${mediaInfo.episode}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const usable = getUsableProviders(meta);
  console.log(`[scraper] tv tmdb_id=${meta.tmdbId} imdb_id=${meta.imdbId || 'n/a'} S${mediaInfo.season}E${mediaInfo.episode} - ${usable.length} providers + ${REAL_SCRAPERS.length} scrapers`);

  const streams = [];
  const sourcesTried = [];

  // Phase 1: embed provider URLs
  for (const p of usable) {
    const url = getSeriesUrl(p.id, { ...meta, ...mediaInfo });
    if (url) {
      streams.push({
        quality: `S${mediaInfo.season}E${mediaInfo.episode}`,
        url,
        source: p.name,
        sourceUrl: url,
        isEmbed: true,
        providerId: p.id,
      });
      sourcesTried.push({
        source: p.name,
        ok: true,
        streamCount: 1,
        error: null,
      });
    }
  }

  // Phase 2: real scrapers (parallel, with timeout)
  const realScraperResults = await Promise.all(
    REAL_SCRAPERS.map(async s => {
      try {
        const startTime = Date.now();
        const timeout = parseInt(process.env.REAL_SCRAPER_TIMEOUT || '15000', 10);
        const streams = await Promise.race([
          s.resolve({
            title: meta.name,
            year: meta.year,
            type: 'tv',
            season: mediaInfo.season,
            episode: mediaInfo.episode,
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('scraper timeout')), timeout)),
        ]);
        console.log(`[scraper] real TV scraper "${s.name}" returned ${streams.length} streams in ${Date.now() - startTime}ms`);
        return { source: s.name, streams, ok: streams.length > 0 };
      } catch (err) {
        console.warn(`[scraper] real TV scraper "${s.name}" failed: ${err.message}`);
        return { source: s.name, streams: [], ok: false, error: err.message };
      }
    })
  );

  for (const r of realScraperResults) {
    sourcesTried.push({
      source: r.source + ' (real)',
      ok: r.ok,
      streamCount: r.streams.length,
      error: r.error || null,
    });
    if (r.ok) {
      streams.push(...r.streams);
    }
  }

  const out = {
    streams,
    sourcesTried,
    succeededSource: streams.length > 0 ? 'Multi-Provider + Real Scrapers' : 'None',
    usedFallback: false,
  };
  cache.set(cacheKey, out);
  return out;
}

export function clearCache() {
  cache.flushAll();
}

export function getCacheStats() {
  return {
    keys: cache.keys().length,
    stats: cache.getStats(),
  };
}

export { PROVIDERS, REAL_SCRAPERS, LEGACY_SCRAPERS };
