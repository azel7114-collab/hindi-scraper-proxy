# Hindi Scraper Proxy v2.0

Single URL that returns working movie/TV streams for any TMDB ID. **AllMovieLand** is the primary source — backend player used by Vegamovies, BollyFlix, Moviesflix, Hiiduba, etc.

## Why v2 is much better than v1

| Aspect | v1 (old) | v2 (new) |
|--------|---------|----------|
| Primary source | Hindi site scrapers (4 sites, often blocked by Cloudflare) | **AllMovieLand** — backend player for all Hindi sites |
| Method | Scrape search → scrape movie page → extract stream URL | **TMDB ID → IMDb ID → direct embed URL** |
| Speed | 5-15s (multiple page fetches) | **<1s** (1 TMDB API call + 1 iframe URL) |
| Reliability | Often fails (sites block scrapers) | **Highly reliable** (CDN-backed player) |
| Maintenance | Weekly (sites change HTML) | **None** (no scraping) |

## Architecture

```
corvique form: https://your-proxy/embed/movie/{tmdb_id}
                    ↓
              TMDB API: tmdb_id → imdb_id
                    ↓
              Build URL: https://slast430did.com/play/{imdb_id}
                    ↓
              For TV:   ...?season={s}&episode={e}
                    ↓
              Return iframe HTML pointing to AllMovieLand player
                    ↓
              corvique iframe loads → video plays
```

## Sources (in priority order)

1. **AllMovieLand** ⭐ PRIMARY — backend player for vegamovies/bollyflix/moviesflix/hiiduba
2. **Multi-Embed** (Fallback) — VidSrc.pk, VidSrc.to, 2embed.cc, Embed.su, MultiEmbed
3. **Hindi scrapers** (Last resort) — Fzmovies, BollyFlix, MoviesFlix, Hiiduba

## Quick Start (local)

```bash
cd hindi-scraper-proxy
npm install
cp .env.example .env
# Edit .env: TMDB_API_KEY=your_key
npm start
# Server runs on http://localhost:3000
```

Open in browser:
- http://localhost:3000/ → landing page
- http://localhost:3000/embed/movie/550 → Fight Club
- http://localhost:3000/embed/tv/1396/1/1 → Breaking Bad S1E1
- http://localhost:3000/probe/movie/550 → JSON debug

## Deploy on Render

1. Push to GitHub
2. Render → New Web Service → connect repo
3. Build: `npm install` | Start: `npm start`
4. Env vars: `TMDB_API_KEY=your_key`
5. URL will be like `https://hindi-scraper-xyz.onrender.com`

## Plug into corvique.site admin

Go to **corvique.site/admin → Video source (auto-attach)**:

| Field | Value |
|-------|-------|
| **Movie link** | `https://your-proxy.example.com/embed/movie/{tmdb_id}` |
| **Series link** | `https://your-proxy.example.com/embed/tv/{tmdb_id}/{season}/{episode}` |
| **API key** | _(blank)_ |
| ☑ Auto-attach on every TMDB import | ✓ |

Click **Save video source** → then **Attach to already imported titles** to backfill.

## API Reference

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/` | GET | Landing page with corvique form values |
| `/health` | GET | Health check |
| `/sources` | GET | List of enabled sources (JSON) |
| `/probe/movie/:tmdbId` | GET | JSON debug — which source found streams |
| `/probe/tv/:tmdbId/:season/:episode` | GET | JSON debug for TV |
| `/embed/movie/:tmdbId` | GET | HTML player (auto-tries sources) |
| `/embed/tv/:tmdbId/:season/:episode` | GET | HTML player for TV episode |
| `/cache/stats` | GET | Cache statistics |
| `/cache/clear` | GET | Clear cache |

## How AllMovieLand was discovered

While inspecting Vegamovies' movie pages, I noticed they load an iframe from `slast430did.com` (which redirects to AllMovieLand's CDN). The URL pattern is:

```
https://slast430did.com/play/{imdb_id}
https://slast430did.com/play/{imdb_id}?season={s}&episode={e}  (TV)
```

This player:
- Returns HTTP 200 with valid HTML
- Has CORS `access-control-allow-origin: *`
- Has NO `X-Frame-Options` or CSP — fully iframe-embeddable
- Uses HLS.js for adaptive streaming
- Supports both movies and TV shows via IMDb IDs

The same backend is used by BollyFlix, Moviesflix, Hiiduba, and many other Hindi streaming sites — they all just embed AllMovieLand's player. So instead of scraping each one, we directly use the player.

## Caching

- TMDB metadata: cached **24h**
- Stream URLs: cached **30 min** (configurable via `CACHE_TTL`)
- Clear cache: `GET /cache/clear`

## Files

```
hindi-scraper-proxy/
├── server.js
├── lib/
│   ├── http.js
│   ├── tmdb.js
│   ├── scraper.js                  # Orchestrator (AllMovieLand first)
│   ├── embed.js
│   └── sources/
│       ├── allmovieland.js         # ⭐ PRIMARY
│       ├── multiembed.js           # FALLBACK
│       ├── fzmovies.js             # Last resort
│       ├── bollyflix.js            # Last resort
│       ├── moviesflix.js           # Last resort
│       └── hiiduba.js              # Last resort
├── package.json
├── .env.example
└── README.md
```

## ⚠️ Legal & ethical use

This proxy is a **technical bridge**. It does not host, store, or upload any content. The sites it links to aggregate third-party streams whose copyright status varies by jurisdiction.

Before using in a public site:
- Confirm you have legal streaming rights for the content
- Respect DMCA / copyright takedown requests
- For personal/home use, consider Plex + Jellyfin with your own media

The maintainers of this proxy are not responsible for how you use it.

## License

MIT
