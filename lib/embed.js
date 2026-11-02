// lib/embed.js
// Generates an HTML5 player page.
// Two modes:
//   1. Direct MP4/HLS streams (from scrapers) → use HTML5 <video> with HLS.js
//   2. Iframe embed URLs (Multi-Embed fallback) → use <iframe> with SMART auto-fallback
//
// v3.3 FIX: Auto-fallback was broken because iframe `load` event was treated as
// success. "Video Not Found" pages also fire `load`, so player got stuck.
// New logic:
//   - Hard timeout per server (6s) — if no playback confirmed, move on
//   - postMessage listener for player events (Player.js, hls.js, custom)
//   - Manual click always works
//   - iframe load NEVER marks success by itself

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
  #tabs button.success { background:#1a3a1a; border-color:#2d5a2d; opacity:0.7; }
  #tabs button.failed { background:#3a1f1f; border-color:#663333; opacity:0.5; }
  #player-wrap { flex:1; position:relative; background:#000; }
  #player { width:100%; height:100%; border:0; display:block; }
  #status {
    position:absolute; bottom:6px; right:8px;
    background:rgba(0,0,0,0.85); color:#fff;
    padding:4px 10px; border-radius:3px;
    font-size:11px; pointer-events:none; max-width:80%; overflow:hidden; text-overflow:ellipsis;
  }
  #progress {
    position:absolute; top:0; left:0; height:2px; background:#e50d75;
    transition:width 0.2s linear; width:0%; z-index:5;
  }
  #retry-btn {
    position:absolute; top:50%; left:50%; transform:translate(-50%, -50%);
    background:#e50d75; color:#fff; border:0; border-radius:6px;
    padding:10px 22px; font-size:14px; cursor:pointer; display:none;
    z-index:10;
  }
  #retry-btn:hover { background:#c10b66; }
  .badge { background:#e50d75; color:#fff; font-size:10px; padding:2px 6px; border-radius:3px; font-weight:600; margin-right:6px; }
  .badge.auto { background:#10b981; }
</style></head>
<body>
<div id="wrap">
  <div id="tabs">
    <span class="badge auto">AUTO</span>
    ${tabsHtml}
  </div>
  <div id="player-wrap">
    <div id="progress"></div>
    <iframe id="player" allowfullscreen frameborder="0" scrolling="no"
            referrerpolicy="origin" allow="autoplay; fullscreen; encrypted-media; picture-in-picture"></iframe>
    <div id="status">Loading...</div>
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
  const urls = ${urlsJson};
  const sources = ${sourcesJson};
  const total = urls.length;

  // ---- Config ----
  const LOAD_TIMEOUT = 6000;        // Hard timeout per server (6s)
  const PROBE_INTERVAL = 250;       // Update progress every 250ms
  const SUCCESS_GRACE = 800;        // After 'playing' event, wait this long to confirm stable

  let currentIdx = 0;
  let loadTimer = null;
  let progressTimer = null;
  let playStartTime = 0;
  let successConfirmed = false;
  let triedServers = new Set();
  let failedServers = new Set();
  let successServers = new Set();
  let isManualMode = false;         // Once user manually clicks, stop auto-fallback

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
  }

  function load(idx, isManual = false) {
    if (idx < 0 || idx >= total) return;
    clearTimers();

    currentIdx = idx;
    if (isManual) isManualMode = true;
    triedServers.add(idx);
    successConfirmed = false;
    playStartTime = 0;

    const url = urls[idx];
    iframe.src = url;
    setStatus('Trying Server ' + (idx + 1) + '/' + total + ': ' + sources[idx] + (isManual ? ' (manual)' : ' (auto)'));
    setProgress(0);
    updateTabs();
    retryBtn.style.display = 'none';

    // Progress bar animation
    const startTime = Date.now();
    progressTimer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(100, (elapsed / LOAD_TIMEOUT) * 100);
      setProgress(pct);
    }, PROBE_INTERVAL);

    // HARD TIMEOUT: if no playback confirmed within LOAD_TIMEOUT, move to next
    loadTimer = setTimeout(() => {
      if (!successConfirmed) {
        console.warn('[auto-fallback] Server ' + (idx + 1) + ' timeout — no playback event in ' + LOAD_TIMEOUT + 'ms');
        failAndNext(idx, 'timeout (no playback event)');
      }
    }, LOAD_TIMEOUT);
  }

  function markSuccess(idx) {
    if (successConfirmed) return;
    successConfirmed = true;
    successServers.add(idx);
    failedServers.delete(idx);
    clearTimers();
    setProgress(100);
    setStatus('✓ Now playing via Server ' + (idx + 1) + ' — ' + sources[idx]);
    updateTabs();
    console.log('[auto-fallback] ✓ Server ' + (idx + 1) + ' SUCCESS');
  }

  function failAndNext(idx, reason) {
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
            markSuccess(currentIdx);
          }
        }, SUCCESS_GRACE);
      }
    }
    if (isError || isNotFound) {
      console.log('[postMessage] error event from', sources[currentIdx], data);
      failAndNext(currentIdx, 'postMessage: ' + (data.event || data.type || 'error'));
    }
  });

  // ---- Manual tab clicks ----
  tabsEl.querySelectorAll('button').forEach((b, i) => {
    b.addEventListener('click', () => {
      failedServers.delete(i);
      isManualMode = true;
      load(i, true);
    });
  });

  // ---- Retry button ----
  retryBtn.addEventListener('click', () => {
    failedServers.clear();
    triedServers.clear();
    successServers.clear();
    isManualMode = false;
    load(0);
  });

  // ---- INTENTIONAL: We do NOT listen to iframe 'load' event ----
  // Cross-origin iframes fire 'load' even for error pages ("Video Not Found").
  // Relying on it caused the v3.2 bug where player got stuck on the error page.
  // We rely on: postMessage 'playing' OR 6s hard timeout.

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
