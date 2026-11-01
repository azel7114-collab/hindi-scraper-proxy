# Hindi Scraper Proxy v3.0

Single URL that returns **10+ working embed providers in parallel** for any TMDB ID. User sees all servers in player UI — first one that loads wins. Falls back to 4 Hindi site scrapers if all embeds fail.

## Why v3 is the best

| Aspect | v1 | v2 | v3 |
|--------|----|----|----|
| Primary source | 4 Hindi scrapers (often fail) | AllMovieLand only | **10 embed providers in parallel** |
| Method | Site scraping | TMDB → IMDb → AllMovieLand | **All providers get URL, player shows all 10 servers** |
| User choice | None | None | **Yes — user can switch server in player** |
| Reliability | Low (Cloudflare blocks) | High (1 source) | **Very high (10 sources)** |

## Architecture

```
corvique form: https://your-proxy/embed/movie/{tmdb_id}
                    ↓
              TMDB API: tmdb_id → imdb_id
                    ↓
              Build URLs for ALL 10 providers in parallel:
                1. AllMovieLand   → https://slast430did.com/play/{imdb_id}
                2. MultiEmbed IMDb → https://multiembed.mov/?video_id={imdb_id}
                3. MultiEmbed TMDB → https://multiembed.mov/?video_id={tmdb_id}&tmdb=1
                4. VidSrc.to      → https://vidsrc.to/embed/movie/{tmdb_id}
                5. VidSrc.ru      → https://vidsrc.ru/embed/movie/{imdb_id}
                6. 2embed.cc      → https://www.2embed.cc/embed/{tmdb_id}
                7. SuperEmbed IMDb → https://superembed.stream/?video_id={imdb_id}
                8. SuperEmbed TMDB → https://superembed.stream/?video_id={tmdb_id}&tmdb=1
                9. VidSrc.pk      → https://embed.vidsrc.pk/movie/{tmdb_id}
               10. Embed.su       → https://embed.su/embed/movie/{tmdb_id}
                    ↓
              Player UI shows "Server 1, 2, 3, ... 10" tabs
                    ↓
              User can click any server, or auto-fallback after 8s
                    ↓
              If ALL embeds fail → try Hindi site scrapers
```

## Files

```
hindi-scraper-proxy/
├── server.js
├── lib/
│   ├── http.js
│   ├── tmdb.js
│   ├── scraper.js                # Orchestrator (all providers in parallel)
│   ├── providers.js              # ⭐ NEW — 10 embed providers config
│   ├── embed.js                  # Player UI with server switcher
│   └── sources/
│       ├── allmovieland.js       # Direct IMDb embed
│       ├── multiembed.js         # Fallback (legacy)
│       ├── fzmovies.js           # Hindi scraper (last resort)
│       ├── bollyflix.js          # Hindi scraper (last resort)
│       ├── moviesflix.js         # Hindi scraper (last resort)
│       └── hiiduba.js            # Hindi scraper (last resort)
├── package.json
├── .env.example
└── README.md
```

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
- http://localhost:3000/ → landing page (lists all 10 providers)
- http://localhost:3000/embed/movie/550 → Fight Club (10 servers in player)
- http://localhost:3000/embed/tv/1396/1/1 → Breaking Bad S1E1 (10 servers)
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
| `/` | GET | Landing page |
| `/health` | GET | Health check |
| `/sources` | GET | List of all providers + scrapers |
| `/probe/movie/:tmdbId` | GET | JSON debug |
| `/probe/tv/:tmdbId/:season/:episode` | GET | JSON debug for TV |
| `/embed/movie/:tmdbId` | GET | HTML player (10 servers) |
| `/embed/tv/:tmdbId/:season/:episode` | GET | HTML player for TV |
| `/cache/stats` | GET | Cache stats |
| `/cache/clear` | GET | Clear cache |

## How player auto-fallback works

1. Player loads Server 1 (AllMovieLand) in iframe
2. If load doesn't fire within 8 seconds → switch to Server 2
3. Repeat for Server 3, 4, 5, ... 10
4. User can also manually click any "Server N" tab

## Adding more providers

Edit `lib/providers.js`:

```js
{
  id: 'newprovider',
  name: 'NewProvider',
  priority: 11,
  movieTemplate: 'https://newprovider.com/movie/{tmdb_id}',
  seriesTemplate: 'https://newprovider.com/tv/{tmdb_id}/{season}/{episode}',
  supports: ['tmdb'],
  note: 'New provider',
},
```

Restart server — done.

## ⚠️ Legal & ethical use

This proxy is a technical bridge. It does not host any content. Use only with content you have legal rights to stream.

## License

MIT
