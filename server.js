// server.js
// Hindi Scraper Proxy
// Single URL that:
//   1. Resolves TMDB id -> title via TMDB API
//   2. Runs 4 Hindi movie scrapers in parallel (Fzmovies, BollyFlix, MoviesFlix, Hiiduba)
//   3. Returns the first successful scraper's streams
//   4. Falls back to Multi-Embed (VidSrc, 2embed, etc.) if all scrapers fail
//
// Routes:
//   GET /                                          - landing page with corvique form values
//   GET /health                                    - health check
//   GET /sources                                   - list of enabled scrapers
//   GET /probe/movie/:tmdbId                       - JSON debug: which scraper found what
//   GET /probe/tv/:tmdbId/:season/:episode         - JSON debug for TV
//   GET /embed/movie/:tmdbId                       - HTML player for movie
//   GET /embed/tv/:tmdbId/:season/:episode         - HTML player for TV episode
//   GET /cache/stats                               - cache stats (debug)
//   GET /cache/clear                               - clear cache (debug)

import express from 'express';
import { getMovieMeta, getTvMeta, getEpisodeMeta } from './lib/tmdb.js';
import { resolveMovie, resolveTv, clearCache, getCacheStats, PROVIDERS } from './lib/scraper.js';
import { renderEmbedPage } from './lib/embed.js';
import * as fzmovies from './lib/sources/fzmovies.js';
import * as bollyflix from './lib/sources/bollyflix.js';
import * as moviesflix from './lib/sources/moviesflix.js';
import * as hiiduba from './lib/sources/hiiduba.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Hindi scrapers (last resort)
const HINDI_SCRAPERS = [fzmovies, bollyflix, moviesflix, hiiduba];

// CORS
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGINS || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Logging
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// ---- Landing page ----
app.get('/', (req, res) => {
  const proto = (req.headers['x-forwarded-proto'] || 'http').toString().split(',')[0].trim();
  const host = req.headers.host || `localhost:${PORT}`;
  const base = `${proto}://${host}`;

  const enabledProviders = PROVIDERS;
  const enabledScrapers = HINDI_SCRAPERS.filter(s => s.enabled());

  res.type('html').send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Hindi Scraper Proxy v3</title>
<style>
  body { font-family:system-ui,Segoe UI,Roboto,sans-serif; max-width:780px; margin:40px auto; padding:0 20px; color:#222; }
  h1 { color:#e50d75; margin-bottom:6px; }
  h2 { margin-top:32px; font-size:16px; }
  code { background:#f4f4f4; padding:8px 10px; border-radius:4px; display:block; margin:6px 0; font-size:13px; word-break:break-all; }
  table { width:100%; border-collapse:collapse; margin:12px 0; }
  th, td { text-align:left; padding:8px 10px; border-bottom:1px solid #eee; font-size:13px; }
  th { background:#fafafa; }
  .badge { background:#e50d75; color:#fff; padding:2px 6px; border-radius:3px; font-size:11px; font-weight:600; }
  .badge.fallback { background:#f59e0b; }
  a { color:#e50d75; }
  .warn { background:#fef3c7; padding:12px; border-radius:6px; font-size:13px; margin-top:18px; }
</style></head><body>
<h1>Hindi Scraper Proxy <span class="badge">v3.0</span></h1>
<p>Single URL that returns <strong>${enabledProviders.length}+ working embed providers in parallel</strong> (AllMovieLand, MultiEmbed, VidSrc, 2embed, SuperEmbed, etc.). User sees all servers in player UI — first one that loads wins. Falls back to ${enabledScrapers.length} Hindi site scrapers if all embeds fail.</p>

<h2>Paste these into corvique admin → Video source (auto-attach)</h2>
<p><strong>Movie link:</strong></p>
<code>${base}/embed/movie/{tmdb_id}</code>
<p><strong>Series link:</strong></p>
<code>${base}/embed/tv/{tmdb_id}/{season}/{episode}</code>

<h2>Embed Providers (all tried in parallel, user picks in player)</h2>
<table>
  <tr><th>#</th><th>Provider</th><th>ID Type</th><th>Priority</th></tr>
  ${enabledProviders.map((p, i) => `<tr><td>${i + 1}</td><td>${p.name}</td><td>${p.supports.join('/')}</td><td>${p.priority}</td></tr>`).join('')}
</table>

<h2>Hindi Site Scrapers (last resort if all embeds fail)</h2>
<table>
  <tr><th>#</th><th>Source</th><th>Enabled</th></tr>
  ${enabledScrapers.map((s, i) => `<tr><td>${i + 1}</td><td>${s.name}</td><td><span class="badge">enabled</span></td></tr>`).join('')}
</table>

<h2>Test</h2>
<p>Open in browser:</p>
<code>${base}/embed/movie/550</code> <span style="color:#888">(Fight Club)</span><br>
<code>${base}/embed/movie/9479</code> <span style="color:#888">(Dangal — Hindi)</span><br>
<code>${base}/embed/tv/1396/1/1</code> <span style="color:#888">(Breaking Bad S1E1 — falls back to Multi-Embed)</span>

<h2>Debug</h2>
<p>Probe all sources for a title (returns JSON with which source found what):</p>
<code>${base}/probe/movie/550</code> <span style="color:#888">(Fight Club)</span><br>
<code>${base}/probe/tv/1396/1/1</code> <span style="color:#888">(Breaking Bad S1E1)</span>

<p style="margin-top:12px"><a href="/health">/health</a> · <a href="/sources">/sources</a> · <a href="/cache/stats">/cache/stats</a> · <a href="/cache/clear">/cache/clear</a></p>

<div class="warn">
  <strong>⚠️ Legal note:</strong> This proxy is a technical bridge. It does not host any content.
  Streaming sites frequently change their HTML — scrapers may break and need maintenance.
  Use only with content you have legal rights to stream.
</div>
</body></html>`);
});

// ---- Health ----
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    tmdb: !!process.env.TMDB_API_KEY,
    embedProviders: PROVIDERS.map(p => p.name),
    hindiScrapers: HINDI_SCRAPERS.filter(s => s.enabled()).map(s => s.name),
    uptime: process.uptime(),
  });
});

// ---- Sources list ----
app.get('/sources', (_req, res) => {
  res.json({
    embedProviders: PROVIDERS,
    hindiScrapers: HINDI_SCRAPERS.filter(s => s.enabled()).map(s => ({
      id: s.id,
      name: s.name,
      enabled: s.enabled(),
    })),
  });
});

// ---- Probe (debug) ----
app.get('/probe/movie/:tmdbId', async (req, res) => {
  const { tmdbId } = req.params;
  try {
    const meta = await getMovieMeta(tmdbId);
    const result = await resolveMovie(meta);
    res.json({
      ok: true,
      tmdbId,
      meta: { title: meta.title, year: meta.year },
      result: {
        succeededSource: result.succeededSource,
        usedFallback: result.usedFallback,
        streamCount: result.streams.length,
        sourcesTried: result.sourcesTried,
        streams: result.streams.slice(0, 5).map(s => ({
          quality: s.quality,
          url: s.url.substring(0, 100) + '...',
          source: s.source,
        })),
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/probe/tv/:tmdbId/:season/:episode', async (req, res) => {
  const { tmdbId, season, episode } = req.params;
  try {
    const meta = await getTvMeta(tmdbId);
    const result = await resolveTv(meta, { season: parseInt(season, 10), episode: parseInt(episode, 10) });
    res.json({
      ok: true,
      tmdbId, season, episode,
      meta: { name: meta.name, year: meta.year },
      result: {
        succeededSource: result.succeededSource,
        usedFallback: result.usedFallback,
        streamCount: result.streams.length,
        sourcesTried: result.sourcesTried,
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---- Movie embed ----
app.get('/embed/movie/:tmdbId', async (req, res) => {
  const { tmdbId } = req.params;
  try {
    console.log(`[movie] tmdb_id=${tmdbId} - resolving via TMDB + scrapers`);
    const meta = await getMovieMeta(tmdbId);
    const result = await resolveMovie(meta);
    console.log(`[movie] tmdb_id=${tmdbId} - resolved via ${result.succeededSource} (${result.streams.length} streams, fallback=${result.usedFallback})`);

    const html = renderEmbedPage({
      title: `${meta.title} (${meta.year})`,
      streams: result.streams,
      sourcesTried: result.sourcesTried,
      usedFallback: result.usedFallback,
    });
    res.type('html').send(html);
  } catch (err) {
    console.error(`[movie] tmdb_id=${tmdbId} ERROR:`, err.message);
    const html = renderEmbedPage({ title: 'Error', error: err.message });
    res.status(200).type('html').send(html);
  }
});

// ---- TV episode embed ----
app.get('/embed/tv/:tmdbId/:season/:episode', async (req, res) => {
  const { tmdbId, season, episode } = req.params;
  const se = parseInt(season, 10);
  const ep = parseInt(episode, 10);
  try {
    console.log(`[tv] tmdb_id=${tmdbId} S${se}E${ep} - resolving`);
    const meta = await getTvMeta(tmdbId);
    const epMeta = await getEpisodeMeta(tmdbId, se, ep).catch(() => ({}));
    const result = await resolveTv(meta, { season: se, episode: ep });
    console.log(`[tv] tmdb_id=${tmdbId} S${se}E${ep} - resolved via ${result.succeededSource} (${result.streams.length} streams)`);

    const html = renderEmbedPage({
      title: `${meta.name} - S${se}E${ep} - ${epMeta.name || ''}`,
      streams: result.streams,
      sourcesTried: result.sourcesTried,
      usedFallback: result.usedFallback,
    });
    res.type('html').send(html);
  } catch (err) {
    console.error(`[tv] tmdb_id=${tmdbId} S${se}E${ep} ERROR:`, err.message);
    const html = renderEmbedPage({ title: 'Error', error: err.message });
    res.status(200).type('html').send(html);
  }
});

// ---- Cache management ----
app.get('/cache/stats', (_req, res) => {
  res.json(getCacheStats());
});

app.get('/cache/clear', (_req, res) => {
  clearCache();
  res.json({ ok: true, message: 'Cache cleared' });
});

// 404
app.use((_req, res) => {
  res.status(404).json({ ok: false, error: 'Not found' });
});

// Error handler
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ ok: false, error: err.message });
});

app.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(`  Hindi Scraper Proxy on port ${PORT}`);
  console.log(`========================================`);
  console.log(`  TMDB API key:    ${process.env.TMDB_API_KEY ? 'set ✓' : 'MISSING ✗'}`);
  console.log(`  Embed providers: ${PROVIDERS.length}`);
  PROVIDERS.forEach(p => console.log(`    ${p.priority}. ${p.name} (${p.supports.join('/')})`));
  console.log(`  Hindi scrapers (last resort):`);
  HINDI_SCRAPERS.forEach(s => {
    if (s.enabled()) console.log(`    ✓ ${s.name}`);
    else console.log(`    ✗ ${s.name} (disabled)`);
  });
  console.log(`========================================\n`);
});
