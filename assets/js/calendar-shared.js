// Shared helpers for calendar widgets (editable + readonly)
// No bundler; include via <script src="assets/js/calendar-shared.js"></script> BEFORE widget scripts.
(function () {
  if (window.LovelyCalendarShared) return;

  function getCacheVersion() {
    try {
      return new URLSearchParams(window.location.search).get('v') || '';
    } catch (e) {
      return '';
    }
  }

  function getDefaultDataFile() {
    // If opened as file://, load from GitHub raw to bypass local fetch restrictions / stale local copies.
    const isLocalFile = window.location.protocol === 'file:';
    return isLocalFile
      ? 'https://raw.githubusercontent.com/lovelycakery/lovelycakery/main/assets/data/calendar-data.json'
      : 'assets/data/calendar-data.json';
  }

  function withCacheVersion(url, cacheVersion) {
    if (!cacheVersion) return url;
    const joiner = url.includes('?') ? '&' : '?';
    return url + joiner + 'v=' + encodeURIComponent(cacheVersion);
  }

  function eventsArrayToMap(data) {
    const map = {};
    const events = data && Array.isArray(data.events) ? data.events : [];
    events.forEach((event) => {
      const dateKey = event && event.date;
      if (!dateKey) return;
      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push(event);
    });
    return map;
  }

  function formatDateKey(year, month, day) {
    const date = new Date(year, month, day);
    return date.toISOString().split('T')[0];
  }

  const MONTHS_ZH = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];
  const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function getMonthYearLabel(date, lang) {
    const y = date.getFullYear();
    const m = date.getMonth();
    const normalized = lang === 'en' ? 'en' : 'zh';
    return normalized === 'en' ? `${MONTHS_EN[m]} ${y}` : `${y}年 ${MONTHS_ZH[m]}`;
  }

  function applyLanguageToDocument(lang) {
    const currentLang = lang || localStorage.getItem('language') || 'zh';
    if (window.LovelyI18n && typeof window.LovelyI18n.applyLanguage === 'function') {
      window.LovelyI18n.applyLanguage(currentLang, document);
      return;
    }
    // Fallback: minimal implementation (should be rare)
    const normalized = currentLang === 'en' ? 'en' : 'zh';
    document.querySelectorAll('[data-en][data-zh]').forEach((el) => {
      el.textContent = normalized === 'en' ? el.getAttribute('data-en') : el.getAttribute('data-zh');
    });
  }

  window.LovelyCalendarShared = {
    getCacheVersion,
    getDefaultDataFile,
    withCacheVersion,
    eventsArrayToMap,
    formatDateKey,
    getMonthYearLabel,
    applyLanguageToDocument,
  };
})();


