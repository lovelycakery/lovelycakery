// 首頁內容載入器（index.html 專用）
// 首頁的標題、說明、按鈕文字／連結、主圖存在 assets/data/home-data.json，admin 的「首頁」分頁可編輯。
// index.html 裡寫的文字是預設值（也給搜尋引擎看）；這裡讀到資料後覆蓋上去。
// 為了不讓訪客先看到舊內容再跳成新內容，index.html 會先加上 html.home-pending 把內容藏起來，
// 這裡套用完（或載入失敗）就拿掉；index.html 另有 1.5 秒的保險，避免本檔沒載到時內容一直藏著。
(function () {
  if (window.__lovelyHomeInit) return;
  window.__lovelyHomeInit = true;

  var DEFAULT_IMAGE = 'assets/images/cakes.jpg';
  var DEFAULT_LINK = 'all-items.html';

  function nonEmpty(v) { return typeof v === 'string' && v.trim() !== ''; }

  // 只在有給中文時才覆蓋；英文沒填就沿用中文
  function setText(el, zh, en) {
    if (!el || !nonEmpty(zh)) return;
    var enText = nonEmpty(en) ? en.trim() : zh.trim();
    el.setAttribute('data-zh', zh.trim());
    el.setAttribute('data-en', enText);
    el.textContent = (localStorage.getItem('language') === 'en') ? enText : zh.trim();
  }

  // 連結只接受站內相對路徑（例如 all-items.html#strawberry），其他一律退回預設
  function safeLink(href) {
    if (!nonEmpty(href)) return DEFAULT_LINK;
    href = href.trim();
    if (/^[A-Za-z0-9_\-.\/%]+(#[A-Za-z0-9_\-.%]*)?$/.test(href) && href.indexOf('//') === -1 && href.charAt(0) !== '/') return href;
    return DEFAULT_LINK;
  }

  // 首頁按鈕用的中文襯線字（Noto Serif TC）。只有首頁需要，所以在這裡載入而不是放進全站的字型清單；
  // 用 media=print 的手法非阻塞載入，字型到之前先用系統的明體顯示。
  // Google Fonts 會依 unicode-range 切片，瀏覽器只下載按鈕實際用到的字。
  function loadButtonFont() {
    // 用 data-font 辨識自己的 link（site-header.js 另有一條只含「美好蛋糕店」五個字的 Noto Serif TC，不能拿它當已載入）
    if (document.querySelector('link[data-font="home-button"]')) return;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.setAttribute('data-font', 'home-button');
    link.href = 'https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@600&display=swap';
    link.media = 'print';
    link.onload = function () { this.media = 'all'; };
    document.head.appendChild(link);
  }
  loadButtonFont();

  function apply(data) {
    data = data || {};
    setText(document.querySelector('.main-headline'), data.headline, data.headline_en);
    // 標題下方的說明文字：資料裡明確留空就整行隱藏（admin 可以把它清掉）；沒有這個欄位時保持 index.html 的預設
    var desc = document.querySelector('.description');
    if (desc && typeof data.description === 'string') {
      if (nonEmpty(data.description)) {
        setText(desc, data.description, data.description_en);
        desc.hidden = false;
      } else {
        desc.hidden = true;
      }
    }
    var btn = document.querySelector('.cta-button');
    if (btn) {
      setText(btn, data.buttonText, data.buttonText_en);
      btn.setAttribute('href', safeLink(data.buttonLink));
    }
    // 圖片下方的說明文字：有填才顯示。只有資料裡真的有這個欄位才動它（apply({}) 時保持原狀）
    var caption = document.querySelector('.hero-caption');
    if (caption && typeof data.imageCaption === 'string') {
      if (nonEmpty(data.imageCaption)) {
        setText(caption, data.imageCaption, data.imageCaption_en);
        caption.hidden = false;
      } else {
        caption.hidden = true;
      }
    }
    var img = document.querySelector('.hero-image');
    if (img) {
      // _previewUrl：admin 預覽時尚未發布的新圖（blob）
      var src = data._previewUrl || (nonEmpty(data.image) ? data.image.trim() : (img.getAttribute('data-src') || DEFAULT_IMAGE));
      if (img.getAttribute('src') !== src) {
        // 換過的圖比例不一定是預設的 1000x370，拿掉寫死的寬高讓瀏覽器照實際比例排
        if (src !== DEFAULT_IMAGE) { img.removeAttribute('width'); img.removeAttribute('height'); }
        img.src = src;
      }
    }
    document.documentElement.classList.remove('home-pending');
  }

  var url = 'assets/data/home-data.json';
  if (new URLSearchParams(window.location.search).get('adminPreview') === '1') url += '?ts=' + Date.now();
  fetch(url)
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(apply)
    .catch(function (e) { console.warn('Failed to load home data:', e); apply({}); });

  // Admin 即時預覽
  window.addEventListener('message', function (e) {
    if (e.origin !== window.location.origin) return;
    if (e.data && e.data.type === 'admin-home-update' && e.data.data) apply(e.data.data);
  });
})();
