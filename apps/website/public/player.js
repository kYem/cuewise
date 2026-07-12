(() => {
  // Allowlisted YouTube params with per-key validation (+ optional default).
  var ALLOWED = {
    autoplay: { ok: isBool, def: '1' },
    start: { ok: isInt },
    end: { ok: isInt },
    controls: { ok: isBool },
    fs: { ok: isBool },
    rel: { ok: isBool, def: '0' },
    loop: { ok: isBool },
    cc_load_policy: { ok: isBool },
    cc_lang_pref: { ok: isLang },
    iv_load_policy: { ok: (v) => v === '1' || v === '3' },
    disablekb: { ok: isBool },
    color: { ok: (v) => v === 'red' || v === 'white' },
    hl: { ok: isLang },
  };

  function isBool(v) {
    return v === '0' || v === '1';
  }
  function isInt(v) {
    return /^\d+$/.test(v);
  }
  function isLang(v) {
    return /^[a-z]{2}(-[a-z]{2})?$/i.test(v);
  }

  // youtube-nocookie.com serves the same embed without setting third-party
  // cookies and (measured) contacts zero doubleclick/googleads ad hosts.
  var YT_ORIGIN = 'https://www.youtube-nocookie.com';

  var wrap = document.getElementById('wrap');
  var params = new URLSearchParams(window.location.search);

  function showError(message) {
    wrap.innerHTML = '';
    var el = document.createElement('div');
    el.className = 'center';
    el.textContent = message;
    wrap.appendChild(el);
  }

  var vid = params.get('v');
  if (!vid) {
    showError('No video ID provided. Use ?v=VIDEO_ID');
    return;
  }
  if (!/^[a-zA-Z0-9_-]{11}$/.test(vid)) {
    showError('Invalid video ID format');
    return;
  }

  var yt = new URLSearchParams();
  yt.set('enablejsapi', '1'); // required for postMessage control
  Object.keys(ALLOWED).forEach((key) => {
    var cfg = ALLOWED[key];
    var value = key === 'start' ? params.get('start') || params.get('t') : params.get(key);
    if (value && cfg.ok(value)) {
      yt.set(key, value);
    } else if (cfg.def) {
      yt.set(key, cfg.def);
    }
  });
  var list = params.get('list');
  if (list && /^[a-zA-Z0-9_-]+$/.test(list)) {
    yt.set('list', list);
  }

  var iframe = document.createElement('iframe');
  iframe.src = `${YT_ORIGIN}/embed/${vid}?${yt.toString()}`;
  iframe.title = 'YouTube video player';
  iframe.allow =
    'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
  iframe.setAttribute('allowfullscreen', '');
  wrap.innerHTML = '';
  wrap.appendChild(iframe);

  // Relay messages both ways: parent (extension/app) <-> YouTube iframe.
  window.addEventListener('message', (event) => {
    if (event.source === window.parent && iframe.contentWindow) {
      // Explicit target origin (never '*') — this direction carries playback commands.
      iframe.contentWindow.postMessage(event.data, YT_ORIGIN);
    } else if (
      event.source === iframe.contentWindow &&
      event.origin === YT_ORIGIN &&
      window.parent !== window
    ) {
      // '*' is fine here: we can't know the embedder's origin, and the payload is just player state.
      window.parent.postMessage(event.data, '*');
    }
  });
})();
