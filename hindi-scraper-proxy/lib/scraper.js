// lib/scraper.js
// Parallel orchestrator
//
// STRATEGY: Run ALL available providers in parallel (Promise.all).
// Each provider returns its embed URL — we return ALL of them as streams
// (since these are iframe embeds, not direct MP4s).
//
// Player UI shows "Server 1, Server 2, ... Server N" tabs, user can switch.
// Auto-fallback after 8s if a server doesn't load.
//
// Old Hindi site scrapers (Fzmovies, BollyFlix, etc.) kept as LAST resort
// in case all embed providers fail.

import NodeCache from 'node-cache';
import { PROVIDERS, getMovieUrl, getSeriesUrl, getUsableProviders } from './providers.js';
import * as fzmovies from './sources/fzmovies.js';
import * as bollyflix from './sources/bollyflix.js';
import * as moviesflix from './sources/moviesflix.js';
import * as hiiduba from './sources/hiiduba.js';
import * as mlsbd from './sources/mlsbd.js';
import * as mkvcinemas from './sources/mkvcinemas.js';
import * as minoplres from './sources/minoplres.js';
import * as vegamovies from './sources/vegamovies.js';
import * as watchhentai from './sources/watchhentai.js';
import * as watchmovies from './sources/watchmovies.js';

const cache = new NodeCache({
  stdTTL: parseInt(process.env.CACHE_TTL || '1800', 10),
});

// Order: AllMovieLand-primary sites first, then user-requested scrapers, then others
const HINDI_SCRAPERS = [
  vegamovies,        // user requested - uses AllMovieLand as backend too
  mlsbd,             // user requested
  watchmovies,       // user requested (hindilinks4u)
  mkvcinemas,        // user requested
  minoplres,         // user requested
  watchhentai,       // user requested (anime, disabled by default)
  fzmovies,          // existing
  bollyflix,         // existing
  moviesflix,        // existing
  hiiduba,           // existing
];

/**
 * Resolve a movie — collect ALL provider URLs (parallel), then Hindi scrapers as backup
 *
 * @param {object} meta - { title, year, tmdbId, imdbId, type: 'movie' }
 */
export async function resolveMovie(meta) {
  const cacheKey = `resolve:movie:${meta.tmdbId}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const usable = getUsableProviders(meta);
  console.log(`[scraper] movie tmdb_id=${meta.tmdbId} imdb_id=${meta.imdbId || 'n/a'} - ${usable.length} providers available`);

  // Build all provider URLs in parallel (these are just URL construction, no I/O)
  const streams = [];
  const sourcesTried = [];

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

  // If we have at least one embed provider URL, return immediately
  if (streams.length > 0) {
    console.log(`[scraper] movie tmdb_id=${meta.tmdbId} - returning ${streams.length} embed URLs`);
    const out = {
      streams,
      sourcesTried,
      succeededSource: 'Multi-Provider Embeds',
      usedFallback: false,
    };
    cache.set(cacheKey, out);
    return out;
  }

  // Last resort: try Hindi scrapers in parallel
  console.log(`[scraper] movie tmdb_id=${meta.tmdbId} - no embed providers, trying Hindi scrapers`);
  const enabledHindi = HINDI_SCRAPERS.filter(s => s.enabled());
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
    if (r.ok) {
      streams.push(...r.streams);
    }
  }

  const out = {
    streams,
    sourcesTried,
    succeededSource: streams.length > 0 ? 'Hindi scrapers' : 'None',
    usedFallback: true,
  };
  cache.set(cacheKey, out);
  return out;
}

/**
 * Resolve a TV episode — same pattern: all providers in parallel
 *
 * @param {object} meta - { name, year, tmdbId, imdbId, type: 'tv' }
 * @param {object} mediaInfo - { season, episode }
 */
export async function resolveTv(meta, mediaInfo) {
  const cacheKey = `resolve:tv:${meta.tmdbId}:${mediaInfo.season}:${mediaInfo.episode}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const usable = getUsableProviders(meta);
  console.log(`[scraper] tv tmdb_id=${meta.tmdbId} imdb_id=${meta.imdbId || 'n/a'} S${mediaInfo.season}E${mediaInfo.episode} - ${usable.length} providers available`);

  const streams = [];
  const sourcesTried = [];

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

  const out = {
    streams,
    sourcesTried,
    succeededSource: streams.length > 0 ? 'Multi-Provider Embeds' : 'None',
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

export { PROVIDERS };
