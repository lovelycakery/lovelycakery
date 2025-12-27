// Calendar embed controller for calendar.html
// Responsibilities:
// - Keep iframe height in sync with widget content (postMessage)
// - Keep CSS var --header-h updated so calendar page offsets correctly
//
// Why:
// - Avoid transform scale (causes "slow shrink" + mobile drifting)
// - Allow natural scrolling; keep the calendar centered and readable

(function () {
  if (window.__lovelyCalendarEmbedInit) return;
  window.__lovelyCalendarEmbedInit = true;

  // During initial load, avoid height "shrink then expand" flicker.
  // We treat the first ~1.6s after iframe load as a settle window:
  // - ignore decreases
  // - apply the latest height after a short debounce
  let settleUntil = 0;
  let lastAppliedHeight = 0;
  let pendingHeight = 0;
  let pendingTimer = 0;

  function getIframe() {
    return document.querySelector('.calendar-iframe');
  }

  function setHeaderHeightVar() {
    const header = document.querySelector('.header');
    const headerH = header ? header.offsetHeight : 100;
    document.documentElement.style.setProperty('--header-h', headerH + 'px');
  }

  function init() {
    setHeaderHeightVar();
    window.addEventListener('resize', setHeaderHeightVar);
    window.addEventListener('load', setHeaderHeightVar);

    // Handshake: after iframe loads, request a resize message.
    // This avoids a race where the iframe posts its initial height before the parent listener is ready.
    function requestResize() {
      const iframe = getIframe();
      if (!iframe || !iframe.contentWindow) return;
      try {
        iframe.contentWindow.postMessage({ type: 'calendar-request-resize' }, '*');
      } catch (e) {
        // ignore
      }
    }

    const iframe = getIframe();
    if (iframe) {
      iframe.addEventListener('load', () => {
        // Enter settle window on each iframe load (first paint can be unstable).
        settleUntil = Date.now() + 1600;
        // Capture current applied height as the baseline to prevent shrinking.
        const cur = parseInt(iframe.style.height || iframe.style.minHeight || '0', 10);
        if (Number.isFinite(cur) && cur > 0) lastAppliedHeight = cur;
        requestResize();
        // A couple of delayed pings in case fonts/layout settle after load
        setTimeout(requestResize, 120);
        setTimeout(requestResize, 600);
      });
    }

    // Also ping once shortly after init (covers fast-loading iframes in some browsers)
    setTimeout(requestResize, 80);

    window.addEventListener('message', function (event) {
      const iframe = getIframe();
      if (!iframe) return;

      // Only accept messages from the embedded calendar iframe
      if (event.source !== iframe.contentWindow) return;
      if (!event.data || event.data.type !== 'calendar-resize') return;

      const h = Number(event.data.height);
      if (!Number.isFinite(h) || h <= 0) return;

      // Guard: ignore early/incorrect tiny heights during initial paint.
      // This prevents the "squished iframe then expands" flicker.
      // Calendar widget can't realistically be smaller than ~450px even on mobile.
      const MIN_REASONABLE_HEIGHT = 450;
      if (h < MIN_REASONABLE_HEIGHT) return;

      // During settle window, ignore height decreases to avoid "half -> full" flicker.
      if (Date.now() < settleUntil && lastAppliedHeight && h < lastAppliedHeight) {
        return;
      }

      // Debounce: apply latest height after a short delay so we don't show intermediate sizes.
      pendingHeight = Math.max(pendingHeight, h);
      if (pendingTimer) clearTimeout(pendingTimer);
      pendingTimer = setTimeout(() => {
        const applyH = Math.ceil(pendingHeight);
        pendingHeight = 0;
        pendingTimer = 0;

        // Once we're past settle window, allow shrinking too.
        // While still settling, only grow.
        const targetH = (Date.now() < settleUntil && lastAppliedHeight)
          ? Math.max(lastAppliedHeight, applyH)
          : applyH;

        lastAppliedHeight = targetH;
        const px = targetH + 'px';
        iframe.style.height = px;
        iframe.style.minHeight = px;
      }, 90);
    });
  }

  init();
})();


