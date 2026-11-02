// lib/embed.js
// Generates an HTML5 player page.
// Two modes:
//   1. Direct MP4/HLS streams (from scrapers) → use HTML5 <video> with HLS.js
//   2. Iframe embed URLs (Multi-Embed fallback) → use <iframe> with SMART auto-fallback
//
// v3.4 FIX: Auto-fallback was too aggressive — even on working servers
// (where movie was actually playing), the 6s timeout would fire and jump
// to the next server, because postMessage 'playing' events don't always
// come from cross-origin players (AllMovieLand's Player.js uses a
// different protocol).
//
// v3.4 New logic:
//   - Longer hard timeout (12s instead of 6s) — gives real players time to start
//   - Iframe content inspection via `iframe.contentWindow.length` (allowed cross-origin)
//     → if iframe has nested iframes (typical for real video players), assume SUCCESS
//   - postMessage listener still active for explicit 'playing' events
//   - "Stay on this server" button — user can pin current server, stop auto-fallback
//   - Manual tab click still works

export function renderEmbedPage({ title, streams = [], sourcesTried = [], usedFallback = false, error = '' }) {
  const safeTitle = escapeHtml(title);

  if (error) {
    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Playback Error</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:#0b0b0b; color:#fff; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
    display:flex; align-items:center; justify-content:center; min-height:100vh; padding:24px; text-align:center; }
  .box { max-width:520px; }
  h1 { color:#e50d75; font-size:20px; margin-bottom:12px; }
  p { color:#aaa; font-size:14px; line-height:1.5; }
</style></head><body>
  <div class="box">
    <h1>Stream Unavailable</h1>
    <p>${escapeHtml(error)}</p>
  </div>
</body></html>`;
  }

  if (streams.length === 0) {
    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>No Streams Found</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:#0b0b0b; color:#fff; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
    display:flex; align-items:center; justify-content:center; min-height:100vh; padding:24px; text-align:center; }
  .box { max-width:520px; }
  h1 { color:#e50d75; font-size:20px; margin-bottom:12px; }
  p { color:#aaa; font-size:14px; line-height:1.5; }
  .sources { margin-top:18px; text-align:left; font-size:12px; }
  .sources div { padding:4px 0; border-bottom:1px solid #222; }
  .sources .ok { color:#4ade80; }
  .sources .fail { color:#f87171; }
</style></head><body>
  <div class="box">
    <h1>No Streams Found</h1>
    <p>Tried ${sourcesTried.length} sources — none returned any streams.</p>
    <div class="sources">
      ${sourcesTried.map(s => `<div class="${s.ok ? 'ok' : 'fail'}">${s.ok ? '✓' : '✗'} ${escapeHtml(s.source)} (${s.streamCount} streams)${s.error ? ' — ' + escapeHtml(s.error) : ''}</div>`).join('')}
    </div>
  </div>
</body></html>`;
  }

  // Separate direct streams from iframe embeds
  const directStreams = streams.filter(s => !s.isEmbed);
  const embedStreams = streams.filter(s => s.isEmbed);

  // Prefer direct streams; fall back to embeds
  const useEmbeds = directStreams.length === 0 && embedStreams.length > 0;

  // For iframe embeds — render iframe with server switcher
  if (useEmbeds) {
    return renderIframeEmbed({ title: safeTitle, embeds: embedStreams, sourcesTried });
  }

  // For direct MP4/HLS streams — render <video> player
  return renderVideoPlayer({ title: safeTitle, streams: directStreams, sourcesTried, usedFallback });
}

function renderVideoPlayer({ title, streams, sourcesTried, usedFallback }) {
  const primary = streams[0];
  const isHls = primary?.url.includes('.m3u8');
  const qualities = streams.map((s, i) => ({
    quality: s.quality || `Server ${i + 1}`,
    url: s.url,
    source: s.source,
  }));

  const qualityOptions = qualities.map((q, i) =>
    `<option value="${i}" ${i === 0 ? 'selected' : ''}>${escapeHtml(q.quality)} — ${escapeHtml(q.source)}</option>`
  ).join('\n        ');

  const hlsScript = isHls ? `<script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.13/dist/hls.min.js"></script>` : '';

  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
${hlsScript}
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html, body { width:100%; height:100%; background:#000; overflow:hidden; }
  body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; }
  #wrap { display:flex; flex-direction:column; width:100%; height:100%; }
  #topbar {
    display:flex; align-items:center; gap:10px;
    padding:6px 10px; background:#111; border-bottom:1px solid #222;
    flex-shrink:0;
  }
  #title { color:#fff; font-size:13px; font-weight:500; flex:1; }
  .badge { background:#e50d75; color:#fff; font-size:10px; padding:2px 6px; border-radius:3px; font-weight:600; }
  .badge.fallback { background:#f59e0b; }
  #quality {
    background:#1f1f1f; color:#fff; border:1px solid #333;
    border-radius:4px; padding:5px 8px; font-size:11px; cursor:pointer;
  }
  #player-wrap { flex:1; position:relative; background:#000; }
  video { width:100%; height:100%; background:#000; display:block; }
  #status {
    position:absolute; bottom:6px; right:8px;
    background:rgba(0,0,0,0.7); color:#fff;
    padding:3px 8px; border-radius:3px;
    font-size:10px; pointer-events:none;
  }
</style></head>
<body>
<div id="wrap">
  <div id="topbar">
    <span class="badge ${usedFallback ? 'fallback' : ''}">${usedFallback ? 'FALLBACK' : 'SCRAPED'}</span>
    <span id="title">${title}</span>
    ${qualities.length > 1 ? `<select id="quality" title="Quality / Source">${qualityOptions}</select>` : ''}
  </div>
  <div id="player-wrap">
    <video id="video" controls autoplay playsinline webkit-playsinline crossorigin="anonymous"></video>
    <div id="status">Loading...</div>
  </div>
</div>
<script>
(function() {
  const video = document.getElementById('video');
  const status = document.getElementById('status');
  const sel = document.getElementById('quality');
  const streams = ${JSON.stringify(qualities)};
  let hls = null;

  function load(idx) {
    const s = streams[idx];
    if (!s) return;
    if (hls) { hls.destroy(); hls = null; }

    const url = s.url;
    status.textContent = 'Loading ' + s.source + ' ...';

    if (url.includes('.m3u8')) {
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = url;
        video.play().catch(()=>{});
      } else if (window.Hls && Hls.isSupported()) {
        hls = new Hls({ enableWorker: true });
        hls.loadSource(url);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(()=>{}));
        hls.on(Hls.Events.ERROR, (e, data) => {
          if (data.fatal) status.textContent = 'HLS error: ' + data.type;
        });
      } else {
        video.src = url;
      }
    } else {
      video.src = url;
      video.play().catch(()=>{});
    }
  }

  video.addEventListener('playing', () => {
    status.textContent = 'Now playing via ' + streams[sel ? sel.value : 0].source;
  });
  video.addEventListener('error', () => {
    status.textContent = 'Error loading stream';
  });

  if (sel) sel.addEventListener('change', (e) => load(parseInt(e.target.value, 10)));

  load(0);
})();
</script>
</body></html>`;
}

function renderIframeEmbed({ title, embeds, sourcesTried }) {
  const tabsHtml = embeds.map((e, i) =>
    `<button type="button" data-idx="${i}" title="${escapeAttr(e.url)}">Server ${i + 1} (${escapeHtml(e.source.split(' / ')[1] || e.source)})</button>`
  ).join('');

  const urlsJson = JSON.stringify(embeds.map(e => e.url));
  const sourcesJson = JSON.stringify(embeds.map(e => e.source));

  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html, body { width:100%; height:100%; background:#000; overflow:hidden; }
  body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; }
  #wrap { display:flex; flex-direction:column; width:100%; height:100%; }
  #tabs { display:flex; flex-wrap:wrap; gap:4px; padding:6px 8px; background:#111; border-bottom:1px solid #222; flex-shrink:0; align-items:center; }
  #tabs button {
    background:#1f1f1f; color:#fff; border:1px solid #333; border-radius:4px;
    padding:4px 8px; font-size:10px; cursor:pointer; transition:all 0.15s;
    white-space:nowrap;
  }
  #tabs button:hover { background:#2a2a2a; }
  #tabs button.active { background:#e50d75; border-color:#e50d75; font-weight:600; }
  #tabs button.tried { opacity:0.45; }
  #tabs button.success { background:#1a3a1a; border-color:#2d5a2d; opacity:0.95; }
  #tabs button.failed { background:#3a1f1f; border-color:#663333; opacity:0.5; }
  #player-wrap { flex:1; position:relative; background:#000; }
  #player { width:100%; height:100%; border:0; display:block; }
  #status {
    position:absolute; bottom:6px; right:8px;
    background:rgba(0,0,0,0.85); color:#fff;
    padding:4px 10px; border-radius:3px;
    font-size:11px; pointer-events:none; max-width:75%; overflow:hidden; text-overflow:ellipsis;
    z-index:6;
  }
  #progress {
    position:absolute; top:0; left:0; height:2px; background:#e50d75;
    transition:width 0.2s linear; width:0%; z-index:5;
  }
  #stay-btn {
    position:absolute; top:10px; right:10px;
    background:#10b981; color:#fff; border:0; border-radius:4px;
    padding:6px 12px; font-size:11px; font-weight:600;
    cursor:pointer; display:none; z-index:7;
  }
  #stay-btn:hover { background:#0d9668; }
  #retry-btn {
    position:absolute; top:50%; left:50%; transform:translate(-50%, -50%);
    background:#e50d75; color:#fff; border:0; border-radius:6px;
    padding:10px 22px; font-size:14px; cursor:pointer; display:none;
    z-index:10;
  }
  #retry-btn:hover { background:#c10b66; }
  .badge { background:#e50d75; color:#fff; font-size:10px; padding:2px 6px; border-radius:3px; font-weight:600; margin-right:6px; }
  .badge.auto { background:#10b981; }
  .badge.pinned { background:#3b82f6; }
</style></head>
<body>
<div id="wrap">
  <div id="tabs">
    <span class="badge auto" id="mode-badge">AUTO</span>
    ${tabsHtml}
  </div>
  <div id="player-wrap">
    <div id="progress"></div>
    <iframe id="player" allowfullscreen frameborder="0" scrolling="no"
            referrerpolicy="origin" allow="autoplay; fullscreen; encrypted-media; picture-in-picture"></iframe>
    <div id="status">Loading...</div>
    <button id="stay-btn" type="button" title="Stop auto-fallback and stay on this server">✓ Stay here</button>
    <button id="retry-btn" type="button">Retry from Server 1</button>
  </div>
</div>
<script>
(function() {
  const iframe = document.getElementById('player');
  const tabsEl = document.getElementById('tabs');
  const status = document.getElementById('status');
  const progress = document.getElementById('progress');
  const retryBtn = document.getElementById('retry-btn');
  const stayBtn = document.getElementById('stay-btn');
  const modeBadge = document.getElementById('mode-badge');
  const urls = ${urlsJson};
  const sources = ${sourcesJson};
  const total = urls.length;

  // ---- Config ----
  const HARD_TIMEOUT = 12000;       // Hard timeout per server (12s) — gives real players time
  const INSPECTION_DELAY = 2500;    // After iframe load, wait this long then inspect
  const INSPECTION_INTERVAL = 1000; // Re-inspect every 1s until timeout
  const PROBE_INTERVAL = 250;       // Update progress bar every 250ms
  const SUCCESS_GRACE = 600;        // After 'playing' event, wait this long to confirm stable
  const NESTED_IFRAME_THRESHOLD = 1; // If iframe.contentWindow.length >= this, assume real player

  let currentIdx = 0;
  let loadTimer = null;
  let progressTimer = null;
  let inspectionTimer = null;
  let iframeLoadTime = 0;
  let playStartTime = 0;
  let successConfirmed = false;
  let triedServers = new Set();
  let failedServers = new Set();
  let successServers = new Set();
  let isManualMode = false;          // User clicked a tab manually — don't auto-advance
  let isPinned = false;              // User clicked "Stay here" — completely stop fallback

  function setProgress(pct) {
    progress.style.width = Math.max(0, Math.min(100, pct)) + '%';
  }

  function setStatus(text) {
    status.textContent = text;
  }

  function updateTabs() {
    [...tabsEl.querySelectorAll('button')].forEach((b, i) => {
      b.classList.toggle('active', i === currentIdx);
      b.classList.toggle('tried', triedServers.has(i) && i !== currentIdx && !successServers.has(i) && !failedServers.has(i));
      b.classList.toggle('success', successServers.has(i));
      b.classList.toggle('failed', failedServers.has(i));
    });
  }

  function clearTimers() {
    if (loadTimer) { clearTimeout(loadTimer); loadTimer = null; }
    if (progressTimer) { clearInterval(progressTimer); progressTimer = null; }
    if (inspectionTimer) { clearInterval(inspectionTimer); inspectionTimer = null; }
  }

  function load(idx, isManual = false) {
    if (idx < 0 || idx >= total) return;
    clearTimers();

    currentIdx = idx;
    if (isManual) isManualMode = true;
    triedServers.add(idx);
    successConfirmed = false;
    playStartTime = 0;
    iframeLoadTime = 0;

    const url = urls[idx];
    iframe.src = url;
    setStatus('Trying Server ' + (idx + 1) + '/' + total + ': ' + sources[idx] + (isManual ? ' (manual)' : ' (auto)'));
    setProgress(0);
    updateTabs();
    retryBtn.style.display = 'none';
    stayBtn.style.display = 'none';

    // Progress bar animation
    const startTime = Date.now();
    progressTimer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(100, (elapsed / HARD_TIMEOUT) * 100);
      setProgress(pct);
    }, PROBE_INTERVAL);

    // Periodic inspection — check iframe for signs of life
    inspectionTimer = setInterval(() => {
      // Only start inspecting after iframe has loaded
      if (iframeLoadTime === 0) return;
      const elapsedSinceLoad = Date.now() - iframeLoadTime;
      if (elapsedSinceLoad < INSPECTION_DELAY) return;

      // Already confirmed? Don't re-check
      if (successConfirmed || isPinned) return;

      // Try cross-origin-safe inspection
      try {
        // iframe.contentWindow.length is allowed cross-origin — returns number of nested iframes
        // Real video players usually embed streams in nested iframes (1+).
        // Error pages like "Video Not Found" usually have 0 nested iframes.
        const nestedCount = iframe.contentWindow ? iframe.contentWindow.length : 0;

        if (nestedCount >= NESTED_IFRAME_THRESHOLD) {
          // Looks like a real player with embedded content — assume success!
          console.log('[inspection] Server ' + (currentIdx + 1) + ' has ' + nestedCount + ' nested iframes — likely real player, marking success');
          markSuccess(currentIdx, 'nested iframes detected');
          return;
        }

        // Try same-origin content inspection (works for some providers)
        try {
          const doc = iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document);
          if (doc && doc.body) {
            const text = doc.body.innerText || '';
            const html = doc.body.innerHTML || '';
            // Detect explicit error text
            if (/video not found|video unavailable|stream unavailable|no source available|file not found/i.test(text)) {
              console.log('[inspection] Server ' + (currentIdx + 1) + ' shows error text — switching');
              failAndNext(currentIdx, 'error text: ' + text.substring(0, 50));
              return;
            }
            // Detect video element
            if (doc.querySelector('video') || /<video/i.test(html)) {
              console.log('[inspection] Server ' + (currentIdx + 1) + ' has <video> element — marking success');
              markSuccess(currentIdx, '<video> element detected');
              return;
            }
          }
        } catch (e) {
          // Cross-origin — contentDocument throws. Fall through to nested-iframe heuristic above.
        }
      } catch (e) {
        // Cross-origin iframe access — ignore, will rely on timeout
      }
    }, INSPECTION_INTERVAL);

    // HARD TIMEOUT: if no playback confirmed within HARD_TIMEOUT, move to next
    loadTimer = setTimeout(() => {
      if (!successConfirmed && !isPinned) {
        console.warn('[auto-fallback] Server ' + (idx + 1) + ' hard timeout after ' + HARD_TIMEOUT + 'ms — switching');
        failAndNext(idx, 'timeout (no playback event)');
      }
    }, HARD_TIMEOUT);
  }

  function markSuccess(idx, reason) {
    if (successConfirmed) return;
    successConfirmed = true;
    successServers.add(idx);
    failedServers.delete(idx);
    clearTimers();
    setProgress(100);
    setStatus('✓ Now playing via Server ' + (idx + 1) + ' — ' + sources[idx] + ' (' + reason + ')');
    updateTabs();
    stayBtn.style.display = 'block';
    console.log('[auto-fallback] ✓ Server ' + (idx + 1) + ' SUCCESS — ' + reason);
  }

  function failAndNext(idx, reason) {
    if (isPinned) return;  // Don't switch if user pinned
    failedServers.add(idx);
    successServers.delete(idx);
    console.warn('[auto-fallback] Server ' + (idx + 1) + ' failed: ' + reason);
    clearTimers();

    // If user has taken manual control, don't auto-advance
    if (isManualMode) {
      setStatus('✗ Server ' + (idx + 1) + ' failed (' + reason + '). Click another tab or retry.');
      setProgress(0);
      updateTabs();
      return;
    }

    // Find next untried server
    let nextIdx = -1;
    for (let i = idx + 1; i < total; i++) {
      if (!failedServers.has(i)) { nextIdx = i; break; }
    }

    if (nextIdx === -1) {
      // Wrap around to start
      for (let i = 0; i < idx; i++) {
        if (!failedServers.has(i)) { nextIdx = i; break; }
      }
    }

    if (nextIdx !== -1) {
      console.log('[auto-fallback] → switching to Server ' + (nextIdx + 1));
      load(nextIdx);
    } else {
      setStatus('✗ All ' + total + ' servers tried. Click any tab above to retry, or use the Retry button.');
      retryBtn.style.display = 'block';
      setProgress(0);
      updateTabs();
    }
  }

  // ---- postMessage listener (catches events from various player types) ----
  window.addEventListener('message', (event) => {
    let data = event.data;
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch (e) { return; }
    }
    if (!data || typeof data !== 'object') return;

    // Detect "playing" events from various player types
    const isPlaying = (
      data.event === 'playing' || data.event === 'play' || data.event === 'loaded' ||
      data.type === 'playing' || data.type === 'play' || data.type === 'loaded' ||
      data.action === 'playing' || data.action === 'play' ||
      data.event === 'playerReady' || data.event === 'fullscreen' ||
      // Player.js protocol (used by AllMovieLand/slast430did)
      (data.context === 'playerjs' && (data.event === 'ready' || data.event === 'play' || data.event === 'playing' || data.event === 'loaded')) ||
      (data.context === 'hls' && data.eventName === 'hlsPlaying') ||
      data.method === 'play' || data.value === 'playing'
    );

    const isError = (
      data.event === 'error' || data.type === 'error' ||
      data.event === 'halt' ||
      data.event === 'playbackError' || data.event === 'playerError' ||
      (data.event === 'complete' && data.reason === 'error')
    );

    const isNotFound = (
      (typeof data.message === 'string' && /not found|unavailable|no source/i.test(data.message)) ||
      (typeof data.error === 'string' && /not found|unavailable/i.test(data.error))
    );

    if (isPlaying && currentIdx >= 0) {
      console.log('[postMessage] playing event from', sources[currentIdx], data);
      if (playStartTime === 0) {
        playStartTime = Date.now();
        setTimeout(() => {
          if (playStartTime > 0 && !successConfirmed) {
            markSuccess(currentIdx, 'postMessage: ' + (data.event || data.type || 'playing'));
          }
        }, SUCCESS_GRACE);
      }
    }
    if (isError || isNotFound) {
      console.log('[postMessage] error event from', sources[currentIdx], data);
      failAndNext(currentIdx, 'postMessage: ' + (data.event || data.type || 'error'));
    }
  });

  // ---- iframe load event — used ONLY to mark "ready to inspect", NOT success ----
  // (This is the key fix vs v3.2 — we don't assume load=success, but we DO use
  // load as a signal to start inspecting the iframe content)
  iframe.addEventListener('load', () => {
    iframeLoadTime = Date.now();
    console.log('[iframe-load] Server ' + (currentIdx + 1) + ' loaded — will inspect content in ' + INSPECTION_DELAY + 'ms');
  });

  // ---- Manual tab clicks ----
  tabsEl.querySelectorAll('button').forEach((b, i) => {
    b.addEventListener('click', () => {
      isPinned = false;  // New manual selection clears pin
      isManualMode = true;
      failedServers.delete(i);
      modeBadge.textContent = 'MANUAL';
      modeBadge.className = 'badge';
      load(i, true);
    });
  });

  // ---- "Stay here" button — pin current server ----
  stayBtn.addEventListener('click', () => {
    isPinned = true;
    isManualMode = true;
    clearTimers();
    setProgress(100);
    setStatus('📌 Pinned on Server ' + (currentIdx + 1) + ' — ' + sources[currentIdx] + ' (auto-fallback stopped)');
    modeBadge.textContent = 'PINNED';
    modeBadge.className = 'badge pinned';
    stayBtn.style.display = 'none';
    console.log('[stay] Pinned on Server ' + (currentIdx + 1));
  });

  // ---- Retry button ----
  retryBtn.addEventListener('click', () => {
    failedServers.clear();
    triedServers.clear();
    successServers.clear();
    isManualMode = false;
    isPinned = false;
    modeBadge.textContent = 'AUTO';
    modeBadge.className = 'badge auto';
    load(0);
  });

  // ---- Start ----
  load(0);
})();
</script>
</body></html>`;
}

function escapeHtml(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeAttr(s = '') {
  return escapeHtml(s);
}
