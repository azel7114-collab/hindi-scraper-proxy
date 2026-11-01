# Hindi Scraper Proxy

Single URL that scrapes **4 Hindi movie sites in parallel** and serves the first working stream. Falls back to Multi-Embed (VidSrc, 2embed, etc.) if all scrapers fail. Built for `corvique.site/admin → Video source (auto-attach)`.

## Why

For Hindi/Bollywood movies, English-focused embed providers (VidSrc.pk, 2embed.cc) often miss content. This proxy:

1. Resolves TMDB id → movie title via TMDB API
2. Runs **4 Hindi scrapers in parallel**:
   - **Fzmovies** — Bollywood + Hindi dubs
   - **BollyFlix** — Bollywood + Hindi dubbed Hollywood
   - **MoviesFlix** — Hindi + dual audio
   - **Hiiduba** — Hindi dubbed movies
3. Returns the **first scraper's streams** that succeed
4. Falls back to **Multi-Embed** (5 providers: VidSrc.pk, VidSrc.to, 2embed.cc, Embed.su, MultiEmbed) if all Hindi scrapers fail

## Files

```
hindi-scraper-proxy/
├── server.js                    # Express server with embed routes
├── lib/
│   ├── http.js                  # Common HTTP client (browser headers)
│   ├── tmdb.js                  # TMDB API integration
│   ├── scraper.js               # Parallel orchestrator
│   ├── embed.js                 # HTML player generator
│   └── sources/
│       ├── fzmovies.js          # Fzmovies scraper
│       ├── bollyflix.js         # BollyFlix scraper
│       ├── moviesflix.js        # MoviesFlix scraper
│       ├── hiiduba.js           # Hiiduba scraper
│       └── multiembed.js        # Multi-Embed fallback
├── package.json
├── .env.example
└── README.md
```

## Quick Start (local)

```bash
cd hindi-scraper-proxy
npm install
cp .env.example .env
# Edit .env:
#   TMDB_API_KEY=your_key_here
npm start
# Server runs on http://localhost:3000
```

Open in browser:
- http://localhost:3000/ → landing page
- http://localhost:3000/embed/movie/9479 → Dangal (Hindi) — scrapers try in parallel
- http://localhost:3000/embed/movie/550 → Fight Club — falls back to Multi-Embed
- http://localhost:3000/embed/tv/1396/1/1 → Breaking Bad S1E1 (Multi-Embed fallback)
- http://localhost:3000/probe/movie/9479 → JSON debug: which scraper found what

## Deploy

### Render (free tier)

1. Push this folder to GitHub
2. Render → New Web Service → connect repo
3. Build: `npm install` | Start: `npm start`
4. Env vars: `TMDB_API_KEY`
5. URL will be like `https://hindi-scraper-xyz.onrender.com`

### Railway / Fly.io / VPS

Same — Node.js 18+ host, `npm install && npm start`.

## Plug into corvique.site admin

Go to **corvique.site/admin → Video source (auto-attach)**:

| Field | Value |
|-------|-------|
| **Movie link** | `https://your-proxy.example.com/embed/movie/{tmdb_id}` |
| **Series link** | `https://your-proxy.example.com/embed/tv/{tmdb_id}/{season}/{episode}` |
| **API key** | _(blank)_ |
| ☑ Auto-attach on every TMDB import | ✓ |
| ☐ I confirm I own streaming rights | only if you legally do |

Click **Save video source** → then **Attach to already imported titles** to backfill.

## API Reference

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/` | GET | Landing page with corvique form values |
| `/health` | GET | Health check |
| `/sources` | GET | List of enabled sources (JSON) |
| `/probe/movie/:tmdbId` | GET | JSON debug — which scraper found streams |
| `/probe/tv/:tmdbId/:season/:episode` | GET | JSON debug for TV |
| `/embed/movie/:tmdbId` | GET | HTML player (tries all scrapers in parallel) |
| `/embed/tv/:tmdbId/:season/:episode` | GET | HTML player for TV episode |
| `/cache/stats` | GET | Cache statistics |
| `/cache/clear` | GET | Clear cache |

## How it works

```
corvique → your-proxy/embed/movie/{tmdb_id}
              ↓
         TMDB API: tmdb_id → "Dangal" (2016)
              ↓
         Parallel scrapers (Promise.all):
              ↓
         ┌──────────────────────────────────┐
         │ Fzmovies  → resolve(title, year) │
         │ BollyFlix → resolve(title, year) │
         │ MoviesFlix→ resolve(title, year) │
         │ Hiiduba   → resolve(title, year) │
         └──────────────────────────────────┘
              ↓
         First successful scraper wins
              ↓
         If all fail → Multi-Embed fallback
              ↓
         HTML player with stream URLs
              ↓
         corvique iframe loads player → video plays
```

## Caching

- TMDB metadata: cached **24h** (rarely changes)
- Scraper results: cached **30 min** (default, configurable via `CACHE_TTL`)
- Movie stream URLs often expire quickly — keep cache TTL low
- Clear cache: `GET /cache/clear`

## Maintaining scrapers

Streaming sites frequently change their HTML structure. If a scraper stops working:

1. Visit the site manually, view page source
2. Update the regex patterns in `lib/sources/<sitename>.js`
3. Test with `/probe/movie/<tmdbId>` to see which scraper returns streams
4. Restart server

Each scraper file has 3 main functions:
- `search(query, yearHint)` — site search → list of movie URLs
- `getStreams(movieUrl)` — movie page → list of stream URLs
- `resolve(meta)` — full flow: search → getStreams → return

## Add a new source

1. Create `lib/sources/yoursite.js`:

```js
import { get, matchAll, decodeEntities, stripHtml } from '../http.js';

export const id = 'yoursite';
export const name = 'YourSite';
export const enabled = () => process.env.ENABLE_YOURSITE !== 'false';

export async function search(query, yearHint) { /* ... */ }
export async function getStreams(movieUrl) { /* ... */ }
export async function resolve(meta) { /* ... */ }
```

2. Add to `lib/scraper.js`:

```js
import * as yoursite from './sources/yoursite.js';
const SCRAPERS = [fzmovies, bollyflix, moviesflix, hiiduba, yoursite];
```

3. Add env var `ENABLE_YOURSITE=true` to `.env.example`

4. Restart — done.

## ⚠️ Known limitations

1. **Scrapers break often** — sites change HTML, add Cloudflare, switch domains. Expect weekly maintenance.
2. **Cloudflare blocks** — some sites use Cloudflare's "I'm not a robot" challenge. Plain fetch can't bypass it. You'd need a headless browser (Puppeteer/Playwright) for those — out of scope here.
3. **URL expiry** — many scraped URLs expire within hours. Cache TTL is intentionally short (30 min).
4. **TV shows** — most Hindi scrapers don't have organized TV episode data. TV requests fall back to Multi-Embed.
5. **Legal risk** — scraping is direct copyright infringement in many jurisdictions. Use only with content you have legal rights to.

## ⚠️ Legal & ethical use

This proxy is a **technical bridge**. It does not host, store, or upload any content. The sites it scrapes aggregate third-party streams whose copyright status varies by jurisdiction.

Before using in a public site:
- Confirm you have legal streaming rights for the content
- Respect DMCA / copyright takedown requests
- For personal/home use, consider Plex + Jellyfin with your own media

The maintainers of this proxy are not responsible for how you use it.

## License

MIT
