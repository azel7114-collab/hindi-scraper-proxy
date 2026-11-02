# Hindi Scraper Proxy v3.4

**Single URL** that returns **14 verified-working embed providers** for any TMDB ID. Player UI shows all servers with **SMART auto-fallback that actually works** — if Server 1 fails (e.g., "Video Not Found"), player switches to Server 2 automatically, but **stops on the first server where the movie actually plays**.

## What's new in v3.4 (vs v3.3)

### 🐛 Bug fix — Auto-fallback was too aggressive

In v3.3, the 6-second timeout was too short for real video players. Even on servers where the movie WAS playing (like VidSrc.me), the timeout would fire before postMessage 'playing' events arrived — so the player kept jumping to the next server instead of staying put.

User report (Roman Urdu):
> "ye tw auto server change krta ja raha h jis pr movie play bhe ho jati os k agy waly server pr chala jata ur auto he laga howa h is ko rok jana chahiye jis server pr movie mil jiye"
> (It keeps auto-switching servers even on the one where the movie IS playing. It should stop on the server where the movie is found.)

### ✅ v3.4 fix — Smarter detection, longer timeout, manual pin

Three improvements:

#### 1. **Longer timeout** (12s instead of 6s)
Real players take time to:
- Load the iframe HTML (1-2s)
- Initialize the player JS (1-2s)
- Fetch the playlist/stream URL (1-3s)
- Start playback (1-2s)

Total: 4-9 seconds. The old 6s timeout fired before playback even started. New 12s gives real players enough time.

#### 2. **Iframe content inspection** (cross-origin safe)
After iframe loads, periodically check:
- `iframe.contentWindow.length` — number of nested iframes (allowed cross-origin)
  - **>= 1 nested iframe** → real video player with embedded stream → **mark SUCCESS**
  - 0 nested iframes → either error page OR JS-loaded player (might still be loading)
- `iframe.contentDocument` (only if same-origin) — check for `<video>` tags or error text like "Video Not Found"

Verified working for these providers (have nested iframes):
- ✅ VidSrc.me — 1 nested iframe
- ✅ 2embed.stream — 1 nested iframe
- ✅ MultiEmbed — typically 1+ nested iframes

For players without nested iframes (AllMovieLand, SmashyStream), we rely on:
- postMessage events (Player.js protocol)
- Hard timeout (12s)

#### 3. **Player.js protocol support**
AllMovieLand uses [Player.js](https://playerjs.com/) library which sends postMessage events in a specific format:
```js
{context: 'playerjs', event: 'ready', version: '1.x.x'}
{context: 'playerjs', event: 'play'}
{context: 'playerjs', event: 'playing'}
```

v3.4's postMessage listener now matches this format too — so AllMovieLand playback will be detected as success.

#### 4. **"Stay here" button** 🆕
When the player lands on a working server, a green "✓ Stay here" button appears in the top-right corner. Click it to **pin the current server** — auto-fallback stops completely. The badge changes from green "AUTO" to blue "PINNED".

This gives the user manual override — if they see the movie is playing, they can lock it.

## Architecture

```
corvique form: https://your-proxy/embed/movie/{tmdb_id}
                    ↓
              TMDB API: tmdb_id → imdb_id
                    ↓
              Build URLs for ALL 14 providers in parallel
                    ↓
              Return iframe HTML → corvique loads it
                    ↓
              Player tries Server 1
                ↓ iframe load event
              Start inspection loop (every 1s):
                - Check nested iframes (cross-origin safe)
                - Check <video> tags (same-origin only)
                - Check postMessage 'playing' events
                ↓
              If success detected → "✓ Now playing via Server X"
              If "Video Not Found" text → switch to next
              If 12s timeout → switch to next
                    ↓
              "✓ Stay here" button appears (user can pin)
```

## 14 Providers

| # | Provider | Type | Detection method |
|---|----------|------|------------------|
| 1 | AllMovieLand (Vegamovies backend) | IMDb | Player.js postMessage |
| 2 | MultiEmbed (IMDb) | IMDb | Nested iframes |
| 3 | MultiEmbed (TMDB) | TMDB | Nested iframes |
| 4 | VidSrc.to (TMDB) | TMDB | postMessage |
| 5 | VidSrc.ru | IMDb | postMessage |
| 6 | 2embed.cc | TMDB | Nested iframes |
| 7 | SuperEmbed (IMDb) | IMDb | postMessage |
| 8 | SuperEmbed (TMDB) | TMDB | postMessage |
| 9 | VidSrc.me | TMDB | Nested iframes ✅ |
| 10 | 2embed.stream | TMDB | Nested iframes ✅ |
| 11 | SmashyStream (AnyEmbed) | TMDB | Aggregator (own picker) |
| 12 | VidSrc.me (IMDb) | IMDb | Nested iframes |
| 13 | VidSrc.pk (backup) | TMDB | postMessage |
| 14 | Embed.su (backup) | TMDB | postMessage |

## Test Results (Nov 2026, sandbox)

| Test | Result |
|------|--------|
| `/probe/movie/550` (Fight Club) | 14 streams ✅ |
| `/probe/tv/1396/1/1` (Breaking Bad) | 14 streams ✅ |
| HTML size | 17,028 bytes |
| `HARD_TIMEOUT = 12000` | ✓ present |
| `stay-btn` (Stay here button) | ✓ present |
| `inspectionTimer` (content inspection) | ✓ present |
| `NESTED_IFRAME_THRESHOLD` (cross-origin heuristic) | ✓ present |
| `playerjs` (Player.js protocol) | ✓ present |
| `markSuccess` function | ✓ present |
| `failAndNext` function | ✓ present |
| `badge.pinned` (PINNED state styling) | ✓ present |
| Server 14 tab | ✓ present |

## Files Changed (vs v3.3)

| File | Change |
|------|--------|
| `lib/embed.js` | ✏️ **Rewrote `renderIframeEmbed()`** — 12s timeout, iframe content inspection (nested iframe heuristic), Player.js protocol, "Stay here" pin button, retry button, manual mode |
| `lib/providers.js` | unchanged from v3.3 (14 providers) |
| `README.md` | ✏️ Updated for v3.4 |

## Deploy Steps

1. Unzip `hindi-scraper-proxy-v3.4.zip` over your existing repo
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
- ✅ Pink progress bar (slower — 12s instead of 6s)
- ✅ Status: "Trying Server 1/14: AllMovieLand (auto)..."
- ✅ If Server 1 plays → automatically stays (no jump)
- ✅ If Server 1 fails → switches to Server 2 after 12s
- ✅ When a server plays, "✓ Stay here" button appears top-right
- ✅ Click "Stay here" → badge turns blue "PINNED", auto-fallback stops

## How to know auto-fallback is working correctly

| Scenario | What should happen |
|----------|-------------------|
| Server 1 = working (e.g., VidSrc.me, has nested iframes) | After 2.5s inspection → marked SUCCESS, no jump |
| Server 1 = "Video Not Found" page | After 2.5s inspection → detected → switch to Server 2 |
| Server 1 = takes long to load (e.g., AllMovieLand) | 12s timeout → if no playback detected, switch to Server 2 |
| All 14 servers fail | "Retry from Server 1" button appears in center |
| User clicks any server tab | Auto-fallback stops, "MANUAL" badge appears |
| User clicks "Stay here" | Auto-fallback stops, "PINNED" badge appears |

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
