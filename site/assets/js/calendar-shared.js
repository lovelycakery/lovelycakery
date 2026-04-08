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
      // Repo moved the deployable site into /site, so the raw path includes that prefix.
      ? 'https://raw.githubusercontent.com/lovelycakery/lovelycakery/main/site/assets/data/calendar-data.json'
      : 'assets/data/calendar-data.json';
  }

  function withCacheVersion(url, cacheVersion) {
    if (!cacheVersion) return url;
    const joiner = url.includes('?') ? '&' : '?';
    return url + joiner + 'v=' + encodeURIComponent(cacheVersion);
  }

  // 舊格式 status → 顏色對照（向下相容用）
  const LEGACY_STATUS_COLORS = {
    available: '#79b06c',
    closed: '#d66555',
    unavailable: '#d29a55',
  };
  const DEFAULT_ITEM_COLOR = '#6b5d4f';

  function legacyStatusColor(status) {
    return LEGACY_STATUS_COLORS[status] || DEFAULT_ITEM_COLOR;
  }

  function eventsArrayToMap(data) {
    const map = {};
    const events = data && Array.isArray(data.events) ? data.events : [];
    events.forEach((event) => {
      const dateKey = event && event.date;
      if (!dateKey) return;
      // 新格式：event.items[]；舊格式：event.status + event.description
      if (event.items && Array.isArray(event.items)) {
        map[dateKey] = event;
      } else {
        // 向下相容舊格式 → 轉成新格式
        const items = [];
        if (event.status || (event.description && event.description.trim())) {
          const color = legacyStatusColor(event.status);
          const text = event.description && event.description.trim()
            ? event.description.trim()
            : (event.status || '');
          items.push({ text: text, color: color });
        }
        map[dateKey] = { date: dateKey, items: items };
      }
    });
    return map;
  }

  function formatDateKey(year, month, day) {
    // Format directly as YYYY-MM-DD without timezone conversion (toISOString can shift dates).
    const m = String(month + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    return `${year}-${m}-${d}`;
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
    legacyStatusColor,
    LEGACY_STATUS_COLORS,
    DEFAULT_ITEM_COLOR,
  };
})();


