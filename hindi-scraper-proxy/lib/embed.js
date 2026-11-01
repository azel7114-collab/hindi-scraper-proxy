// lib/embed.js
// Generates an HTML5 player page.
// Two modes:
//   1. Direct MP4/HLS streams (from scrapers) → use HTML5 <video> with HLS.js
//   2. Iframe embed URLs (Multi-Embed fallback) → use <iframe>

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
  const activeStreams = useEmbeds ? embedStreams : directStreams;

  const primary = activeStreams[0];
  const isHls = primary?.url.includes('.m3u8');
  const posterAttr = streams._poster ? `poster="${escapeAttr(streams._poster)}"` : '';

  // For iframe embeds — render iframe with server switcher
  if (useEmbeds) {
    return renderIframeEmbed({ title: safeTitle, embeds: embedStreams, sourcesTried });
  }

  // For direct MP4/HLS streams — render <video> player
  return renderVideoPlayer({ title: safeTitle, streams: directStreams, isHls, sourcesTried, usedFallback });
}

function renderVideoPlayer({ title, streams, isHls, sourcesTried, usedFallback }) {
  const primary = streams[0];
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
  #tabs button.tried { opacity:0.5; }
  #tabs button.failed { background:#3a1f1f; border-color:#663333; opacity:0.6; }
  #player-wrap { flex:1; position:relative; background:#000; }
  #player { width:100%; height:100%; border:0; display:block; }
  #status {
    position:absolute; bottom:6px; right:8px;
    background:rgba(0,0,0,0.8); color:#fff;
    padding:4px 10px; border-radius:3px;
    font-size:11px; pointer-events:none;
  }
  #progress {
    position:absolute; top:0; left:0; height:2px; background:#e50d75;
    transition:width 0.2s linear; width:0%;
  }
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
            referrerpolicy="origin" allow="autoplay; fullscreen; encrypted-media"></iframe>
    <div id="status">Loading...</div>
  </div>
</div>
<script>
(function() {
  const iframe = document.getElementById('player');
  const tabsEl = document.getElementById('tabs');
  const status = document.getElementById('status');
  const progress = document.getElementById('progress');
  const urls = ${urlsJson};
  const sources = ${sourcesJson};
  const total = urls.length;

  // ---- Config ----
  const LOAD_TIMEOUT = 5000;        // Max wait per server (5s)
  const PROBE_INTERVAL = 500;       // Check iframe status every 500ms
  const MIN_PLAY_TIME = 1500;       // Need 1.5s of stable playback before considering success

  let currentIdx = 0;
  let loadTimer = null;
  let probeTimer = null;
  let playStartTime = 0;
  let successConfirmed = false;
  let triedServers = new Set();
  let failedServers = new Set();

  function setProgress(pct) {
    progress.style.width = pct + '%';
  }

  function setStatus(text) {
    status.textContent = text;
  }

  function updateTabs() {
    [...tabsEl.querySelectorAll('button')].forEach((b, i) => {
      b.classList.toggle('active', i === currentIdx);
      b.classList.toggle('tried', triedServers.has(i) && i !== currentIdx);
      b.classList.toggle('failed', failedServers.has(i));
    });
  }

  function load(idx, isManual = false) {
    if (idx < 0 || idx >= total) return;
    if (loadTimer) clearTimeout(loadTimer);
    if (probeTimer) clearInterval(probeTimer);

    currentIdx = idx;
    triedServers.add(idx);
    successConfirmed = false;
    playStartTime = 0;

    const url = urls[idx];
    iframe.src = url;
    setStatus('Trying Server ' + (idx + 1) + '/' + total + ': ' + sources[idx] + (isManual ? ' (manual)' : ' (auto)'));
    setProgress(0);
    updateTabs();

    // Start progress animation
    const startTime = Date.now();
    probeTimer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(100, (elapsed / LOAD_TIMEOUT) * 100);
      setProgress(pct);

      // Try to detect "Video Not Found" via iframe content (cross-origin restricted, but worth trying)
      try {
        const doc = iframe.contentDocument || iframe.contentWindow.document;
        if (doc) {
          const text = doc.body ? doc.body.innerText : '';
          if (text && /video not found|not found|video unavailable|error/i.test(text)) {
            console.warn('Server ' + (idx + 1) + ' shows error text, switching...');
            failAndNext(idx, 'error text detected');
            return;
          }
        }
      } catch (e) {
        // Cross-origin — can't read content. Continue with timeout.
      }

      // If we've been playing for MIN_PLAY_TIME, consider success
      if (playStartTime > 0 && Date.now() - playStartTime > MIN_PLAY_TIME && !successConfirmed) {
        successConfirmed = true;
        setStatus('✓ Now playing via Server ' + (idx + 1) + ' — ' + sources[idx]);
        setProgress(100);
        clearInterval(probeTimer);
      }
    }, PROBE_INTERVAL);

    // Hard timeout: if not confirmed in LOAD_TIMEOUT, move to next
    loadTimer = setTimeout(() => {
      if (!successConfirmed) {
        failAndNext(idx, 'timeout');
      }
    }, LOAD_TIMEOUT);
  }

  function failAndNext(idx, reason) {
    failedServers.add(idx);
    console.warn('Server ' + (idx + 1) + ' failed: ' + reason);
    if (loadTimer) clearTimeout(loadTimer);
    if (probeTimer) clearInterval(probeTimer);

    if (currentIdx < total - 1) {
      // Try next server
      load(currentIdx + 1);
    } else {
      setStatus('✗ All servers tried. Click any tab above to retry manually.');
      setProgress(0);
      updateTabs();
    }
  }

  // ---- Listen for postMessage from iframe (some players send events) ----
  window.addEventListener('message', (event) => {
    try {
      const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      // Common player events: 'play', 'playing', 'loaded', 'ready'
      if (data && (data.event === 'playing' || data.event === 'play' || data.type === 'playing' || data.type === 'play' || data.action === 'playing')) {
        if (playStartTime === 0) {
          playStartTime = Date.now();
          setStatus('Loading... playing detected, verifying...');
        }
      }
      if (data && (data.event === 'error' || data.type === 'error')) {
        failAndNext(currentIdx, 'postMessage error');
      }
    } catch (e) {}
  });

  // ---- Manual tab clicks ----
  tabsEl.querySelectorAll('button').forEach((b, i) => {
    b.addEventListener('click', () => {
      failedServers.delete(i);  // reset on manual click
      load(i, true);
    });
  });

  // ---- iframe load event (some players fire this on success) ----
  iframe.addEventListener('load', () => {
    // Don't immediately mark as success — wait for playback verification
    // But mark a soft start time for verification
    if (playStartTime === 0) {
      // Give the player a moment to actually start
      setTimeout(() => {
        if (!successConfirmed && playStartTime === 0) {
          // If no other event has fired, treat load as soft success after 1.5s
          playStartTime = Date.now();
        }
      }, 1500);
    }
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
