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
      const langButtons = document.querySelectorAll('.lang-btn');
      const currentLang = localStorage.getItem('language') || 'zh';

      // Initialize language
      applyLanguage(currentLang, document);

      // Update button active state
      langButtons.forEach((btn) => {
        btn.classList.toggle('active', btn.getAttribute('data-lang') === normalizeLang(currentLang));
      });

      langButtons.forEach((button) => {
        button.addEventListener('click', function () {
          const lang = normalizeLang(this.getAttribute('data-lang'));
          localStorage.setItem('language', lang);
          applyLanguage(lang, document);

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
})();


