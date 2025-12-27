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

      const px = Math.ceil(h) + 'px';
      iframe.style.height = px;
      iframe.style.minHeight = px;
    });
  }

  init();
})();


