// lib/tmdb.js
// TMDB API integration: tmdb_id -> title (and metadata)
// Used as the bridge between corvique's TMDB-based imports and site scrapers

import NodeCache from 'node-cache';

const cache = new NodeCache({ stdTTL: 86400 }); // 24h cache
const TMDB_BASE = 'https://api.themoviedb.org/3';

export async function getMovieMeta(tmdbId) {
  const cacheKey = `movie:${tmdbId}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) throw new Error('TMDB_API_KEY environment variable is required');

  const url = `${TMDB_BASE}/movie/${tmdbId}?api_key=${apiKey}&language=en-US`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(parseInt(process.env.SCRAPER_TIMEOUT || '15000', 10)),
  });

  if (!res.ok) {
    if (res.status === 404) throw new Error(`TMDB movie ${tmdbId} not found`);
    throw new Error(`TMDB API error: ${res.status}`);
  }

  const data = await res.json();
  const meta = {
    type: 'movie',
    title: data.title || data.original_title,
    originalTitle: data.original_title || data.title,
    year: data.release_date ? data.release_date.slice(0, 4) : '',
    poster: data.poster_path ? `https://image.tmdb.org/t/p/w500${data.poster_path}` : '',
    overview: data.overview || '',
    tmdbId: String(tmdbId),
    imdbId: data.imdb_id || '',
  };

  cache.set(cacheKey, meta);
  return meta;
}

export async function getTvMeta(tmdbId) {
  const cacheKey = `tv:${tmdbId}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) throw new Error('TMDB_API_KEY environment variable is required');

  const url = `${TMDB_BASE}/tv/${tmdbId}?api_key=${apiKey}&language=en-US`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(parseInt(process.env.SCRAPER_TIMEOUT || '15000', 10)),
  });

  if (!res.ok) {
    if (res.status === 404) throw new Error(`TMDB tv ${tmdbId} not found`);
    throw new Error(`TMDB API error: ${res.status}`);
  }

  const data = await res.json();

  // Fetch IMDb ID via external_ids endpoint
  let imdbId = '';
  try {
    const extUrl = `${TMDB_BASE}/tv/${tmdbId}/external_ids?api_key=${apiKey}`;
    const extRes = await fetch(extUrl, {
      signal: AbortSignal.timeout(parseInt(process.env.SCRAPER_TIMEOUT || '15000', 10)),
    });
    if (extRes.ok) {
      const extData = await extRes.json();
      imdbId = extData.imdb_id || '';
    }
  } catch {
    // ignore — IMDb ID will be empty
  }

  const meta = {
    type: 'tv',
    name: data.name || data.original_name,
    originalName: data.original_name || data.name,
    year: data.first_air_date ? data.first_air_date.slice(0, 4) : '',
    poster: data.poster_path ? `https://image.tmdb.org/t/p/w500${data.poster_path}` : '',
    overview: data.overview || '',
    tmdbId: String(tmdbId),
    imdbId,
  };

  cache.set(cacheKey, meta);
  return meta;
}

export async function getEpisodeMeta(tmdbId, season, episode) {
  const cacheKey = `ep:${tmdbId}:${season}:${episode}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) throw new Error('TMDB_API_KEY environment variable is required');

  const url = `${TMDB_BASE}/tv/${tmdbId}/season/${season}/episode/${episode}?api_key=${apiKey}`;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(parseInt(process.env.SCRAPER_TIMEOUT || '15000', 10)),
    });
    if (!res.ok) return { name: `S${season}E${episode}`, overview: '' };
    const data = await res.json();
    const meta = {
      name: data.name || `S${season}E${episode}`,
      overview: data.overview || '',
    };
    cache.set(cacheKey, meta);
    return meta;
  } catch {
    return { name: `S${season}E${episode}`, overview: '' };
  }
}
