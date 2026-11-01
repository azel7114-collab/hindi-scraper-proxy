// lib/scraper.js
// Parallel orchestrator
//
// PRIMARY: AllMovieLand (Vegamovies backend) — uses IMDb ID directly, no scraping needed.
//          This is the player used by vegamovies, bollyflix, moviesflix, hiiduba, etc.
// FALLBACK 1: Hindi site scrapers (Fzmovies, BollyFlix, MoviesFlix, Hiiduba) — try in parallel
// FALLBACK 2: Multi-Embed (VidSrc, 2embed, Embed.su, MultiEmbed) — last resort

import NodeCache from 'node-cache';
import * as allmovieland from './sources/allmovieland.js';
import * as fzmovies from './sources/fzmovies.js';
import * as bollyflix from './sources/bollyflix.js';
import * as moviesflix from './sources/moviesflix.js';
import * as hiiduba from './sources/hiiduba.js';
import * as multiembed from './sources/multiembed.js';

const cache = new NodeCache({
  stdTTL: parseInt(process.env.CACHE_TTL || '1800', 10),
});

// Order: primary first, then fallbacks
const ALL_SOURCES = [
  allmovieland,  // PRIMARY — IMDb ID-based, no scraping
  multiembed,    // FALLBACK — 5 embed providers
  fzmovies,      // Last resort — Hindi scraper
  bollyflix,     // Last resort — Hindi scraper
  moviesflix,    // Last resort — Hindi scraper
  hiiduba,       // Last resort — Hindi scraper
];

const HINDI_SCRAPERS = [fzmovies, bollyflix, moviesflix, hiiduba];

/**
 * Resolve a movie — try AllMovieLand first (best), then Hindi scrapers in parallel,
 * then Multi-Embed as final fallback.
 *
 * @param {object} meta - { title, year, tmdbId, imdbId, type }
 */
export async function resolveMovie(meta) {
  const cacheKey = `resolve:movie:${meta.tmdbId}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const sourcesTried = [];

  // ---- STEP 1: Try AllMovieLand (PRIMARY) ----
  if (allmovieland.enabled() && meta.imdbId) {
    try {
      console.log(`[scraper] movie tmdb_id=${meta.tmdbId} imdb_id=${meta.imdbId} - trying AllMovieLand (PRIMARY)`);
      const streams = await allmovieland.resolve(meta);
      if (streams.length > 0) {
        console.log(`[scraper] movie tmdb_id=${meta.tmdbId} - AllMovieLand SUCCESS (${streams.length} streams)`);
        sourcesTried.push({ source: 'AllMovieLand', ok: true, streamCount: streams.length, error: null });
        const out = {
          streams,
          sourcesTried,
          succeededSource: 'AllMovieLand',
          usedFallback: false,
        };
        cache.set(cacheKey, out);
        return out;
      }
      sourcesTried.push({ source: 'AllMovieLand', ok: false, streamCount: 0, error: 'No streams returned' });
    } catch (err) {
      sourcesTried.push({ source: 'AllMovieLand', ok: false, streamCount: 0, error: err.message });
    }
  } else if (!meta.imdbId) {
    sourcesTried.push({ source: 'AllMovieLand', ok: false, streamCount: 0, error: 'No IMDb ID from TMDB' });
  }

  // ---- STEP 2: Try Hindi scrapers in parallel ----
  const enabledHindi = HINDI_SCRAPERS.filter(s => s.enabled());
  console.log(`[scraper] movie tmdb_id=${meta.tmdbId} - AllMovieLand failed, trying ${enabledHindi.length} Hindi scrapers in parallel`);

  const hindiResults = await Promise.all(
    enabledHindi.map(async s => {
      try {
        const streams = await s.resolve({ title: meta.title, year: meta.year });
        return { source: s.name, streams, ok: streams.length > 0 };
      } catch (err) {
        return { source: s.name, streams: [], ok: false, error: err.message };
      }
    })
  );

  for (const r of hindiResults) {
    sourcesTried.push({
      source: r.source,
      ok: r.ok,
      streamCount: r.streams.length,
      error: r.error || null,
    });
  }

  const firstHindiSuccess = hindiResults.find(r => r.ok);
  if (firstHindiSuccess) {
    console.log(`[scraper] movie tmdb_id=${meta.tmdbId} - ${firstHindiSuccess.source} SUCCESS (${firstHindiSuccess.streams.length} streams)`);
    const out = {
      streams: firstHindiSuccess.streams,
      sourcesTried,
      succeededSource: firstHindiSuccess.source,
      usedFallback: false,
    };
    cache.set(cacheKey, out);
    return out;
  }

  // ---- STEP 3: Fall back to Multi-Embed ----
  console.log(`[scraper] movie tmdb_id=${meta.tmdbId} - all scrapers failed, using Multi-Embed fallback`);
  const fallbackStreams = await multiembed.resolve(meta);
  sourcesTried.push({
    source: 'Multi-Embed',
    ok: fallbackStreams.length > 0,
    streamCount: fallbackStreams.length,
    error: null,
  });

  const out = {
    streams: fallbackStreams,
    sourcesTried,
    succeededSource: 'Multi-Embed (Fallback)',
    usedFallback: true,
  };
  cache.set(cacheKey, out);
  return out;
}

/**
 * Resolve a TV episode — AllMovieLand first (uses IMDb ID + season/episode params),
 * then Multi-Embed fallback.
 *
 * @param {object} meta - { name, year, tmdbId, imdbId, type: 'tv' }
 * @param {object} mediaInfo - { season, episode }
 */
export async function resolveTv(meta, mediaInfo) {
  const cacheKey = `resolve:tv:${meta.tmdbId}:${mediaInfo.season}:${mediaInfo.episode}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const sourcesTried = [];

  // ---- STEP 1: Try AllMovieLand ----
  if (allmovieland.enabled() && meta.imdbId) {
    try {
      console.log(`[scraper] tv tmdb_id=${meta.tmdbId} imdb_id=${meta.imdbId} S${mediaInfo.season}E${mediaInfo.episode} - trying AllMovieLand`);
      const streams = await allmovieland.resolve(meta, mediaInfo);
      if (streams.length > 0) {
        console.log(`[scraper] tv tmdb_id=${meta.tmdbId} - AllMovieLand SUCCESS`);
        sourcesTried.push({ source: 'AllMovieLand', ok: true, streamCount: streams.length, error: null });
        const out = {
          streams,
          sourcesTried,
          succeededSource: 'AllMovieLand',
          usedFallback: false,
        };
        cache.set(cacheKey, out);
        return out;
      }
      sourcesTried.push({ source: 'AllMovieLand', ok: false, streamCount: 0, error: 'No streams' });
    } catch (err) {
      sourcesTried.push({ source: 'AllMovieLand', ok: false, streamCount: 0, error: err.message });
    }
  } else if (!meta.imdbId) {
    sourcesTried.push({ source: 'AllMovieLand', ok: false, streamCount: 0, error: 'No IMDb ID from TMDB' });
  }

  // ---- STEP 2: Multi-Embed fallback ----
  console.log(`[scraper] tv tmdb_id=${meta.tmdbId} - using Multi-Embed fallback`);
  const fallbackStreams = await multiembed.resolve(meta, mediaInfo);
  sourcesTried.push({
    source: 'Multi-Embed',
    ok: fallbackStreams.length > 0,
    streamCount: fallbackStreams.length,
    error: null,
  });

  const out = {
    streams: fallbackStreams,
    sourcesTried,
    succeededSource: 'Multi-Embed (Fallback)',
    usedFallback: true,
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
