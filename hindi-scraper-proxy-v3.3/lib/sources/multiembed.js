// lib/sources/multiembed.js
// Multi-Embed fallback — if all Hindi scrapers fail, return MultiEmbed / VidSrc URLs.
// These are iframe-embeddable URLs that auto-play in our player.

export const id = 'multiembed';
export const name = 'Multi-Embed (Fallback)';
export const enabled = () => process.env.ENABLE_MULTIEMBED_FALLBACK !== 'false';

const PROVIDERS = [
  {
    id: 'vidsrcpk',
    name: 'VidSrc.pk',
    movie: 'https://embed.vidsrc.pk/movie/{tmdb_id}',
    series: 'https://embed.vidsrc.pk/tv/{tmdb_id}/{season}/{episode}',
  },
  {
    id: 'vidsrcto',
    name: 'VidSrc.to',
    movie: 'https://vidsrc.to/embed/movie/{tmdb_id}',
    series: 'https://vidsrc.to/embed/tv/{tmdb_id}/{season}-{episode}',
  },
  {
    id: '2embed',
    name: '2embed.cc',
    movie: 'https://www.2embed.cc/embed/{tmdb_id}',
    series: 'https://www.2embed.cc/embedtv/{tmdb_id}/{season}/{episode}',
  },
  {
    id: 'embedsu',
    name: 'Embed.su',
    movie: 'https://embed.su/embed/movie/{tmdb_id}',
    series: 'https://embed.su/embed/tv/{tmdb_id}/{season}/{episode}',
  },
  {
    id: 'multiembed',
    name: 'MultiEmbed',
    movie: 'https://multiembed.mov/?video_id={tmdb_id}',
    series: 'https://multiembed.mov/?video_id={tmdb_id}&s={season}&e={episode}',
  },
];

/**
 * @param {object} meta - { tmdbId, type: 'movie'|'tv' }
 * @param {object} [mediaInfo] - { season, episode } for TV
 */
export async function resolve(meta, mediaInfo = {}) {
  if (!meta?.tmdbId) return [];

  const isSeries = meta.type === 'tv' && mediaInfo.season != null && mediaInfo.episode != null;
  const streams = [];

  for (const p of PROVIDERS) {
    let url;
    if (isSeries) {
      url = p.series
        .replace('{tmdb_id}', encodeURIComponent(meta.tmdbId))
        .replace('{season}', encodeURIComponent(mediaInfo.season))
        .replace('{episode}', encodeURIComponent(mediaInfo.episode));
    } else {
      url = p.movie.replace('{tmdb_id}', encodeURIComponent(meta.tmdbId));
    }
    streams.push({
      quality: 'embed',
      url,
      source: `Multi-Embed / ${p.name}`,
      sourceUrl: url,
      isEmbed: true,
    });
  }

  return streams;
}

export const PROVIDERS_LIST = PROVIDERS;
