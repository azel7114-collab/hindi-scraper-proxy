// lib/scraper.js
// Parallel orchestrator — runs all enabled scrapers in parallel.
// First successful scraper's streams are returned (Promise.any style).
// Falls back to Multi-Embed if all scrapers fail.

import NodeCache from 'node-cache';
import * as fzmovies from './sources/fzmovies.js';
import * as bollyflix from './sources/bollyflix.js';
import * as moviesflix from './sources/moviesflix.js';
import * as hiiduba from './sources/hiiduba.js';
import * as multiembed from './sources/multiembed.js';

const cache = new NodeCache({
  stdTTL: parseInt(process.env.CACHE_TTL || '1800', 10),
});

const SCRAPERS = [fzmovies, bollyflix, moviesflix, hiiduba];

/**
 * Run all enabled scrapers in parallel for a movie.
 * Returns the first scraper's results that have at least 1 stream.
 * If all fail, falls back to Multi-Embed.
 *
 * @param {object} meta - TMDB metadata { title, year, tmdbId, type }
 * @returns {Promise<{ streams: Array, sourcesTried: Array, succeededSource: string|null }>}
 */
export async function resolveMovie(meta) {
  const cacheKey = `resolve:movie:${meta.tmdbId}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const enabledScrapers = SCRAPERS.filter(s => s.enabled());

  console.log(`[scraper] movie tmdb_id=${meta.tmdbId} title="${meta.title}" - trying ${enabledScrapers.length} scrapers in parallel`);

  // Run all in parallel; each returns [] on failure
  const results = await Promise.all(
    enabledScrapers.map(async s => {
      try {
        const streams = await s.resolve({ title: meta.title, year: meta.year });
        return { source: s.name, streams, ok: streams.length > 0 };
      } catch (err) {
        console.log(`[scraper] ${s.name} error: ${err.message}`);
        return { source: s.name, streams: [], ok: false, error: err.message };
      }
    })
  );

  const sourcesTried = results.map(r => ({
    source: r.source,
    ok: r.ok,
    streamCount: r.streams.length,
    error: r.error || null,
  }));

  // Find first successful scraper
  const firstSuccess = results.find(r => r.ok);
  if (firstSuccess) {
    console.log(`[scraper] movie tmdb_id=${meta.tmdbId} - first success: ${firstSuccess.source} (${firstSuccess.streams.length} streams)`);
    const out = {
      streams: firstSuccess.streams,
      sourcesTried,
      succeededSource: firstSuccess.source,
      usedFallback: false,
    };
    cache.set(cacheKey, out);
    return out;
  }

  // All scrapers failed — fall back to Multi-Embed
  console.log(`[scraper] movie tmdb_id=${meta.tmdbId} - all scrapers failed, using Multi-Embed fallback`);
  const fallbackStreams = await multiembed.resolve(meta);
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
 * TV episode flow.
 * Note: most Hindi scrapers are movie-only. We'll try, but expect Multi-Embed fallback.
 *
 * @param {object} meta - { name, year, tmdbId, type: 'tv' }
 * @param {object} mediaInfo - { season, episode }
 */
export async function resolveTv(meta, mediaInfo) {
  const cacheKey = `resolve:tv:${meta.tmdbId}:${mediaInfo.season}:${mediaInfo.episode}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  console.log(`[scraper] tv tmdb_id=${meta.tmdbId} "${meta.name}" S${mediaInfo.season}E${mediaInfo.episode} - using Multi-Embed (Hindi scrapers are movie-focused)`);

  // Hindi scrapers generally don't have organized TV episode data,
  // so we go straight to Multi-Embed fallback
  const fallbackStreams = await multiembed.resolve(meta, mediaInfo);
  const out = {
    streams: fallbackStreams,
    sourcesTried: [{ source: 'Multi-Embed', ok: true, streamCount: fallbackStreams.length, error: null }],
    succeededSource: 'Multi-Embed (TV)',
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
