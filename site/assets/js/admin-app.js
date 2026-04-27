/* global GitHubAPI, ImageCompress, AdminTranslate */

// Lovely Admin — Web-based admin application logic
// Local-edit mode: changes are kept in memory with instant preview.
// "一鍵發布" commits all accumulated changes to GitHub in one atomic commit.
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const SITE = 'site';
  const DEFAULT_TAGS = ['奶蛋素', '無咖啡因', '無酒精'];

  // 圖片型 tab：seasonal / products / sets。價格／標籤欄位僅 seasonal/products 使用
  const IMAGE_TYPES = ['seasonal', 'products', 'sets'];
  const TYPE_LABEL = { seasonal: '新品上市', products: '全部品項', sets: '優惠組合' };
  const TYPE_DATAFILE = { seasonal: 'seasonal-data.json', products: 'products-data.json', sets: 'sets-data.json' };
  const TYPE_IMAGEDIR = { seasonal: 'assets/images/seasonal', products: 'assets/images/products', sets: 'assets/images/sets' };
  const TYPES_WITH_PRICE = ['seasonal', 'products'];
  const TYPES_WITH_TAGS = ['seasonal', 'products'];

  function isImageTab(tab) { return IMAGE_TYPES.indexOf(tab) !== -1; }
  function tabTypeHasPrice(tab) { return TYPES_WITH_PRICE.indexOf(tab) !== -1; }
  function tabTypeHasTags(tab) { return TYPES_WITH_TAGS.indexOf(tab) !== -1; }

  // ── State ─────────────────────────────────────────────────────────

  const state = {
    calendarData: null,
    eventsByDate: new Map(),
    selectedDate: '',
    clickHookInstalled: false,
    hookTimer: 0,
    lastSelectedDayEl: null,
    currentTab: 'calendar',
    currentMode: 'edit',
    imageData: {
      seasonal: { items: [] },
      products: { items: [] },
      sets: { items: [] },
    },
    editingImageIndex: -1,
    scrollToImageIndex: -1,
    editingTags: [],
    globalTags: DEFAULT_TAGS.slice(),
  };

  // Tracks what has been modified locally (not yet published)
  const dirty = {
    calendar: false,
    seasonal: false,
    products: false,
    sets: false,
    // Pending image uploads: [{path, base64, repoPath}]
    pendingImages: [],
    // Pending image deletions: [repoPath]
    pendingDeletes: [],
  };

  function hasPendingChanges() {
    return dirty.calendar || dirty.seasonal || dirty.products || dirty.sets ||
      dirty.pendingImages.length > 0 || dirty.pendingDeletes.length > 0;
  }

  function updatePublishButton() {
    var btn = $('publishBtn');
    if (!btn) return;
    btn.disabled = !hasPendingChanges();
    var count = 0;
    if (dirty.calendar) count++;
    if (dirty.seasonal) count++;
    if (dirty.products) count++;
    if (dirty.sets) count++;
    count += dirty.pendingImages.length;
    count += dirty.pendingDeletes.length;
    btn.textContent = count > 0 ? '一鍵發布 (' + count + ')' : '一鍵發布';
  }

  // ── Helpers: sanitize (ported from main.js) ───────────────────────

  function sanitizeFilename(name) {
    return String(name || '').replace(/[/\\:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
  }

  function getImageFilename(name) {
    var s = sanitizeFilename(name);
    return s ? s + '.jpg' : 'untitled.jpg';
  }

  // ── Helpers: calendar validation ──────────────────────────────────

  function validateCalendarData(data) {
    if (!data || typeof data !== 'object') throw new Error('calendar-data.json must be an object.');
    if (!Array.isArray(data.events)) throw new Error('calendar-data.json must contain an "events" array.');
    var maxItems = (typeof data.maxItems === 'number' && data.maxItems > 0) ? data.maxItems : 3;
    for (var i = 0; i < data.events.length; i++) {
      var ev = data.events[i];
      if (!ev || typeof ev !== 'object') throw new Error('Each event must be an object.');
      if (typeof ev.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(ev.date)) throw new Error('Invalid date: ' + ev.date);
      if (!Array.isArray(ev.items)) throw new Error('Event ' + ev.date + ' must have an items array.');
      if (ev.items.length > maxItems) throw new Error('Event ' + ev.date + ' has too many items (max ' + maxItems + ').');
      for (var j = 0; j < ev.items.length; j++) {
        var item = ev.items[j];
        if (!item || typeof item !== 'object') throw new Error('Each item must be an object.');
        if (typeof item.text !== 'string') throw new Error('Item text must be a string.');
      }
    }
  }

  // ── Helpers: image data validation ────────────────────────────────

  function validateImageData(data) {
    if (!data || typeof data !== 'object') throw new Error('Data must be an object');
    if (!Array.isArray(data.items)) throw new Error('Data must contain items array');
    for (var i = 0; i < data.items.length; i++) {
      var item = data.items[i];
      if (!item || typeof item !== 'object') throw new Error('Each item must be an object');
      if (typeof item.name !== 'string') throw new Error('Item name must be a string');
      if (typeof item.image !== 'string') throw new Error('Item image must be a string');
      if (!Array.isArray(item.tags)) throw new Error('Item tags must be an array');
      for (var j = 0; j < item.tags.length; j++) {
        if (typeof item.tags[j] !== 'string' || !item.tags[j].trim()) throw new Error('Tag must be a non-empty string');
      }
    }
  }

  // ── Helpers: cache version ────────────────────────────────────────

  function computeNextCacheVersion(currentV) {
    var d = new Date();
    var today = '' + d.getUTCFullYear() + String(d.getUTCMonth() + 1).padStart(2, '0') + String(d.getUTCDate()).padStart(2, '0');
    var nextSuffix = 1;
    var m = typeof currentV === 'string' ? currentV.match(/^(\d{8})-(\d+)$/) : null;
    if (m && m[1] === today && Number.isFinite(Number(m[2]))) nextSuffix = Number(m[2]) + 1;
    return today + '-' + nextSuffix;
  }

  // ── UI helpers ────────────────────────────────────────────────────

  function logStatus(msg) {
    var box = $('statusBox');
    if (!box) return;
    box.textContent = '[' + new Date().toLocaleString() + '] ' + msg + '\n' + (box.textContent || '');
  }

  function showError(msg) {
    var el = $('errorMessage');
    if (el) { el.textContent = msg; el.style.display = 'flex'; }
    logStatus('⚠️ ' + msg);
  }

  function clearError() {
    var el = $('errorMessage');
    if (el) { el.style.display = 'none'; el.textContent = ''; }
  }

  function showSuccess(msg) {
    clearError();
    var el = $('successMessage');
    if (el) { el.textContent = msg; el.style.display = 'flex'; }
    logStatus('✅ ' + msg);
  }

  function clearSuccess() {
    var el = $('successMessage');
    if (el) { el.style.display = 'none'; el.textContent = ''; }
  }

  function setButtonLoading(btn, loading) {
    if (!btn) return;
    btn.disabled = loading;
    if (loading) { btn.dataset.origText = btn.textContent; btn.textContent = '處理中…'; }
    else if (btn.dataset.origText) { btn.textContent = btn.dataset.origText; delete btn.dataset.origText; }
  }

  function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  // ── Login / Logout ────────────────────────────────────────────────

  async function handleLogin() {
    var token = $('tokenInput').value.trim();
    if (!token) { $('loginError').textContent = '請輸入 Token'; return; }
    $('loginBtn').disabled = true;
    $('loginError').textContent = '驗證中…';
    GitHubAPI.setToken(token);
    var res = await GitHubAPI.validateToken();
    if (!res.ok) { $('loginError').textContent = res.error || 'Token 無效'; GitHubAPI.clearToken(); $('loginBtn').disabled = false; return; }
    var repoRes = await GitHubAPI.checkRepoAccess();
    if (!repoRes.ok) { $('loginError').textContent = '無法存取 repo：' + (repoRes.error || ''); GitHubAPI.clearToken(); $('loginBtn').disabled = false; return; }
    $('loginBtn').disabled = false;
    showApp(res.login);
  }

  function handleLogout() {
    GitHubAPI.clearToken();
    $('appContainer').style.display = 'none';
    $('loginScreen').style.display = '';
    $('tokenInput').value = '';
    $('loginError').textContent = '';
  }

  function showApp(login) {
    $('loginScreen').style.display = 'none';
    $('appContainer').style.display = '';
    $('userInfo').textContent = login;
    initApp();
  }

  // ── Preview ───────────────────────────────────────────────────────

  function getPreviewBaseUrl() {
    return window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '');
  }

  function reloadPreview() {
    var pageMap = { calendar: 'calendar.html', seasonal: 'seasonal.html', sets: 'sets.html', products: 'all-items.html' };
    var page = pageMap[state.currentTab] || 'calendar.html';
    var mode = state.currentMode === 'edit' ? 'edit' : 'preview';
    var iframe = $('previewFrame');
    iframe.src = getPreviewBaseUrl() + '/' + page + '?adminPreview=1&mode=' + mode + '&ts=' + Date.now();
    state.clickHookInstalled = false;
    if (state.hookTimer) { clearInterval(state.hookTimer); state.hookTimer = 0; }
  }

  // ── Send data to iframe for instant preview ───────────────────────

  function sendCalendarDataToPreview() {
    var iframe = $('previewFrame');
    if (!iframe || !iframe.contentWindow) return;
    var msg = { type: 'admin-calendar-update', data: state.calendarData };
    // Send to outer iframe (calendar.html) — calendar-embed.js forwards to inner widget
    try { iframe.contentWindow.postMessage(msg, '*'); } catch (e) { /* ignore */ }
    // Also try direct inner iframe access (same-origin only)
    try {
      var innerIframe = iframe.contentDocument && iframe.contentDocument.querySelector('iframe.calendar-iframe');
      if (innerIframe && innerIframe.contentWindow) {
        innerIframe.contentWindow.postMessage(msg, '*');
      }
    } catch (e) { /* cross-origin or not ready */ }
  }

  function sendImageDataToPreview(type) {
    var iframe = $('previewFrame');
    if (!iframe || !iframe.contentWindow) return;
    iframe.contentWindow.postMessage({
      type: 'admin-gallery-update',
      items: state.imageData[type].items,
    }, '*');
  }

  // ── Calendar click hook ───────────────────────────────────────────

  function tryInstallCalendarClickHook() {
    if (state.clickHookInstalled) return true;
    try {
    var outer = $('previewFrame');
    if (!outer || !outer.contentWindow || !outer.contentDocument) return false;
    var inner = outer.contentDocument.querySelector('iframe.calendar-iframe');
    if (!inner || !inner.contentWindow || !inner.contentDocument) return false;
    var doc = inner.contentDocument;

    if (!doc.getElementById('lovely-admin-style')) {
      var style = doc.createElement('style');
      style.id = 'lovely-admin-style';
      // Inject minimal selection style. Outline color matches admin --accent (#d4a574 → rgba(212,165,116,...)).
      // Can't reference parent CSS variables here because this style lives inside an iframe doc.
      style.textContent = '.calendar-day.lovely-admin-selected{outline:3px solid rgba(212,165,116,0.95);outline-offset:2px;box-shadow:0 0 0 6px rgba(212,165,116,0.22);}';
      if (doc.head) doc.head.appendChild(style);
    }

    doc.addEventListener('click', function (e) {
      try {
        var dayEl = e.target.closest ? e.target.closest('.calendar-day') : null;
        if (!dayEl) return;
        var date = dayEl.getAttribute('data-date') || '';
        if (!date) return;
        if (state.lastSelectedDayEl && state.lastSelectedDayEl !== dayEl) state.lastSelectedDayEl.classList.remove('lovely-admin-selected');
        dayEl.classList.add('lovely-admin-selected');
        state.lastSelectedDayEl = dayEl;
        e.preventDefault();
        e.stopPropagation();
        setSelectedDate(date);
      } catch (err) { /* ignore */ }
    }, true);

    state.clickHookInstalled = true;
    logStatus('✅ 日曆點擊已連結');
    return true;
    } catch (e) { return false; }
  }

  function startHookWatcher() {
    if (state.hookTimer) { clearInterval(state.hookTimer); state.hookTimer = 0; }
    var start = Date.now();
    state.hookTimer = setInterval(function () {
      if (tryInstallCalendarClickHook()) { clearInterval(state.hookTimer); state.hookTimer = 0; return; }
      if (Date.now() - start > 12000) { clearInterval(state.hookTimer); state.hookTimer = 0; }
    }, 250);
  }

  // ── Calendar data ─────────────────────────────────────────────────

  async function refreshCalendarData() {
    var res = await GitHubAPI.getJSON(SITE + '/assets/data/calendar-data.json');
    state.calendarData = migrateCalendarData(res.data);
    state.eventsByDate = buildEventsMap(state.calendarData);
  }

  // 將舊格式（status + description）轉成新格式（items[]）
  function migrateCalendarData(data) {
    if (!data || !Array.isArray(data.events)) return data;
    var needsMigration = false;
    for (var i = 0; i < data.events.length; i++) {
      var ev = data.events[i];
      if (ev && !Array.isArray(ev.items)) { needsMigration = true; break; }
    }
    if (!needsMigration) return data;
    var migrated = JSON.parse(JSON.stringify(data));
    if (typeof migrated.maxItems !== 'number') migrated.maxItems = 3;
    for (var i = 0; i < migrated.events.length; i++) {
      var ev = migrated.events[i];
      if (ev && !Array.isArray(ev.items)) {
        var items = [];
        var color = (window.LovelyCalendarShared && window.LovelyCalendarShared.legacyStatusColor)
          ? window.LovelyCalendarShared.legacyStatusColor(ev.status)
          : '#6b5d4f';
        var text = (ev.description && ev.description.trim()) ? ev.description.trim() : (ev.status || '');
        if (text) items.push({ text: text, color: color });
        ev.items = items;
        delete ev.status;
        delete ev.description;
      }
    }
    return migrated;
  }

  function buildEventsMap(data) {
    var map = new Map();
    var events = data && Array.isArray(data.events) ? data.events : [];
    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      if (ev && ev.date) map.set(ev.date, ev);
    }
    return map;
  }

  function getMaxItems() {
    return (state.calendarData && typeof state.calendarData.maxItems === 'number' && state.calendarData.maxItems > 0)
      ? state.calendarData.maxItems : 3;
  }

  function setSelectedDate(dateStr) {
    state.selectedDate = dateStr || '';
    clearSuccess();
    $('selectedDate').textContent = state.selectedDate ? '選取日期：' + state.selectedDate : '選取日期：尚未選取';
    if (state.currentTab !== 'calendar') return;
    var form = $('calendarEditForm');
    if (state.selectedDate) {
      form.style.display = 'block';
      var has = state.eventsByDate.has(state.selectedDate);
      var ev = has ? state.eventsByDate.get(state.selectedDate) : null;
      var items = (ev && Array.isArray(ev.items)) ? ev.items : [];
      renderCalendarItemsEditor(items);
      $('maxItemsLabel').textContent = String(getMaxItems());
      $('saveBtn').disabled = false;
      $('clearBtn').disabled = !has;
    } else {
      form.style.display = 'none';
      $('saveBtn').disabled = true;
      $('clearBtn').disabled = true;
    }
  }

  // ── Calendar items editor UI ──────────────────────────────────────

  function renderCalendarItemsEditor(items) {
    var container = $('calendarItemsContainer');
    if (!container) return;
    container.innerHTML = '';
    var max = getMaxItems();
    for (var i = 0; i < items.length && i < max; i++) {
      container.appendChild(createItemRow(items[i], i));
    }
    updateAddItemBtn();
  }

  // 常用顏色預設
  var COLOR_PRESETS = [
    { color: '#2f1f14', name: '深棕' },
    { color: '#333333', name: '黑' },
    { color: '#cc0000', name: '紅' },
    { color: '#e67700', name: '橘' },
    { color: '#1a8a1a', name: '綠' },
    { color: '#0066cc', name: '藍' },
    { color: '#7b2d8e', name: '紫' },
    { color: '#888888', name: '灰' },
  ];

  function createItemRow(item, index) {
    var DEFAULT_COLOR = (window.LovelyCalendarShared && window.LovelyCalendarShared.DEFAULT_ITEM_COLOR) || '#6b5d4f';
    var row = document.createElement('div');
    row.className = 'cal-item-row';

    // 第一行：顏色選擇器 + 顯示文字
    var topRow = document.createElement('div');
    topRow.className = 'cal-item-row__top';

    var colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.className = 'cal-item-color';
    colorInput.value = item.color || DEFAULT_COLOR;
    colorInput.title = '自訂顏色';

    var textInput = document.createElement('input');
    textInput.type = 'text';
    textInput.className = 'cal-item-text input';
    textInput.value = item.text || '';
    textInput.placeholder = '顯示文字（短）';

    var removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn btn-sm cal-item-remove';
    removeBtn.textContent = '✕';
    removeBtn.title = '移除此項目';
    removeBtn.addEventListener('click', function () {
      row.remove();
      updateAddItemBtn();
    });

    topRow.appendChild(colorInput);
    topRow.appendChild(textInput);
    topRow.appendChild(removeBtn);
    row.appendChild(topRow);

    // 第二行：快速顏色選擇
    var swatchRow = document.createElement('div');
    swatchRow.className = 'cal-item-row__swatches';
    COLOR_PRESETS.forEach(function (preset) {
      var swatch = document.createElement('span');
      swatch.className = 'cal-item-swatch';
      swatch.title = preset.name;
      swatch.style.background = preset.color;
      if (colorInput.value.toLowerCase() === preset.color.toLowerCase()) {
        swatch.classList.add('is-selected');
      }
      swatch.addEventListener('click', function () {
        colorInput.value = preset.color;
        swatchRow.querySelectorAll('.cal-item-swatch').forEach(function (s) { s.classList.remove('is-selected'); });
        swatch.classList.add('is-selected');
      });
      swatchRow.appendChild(swatch);
    });
    row.appendChild(swatchRow);

    // 第三行：hover 詳細說明
    var detailInput = document.createElement('input');
    detailInput.type = 'text';
    detailInput.className = 'cal-item-detail input';
    detailInput.value = item.detail || '';
    detailInput.placeholder = '滑鼠移入時顯示的詳細說明（可留空）';
    row.appendChild(detailInput);

    // 第四行：英文標籤 + AI 翻譯按鈕
    var enRow = document.createElement('div');
    enRow.className = 'cal-item-row__en';

    var textEnInput = document.createElement('input');
    textEnInput.type = 'text';
    textEnInput.className = 'cal-item-text-en input';
    textEnInput.value = item.text_en || '';
    textEnInput.placeholder = 'Display text (EN)';

    var translateBtn = document.createElement('button');
    translateBtn.type = 'button';
    translateBtn.className = 'btn btn-sm btn-translate cal-item-translate';
    translateBtn.textContent = 'AI 翻譯';
    translateBtn.title = '用 Claude AI 自動翻譯';
    translateBtn.addEventListener('click', async function () {
      if (!window.AdminTranslate || !AdminTranslate.hasApiKey()) {
        alert('請先點右上角「AI」按鈕設定 Claude API Key');
        return;
      }
      var zhText = textInput.value.trim();
      var zhDetail = detailInput.value.trim();
      if (!zhText && !zhDetail) { alert('請先填寫中文標籤或詳細說明'); return; }
      var orig = translateBtn.textContent;
      translateBtn.disabled = true;
      translateBtn.textContent = '翻譯中…';
      try {
        var result = await AdminTranslate.translateCalendar(zhText, zhDetail);
        if (result.text_en) textEnInput.value = result.text_en;
        if (result.detail_en) detailEnInput.value = result.detail_en;
      } catch (e) {
        alert('翻譯失敗：' + (e.message || String(e)));
      } finally {
        translateBtn.disabled = false;
        translateBtn.textContent = orig;
      }
    });

    enRow.appendChild(textEnInput);
    enRow.appendChild(translateBtn);
    row.appendChild(enRow);

    // 第五行：英文詳細說明
    var detailEnInput = document.createElement('input');
    detailEnInput.type = 'text';
    detailEnInput.className = 'cal-item-detail-en input';
    detailEnInput.value = item.detail_en || '';
    detailEnInput.placeholder = 'Hover detail (EN, optional)';
    row.appendChild(detailEnInput);

    // color picker 變更時同步 swatch 選取狀態
    colorInput.addEventListener('input', function () {
      var val = colorInput.value.toLowerCase();
      swatchRow.querySelectorAll('.cal-item-swatch').forEach(function (s, i) {
        s.classList.toggle('is-selected', COLOR_PRESETS[i] && COLOR_PRESETS[i].color.toLowerCase() === val);
      });
    });

    return row;
  }

  function addCalendarItem() {
    var container = $('calendarItemsContainer');
    if (!container) return;
    var max = getMaxItems();
    if (container.children.length >= max) return;
    var defColor = (window.LovelyCalendarShared && window.LovelyCalendarShared.DEFAULT_ITEM_COLOR) || '#6b5d4f';
    container.appendChild(createItemRow({ text: '', color: defColor, detail: '' }, container.children.length));
    updateAddItemBtn();
  }

  function updateAddItemBtn() {
    var btn = $('addItemBtn');
    if (!btn) return;
    var container = $('calendarItemsContainer');
    var max = getMaxItems();
    btn.disabled = container && container.children.length >= max;
  }

  function readCalendarItemsFromUI() {
    var container = $('calendarItemsContainer');
    if (!container) return [];
    var items = [];
    var rows = container.querySelectorAll('.cal-item-row');
    for (var i = 0; i < rows.length; i++) {
      var textEl = rows[i].querySelector('.cal-item-text');
      var colorEl = rows[i].querySelector('.cal-item-color');
      var detailEl = rows[i].querySelector('.cal-item-detail');
      var text = textEl ? textEl.value.trim() : '';
      if (!text) continue; // 跳過空文字
      var obj = { text: text, color: colorEl ? colorEl.value : '#6b5d4f' };
      var detail = detailEl ? detailEl.value.trim() : '';
      if (detail) obj.detail = detail;
      var textEnEl = rows[i].querySelector('.cal-item-text-en');
      var detailEnEl = rows[i].querySelector('.cal-item-detail-en');
      var textEn = textEnEl ? textEnEl.value.trim() : '';
      var detailEn = detailEnEl ? detailEnEl.value.trim() : '';
      if (textEn) obj.text_en = textEn;
      if (detailEn) obj.detail_en = detailEn;
      items.push(obj);
    }
    return items;
  }

  // ── Calendar save (LOCAL — instant preview) ───────────────────────

  function saveCalendarEvent() {
    if (!state.selectedDate) return;
    var items = readCalendarItemsFromUI();
    var data = JSON.parse(JSON.stringify(state.calendarData));
    var events = Array.isArray(data.events) ? data.events : [];
    var idx = events.findIndex(function (e) { return e && e.date === state.selectedDate; });

    if (items.length === 0) {
      // 沒有項目 → 移除該日期
      if (idx >= 0) events.splice(idx, 1);
    } else {
      var next = { date: state.selectedDate, items: items };
      if (idx >= 0) events[idx] = next; else events.push(next);
    }
    events.sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
    data.events = events;
    try { validateCalendarData(data); } catch (e) { showError('驗證失敗：' + e.message); return; }

    state.calendarData = data;
    state.eventsByDate = buildEventsMap(data);
    dirty.calendar = true;
    updatePublishButton();

    showSuccess('已儲存（本地）：' + state.selectedDate + ' (' + items.length + ' 項)');
    setSelectedDate(state.selectedDate);
    sendCalendarDataToPreview();
  }

  function clearCalendarEvent() {
    if (!state.selectedDate || !state.eventsByDate.has(state.selectedDate)) return;
    if (!confirm('確定要清除 ' + state.selectedDate + ' 的日曆事件嗎？')) return;
    var data = JSON.parse(JSON.stringify(state.calendarData));
    data.events = (data.events || []).filter(function (e) { return !(e && e.date === state.selectedDate); });
    state.calendarData = data;
    state.eventsByDate = buildEventsMap(data);
    dirty.calendar = true;
    updatePublishButton();
    showSuccess('已清除（本地）：' + state.selectedDate);
    setSelectedDate(state.selectedDate);
    sendCalendarDataToPreview();
  }

  // ── Image data ────────────────────────────────────────────────────

  async function loadImageData(type) {
    try {
      var filename = TYPE_DATAFILE[type] || (type + '-data.json');
      var res = await GitHubAPI.getJSON(SITE + '/assets/data/' + filename);
      state.imageData[type] = res.data;
    } catch (e) {
      logStatus('❌ 載入 ' + type + ' 資料失敗：' + (e.message || String(e)));
    }
  }

  // ── Image edit panel ──────────────────────────────────────────────

  // ── Tag editor ────────────────────────────────────────────────────

  function renderTagChips() {
    var chips = $('tagChips');
    if (!chips) return;
    chips.innerHTML = '';
    state.editingTags.forEach(function (tag) {
      var chip = document.createElement('span');
      chip.className = 'tag-chip';
      var text = document.createTextNode(tag);
      chip.appendChild(text);
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tag-chip__remove';
      btn.setAttribute('aria-label', '移除 ' + tag);
      btn.textContent = '×';
      (function (t) {
        btn.addEventListener('click', function () { removeEditingTag(t); });
      }(tag));
      chip.appendChild(btn);
      chips.appendChild(chip);
    });
    renderPresetButtons();
  }

  function addEditingTag(tag) {
    tag = tag.trim();
    if (!tag || state.editingTags.indexOf(tag) !== -1) return;
    state.editingTags.push(tag);
    renderTagChips();
  }

  function removeEditingTag(tag) {
    var idx = state.editingTags.indexOf(tag);
    if (idx === -1) return;
    state.editingTags.splice(idx, 1);
    renderTagChips();
  }

  // ── Global tag management ──────────────────────────────────────────

  function refreshGlobalTags() {
    var all = DEFAULT_TAGS.slice();
    IMAGE_TYPES.forEach(function (type) {
      (state.imageData[type].items || []).forEach(function (item) {
        (item.tags || []).forEach(function (tag) {
          if (all.indexOf(tag) === -1) all.push(tag);
        });
      });
    });
    state.globalTags = all;
    renderPresetButtons();
    renderTagManager();
  }

  function renderPresetButtons() {
    var container = $('tagPresets');
    if (!container) return;
    container.innerHTML = '';
    state.globalTags.forEach(function (tag) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tag-preset';
      btn.dataset.tag = tag;
      btn.textContent = tag;
      btn.disabled = state.editingTags.indexOf(tag) !== -1;
      container.appendChild(btn);
    });
  }

  function renderTagManager() {
    var list = $('tagManagerList');
    if (!list) return;
    list.innerHTML = '';
    if (state.globalTags.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'tag-manager-empty';
      empty.textContent = '尚無標籤';
      list.appendChild(empty);
      return;
    }
    state.globalTags.forEach(function (tag) {
      var count = 0;
      IMAGE_TYPES.forEach(function (type) {
        (state.imageData[type].items || []).forEach(function (item) {
          if ((item.tags || []).indexOf(tag) !== -1) count++;
        });
      });
      var row = document.createElement('div');
      row.className = 'tag-manager-item';
      row.dataset.tag = tag;

      var nameSpan = document.createElement('span');
      nameSpan.className = 'tag-manager-item__name';
      nameSpan.textContent = tag;

      var countSpan = document.createElement('span');
      countSpan.className = 'tag-manager-item__count';
      countSpan.textContent = count > 0 ? count + ' 項' : '';

      var actions = document.createElement('div');
      actions.className = 'tag-manager-item__actions';

      var renameBtn = document.createElement('button');
      renameBtn.type = 'button';
      renameBtn.className = 'btn btn-sm btn-secondary tm-rename-btn';
      renameBtn.dataset.tag = tag;
      renameBtn.textContent = '改名';

      var deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'btn btn-sm tm-delete-btn';
      deleteBtn.dataset.tag = tag;
      deleteBtn.textContent = '刪除';

      actions.appendChild(renameBtn);
      actions.appendChild(deleteBtn);
      row.appendChild(nameSpan);
      row.appendChild(countSpan);
      row.appendChild(actions);
      list.appendChild(row);
    });
  }

  function addGlobalTag(tag) {
    tag = tag.trim();
    if (!tag || state.globalTags.indexOf(tag) !== -1) return;
    state.globalTags.push(tag);
    renderPresetButtons();
    renderTagManager();
  }

  function renameTagGlobally(oldTag, newTag) {
    newTag = newTag.trim();
    if (!newTag || newTag === oldTag) { renderTagManager(); return; }
    if (state.globalTags.indexOf(newTag) !== -1) {
      alert('標籤「' + newTag + '」已存在');
      renderTagManager();
      return;
    }
    IMAGE_TYPES.forEach(function (type) {
      var changed = false;
      (state.imageData[type].items || []).forEach(function (item) {
        var idx = (item.tags || []).indexOf(oldTag);
        if (idx !== -1) { item.tags[idx] = newTag; changed = true; }
      });
      if (changed) dirty[type] = true;
    });
    var gIdx = state.globalTags.indexOf(oldTag);
    if (gIdx !== -1) state.globalTags[gIdx] = newTag;
    var eIdx = state.editingTags.indexOf(oldTag);
    if (eIdx !== -1) state.editingTags[eIdx] = newTag;
    updatePublishButton();
    renderPresetButtons();
    renderTagChips();
    renderTagManager();
  }

  function deleteTagGlobally(tag) {
    var count = 0;
    IMAGE_TYPES.forEach(function (type) {
      (state.imageData[type].items || []).forEach(function (item) {
        if ((item.tags || []).indexOf(tag) !== -1) count++;
      });
    });
    var msg = count > 0
      ? '有 ' + count + ' 個品項使用標籤「' + tag + '」，確定要從所有品項中移除此標籤嗎？'
      : '確定要移除標籤「' + tag + '」？';
    if (!confirm(msg)) return;
    IMAGE_TYPES.forEach(function (type) {
      var changed = false;
      (state.imageData[type].items || []).forEach(function (item) {
        var idx = (item.tags || []).indexOf(tag);
        if (idx !== -1) { item.tags.splice(idx, 1); changed = true; }
      });
      if (changed) dirty[type] = true;
    });
    var gIdx = state.globalTags.indexOf(tag);
    if (gIdx !== -1) state.globalTags.splice(gIdx, 1);
    var eIdx = state.editingTags.indexOf(tag);
    if (eIdx !== -1) state.editingTags.splice(eIdx, 1);
    updatePublishButton();
    renderPresetButtons();
    renderTagChips();
    renderTagManager();
  }

  function hasUnsavedChanges() {
    if (state.editingImageIndex < 0) return false;
    var type = isImageTab(state.currentTab) ? state.currentTab : 'products';
    var item = state.imageData[type].items[state.editingImageIndex];
    if (!item) return false;
    var prices = (item.prices && typeof item.prices === 'object') ? item.prices : {};
    var tags = state.editingTags;
    var origTags = item.tags || [];
    if ($('imageNameInput').value.trim() !== (item.name || '').trim()) return true;
    if ($('imageNameEnInput').value.trim() !== (item.name_en || '').trim()) return true;
    if (tabTypeHasPrice(type)) {
      if ($('imagePriceSize6Input').value.trim() !== (prices.size6 || '').toString().trim()) return true;
      if ($('imagePriceSize8Input').value.trim() !== (prices.size8 || '').toString().trim()) return true;
      if ($('imagePriceSliceInput').value.trim() !== (prices.slice || '').toString().trim()) return true;
    }
    if ($('imageDescInput').value.trim() !== (item.description || '').trim()) return true;
    if ($('imageDescEnInput').value.trim() !== (item.description_en || '').trim()) return true;
    if (tabTypeHasTags(type)) {
      if (tags.length !== origTags.length || tags.some(function (t) { return origTags.indexOf(t) === -1; })) return true;
    }
    return false;
  }

  function confirmDiscardChanges() {
    if (!hasUnsavedChanges()) return true;
    return confirm('目前有未儲存的修改，確定要放棄嗎？');
  }

  function openImageEditPanel(type, index) {
    if (state.editingImageIndex >= 0 && state.editingImageIndex !== index && !confirmDiscardChanges()) return;
    clearError(); clearSuccess();
    var item = state.imageData[type].items[index];
    if (!item) return;
    state.editingImageIndex = index;
    $('selectedImage').textContent = '選取圖片：' + (item.name || '未命名');
    $('imageNameInput').value = item.name || '';
    $('imageNameEnInput').value = item.name_en || '';
    var prices = (item.prices && typeof item.prices === 'object') ? item.prices : {};
    $('imagePriceSize6Input').value = prices.size6 || '';
    $('imagePriceSize8Input').value = prices.size8 || '';
    $('imagePriceSliceInput').value = prices.slice || '';
    $('imageDescInput').value = item.description || '';
    $('imageDescEnInput').value = item.description_en || '';
    state.editingTags = (item.tags && Array.isArray(item.tags)) ? item.tags.slice() : [];
    renderTagChips();
    $('imageEditForm').style.display = 'block';
    $('imageEditSaveBtn').disabled = false;
    $('imageEditDeleteBtn').disabled = false;
    var iframe = $('previewFrame');
    if (iframe && iframe.contentWindow) iframe.contentWindow.postMessage({ type: 'gallery-select', index: index }, '*');
    requestAnimationFrame(function () { var inp = $('imageNameInput'); if (inp) { inp.focus(); inp.select(); } });
  }

  function clearImageEditPanel() {
    state.editingImageIndex = -1;
    $('selectedImage').textContent = '選取圖片：尚未選取';
    ['imageNameInput', 'imageNameEnInput', 'imagePriceSize6Input', 'imagePriceSize8Input', 'imagePriceSliceInput', 'imageDescInput', 'imageDescEnInput'].forEach(function (id) { $(id).value = ''; });
    state.editingTags = [];
    renderTagChips();
    $('imageEditForm').style.display = 'none';
    $('imageEditSaveBtn').disabled = true;
    $('imageEditDeleteBtn').disabled = true;
    var iframe = $('previewFrame');
    if (iframe && iframe.contentWindow) iframe.contentWindow.postMessage({ type: 'gallery-select', index: -1 }, '*');
  }

  // ── Image save (LOCAL) ────────────────────────────────────────────

  function saveImageEdit(type) {
    var index = state.editingImageIndex;
    if (index < 0) return;
    var name = $('imageNameInput').value.trim();
    if (!name) { alert('請輸入圖片名稱'); return; }

    var item = state.imageData[type].items[index];
    item.name = name;
    item.name_en = $('imageNameEnInput').value.trim();
    if (tabTypeHasPrice(type)) {
      var prices = {};
      var s6 = $('imagePriceSize6Input').value.trim();
      var s8 = $('imagePriceSize8Input').value.trim();
      var sl = $('imagePriceSliceInput').value.trim();
      if (s6) prices.size6 = s6;
      if (s8) prices.size8 = s8;
      if (sl) prices.slice = sl;
      if (Object.keys(prices).length > 0) { item.prices = prices; }
      else { delete item.prices; }
    } else {
      delete item.prices;
    }
    item.description = $('imageDescInput').value.trim();
    item.description_en = $('imageDescEnInput').value.trim();
    item.tags = state.editingTags.slice();

    // 名稱和檔名分離：改名稱只改 JSON，不動圖片檔案
    dirty[type] = true;
    updatePublishButton();

    $('selectedImage').textContent = '選取圖片：' + name;
    showSuccess('已儲存（本地）：' + name);
    // 不重新渲染 gallery — 純文字修改不需要重建圖片元素，避免圖片閃爍/失效
    // 只有排序、上傳、刪除才呼叫 sendImageDataToPreview
  }

  function deleteImage(type, index) {
    var item = state.imageData[type].items[index];
    if (!item) return;
    if (!confirm('確定要刪除「' + item.name + '」嗎？')) return;

    dirty.pendingDeletes.push(SITE + '/' + item.image);
    state.imageData[type].items.splice(index, 1);
    dirty[type] = true;
    updatePublishButton();

    clearImageEditPanel();
    showSuccess('已刪除（本地）：' + item.name);
    sendImageDataToPreview(type);
  }

  // ── Batch delete ──────────────────────────────────────────────────

  var batchMode = false;
  var batchSelected = new Set();

  function enterBatchMode() {
    if (state.editingImageIndex >= 0 && !confirmDiscardChanges()) return;
    batchMode = true;
    batchSelected.clear();
    clearImageEditPanel();
    $('batchDeleteBtn').style.display = 'none';
    $('downloadBackupBtn').style.display = 'none';
    $('batchDeleteActions').style.display = 'block';
    $('imageEditForm').style.display = 'none';
    updateBatchDeleteButton();
    var iframe = $('previewFrame');
    if (iframe && iframe.contentWindow) iframe.contentWindow.postMessage({ type: 'batch-mode', enabled: true }, '*');
    logStatus('進入批次刪除模式，點擊圖片勾選');
  }

  function exitBatchMode() {
    batchMode = false;
    batchSelected.clear();
    $('batchDeleteBtn').style.display = '';
    $('downloadBackupBtn').style.display = '';
    $('batchDeleteActions').style.display = 'none';
    var iframe = $('previewFrame');
    if (iframe && iframe.contentWindow) iframe.contentWindow.postMessage({ type: 'batch-mode', enabled: false }, '*');
  }

  function updateBatchDeleteButton() {
    var btn = $('batchDeleteConfirmBtn');
    var count = batchSelected.size;
    btn.textContent = '刪除已選 (' + count + ')';
    btn.disabled = count === 0;
  }

  function executeBatchDelete() {
    var type = isImageTab(state.currentTab) ? state.currentTab : 'products';
    var count = batchSelected.size;
    if (count === 0) return;
    if (!confirm('確定要刪除 ' + count + ' 個品項嗎？')) return;

    // Sort indices descending so splicing doesn't shift later indices
    var indices = Array.from(batchSelected).sort(function (a, b) { return b - a; });
    indices.forEach(function (idx) {
      var item = state.imageData[type].items[idx];
      if (item) {
        dirty.pendingDeletes.push(SITE + '/' + item.image);
        state.imageData[type].items.splice(idx, 1);
      }
    });

    dirty[type] = true;
    updatePublishButton();
    exitBatchMode();
    showSuccess('已刪除（本地）：' + count + ' 個品項');
    sendImageDataToPreview(type);
  }

  // ── Image upload (LOCAL — compress + store in memory) ──────────────

  async function handleImageUpload(type, files) {
    if (!files || files.length === 0) return;

    var imageDir = TYPE_IMAGEDIR[type] || 'assets/images/products';
    var lastUploadedName = null;

    for (var i = 0; i < files.length; i++) {
      var file = files[i];
      var baseName = file.name.replace(/\.[^.]+$/, '') || 'untitled';
      var sanitized = sanitizeFilename(baseName);
      var filename = getImageFilename(sanitized);

      logStatus('⏳ 壓縮圖片：' + file.name + '…');
      try {
        var compressed = await ImageCompress.compress(file);

        // Store pending uploads: desktop + mobile (sm/)
        var repoPath = SITE + '/' + imageDir + '/' + filename;
        var repoPathSm = SITE + '/' + imageDir + '/sm/' + filename;
        dirty.pendingImages.push({ repoPath: repoPath, base64: compressed.desktop.base64 });
        dirty.pendingImages.push({ repoPath: repoPathSm, base64: compressed.mobile.base64 });

        // Add to local items for instant preview
        var newItem = {
          image: imageDir + '/' + filename,
          name: sanitized,
          name_en: '',
          description: '',
          description_en: '',
          tags: [],
          // Store blob URL for instant preview
          _previewUrl: URL.createObjectURL(compressed.desktop.blob),
        };
        if (tabTypeHasPrice(type)) {
          newItem.prices = { size6: '', size8: '', slice: '' };
        }
        state.imageData[type].items.push(newItem);
        lastUploadedName = sanitized;
        logStatus('✅ 已壓縮：' + file.name + ' → ' + filename);
      } catch (e) {
        showError('壓縮失敗：' + (e.message || String(e)));
      }
    }

    dirty[type] = true;
    updatePublishButton();
    sendImageDataToPreview(type);

    if (lastUploadedName) {
      var idx = state.imageData[type].items.findIndex(function (it) { return it.name === lastUploadedName; });
      if (idx >= 0) {
        openImageEditPanel(type, idx);
        state.scrollToImageIndex = idx;
      }
      showSuccess('已上傳（本地）：' + lastUploadedName + '（點「一鍵發布」後才會上傳到 GitHub）');
    }
  }

  // ── Image reorder (LOCAL) ─────────────────────────────────────────

  function reorderImages(type, fromIndex, toIndex) {
    var items = state.imageData[type].items;
    var moved = items.splice(fromIndex, 1)[0];
    items.splice(toIndex, 0, moved);
    dirty[type] = true;
    updatePublishButton();
    showSuccess('已重新排序（本地）');
    // 用 DOM 移動元素而非重新渲染，避免圖片重載失效
    var iframe = $('previewFrame');
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage({ type: 'admin-gallery-reorder-dom', fromIndex: fromIndex, toIndex: toIndex }, '*');
    }
  }

  // ── PUBLISH — commit all pending changes to GitHub ────────────────

  async function publish() {
    if (!hasPendingChanges()) { alert('沒有待發布的變更。'); return; }
    if (!confirm('確定要發布所有變更嗎？\n這會將所有修改一次 commit 到 GitHub。')) return;
    if (state.saving) return;
    state.saving = true;
    var btn = $('publishBtn');
    setButtonLoading(btn, true);

    try {
      var changes = [];
      var parts = []; // for commit message

      // 1. Calendar data
      if (dirty.calendar) {
        validateCalendarData(state.calendarData);
        changes.push({
          path: SITE + '/assets/data/calendar-data.json',
          content: JSON.stringify(state.calendarData, null, 2) + '\n',
        });

        // Version bump
        var targets = ['calendar.html', 'calendar-widget-readonly.html'];
        var curV = null;
        for (var i = 0; i < targets.length; i++) {
          try {
            var file = await GitHubAPI.getFile(SITE + '/' + targets[i]);
            if (!curV) { var m = file.content.match(/\?v=([0-9]{8}-[0-9]+)/); curV = m ? m[1] : ''; }
            var nextV = computeNextCacheVersion(curV);
            var updated = file.content.replace(/\?v=([0-9]{8}-[0-9]+)/g, '?v=' + nextV);
            if (updated !== file.content) changes.push({ path: SITE + '/' + targets[i], content: updated });
          } catch (e) { /* skip */ }
        }
        parts.push('日曆');
      }

      // 2. Image-type data (seasonal / products / sets)
      IMAGE_TYPES.forEach(function (t) {
        if (!dirty[t]) return;
        var data = { schema_version: 1, items: cleanItemsForCommit(state.imageData[t].items) };
        validateImageData(data);
        changes.push({ path: SITE + '/assets/data/' + TYPE_DATAFILE[t], content: JSON.stringify(data, null, 2) + '\n' });
        parts.push(TYPE_LABEL[t]);
      });

      // 4. Pending image uploads
      for (var j = 0; j < dirty.pendingImages.length; j++) {
        var img = dirty.pendingImages[j];
        changes.push({ path: img.repoPath, content: img.base64, encoding: 'base64' });
      }
      if (dirty.pendingImages.length > 0) parts.push(dirty.pendingImages.length + ' 張圖片');

      // Commit all changes
      if (changes.length > 0) {
        var msg = '更新：' + parts.join('、');
        await GitHubAPI.commitMultipleFiles(changes, msg);
        logStatus('✅ 已 commit：' + msg);
      }

      // Delete files (explicit deletes from image deletion) — must be after commit
      for (var k = 0; k < dirty.pendingDeletes.length; k++) {
        try {
          await GitHubAPI.deleteFile(dirty.pendingDeletes[k], '刪除：' + dirty.pendingDeletes[k].split('/').pop());
        } catch (e) {
          logStatus('⚠️ 刪除失敗（可手動清理）：' + e.message);
        }
      }

      // Reset dirty state
      dirty.calendar = false;
      IMAGE_TYPES.forEach(function (t) { dirty[t] = false; });
      dirty.pendingImages = [];
      dirty.pendingDeletes = [];
      updatePublishButton();

      // Reload data from GitHub to sync
      await refreshCalendarData();
      for (var ti = 0; ti < IMAGE_TYPES.length; ti++) {
        await loadImageData(IMAGE_TYPES[ti]);
      }

      showSuccess('已發布！等待部署中…');
      watchDeployment();
    } catch (e) {
      showError('發布失敗：' + (e.message || String(e)));
    } finally {
      state.saving = false;
      setButtonLoading(btn, false);
      updatePublishButton();
    }
  }

  // ── Deployment status watcher ─────────────────────────────────────

  function watchDeployment() {
    var startTime = Date.now();
    var maxWait = 180000; // 3 minutes
    var interval = 5000;  // poll every 5 seconds
    var timer = null;

    function updateHint(msg) {
      var el = $('deployHint');
      if (el) { el.textContent = msg; el.style.display = 'flex'; }
    }

    function clearHint() {
      var el = $('deployHint');
      if (el) el.style.display = 'none';
    }

    updateHint('⏳ 部署中…');

    timer = setInterval(async function () {
      try {
        var elapsed = Math.round((Date.now() - startTime) / 1000);
        updateHint('⏳ 部署中… (' + elapsed + '秒)');

        var data = await GitHubAPI.getLatestWorkflowRun();
        if (!data) return;

        if (data.status === 'completed') {
          clearInterval(timer);
          if (data.conclusion === 'success') {
            updateHint('✅ 部署完成！網站已更新。');
            showSuccess('部署完成！網站已更新。');
            // Auto-reload preview after successful deployment
            setTimeout(function () { reloadPreview(); clearHint(); }, 2000);
          } else {
            updateHint('❌ 部署失敗（' + data.conclusion + '）。請檢查 GitHub Actions。');
            logStatus('❌ 部署失敗：' + data.conclusion);
          }
          return;
        }

        // Timeout
        if (Date.now() - startTime > maxWait) {
          clearInterval(timer);
          updateHint('⚠️ 等待超時。請到 GitHub Actions 頁面查看部署狀態。');
        }
      } catch (e) {
        // Silently ignore polling errors
      }
    }, interval);
  }

  // Remove internal fields before committing
  function cleanItemsForCommit(items) {
    return items.map(function (item) {
      var clean = Object.assign({}, item);
      delete clean._previewUrl;
      delete clean._sha;
      return clean;
    });
  }

  // ── Download Backup ───────────────────────────────────────────────

  async function downloadBackup(type) {
    if (typeof JSZip === 'undefined') { showError('JSZip 尚未載入，請檢查網路連線'); return; }

    var items = state.imageData[type].items || [];
    if (items.length === 0) { showError('沒有可備份的資料'); return; }

    var btn = $('downloadBackupBtn');
    setButtonLoading(btn, true);
    logStatus('📦 開始打包 ' + (TYPE_LABEL[type] || type) + '…');

    try {
      var zip = new JSZip();
      var imgFolder = zip.folder('images');

      // Build clean data and fetch images in parallel
      var exportItems = [];
      var fetchPromises = [];
      var usedNames = {};

      items.forEach(function (item, i) {
        // Clean copy for export
        var clean = Object.assign({}, item);
        delete clean._previewUrl;
        delete clean._sha;

        // Use product name as filename for readability
        var origPath = item.image || '';
        var baseName = (item.name && item.name.trim()) ? sanitizeFilename(item.name) : ('image-' + (i + 1));
        // Deduplicate: append number if name already used
        var candidate = baseName + '.jpg';
        var n = 1;
        while (usedNames[candidate]) { candidate = baseName + '-' + (++n) + '.jpg'; }
        usedNames[candidate] = true;
        var filename = candidate;
        clean.image = 'images/' + filename;
        exportItems.push(clean);

        // Fetch image: use blob URL for unpublished, GitHub raw URL for published
        var imgUrl = item._previewUrl;
        if (!imgUrl && origPath) {
          // Build raw.githubusercontent.com URL (works on file:// and https://)
          var rawBase = 'https://raw.githubusercontent.com/' + GitHubAPI.OWNER + '/' + GitHubAPI.REPO + '/' + GitHubAPI.BRANCH + '/' + SITE + '/';
          imgUrl = rawBase + encodeURI(origPath);
        }
        if (imgUrl) {
          fetchPromises.push(
            (function (url, fname) {
              return fetch(url).then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.arrayBuffer();
              }).then(function (buf) {
                imgFolder.file(fname, buf);
              }).catch(function (e) {
                logStatus('⚠️ 無法下載圖片：' + fname + ' (' + e.message + ')');
              });
            })(imgUrl, filename)
          );
        }
      });

      await Promise.all(fetchPromises);

      // Add data.json
      var exportData = { schema_version: 1, items: exportItems };
      zip.file('data.json', JSON.stringify(exportData, null, 2));

      // Generate and trigger download with save dialog
      var blob = await zip.generateAsync({ type: 'blob' });
      var today = new Date().toISOString().slice(0, 10);
      var zipName = type + '-backup-' + today + '.zip';

      if (window.showSaveFilePicker) {
        try {
          var handle = await window.showSaveFilePicker({
            suggestedName: zipName,
            types: [{ description: 'ZIP 壓縮檔', accept: { 'application/zip': ['.zip'] } }],
          });
          var writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
        } catch (e) {
          if (e.name === 'AbortError') { logStatus('已取消下載'); return; }
          throw e;
        }
      } else {
        // Fallback for browsers without File System Access API (e.g. Firefox)
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = zipName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
      }

      logStatus('✅ 備份完成：' + zipName + '（' + exportItems.length + ' 個品項）');
    } catch (e) {
      showError('備份失敗：' + (e.message || String(e)));
    } finally {
      setButtonLoading(btn, false);
      btn.textContent = '下載備份';
    }
  }

  // ── Validation ────────────────────────────────────────────────────

  function collectCalendarMissing() {
    var missing = [];
    var data = state.calendarData;
    if (!data || !Array.isArray(data.events)) return missing;
    data.events.forEach(function (ev) {
      if (!ev || !Array.isArray(ev.items)) return;
      ev.items.forEach(function (item) {
        if (!item || !item.text) return;
        var mf = [];
        if (!item.text_en || !item.text_en.trim()) mf.push('英文標籤');
        if (item.detail && item.detail.trim() && (!item.detail_en || !item.detail_en.trim())) mf.push('英文詳細');
        if (mf.length > 0) missing.push({ type: '月曆 ' + ev.date, name: item.text, required: [], fields: mf });
      });
    });
    return missing;
  }

  function checkAllCalendarFields() {
    showCheckResultModal(collectCalendarMissing());
  }

  function checkAllFields() {
    var missing = [];
    IMAGE_TYPES.forEach(function (type) {
      (state.imageData[type].items || []).forEach(function (item) {
        var mf = [], mr = [];
        if (!item.name || !item.name.trim()) mr.push('名稱');
        if (!item.name_en || !item.name_en.trim()) mf.push('名稱 (英文)');
        if (tabTypeHasPrice(type)) {
          var hasPrices = item.prices && (item.prices.size6 || item.prices.size8 || item.prices.slice);
          if (!hasPrices) mf.push('價格');
        }
        if (!item.description || !item.description.trim()) mf.push('描述');
        if (!item.description_en || !item.description_en.trim()) mf.push('描述 (英文)');
        if (mr.length > 0 || mf.length > 0) missing.push({ type: TYPE_LABEL[type] || type, name: item.name || '未命名', required: mr, fields: mf });
      });
    });
    showCheckResultModal(missing);
  }

  function showCheckResultModal(missingItems) {
    var modal = $('checkResultModal');
    $('checkResultModalTitle').textContent = missingItems.length === 0 ? '✅ 檢查完成' : '⚠️ 發現 ' + missingItems.length + ' 個圖片缺少欄位';
    var body = $('checkResultModalBody');
    if (missingItems.length === 0) {
      body.innerHTML = '<div style="text-align:center;padding:20px 0;color:var(--accent);">所有圖片都已填寫完整欄位！</div>';
    } else {
      var html = '';
      missingItems.forEach(function (m, idx) {
        html += '<div class="check-item"><div class="check-item-name">' + (idx + 1) + '. ' + escapeHtml(m.type) + ' - ' + escapeHtml(m.name) + '</div>';
        if (m.required.length > 0) html += '<div class="check-item-field">⚠️ 必填缺少：' + escapeHtml(m.required.join('、')) + '</div>';
        if (m.fields.length > 0) html += '<div class="check-item-field">⚠️ 建議填寫：' + escapeHtml(m.fields.join('、')) + '</div>';
        html += '</div>';
      });
      body.innerHTML = html;
    }
    modal.style.display = 'flex';
    var close = function () { modal.style.display = 'none'; };
    $('checkResultModalClose').onclick = close;
    $('checkResultModalOk').onclick = close;
    modal.querySelector('.check-result-modal__overlay').onclick = close;
  }

  // ── Tab / Mode switching ──────────────────────────────────────────

  function switchTab(tabName) {
    if (batchMode) exitBatchMode();
    state.currentTab = tabName;
    if (tabName !== 'calendar' && state.hookTimer) { clearInterval(state.hookTimer); state.hookTimer = 0; state.clickHookInstalled = false; }
    document.querySelectorAll('.tab-btn').forEach(function (btn) { btn.classList.toggle('active', btn.dataset.tab === tabName); });
    clearError(); clearSuccess();
    if (tabName === 'calendar') {
      $('calendarPanel').style.display = 'block';
      $('imagePanel').style.display = 'none';
    } else {
      $('calendarPanel').style.display = 'none';
      $('imagePanel').style.display = 'block';
      // 在沒有價格的 tab（如 sets）隱藏價格區塊
      var priceSection = $('priceSection');
      if (priceSection) priceSection.style.display = tabTypeHasPrice(tabName) ? '' : 'none';
      // 在沒有標籤的 tab（如 sets）隱藏標籤編輯與管理區塊
      var hasTags = tabTypeHasTags(tabName);
      var tagSection = $('tagSection');
      if (tagSection) tagSection.style.display = hasTags ? '' : 'none';
      var tagManagerSection = $('tagManagerSection');
      if (tagManagerSection) tagManagerSection.style.display = hasTags ? '' : 'none';
      // Only load from GitHub if we haven't loaded yet (or if not dirty)
      if (!dirty[tabName] && (!state.imageData[tabName].items || state.imageData[tabName].items.length === 0)) {
        loadImageData(tabName);
      }
      clearImageEditPanel();
    }
    reloadPreview();
  }

  function switchMode(mode) {
    state.currentMode = mode;
    $('editModeBtn').classList.toggle('active', mode === 'edit');
    $('previewModeBtn').classList.toggle('active', mode === 'preview');
    $('topbarCenter').style.display = mode === 'preview' ? 'none' : 'flex';
    if (mode === 'preview') {
      $('mainContainer').classList.add('preview-mode');
      if (state.hookTimer) { clearInterval(state.hookTimer); state.hookTimer = 0; state.clickHookInstalled = false; }
    } else {
      $('mainContainer').classList.remove('preview-mode');
      if (state.currentTab === 'calendar') { state.clickHookInstalled = false; startHookWatcher(); }
    }
    reloadPreview();
  }

  // ── PostMessage from iframe ───────────────────────────────────────

  window.addEventListener('message', function (e) {
    // file:// 協定下 e.origin 是 "null" 但 location.origin 可能是 "file://"（Chrome）
    var sameOrigin = e.origin === location.origin
      || (location.protocol === 'file:' && (e.origin === 'null' || e.origin === 'file://'));
    if (!sameOrigin) return;
    if (!e.data || typeof e.data !== 'object' || !e.data.type) return;
    if (e.data.type === 'calendar-month-changed' && typeof e.data.month === 'string') {
      state.previewMonth = e.data.month;
      return;
    }
    if (e.data.type === 'gallery-reorder') {
      var type = isImageTab(state.currentTab) ? state.currentTab : 'products';
      if (typeof e.data.fromIndex === 'number' && typeof e.data.toIndex === 'number') reorderImages(type, e.data.fromIndex, e.data.toIndex);
    } else if (e.data.type === 'gallery-edit') {
      var type2 = isImageTab(state.currentTab) ? state.currentTab : 'products';
      var items = state.imageData[type2] && state.imageData[type2].items;
      if (typeof e.data.index === 'number' && items && e.data.index < items.length) openImageEditPanel(type2, e.data.index);
    } else if (e.data.type === 'gallery-deselect') {
      if (!batchMode && confirmDiscardChanges()) clearImageEditPanel();
    } else if (e.data.type === 'batch-toggle') {
      var idx = e.data.index;
      if (batchSelected.has(idx)) batchSelected.delete(idx);
      else batchSelected.add(idx);
      updateBatchDeleteButton();
    } else if (e.data.type === 'calendar-day-clicked') {
      // postMessage fallback for calendar click (works even when contentDocument is blocked)
      if (state.currentTab === 'calendar' && state.currentMode === 'edit' && e.data.date) {
        setSelectedDate(e.data.date);
      }
    }
  });

  // ── Init ──────────────────────────────────────────────────────────

  async function initApp() {
    $('editModeBtn').addEventListener('click', function () { switchMode('edit'); });
    $('previewModeBtn').addEventListener('click', function () { switchMode('preview'); });

    var toggle = $('statusToggle'), box = $('statusBox');
    toggle.addEventListener('click', function () {
      box.classList.toggle('show');
      toggle.classList.toggle('expanded');
    });

    document.querySelectorAll('.tab-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { switchTab(btn.dataset.tab); });
    });

    $('saveBtn').addEventListener('click', saveCalendarEvent);
    $('clearBtn').addEventListener('click', clearCalendarEvent);
    if ($('addItemBtn')) $('addItemBtn').addEventListener('click', addCalendarItem);

    $('imageEditSaveBtn').addEventListener('click', function () {
      if (isImageTab(state.currentTab)) saveImageEdit(state.currentTab);
    });

    // Tag editor: preset buttons (event delegation)
    $('tagPresets').addEventListener('click', function (e) {
      var btn = e.target.closest('.tag-preset');
      if (btn && !btn.disabled) addEditingTag(btn.dataset.tag);
    });



    // Tag manager: toggle
    $('tagManagerToggle').addEventListener('click', function () {
      var content = $('tagManagerContent');
      var icon = $('tagManagerIcon');
      var visible = content.style.display !== 'none';
      content.style.display = visible ? 'none' : 'block';
      if (icon) icon.style.transform = visible ? '' : 'rotate(180deg)';
    });

    // Tag manager: add global tag
    $('globalTagAddBtn').addEventListener('click', function () {
      var input = $('globalTagInput');
      addGlobalTag(input.value);
      input.value = '';
    });
    $('globalTagInput').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        addGlobalTag($('globalTagInput').value);
        $('globalTagInput').value = '';
      }
    });

    // Tag manager: list actions (event delegation)
    $('tagManagerList').addEventListener('click', function (e) {
      var renameBtn = e.target.closest('.tm-rename-btn');
      var deleteBtn = e.target.closest('.tm-delete-btn');
      var confirmBtn = e.target.closest('.tm-confirm-btn');
      var cancelBtn = e.target.closest('.tm-cancel-btn');

      if (renameBtn) {
        var tag = renameBtn.dataset.tag;
        var row = renameBtn.closest('.tag-manager-item');
        if (!row) return;
        row.innerHTML = '';
        var input = document.createElement('input');
        input.type = 'text';
        input.className = 'input input--sm tm-rename-input';
        input.value = tag;
        input.maxLength = 20;
        var rowActions = document.createElement('div');
        rowActions.className = 'tag-manager-item__actions';
        var confirmBtn2 = document.createElement('button');
        confirmBtn2.type = 'button';
        confirmBtn2.className = 'btn btn-sm btn-primary tm-confirm-btn';
        confirmBtn2.dataset.tag = tag;
        confirmBtn2.textContent = '確認';
        var cancelBtn2 = document.createElement('button');
        cancelBtn2.type = 'button';
        cancelBtn2.className = 'btn btn-sm btn-secondary tm-cancel-btn';
        cancelBtn2.dataset.tag = tag;
        cancelBtn2.textContent = '取消';
        rowActions.appendChild(confirmBtn2);
        rowActions.appendChild(cancelBtn2);
        row.appendChild(input);
        row.appendChild(rowActions);
        input.focus();
        input.select();
        input.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter') { ev.preventDefault(); renameTagGlobally(tag, input.value); }
          if (ev.key === 'Escape') renderTagManager();
        });
        return;
      }

      if (deleteBtn) {
        deleteTagGlobally(deleteBtn.dataset.tag);
        return;
      }

      if (confirmBtn) {
        var row2 = confirmBtn.closest('.tag-manager-item');
        var input2 = row2 ? row2.querySelector('.tm-rename-input') : null;
        if (input2) renameTagGlobally(confirmBtn.dataset.tag, input2.value);
        return;
      }

      if (cancelBtn) {
        renderTagManager();
        return;
      }
    });
    $('imageEditDeleteBtn').addEventListener('click', function () {
      if (isImageTab(state.currentTab)) deleteImage(state.currentTab, state.editingImageIndex);
    });
    $('checkCalendarFieldsBtn').addEventListener('click', checkAllCalendarFields);
    $('checkEnglishBtn').addEventListener('click', function () {
      // Ensure data is loaded
      IMAGE_TYPES.forEach(function (t) {
        if (!state.imageData[t].items.length && !dirty[t]) loadImageData(t);
      });
      setTimeout(checkAllFields, 300);
    });

    // Download backup
    $('downloadBackupBtn').addEventListener('click', function () {
      if (isImageTab(state.currentTab)) downloadBackup(state.currentTab);
    });

    // Batch delete
    $('batchDeleteBtn').addEventListener('click', enterBatchMode);
    $('batchDeleteCancelBtn').addEventListener('click', exitBatchMode);
    $('batchDeleteConfirmBtn').addEventListener('click', executeBatchDelete);

    // Claude API key
    $('claudeKeyBtn').addEventListener('click', function () {
      var current = AdminTranslate.hasApiKey() ? '（已設定）' : '（未設定）';
      var key = prompt('請輸入 Claude API Key ' + current + '\n留空可清除設定：', '');
      if (key === null) return; // cancelled
      if (key.trim()) {
        AdminTranslate.setApiKey(key.trim());
        logStatus('✅ Claude API Key 已儲存');
        alert('Claude API Key 已設定成功！');
      } else {
        AdminTranslate.clearApiKey();
        logStatus('已清除 Claude API Key');
        alert('已清除 Claude API Key');
      }
    });

    // 通用：翻譯單一欄位（名稱或描述）
    async function runFieldTranslate(btnId, srcInputId, dstInputId, srcKind) {
      if (!AdminTranslate.hasApiKey()) {
        alert('請先點右上角「AI」按鈕設定 Claude API Key');
        return;
      }
      var src = $(srcInputId).value.trim();
      if (!src) { alert('請先填寫中文' + (srcKind === 'name' ? '名稱' : '描述')); return; }
      var btn = $(btnId);
      var origText = btn.textContent;
      btn.disabled = true;
      btn.textContent = '翻譯中…';
      try {
        var result = await AdminTranslate.translate(
          srcKind === 'name' ? src : '',
          srcKind === 'desc' ? src : ''
        );
        var out = srcKind === 'name' ? result.name_en : result.description_en;
        if (out) $(dstInputId).value = out;
        logStatus('✅ AI 翻譯完成：' + (out || ''));
      } catch (e) {
        alert('翻譯失敗：' + (e.message || String(e)));
        logStatus('❌ 翻譯失敗：' + (e.message || String(e)));
      } finally {
        btn.disabled = false;
        btn.textContent = origText;
      }
    }

    $('translateBtn').addEventListener('click', function () {
      runFieldTranslate('translateBtn', 'imageNameInput', 'imageNameEnInput', 'name');
    });
    $('translateDescBtn').addEventListener('click', function () {
      runFieldTranslate('translateDescBtn', 'imageDescInput', 'imageDescEnInput', 'desc');
    });

    // Translate all calendar items across all dates that don't yet have text_en
    $('translateAllCalendarBtn').addEventListener('click', async function () {
      if (!window.AdminTranslate || !AdminTranslate.hasApiKey()) {
        alert('請先點右上角「AI」按鈕設定 Claude API Key');
        return;
      }
      // 先把當前編輯中的列存回 state，避免遺失尚未儲存的修改
      if (state.selectedDate) {
        try { saveCalendarEvent(); } catch (_) { /* */ }
      }
      var data = state.calendarData;
      if (!data || !Array.isArray(data.events)) { alert('沒有月曆資料'); return; }

      // 範圍：iframe 預覽當前顯示的月份（fallback：選取日期 → 今天）
      var monthPrefix = state.previewMonth
        || (state.selectedDate && state.selectedDate.slice(0, 7))
        || (new Date()).toISOString().slice(0, 7);

      // 收集當月缺英文的項目
      var pending = [];
      data.events.forEach(function (ev) {
        if (!ev || !Array.isArray(ev.items)) return;
        if (typeof ev.date !== 'string' || ev.date.slice(0, 7) !== monthPrefix) return;
        ev.items.forEach(function (item, idx) {
          if (item && item.text && !item.text_en) {
            pending.push({ ev: ev, item: item, idx: idx });
          }
        });
      });
      if (pending.length === 0) { alert(monthPrefix + ' 沒有需要翻譯的項目'); return; }
      if (!confirm('將翻譯 ' + monthPrefix + ' 的 ' + pending.length + ' 個項目，確定？')) return;

      var btn = $('translateAllCalendarBtn');
      var orig = btn.textContent;
      btn.disabled = true;
      var done = 0, failed = 0;
      for (var i = 0; i < pending.length; i++) {
        var p = pending[i];
        btn.textContent = '翻譯中… ' + (i + 1) + '/' + pending.length;
        try {
          var result = await AdminTranslate.translateCalendar(p.item.text || '', p.item.detail || '');
          if (result.text_en) p.item.text_en = result.text_en;
          if (result.detail_en) p.item.detail_en = result.detail_en;
          done++;
        } catch (e) {
          failed++;
          logStatus('❌ 翻譯失敗：' + (p.item.text || '') + ' — ' + (e.message || String(e)));
        }
      }
      btn.disabled = false;
      btn.textContent = orig;

      // 標記為 dirty 並重新整理當前列
      dirty.calendar = true;
      updatePublishButton();
      sendCalendarDataToPreview();
      if (state.selectedDate) setSelectedDate(state.selectedDate);

      logStatus('✅ AI 翻譯完成：成功 ' + done + ' / 失敗 ' + failed);
      alert('完成：成功 ' + done + '，失敗 ' + failed + '\n記得按「發布」才會上線');
    });

    // Publish button
    $('publishBtn').addEventListener('click', publish);

    // Image upload
    var uploadArea = $('imageUploadArea'), fileInput = $('imageFileInput');
    uploadArea.addEventListener('dragover', function (e) { e.preventDefault(); uploadArea.classList.add('dragover'); });
    uploadArea.addEventListener('dragleave', function () { uploadArea.classList.remove('dragover'); });
    uploadArea.addEventListener('drop', function (e) {
      e.preventDefault(); uploadArea.classList.remove('dragover');
      var files = Array.from(e.dataTransfer.files || []);
      if (files.length > 0 && isImageTab(state.currentTab)) handleImageUpload(state.currentTab, files);
    });
    uploadArea.addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function () {
      var files = Array.from(fileInput.files || []);
      if (files.length > 0 && isImageTab(state.currentTab)) handleImageUpload(state.currentTab, files);
      fileInput.value = '';
    });

    $('logoutBtn').addEventListener('click', handleLogout);

    var previewFrame = $('previewFrame');
    previewFrame.setAttribute('tabindex', '-1');
    previewFrame.addEventListener('load', function () {
      if (state.currentTab === 'calendar' && state.currentMode === 'edit') { state.clickHookInstalled = false; startHookWatcher(); }
      // Re-send local data to new iframe
      if (state.currentTab === 'calendar' && dirty.calendar) {
        setTimeout(function () { sendCalendarDataToPreview(); }, 500);
      }
      if (isImageTab(state.currentTab) && dirty[state.currentTab]) {
        setTimeout(function () { sendImageDataToPreview(state.currentTab); }, 500);
      }
      if (state.editingImageIndex >= 0 && state.currentMode === 'edit' && previewFrame.contentWindow) {
        setTimeout(function () { previewFrame.contentWindow.postMessage({ type: 'gallery-select', index: state.editingImageIndex }, '*'); }, 300);
      }
      if (state.scrollToImageIndex >= 0 && previewFrame.contentWindow) {
        setTimeout(function () {
          previewFrame.contentWindow.postMessage({ type: 'gallery-scroll-to', index: state.scrollToImageIndex }, '*');
          state.scrollToImageIndex = -1;
        }, 300);
      }
    });

    try {
      await refreshCalendarData();
      logStatus('✅ 日曆資料已載入');
    } catch (e) {
      logStatus('❌ 載入日曆資料失敗：' + (e.message || String(e)));
    }

    // Pre-load image data
    for (var ti = 0; ti < IMAGE_TYPES.length; ti++) {
      await loadImageData(IMAGE_TYPES[ti]);
    }
    refreshGlobalTags();

    switchTab('calendar');
    switchMode('edit');
    updatePublishButton();

    // 開啟編輯頁時自動檢查所有欄位，有缺則用狀態列訊息提醒（不跳視窗）
    setTimeout(function () {
      var calMissing = 0;
      try { calMissing = collectCalendarMissing().length; } catch (_) { /* */ }
      var imgMissing = 0;
      IMAGE_TYPES.forEach(function (type) {
        (state.imageData[type].items || []).forEach(function (item) {
          var bad = false;
          if (!item.name || !item.name.trim()) bad = true;
          if (!item.name_en || !item.name_en.trim()) bad = true;
          if (tabTypeHasPrice(type)) {
            var hasPrices = item.prices && (item.prices.size6 || item.prices.size8 || item.prices.slice);
            if (!hasPrices) bad = true;
          }
          if (!item.description || !item.description.trim()) bad = true;
          if (!item.description_en || !item.description_en.trim()) bad = true;
          if (bad) imgMissing++;
        });
      });
      if (calMissing > 0 || imgMissing > 0) {
        var parts = [];
        if (calMissing > 0) parts.push('月曆 ' + calMissing + ' 項');
        if (imgMissing > 0) parts.push('商品 ' + imgMissing + ' 項');
        showError('偵測到缺漏欄位：' + parts.join('、') + '（點對應頁面的「檢查所有欄位」查看詳情）');
      } else {
        showSuccess('欄位檢查通過：無缺漏');
      }
    }, 600);
  }

  // ── Boot ──────────────────────────────────────────────────────────

  window.addEventListener('load', function () {
    $('loginBtn').addEventListener('click', handleLogin);
    $('tokenInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') handleLogin(); });

    if (GitHubAPI.hasToken()) {
      GitHubAPI.validateToken().then(function (res) {
        if (res.ok) showApp(res.login);
        else GitHubAPI.clearToken();
      });
    }
  });
})();
