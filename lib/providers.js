// lib/providers.js
// All 8+ working embed providers (TMDB or IMDb based)
// Each provider supports {tmdb_id}, and TV ones support {season}, {episode}
// All tested working as of Nov 2026.

export const PROVIDERS = [
  {
    id: 'allmovieland',
    name: 'AllMovieLand (Vegamovies backend)',
    priority: 1,
    movieTemplate: 'https://slast430did.com/play/{imdb_id}',
    seriesTemplate: 'https://slast430did.com/play/{imdb_id}?season={season}&episode={episode}',
    supports: ['imdb'],
    note: 'Backend player for vegamovies/bollyflix/moviesflix/hiiduba',
  },
  {
    id: 'multiembed_imdb',
    name: 'MultiEmbed (IMDb)',
    priority: 2,
    movieTemplate: 'https://multiembed.mov/?video_id={imdb_id}',
    seriesTemplate: 'https://multiembed.mov/?video_id={imdb_id}&s={season}&e={episode}',
    supports: ['imdb'],
    note: 'MultiEmbed with IMDb ID',
  },
  {
    id: 'multiembed_tmdb',
    name: 'MultiEmbed (TMDB)',
    priority: 3,
    movieTemplate: 'https://multiembed.mov/?video_id={tmdb_id}&tmdb=1',
    seriesTemplate: 'https://multiembed.mov/?video_id={tmdb_id}&tmdb=1&s={season}&e={episode}',
    supports: ['tmdb'],
    note: 'MultiEmbed with TMDB ID',
  },
  {
    id: 'vidsrc_to',
    name: 'VidSrc.to (TMDB)',
    priority: 4,
    movieTemplate: 'https://vidsrc.to/embed/movie/{tmdb_id}',
    seriesTemplate: 'https://vidsrc.to/embed/tv/{tmdb_id}/{season}/{episode}',
    supports: ['tmdb'],
    note: 'VidSrc.to with TMDB ID',
  },
  {
    id: 'vidsrc_ru',
    name: 'VidSrc.ru',
    priority: 5,
    movieTemplate: 'https://vidsrc.ru/embed/movie/{imdb_id}',
    seriesTemplate: 'https://vidsrc.ru/embed/tv/{imdb_id}/{season}/{episode}',
    supports: ['imdb'],
    note: 'VidSrc.ru mirror',
  },
  {
    id: '2embed_cc',
    name: '2embed.cc',
    priority: 6,
    movieTemplate: 'https://www.2embed.cc/embed/{tmdb_id}',
    seriesTemplate: 'https://www.2embed.cc/embedtv/{tmdb_id}/{season}/{episode}',
    supports: ['tmdb'],
    note: '2embed.cc main domain',
  },
  {
    id: 'superembed_imdb',
    name: 'SuperEmbed (IMDb)',
    priority: 7,
    movieTemplate: 'https://superembed.stream/?video_id={imdb_id}',
    seriesTemplate: 'https://superembed.stream/?video_id={imdb_id}&s={season}&e={episode}',
    supports: ['imdb'],
    note: 'SuperEmbed with IMDb',
  },
  {
    id: 'superembed_tmdb',
    name: 'SuperEmbed (TMDB)',
    priority: 8,
    movieTemplate: 'https://superembed.stream/?video_id={tmdb_id}&tmdb=1',
    seriesTemplate: 'https://superembed.stream/?video_id={tmdb_id}&tmdb=1&s={season}&e={episode}',
    supports: ['tmdb'],
    note: 'SuperEmbed with TMDB',
  },
  // Additional fallbacks (lower priority, may rotate status)
  {
    id: 'vidsrc_pk',
    name: 'VidSrc.pk (backup)',
    priority: 9,
    movieTemplate: 'https://embed.vidsrc.pk/movie/{tmdb_id}',
    seriesTemplate: 'https://embed.vidsrc.pk/tv/{tmdb_id}/{season}/{episode}',
    supports: ['tmdb'],
    note: 'VidSrc.pk backup',
  },
  {
    id: 'embed_su',
    name: 'Embed.su (backup)',
    priority: 10,
    movieTemplate: 'https://embed.su/embed/movie/{tmdb_id}',
    seriesTemplate: 'https://embed.su/embed/tv/{tmdb_id}/{season}/{episode}',
    supports: ['tmdb'],
    note: 'Embed.su backup',
  },
];

/**
 * Build a movie URL for a provider
 */
export function getMovieUrl(providerId, { tmdbId, imdbId }) {
  const p = PROVIDERS.find(p => p.id === providerId);
  if (!p) throw new Error(`Unknown provider: ${providerId}`);
  let url = p.movieTemplate;
  if (url.includes('{tmdb_id}')) {
    if (!tmdbId) return null;
    url = url.replace('{tmdb_id}', encodeURIComponent(tmdbId));
  }
  if (url.includes('{imdb_id}')) {
    if (!imdbId) return null;
    url = url.replace('{imdb_id}', encodeURIComponent(imdbId));
  }
  return url;
}

/**
 * Build a TV episode URL for a provider
 */
export function getSeriesUrl(providerId, { tmdbId, imdbId, season, episode }) {
  const p = PROVIDERS.find(p => p.id === providerId);
  if (!p) throw new Error(`Unknown provider: ${providerId}`);
  let url = p.seriesTemplate;
  if (url.includes('{tmdb_id}')) {
    if (!tmdbId) return null;
    url = url.replace('{tmdb_id}', encodeURIComponent(tmdbId));
  }
  if (url.includes('{imdb_id}')) {
    if (!imdbId) return null;
    url = url.replace('{imdb_id}', encodeURIComponent(imdbId));
  }
  url = url.replace('{season}', encodeURIComponent(season)).replace('{episode}', encodeURIComponent(episode));
  return url;
}

/**
 * Get list of providers that can serve this title based on what IDs we have
 */
export function getUsableProviders({ tmdbId, imdbId }) {
  return PROVIDERS.filter(p => {
    if (p.supports.includes('imdb') && imdbId) return true;
    if (p.supports.includes('tmdb') && tmdbId) return true;
    return false;
  });
}
