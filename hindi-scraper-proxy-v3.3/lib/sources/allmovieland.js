// lib/sources/allmovieland.js
// AllMovieLand — backend player used by Vegamovies, BollyFlix, Moviesflix, Hiiduba, etc.
//
// CRITICAL DISCOVERY: These Hindi streaming sites don't host content themselves.
// They all use AllMovieLand's iframe player at slast430did.com.
//
// AllMovieLand uses IMDb IDs, not TMDB IDs. So we just need:
//   1. TMDB API → get IMDb ID
//   2. Build URL: https://slast430did.com/play/{imdb_id}
//   3. For TV:   https://slast430did.com/play/{imdb_id}?season={s}&episode={e}
//
// No scraping needed! This is the cleanest, most reliable approach.

export const id = 'allmovieland';
export const name = 'AllMovieLand (Vegamovies backend)';
export const enabled = () => process.env.ENABLE_ALLMOVIELAND !== 'false';

// Multiple CDN domains (they rotate these)
const DOMAINS = [
  'https://slast430did.com',
  // Backup domains (try if primary fails)
  // 'https://allmovieland.link',
];

/**
 * @param {object} meta - { tmdbId, imdbId, type: 'movie'|'tv' }
 * @param {object} [mediaInfo] - { season, episode } for TV
 */
export async function resolve(meta, mediaInfo = {}) {
  if (!meta?.imdbId) {
    return [];
  }

  const isSeries = meta.type === 'tv' && mediaInfo.season != null && mediaInfo.episode != null;

  const streams = [];

  for (const base of DOMAINS) {
    let url;
    if (isSeries) {
      url = `${base}/play/${meta.imdbId}?season=${mediaInfo.season}&episode=${mediaInfo.episode}`;
    } else {
      url = `${base}/play/${meta.imdbId}`;
    }
    streams.push({
      quality: isSeries ? `S${mediaInfo.season}E${mediaInfo.episode}` : 'auto',
      url,
      source: 'AllMovieLand',
      sourceUrl: url,
      isEmbed: true,
    });
  }

  return streams;
}
