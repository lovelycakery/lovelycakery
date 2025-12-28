// Shared site header/nav renderer for Lovely Cakery (no bundler, plain script include)
// Usage: include this script BEFORE assets/js/i18n.js on every page.
//
// It will:
// - Render the full <header> content (logo + nav + socials + language switcher)
// - Mark the current page link with aria-current="page" and .is-active
// - Leave data-en/data-zh on nav items so existing i18n.js can translate it
//
// Contract:
// - Page must contain: <header class="header" id="site-header"></header>
// - CSS is in assets/css/styles.css
(function () {
  if (window.LovelySiteHeader) return;

  function getCurrentPage() {
    try {
      const p = window.location.pathname || '';
      const base = p.split('/').pop() || '';
      return base || 'index.html';
    } catch (e) {
      return 'index.html';
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function renderNavItems(currentPage) {
    const items = [
      { href: 'index.html', zh: '首頁', en: 'HOME' },
      { href: 'calendar.html', zh: '日曆', en: 'CALENDAR' },
      { href: 'seasonal.html', zh: '季節限定', en: 'SEASONAL' },
      { href: 'all-items.html', zh: '全部品項', en: 'ALL ITEMS' },
      { href: 'order.html', zh: '訂購方式', en: 'ORDER' },
      { href: 'contact.html', zh: '地圖', en: 'MAP' },
    ];

    const parts = [];
    items.forEach((it, idx) => {
      const isActive = it.href === currentPage;
      parts.push(
        '<a href="' +
          escapeHtml(it.href) +
          '" class="nav-link' +
          (isActive ? ' is-active' : '') +
          '" data-en="' +
          escapeHtml(it.en) +
          '" data-zh="' +
          escapeHtml(it.zh) +
          '"' +
          (isActive ? ' aria-current="page"' : '') +
          '>' +
          escapeHtml(it.zh) +
          '</a>'
      );
      if (idx !== items.length - 1) parts.push('<span class="nav-separator">|</span>');
    });
    return parts.join('');
  }

  function buildHeaderHtml() {
    const currentPage = getCurrentPage();

    return (
      '<div class="container">' +
      '  <div class="nav-wrapper">' +
      '    <h1 class="logo">' +
      '      <a href="index.html" style="text-decoration: none; color: inherit;">' +
      '        <img src="assets/images/logo/logo.png" alt="Lovely Cakery logo" class="site-logo" width="78" height="78" decoding="async">' +
      '        <span>Lovely Cakery</span>' +
      '      </a>' +
      '    </h1>' +
      '    <div class="nav-right">' +
      '      <nav class="nav" aria-label="Primary">' +
      renderNavItems(currentPage) +
      '      </nav>' +
      '      <div class="social-links">' +
      '        <a href="https://www.facebook.com/lovelycakery2025/" target="_blank" rel="noopener noreferrer" class="social-link" aria-label="Facebook">' +
      '          <svg class="social-icon" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
      '            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>' +
      '          </svg>' +
      '        </a>' +
      '        <a href="https://www.instagram.com/lovelycakery2022/" target="_blank" rel="noopener noreferrer" class="social-link" aria-label="Instagram">' +
      '          <svg class="social-icon" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
      '            <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>' +
      '          </svg>' +
      '        </a>' +
      '      </div>' +
      '      <div class="language-switcher" aria-label="Language switcher">' +
      '        <button class="lang-btn active" data-lang="zh" type="button">中文</button>' +
      '        <span class="lang-separator">|</span>' +
      '        <button class="lang-btn" data-lang="en" type="button">EN</button>' +
      '      </div>' +
      '    </div>' +
      '  </div>' +
      '</div>'
    );
  }

  function renderIntoHeader() {
    const header = document.getElementById('site-header');
    if (!header) return;
    header.innerHTML = buildHeaderHtml();
  }

  function init() {
    // If called late, render immediately; otherwise render on DOMContentLoaded.
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', renderIntoHeader);
    } else {
      renderIntoHeader();
    }
  }

  window.LovelySiteHeader = { init: init };
  init();
})();


