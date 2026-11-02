# Hindi Scraper Proxy v3.3

**Single URL** that returns **14 verified-working embed providers** for any TMDB ID. Player UI shows all servers with **smart auto-fallback** — if Server 1 fails (e.g., "Video Not Found"), player automatically switches to Server 2 within 6 seconds, then Server 3, and so on. User does nothing — playback just starts on whatever server works.

## What's new in v3.3 (vs v3.2)

### 🐛 Bug fix — Auto-fallback was broken

In v3.2, the auto-fallback logic was present but **never actually triggered**. The bug was in `lib/embed.js`:

```js
// ❌ v3.2 BUG
iframe.addEventListener('load', () => {
  if (playStartTime === 0) {
    setTimeout(() => {
      playStartTime = Date.now();  // ← assumes iframe load = success
    }, 1500);
  }
});
```

The iframe `load` event fires for **every** iframe — including error pages like "Video Not Found". The browser can't tell whether the content inside actually played. So:
1. Server 1 (AllMovieLand) loads the "Video Not Found" page → `load` event fires
2. After 1.5s, `playStartTime = Date.now()` is set
3. After another 1.5s, `successConfirmed = true` is set
4. The 5s `loadTimer` is then canceled because `successConfirmed` is true
5. **Player stays stuck on the error page forever**

### ✅ v3.3 fix — Reliability via hard timeout

The new logic:

```js
// ✅ v3.3 FIX — Do NOT listen to iframe 'load' event
//   - 6s hard timeout per server (if no playback confirmed, move on)
//   - postMessage listener for player events (Player.js, hls.js, custom)
//   - Manual click always works
//   - iframe load NEVER marks success by itself

loadTimer = setTimeout(() => {
  if (!successConfirmed) {
    failAndNext(idx, 'timeout (no playback event)');
  }
}, 6000);
```

The postMessage listener now also matches **more player event formats**:
- Player.js protocol (`event: 'playing'`, `'play'`, `'loaded'`)
- hls.js events (`context: 'hls'`, `eventName: 'hlsPlaying'`)
- Custom player events (`action: 'playing'`, `method: 'play'`)
- Error events (`event: 'error'`, `'halt'`, `'playbackError'`)
- "Video Not Found" detection via message/error text

### 🚀 Added 4 new verified-working providers

Tested with HTTP 200 + real player HTML from sandbox (Nov 2026):

| # | Provider | Type | Notes |
|---|----------|------|-------|
| 9 | **VidSrc.me** | TMDB | 58KB real player, both movies + TV |
| 10 | **2embed.stream** | TMDB | Clean HLS player |
| 11 | **SmashyStream (AnyEmbed)** | TMDB | Aggregator with own multi-server picker |
| 12 | **VidSrc.me (IMDb)** | IMDb | IMDb variant for older movies |

Now you have **14 total providers** (was 10 in v3.2).

## Architecture

```
corvique form: https://your-proxy/embed/movie/{tmdb_id}
                    ↓
              TMDB API: tmdb_id → imdb_id
                    ↓
              Build URLs for ALL 14 providers in parallel:
                1. AllMovieLand      → https://slast430did.com/play/{imdb_id}
                2. MultiEmbed IMDb   → https://multiembed.mov/?video_id={imdb_id}
                3. MultiEmbed TMDB   → https://multiembed.mov/?video_id={tmdb_id}&tmdb=1
                4. VidSrc.to         → https://vidsrc.to/embed/movie/{tmdb_id}
                5. VidSrc.ru         → https://vidsrc.ru/embed/movie/{imdb_id}
                6. 2embed.cc         → https://www.2embed.cc/embed/{tmdb_id}
                7. SuperEmbed IMDb   → https://superembed.stream/?video_id={imdb_id}
                8. SuperEmbed TMDB   → https://superembed.stream/?video_id={tmdb_id}&tmdb=1
                9. VidSrc.me (TMDB)  → https://vidsrc.me/embed/movie?tmdb={tmdb_id}    ← NEW
               10. 2embed.stream     → https://www.2embed.stream/embed/movie/{tmdb_id}   ← NEW
               11. SmashyStream      → https://embed.smashystream.com/playere.php?tmdb={tmdb_id}  ← NEW
               12. VidSrc.me (IMDb)  → https://vidsrc.me/embed/movie?imdb={imdb_id}     ← NEW
               13. VidSrc.pk (backup)
               14. Embed.su (backup)
                    ↓
              Return iframe HTML → corvique loads it
                    ↓
              Player tries Server 1
                ↓ 6 seconds, no playback event
              Player tries Server 2
                ↓ 6 seconds, no playback event
              Player tries Server 3
                ↓ postMessage 'playing' received
              ✓ "Now playing via Server 3 — MultiEmbed"
```

## Test Results (Nov 2026, sandbox)

| Test | Result |
|------|--------|
| `/probe/movie/550` (Fight Club) | 14 streams ✅ |
| `/probe/tv/1396/1/1` (Breaking Bad S1E1) | 14 streams ✅ |
| HTML render size | 12,080 bytes ✅ |
| AUTO badge | ✓ present |
| `failAndNext` function | ✓ present (4 occurrences) |
| `markSuccess` function | ✓ present |
| Retry button | ✓ present |
| postMessage listener | ✓ present |
| iframe `load` listener (the bug) | **0 occurrences** ✅ (intentionally removed) |
| Total server tabs | 14 ✅ |

## Files Changed (vs v3.2)

| File | Change |
|------|--------|
| `lib/embed.js` | ✏️ **Rewrote `renderIframeEmbed()`** — removed iframe-load=success assumption, added 6s hard timeout + postMessage listener + retry button + manual mode |
| `lib/providers.js` | ✏️ **Added 4 new providers** (vidsrc_me, 2embed_stream, smashystream, vidsrc_me_imdb) — total now 14 |
| `README.md` | ✏️ Updated for v3.3 |

All other files (`server.js`, `lib/scraper.js`, `lib/tmdb.js`, `lib/sources/*.js`, `lib/http.js`) unchanged.

## Deploy Steps

1. Unzip `hindi-scraper-proxy-v3.3.zip` over your existing repo
2. Push to GitHub
3. Render dashboard → "Manual Deploy" → "Deploy latest commit"
4. Wait 2-3 min

## Verify After Deploy

Open in browser:

```
https://hindi-scraper-proxy.onrender.com/embed/movie/550
```

You should see:
- ✅ 14 server tabs at top
- ✅ Green "AUTO" badge
- ✅ Pink progress bar
- ✅ Status: "Trying Server 1/14: AllMovieLand (auto)..."
- ✅ If Server 1 fails → automatically switches to Server 2 within 6s
- ✅ If all 14 fail → "Retry from Server 1" button appears

## corvique Admin Form (unchanged)

| Field | Value |
|-------|-------|
| Movie link | `https://hindi-scraper-proxy.onrender.com/embed/movie/{tmdb_id}` |
| Series link | `https://hindi-scraper-proxy.onrender.com/embed/tv/{tmdb_id}/{season}/{episode}` |

## Environment Variables

| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
| `TMDB_API_KEY` | ✅ Yes | — | Your TMDB v3 API key |
| `PORT` | No | `3000` | Render sets automatically |
| `CACHE_TTL` | No | `1800` | Seconds (30 min) |
| `SCRAPER_TIMEOUT` | No | `15000` | ms |
| `CORS_ORIGINS` | No | `*` | Comma-separated |

## Debug Endpoints

- `/health` — service status
- `/sources` — list of all providers + scrapers
- `/probe/movie/{tmdbId}` — JSON debug for movie
- `/probe/tv/{tmdbId}/{season}/{episode}` — JSON debug for TV
- `/cache/stats` — cache statistics
- `/cache/clear` — clear cache

## ⚠️ Legal Note

This proxy is a technical bridge. It does not host any content. Streaming sites frequently change their HTML — auto-fallback handles transient failures gracefully. Use only with content you have legal rights to stream.
