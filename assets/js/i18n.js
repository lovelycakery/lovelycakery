// Shared i18n helpers for Lovely Cakery (no bundler, plain script include)
// Provides:
// - window.LovelyI18n.applyLanguage(lang, root?)
// - window.LovelyI18n.initLanguageSwitcher()
//
// Maintenance notes:
// - Source of truth: localStorage.language ('zh' | 'en')
// - UI convention: any translatable element must have BOTH data-en and data-zh
// - Event-driven sync: when language changes, we postMessage to all iframes:
//   { type: 'lovely-language', lang }

(function () {
  if (window.LovelyI18n) return;

  // --- fixed header height -> CSS var --header-h (used by .main-content margin-top) ---
  function setHeaderHeightVar() {
    try {
      const header = document.querySelector('.header');
      const h = header ? header.offsetHeight : 0;
      document.documentElement.style.setProperty('--header-h', (h || 0) + 'px');
    } catch (e) {
      // ignore
    }
  }

  let __lovelyHeaderRAF = 0;
  function scheduleHeaderMeasure() {
    try {
      if (__lovelyHeaderRAF) cancelAnimationFrame(__lovelyHeaderRAF);
      __lovelyHeaderRAF = requestAnimationFrame(function () {
        __lovelyHeaderRAF = 0;
        setHeaderHeightVar();
      });
    } catch (e) {
      // Fallback: best-effort
      setHeaderHeightVar();
    }
  }

  function normalizeLang(lang) {
    return lang === 'en' ? 'en' : 'zh';
  }

  function applyLanguage(lang, root) {
    const normalized = normalizeLang(lang);
    const scope = root || document;

    const elements = scope.querySelectorAll('[data-en][data-zh]');
    elements.forEach((el) => {
      el.textContent = normalized === 'en' ? el.getAttribute('data-en') : el.getAttribute('data-zh');
    });

    // Update <html lang> only when applying to the main document.
    // (In iframes it's fine too, but this avoids surprises if root != document.)
    if (scope === document) {
      document.documentElement.lang = normalized === 'en' ? 'en' : 'zh-TW';
    }
  }

  function initLanguageSwitcher() {
    // Prevent double-binding if multiple scripts call this
    if (window.__lovelyLangInit) return;
    window.__lovelyLangInit = true;

    document.addEventListener('DOMContentLoaded', function () {
      // Measure header as early as possible (before/after fonts/lang can change layout)
      scheduleHeaderMeasure();

      const langButtons = document.querySelectorAll('.lang-btn');
      // No language switcher on this page (e.g., iframe widgets) — do nothing.
      if (!langButtons || langButtons.length === 0) {
        // Still keep header height var updated for pages that have a fixed header but no switcher.
        // (e.g., future minimal pages)
        scheduleHeaderMeasure();
        return;
      }
      const currentLang = localStorage.getItem('language') || 'zh';

      // Initialize language
      applyLanguage(currentLang, document);
      // Language swap can change header height (text length/line wrap)
      scheduleHeaderMeasure();

      // Update button active state
      langButtons.forEach((btn) => {
        btn.classList.toggle('active', btn.getAttribute('data-lang') === normalizeLang(currentLang));
      });

      langButtons.forEach((button) => {
        button.addEventListener('click', function () {
          const lang = normalizeLang(this.getAttribute('data-lang'));
          localStorage.setItem('language', lang);
          applyLanguage(lang, document);
          scheduleHeaderMeasure();

          langButtons.forEach((btn) => {
            btn.classList.toggle('active', btn.getAttribute('data-lang') === lang);
          });

          // Notify embedded iframes (event-driven, avoids polling).
          try {
            document.querySelectorAll('iframe').forEach((ifr) => {
              try {
                ifr.contentWindow && ifr.contentWindow.postMessage({ type: 'lovely-language', lang }, '*');
              } catch (e) {
                // ignore
              }
            });
          } catch (e) {
            // ignore
          }
        });
      });
    });
  }

  window.LovelyI18n = {
    applyLanguage,
    initLanguageSwitcher,
  };

  // Auto-init on pages that have language switcher buttons.
  // This lets normal pages include only i18n.js without an extra "bootstrap" script.
  // (Safe for iframe widgets because they don't include .lang-btn)
  try {
    initLanguageSwitcher();
  } catch (e) {
    // ignore
  }

  // Keep header height in sync with viewport changes and late font loads.
  try {
    window.addEventListener('load', scheduleHeaderMeasure);
    window.addEventListener('resize', scheduleHeaderMeasure);
    window.addEventListener('orientationchange', scheduleHeaderMeasure);
  } catch (e) {
    // ignore
  }

  try {
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () {
        scheduleHeaderMeasure();
        // One extra tick after fonts apply to catch reflow
        setTimeout(scheduleHeaderMeasure, 50);
      });
    }
  } catch (e) {
    // ignore
  }
})();


