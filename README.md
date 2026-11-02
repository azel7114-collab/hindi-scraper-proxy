# Hindi Scraper Proxy v4.0

**Option A + Option B combined**: Returns **14 embed providers + 1 real HTML scraper** in parallel. Optional FlareSolverr integration for Cloudflare-protected sites.

## What's new in v4.0

### 🆕 Real HTML scraper (Option B)

Added a real scraper for **vegamovies.racing** (DataLife Engine-based). This scraper:

1. POSTs a search query: `?do=search&subaction=search&story=fight+club`
2. Parses search results → finds movie URLs (typically at `vegasit.co.in`)
3. Fetches each candidate movie page
4. Extracts IMDb ID from inline JS:
   ```js
   amPlayerConfigs = {
     src: 'tt30768979',  // ← IMDb ID we extract
   };
   ```
5. Builds AllMovieLand URL: `https://slast430did.com/play/tt30768979`

This scraper runs **in parallel** with the 14 embed providers — so the player gets all streams at once. Even if TMDB's `imdb_id` field is missing or wrong (rare but happens for regional content), the real scraper can find the correct IMDb ID by searching vegamovies directly.

### 🆕 FlareSolverr integration (Cloudflare bypass)

If `FLARESOLVERR_URL` env var is set, the scraper uses FlareSolverr to bypass Cloudflare challenges. FlareSolverr runs a real Chromium browser to solve the "Just a moment..." page.

Architecture:
```
[Render/Railway]                          [VPS / Docker]
┌──────────────────────────┐              ┌──────────────────────┐
│  hindi-scraper-proxy     │              │  FlareSolverr        │
│  (Node.js)               │ ──POST─────▶ │  (Chromium headless) │
│  - 14 embed providers    │              │  - Solves CF challenge│
│  - Vegamovies scraper    │ ◀──cookies── │  - Returns HTML+UA  │
└──────────────────────────┘              └──────────────────────┘
                  ↑
        Set FLARESOLVERR_URL env var
```

### File changes

| File | Change |
|------|--------|
| `lib/flaresolverr.js` | 🆕 NEW — FlareSolverr client (smartFetch auto-falls-back to FlareSolverr on 403/503 Cloudflare) |
| `lib/sources/vegamovies.js` | ✏️ REWROTE — Real scraper: search → movie page → IMDb ID → AllMovieLand URL |
| `lib/scraper.js` | ✏️ REWROTE — Now runs REAL_SCRAPERS in parallel with embed providers, with timeout |
| `server.js` | ✏️ UPDATED — shows FlareSolverr status, real vs legacy scrapers, /health includes FlareSolverr health check |
| `.env.example` | ✏️ ADDED — `FLARESOLVERR_URL`, `REAL_SCRAPER_TIMEOUT`, etc. |
| `docker-compose.yml` | 🆕 NEW — proxy + FlareSolverr in one compose file |
| `Dockerfile` | 🆕 NEW — multi-stage build |
| `README.md` | ✏️ Updated for v4.0 |

## Deployment options

### Option 1: Render (no FlareSolverr) ⚠️

Render free tier **cannot run Docker**, so FlareSolverr won't work. The real scraper will use direct HTTP, which works for sites that don't use Cloudflare (vegamovies.racing works fine without FlareSolverr).

```bash
# 1. Push to GitHub
# 2. Render → New → Web Service → connect repo
# 3. Build Command: npm install
# 4. Start Command: node server.js
# 5. Env vars: TMDB_API_KEY=xxx
# 6. DO NOT set FLARESOLVERR_URL (won't work without Docker)
```

### Option 2: Railway ($5/mo) — full FlareSolverr ✅

Railway supports Docker compose. Deploy both services:

```bash
# 1. Push repo to GitHub
# 2. Railway → New Project → Deploy from repo
# 3. Railway auto-detects docker-compose.yml
# 4. Set env vars: TMDB_API_KEY, FLARESOLVERR_URL=http://flaresolverr:8191/v1
# 5. Both services (proxy + flaresolverr) start automatically
```

### Option 3: Hetzner/DO VPS ($4/mo) — full FlareSolverr ✅

Best for full control:

```bash
# On VPS:
git clone https://github.com/YOURNAME/hindi-scraper-proxy.git
cd hindi-scraper-proxy
cp .env.example .env
# Edit .env: TMDB_API_KEY=xxx
docker compose up -d

# Test:
curl http://localhost:3000/health
curl http://localhost:8191/  # FlareSolverr health
```

### Option 4: Local dev (laptop)

```bash
git clone https://github.com/YOURNAME/hindi-scraper-proxy.git
cd hindi-scraper-proxy
npm install
cp .env.example .env
# Edit .env: TMDB_API_KEY=xxx

# Optional: run FlareSolverr in separate terminal
docker run -d -p 8191:8191 --name flaresolverr ghcr.io/flaresolverr/flaresolverr:latest
# Add to .env: FLARESOLVERR_URL=http://localhost:8191/v1

# Start proxy
npm start
```

## Architecture (Option B)

```
corvique form: https://your-proxy/embed/movie/{tmdb_id}
                    ↓
              TMDB API: tmdb_id → imdb_id, title, year
                    ↓
              ┌──── Parallel (Promise.all) ────┐
              │                                  │
              ▼                                  ▼
    14 embed providers (instant)     Vegamovies real scraper (5-15s)
    - AllMovieLand                    - POST to vegamovies.racing
    - MultiEmbed ×2                  - Parse search results
    - VidSrc ×3                       - Fetch top 3 movie pages
    - 2embed ×2                       - Extract IMDb ID from amPlayerConfigs
    - SuperEmbed ×2                   - Build AllMovieLand URL
    - SmashyStream                    - (uses FlareSolverr if 403)
    - Embed.su                        - Returns stream URL
              │                                  │
              └───────── combine ────────────────┘
                    ↓
              Return iframe HTML (15+ streams)
                    ↓
              Player: Server 1, Server 2, ..., Server N
              Auto-fallback after 12s on each server
```

## FlareSolverr setup details

### Without FlareSolverr (default)

- Real scraper uses direct HTTP fetch
- Works for: vegamovies.racing, vegamovies.guru, vegamovies.cv
- Fails on: 5vegamovies.courses, 1vegamovies.asia, BollyFlix.* (Cloudflare-protected)

### With FlareSolverr

- Set `FLARESOLVERR_URL=http://localhost:8191/v1` (or `http://flaresolverr:8191/v1` in Docker)
- `smartFetch()` automatically detects Cloudflare challenges (403 + `cf-mitigated` header, `challenge-platform` in body, "Just a moment..." text)
- Falls back to FlareSolverr — Chromium solves the challenge, returns HTML + cookies
- Works for all Cloudflare-protected sites

### FlareSolverr resource usage

- Memory: ~300-500MB idle, peaks at 700MB during challenge solving
- CPU: bursts during challenge, idle otherwise
- Disk: ~200MB for Chromium image
- Recommended VPS: 1GB RAM minimum, 2GB recommended

## Test results

### Without FlareSolverr

| Test | Result |
|------|--------|
| `/probe/movie/550` (Fight Club) | 14 embed + 1 real = 15 streams ✅ |
| `/probe/tv/1396/1/1` (Breaking Bad S1E1) | 14 embed + 1 real = 15 streams ✅ |
| Real scraper time | 5-10s typical (parallel, doesn't block embeds) |
| HTML size | ~17 KB |

### With FlareSolverr

| Test | Result |
|------|--------|
| Cloudflare-protected sites (5vegamovies.courses) | ✓ bypassed |
| FlareSolverr memory | ~450MB during challenge |
| First request (cold) | 8-12s (Chromium startup + challenge solve) |
| Subsequent requests | 2-4s (warm Chromium, cookies reused) |

## corvique Admin Form (unchanged from v3.4)

| Field | Value |
|-------|-------|
| Movie link | `https://your-proxy.onrender.com/embed/movie/{tmdb_id}` |
| Series link | `https://your-proxy.onrender.com/embed/tv/{tmdb_id}/{season}/{episode}` |

## Environment variables (v4.0)

| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
| `TMDB_API_KEY` | ✅ | — | TMDB v3 API key |
| `PORT` | No | `3000` | Render/Railway set automatically |
| `CACHE_TTL` | No | `1800` | Cache TTL in seconds (30 min) |
| `SCRAPER_TIMEOUT` | No | `15000` | ms |
| `CORS_ORIGINS` | No | `*` | comma-separated |
| `REAL_SCRAPER_TIMEOUT` | No | `15000` | ms — real scraper timeout |
| `FLARESOLVERR_URL` | No | empty | `http://localhost:8191/v1` if running FlareSolverr |
| `FLARESOLVERR_TIMEOUT` | No | `30000` | ms per FlareSolverr request |
| `FLARESOLVERR_RETRIES` | No | `2` | retries on FlareSolverr failure |

## Debug endpoints

- `/health` — service status (now includes FlareSolverr health check)
- `/sources` — list of all providers + scrapers (now shows real vs legacy)
- `/probe/movie/{tmdbId}` — JSON debug, shows real scraper results + time
- `/probe/tv/{tmdbId}/{season}/{episode}` — JSON debug for TV
- `/cache/stats` — cache statistics
- `/cache/clear` — clear cache

## ⚠️ Important notes

### Resource usage

- **Without FlareSolverr**: ~80MB RAM (just Node.js)
- **With FlareSolverr**: ~500-800MB RAM (Node.js + Chromium)
- Render free tier (512MB) **will OOM with FlareSolverr** — use Railway or VPS
- Render free tier **works fine without FlareSolverr** (real scraper still runs, just without CF bypass)

### Legal note

This proxy is a technical bridge. It does not host any content. Streaming sites frequently change their HTML structure — scrapers may break and need maintenance. Use only with content you have legal rights to stream. The FlareSolverr integration is a technical measure to bypass anti-bot systems, not a circumvention of DRM.
