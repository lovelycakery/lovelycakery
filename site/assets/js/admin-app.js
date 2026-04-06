/* global GitHubAPI, ImageCompress, AdminTranslate */

// Lovely Admin — Web-based admin application logic
// Local-edit mode: changes are kept in memory with instant preview.
// "一鍵發布" commits all accumulated changes to GitHub in one atomic commit.
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const SITE = 'site';

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
    },
    editingImageIndex: -1,
    scrollToImageIndex: -1,
    saving: false,
  };

  // Tracks what has been modified locally (not yet published)
  const dirty = {
    calendar: false,
    seasonal: false,
    products: false,
    // Pending image uploads: [{path, base64, repoPath}]
    pendingImages: [],
    // Pending image deletions: [repoPath]
    pendingDeletes: [],
  };

  function hasPendingChanges() {
    return dirty.calendar || dirty.seasonal || dirty.products ||
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
    var allowedTags = ['奶蛋素', '無咖啡因', '含酒精'];
    for (var i = 0; i < data.items.length; i++) {
      var item = data.items[i];
      if (!item || typeof item !== 'object') throw new Error('Each item must be an object');
      if (typeof item.name !== 'string') throw new Error('Item name must be a string');
      if (typeof item.image !== 'string') throw new Error('Item image must be a string');
      if (!Array.isArray(item.tags)) throw new Error('Item tags must be an array');
      for (var j = 0; j < item.tags.length; j++) {
        if (allowedTags.indexOf(item.tags[j]) === -1) throw new Error('Invalid tag: ' + item.tags[j]);
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
    var page = state.currentTab === 'calendar' ? 'calendar.html'
      : (state.currentTab === 'seasonal' ? 'seasonal.html' : 'all-items.html');
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
        var color = ev.status === 'available' ? '#79b06c'
          : ev.status === 'closed' ? '#d66555'
          : ev.status === 'unavailable' ? '#d29a55' : '#6b5d4f';
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
    var row = document.createElement('div');
    row.className = 'cal-item-row';
    row.style.cssText = 'display:flex;flex-direction:column;gap:4px;padding:8px;margin-bottom:6px;background:rgba(0,0,0,0.03);border-radius:8px;position:relative;';

    // 第一行：顏色選擇器 + 顯示文字
    var topRow = document.createElement('div');
    topRow.style.cssText = 'display:flex;align-items:center;gap:6px;';

    var colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.className = 'cal-item-color';
    colorInput.value = item.color || '#6b5d4f';
    colorInput.title = '自訂顏色';
    colorInput.style.cssText = 'width:28px;height:28px;border:1px solid #ccc;border-radius:50%;cursor:pointer;padding:1px;flex-shrink:0;';

    var textInput = document.createElement('input');
    textInput.type = 'text';
    textInput.className = 'cal-item-text input';
    textInput.value = item.text || '';
    textInput.placeholder = '顯示文字（短）';
    textInput.style.cssText = 'flex:1;font-size:13px;';

    var removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn btn-sm';
    removeBtn.textContent = '✕';
    removeBtn.title = '移除此項目';
    removeBtn.style.cssText = 'flex-shrink:0;padding:2px 7px;font-size:12px;color:#d66555;';
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
    swatchRow.style.cssText = 'display:flex;align-items:center;gap:4px;flex-wrap:wrap;';
    COLOR_PRESETS.forEach(function (preset) {
      var swatch = document.createElement('span');
      swatch.title = preset.name;
      swatch.style.cssText = 'width:18px;height:18px;border-radius:50%;cursor:pointer;border:2px solid transparent;box-sizing:border-box;flex-shrink:0;transition:border-color 0.15s;background:' + preset.color + ';';
      if (colorInput.value.toLowerCase() === preset.color.toLowerCase()) {
        swatch.style.borderColor = 'rgba(47,31,20,0.5)';
      }
      swatch.addEventListener('click', function () {
        colorInput.value = preset.color;
        // 更新所有 swatch 的選取狀態
        swatchRow.querySelectorAll('span').forEach(function (s) { s.style.borderColor = 'transparent'; });
        swatch.style.borderColor = 'rgba(47,31,20,0.5)';
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
    detailInput.style.cssText = 'font-size:12px;color:#6b5d4f;';
    row.appendChild(detailInput);

    // color picker 變更時同步 swatch 選取狀態
    colorInput.addEventListener('input', function () {
      swatchRow.querySelectorAll('span').forEach(function (s) { s.style.borderColor = 'transparent'; });
      // 如果剛好選到預設色，標記它
      var val = colorInput.value.toLowerCase();
      COLOR_PRESETS.forEach(function (p, i) {
        if (p.color.toLowerCase() === val) {
          swatchRow.children[i].style.borderColor = 'rgba(47,31,20,0.5)';
        }
      });
    });

    return row;
  }

  function addCalendarItem() {
    var container = $('calendarItemsContainer');
    if (!container) return;
    var max = getMaxItems();
    if (container.children.length >= max) return;
    container.appendChild(createItemRow({ text: '', color: '#6b5d4f', detail: '' }, container.children.length));
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
      var filename = type === 'seasonal' ? 'seasonal-data.json' : 'products-data.json';
      var res = await GitHubAPI.getJSON(SITE + '/assets/data/' + filename);
      state.imageData[type] = res.data;
    } catch (e) {
      logStatus('❌ 載入 ' + type + ' 資料失敗：' + (e.message || String(e)));
    }
  }

  // ── Image edit panel ──────────────────────────────────────────────

  function hasUnsavedChanges() {
    if (state.editingImageIndex < 0) return false;
    var type = state.currentTab === 'seasonal' ? 'seasonal' : 'products';
    var item = state.imageData[type].items[state.editingImageIndex];
    if (!item) return false;
    var prices = (item.prices && typeof item.prices === 'object') ? item.prices : {};
    var tags = [];
    document.querySelectorAll('.tag-checkboxes input[type="checkbox"]:checked').forEach(function (cb) { tags.push(cb.value); });
    var origTags = item.tags || [];
    if ($('imageNameInput').value.trim() !== (item.name || '').trim()) return true;
    if ($('imageNameEnInput').value.trim() !== (item.name_en || '').trim()) return true;
    if ($('imagePriceSize6Input').value.trim() !== (prices.size6 || '').toString().trim()) return true;
    if ($('imagePriceSize8Input').value.trim() !== (prices.size8 || '').toString().trim()) return true;
    if ($('imagePriceSliceInput').value.trim() !== (prices.slice || '').toString().trim()) return true;
    if ($('imageDescInput').value.trim() !== (item.description || '').trim()) return true;
    if ($('imageDescEnInput').value.trim() !== (item.description_en || '').trim()) return true;
    if (tags.length !== origTags.length || tags.some(function (t) { return origTags.indexOf(t) === -1; })) return true;
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
    document.querySelectorAll('.tag-checkboxes input[type="checkbox"]').forEach(function (cb) { cb.checked = false; });
    if (item.tags && Array.isArray(item.tags)) {
      item.tags.forEach(function (tag) {
        var id = tag === '奶蛋素' ? 'tag-vegetarian' : (tag === '無咖啡因' ? 'tag-caffeine-free' : (tag === '含酒精' ? 'tag-alcohol' : ''));
        if (id && $(id)) $(id).checked = true;
      });
    }
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
    document.querySelectorAll('.tag-checkboxes input[type="checkbox"]').forEach(function (cb) { cb.checked = false; });
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
    var prices = {};
    var s6 = $('imagePriceSize6Input').value.trim();
    var s8 = $('imagePriceSize8Input').value.trim();
    var sl = $('imagePriceSliceInput').value.trim();
    if (s6) prices.size6 = s6;
    if (s8) prices.size8 = s8;
    if (sl) prices.slice = sl;
    if (Object.keys(prices).length > 0) { item.prices = prices; }
    else { delete item.prices; }
    item.description = $('imageDescInput').value.trim();
    item.description_en = $('imageDescEnInput').value.trim();
    var tags = [];
    document.querySelectorAll('.tag-checkboxes input[type="checkbox"]:checked').forEach(function (cb) { tags.push(cb.value); });
    item.tags = tags;

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
    var type = state.currentTab === 'seasonal' ? 'seasonal' : 'products';
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

    var imageDir = type === 'seasonal' ? 'assets/images/seasonal' : 'assets/images/products';
    var lastUploadedName = null;

    for (var i = 0; i < files.length; i++) {
      var file = files[i];
      var baseName = file.name.replace(/\.[^.]+$/, '') || 'untitled';
      var sanitized = sanitizeFilename(baseName);
      var filename = getImageFilename(sanitized);

      logStatus('⏳ 壓縮圖片：' + file.name + '…');
      try {
        var compressed = await ImageCompress.compress(file);

        // Store pending upload
        var repoPath = SITE + '/' + imageDir + '/' + filename;
        dirty.pendingImages.push({ repoPath: repoPath, base64: compressed.base64 });

        // Add to local items for instant preview
        var newItem = {
          image: imageDir + '/' + filename,
          name: sanitized,
          name_en: '',
          prices: { size6: '', size8: '', slice: '' },
          description: '',
          description_en: '',
          tags: [],
          // Store blob URL for instant preview
          _previewUrl: URL.createObjectURL(compressed.blob),
        };
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

      // 2. Seasonal data
      if (dirty.seasonal) {
        var sData = { schema_version: 1, items: cleanItemsForCommit(state.imageData.seasonal.items) };
        validateImageData(sData);
        changes.push({ path: SITE + '/assets/data/seasonal-data.json', content: JSON.stringify(sData, null, 2) + '\n' });
        parts.push('季節限定');
      }

      // 3. Products data
      if (dirty.products) {
        var pData = { schema_version: 1, items: cleanItemsForCommit(state.imageData.products.items) };
        validateImageData(pData);
        changes.push({ path: SITE + '/assets/data/products-data.json', content: JSON.stringify(pData, null, 2) + '\n' });
        parts.push('全部品項');
      }

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
      dirty.seasonal = false;
      dirty.products = false;
      dirty.pendingImages = [];
      dirty.pendingDeletes = [];
      updatePublishButton();

      // Reload data from GitHub to sync
      await refreshCalendarData();
      await loadImageData('seasonal');
      await loadImageData('products');

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
    logStatus('📦 開始打包 ' + (type === 'seasonal' ? '季節限定' : '全部品項') + '…');

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

      // Generate and trigger download
      var blob = await zip.generateAsync({ type: 'blob' });
      var today = new Date().toISOString().slice(0, 10);
      var zipName = type + '-backup-' + today + '.zip';
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = zipName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);

      logStatus('✅ 備份完成：' + zipName + '（' + exportItems.length + ' 個品項）');
    } catch (e) {
      showError('備份失敗：' + (e.message || String(e)));
    } finally {
      setButtonLoading(btn, false);
      btn.textContent = '下載備份';
    }
  }

  // ── Validation ────────────────────────────────────────────────────

  function checkAllFields() {
    var missing = [];
    ['seasonal', 'products'].forEach(function (type) {
      (state.imageData[type].items || []).forEach(function (item) {
        var mf = [], mr = [];
        if (!item.name || !item.name.trim()) mr.push('名稱');
        if (!item.name_en || !item.name_en.trim()) mf.push('名稱 (英文)');
        var hasPrices = item.prices && (item.prices.size6 || item.prices.size8 || item.prices.slice);
        if (!hasPrices) mf.push('價格');
        if (!item.description || !item.description.trim()) mf.push('描述');
        if (!item.description_en || !item.description_en.trim()) mf.push('描述 (英文)');
        if (mr.length > 0 || mf.length > 0) missing.push({ type: type === 'seasonal' ? '季節限定' : '全部品項', name: item.name || '未命名', required: mr, fields: mf });
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
    if (e.data.type === 'gallery-reorder') {
      var type = state.currentTab === 'seasonal' ? 'seasonal' : 'products';
      if (typeof e.data.fromIndex === 'number' && typeof e.data.toIndex === 'number') reorderImages(type, e.data.fromIndex, e.data.toIndex);
    } else if (e.data.type === 'gallery-edit') {
      var type2 = state.currentTab === 'seasonal' ? 'seasonal' : 'products';
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
      if (state.currentTab === 'seasonal' || state.currentTab === 'products') saveImageEdit(state.currentTab);
    });
    $('imageEditDeleteBtn').addEventListener('click', function () {
      if (state.currentTab === 'seasonal' || state.currentTab === 'products') deleteImage(state.currentTab, state.editingImageIndex);
    });
    $('validateBtn').addEventListener('click', function () {
      if (state.currentTab === 'seasonal' || state.currentTab === 'products') {
        var items = state.imageData[state.currentTab].items || [];
        var issues = [];
        items.forEach(function (item, i) { if (!item.name || !item.name.trim()) issues.push('#' + (i + 1) + '：缺少名稱'); });
        logStatus(issues.length === 0 ? '✅ 驗證通過' : '⚠️ ' + issues.join(', '));
      }
    });
    $('checkEnglishBtn').addEventListener('click', function () {
      // Ensure data is loaded
      if (!state.imageData.seasonal.items.length && !dirty.seasonal) loadImageData('seasonal');
      if (!state.imageData.products.items.length && !dirty.products) loadImageData('products');
      setTimeout(checkAllFields, 300);
    });

    // Download backup
    $('downloadBackupBtn').addEventListener('click', function () {
      if (state.currentTab === 'seasonal' || state.currentTab === 'products') downloadBackup(state.currentTab);
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

    // Translate button
    $('translateBtn').addEventListener('click', async function () {
      if (!AdminTranslate.hasApiKey()) {
        alert('請先點右上角「AI」按鈕設定 Claude API Key');
        return;
      }
      var zhName = $('imageNameInput').value.trim();
      var zhDesc = $('imageDescInput').value.trim();
      if (!zhName && !zhDesc) { alert('請先填寫中文名稱或描述'); return; }

      var btn = $('translateBtn');
      var origText = btn.textContent;
      btn.disabled = true;
      btn.textContent = '翻譯中…';
      try {
        var result = await AdminTranslate.translate(zhName, zhDesc);
        if (result.name_en) $('imageNameEnInput').value = result.name_en;
        if (result.description_en) $('imageDescEnInput').value = result.description_en;
        logStatus('✅ AI 翻譯完成：' + (result.name_en || ''));
      } catch (e) {
        alert('翻譯失敗：' + (e.message || String(e)));
        logStatus('❌ 翻譯失敗：' + (e.message || String(e)));
      } finally {
        btn.disabled = false;
        btn.textContent = origText;
      }
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
      if (files.length > 0 && (state.currentTab === 'seasonal' || state.currentTab === 'products')) handleImageUpload(state.currentTab, files);
    });
    uploadArea.addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function () {
      var files = Array.from(fileInput.files || []);
      if (files.length > 0 && (state.currentTab === 'seasonal' || state.currentTab === 'products')) handleImageUpload(state.currentTab, files);
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
      if ((state.currentTab === 'seasonal' || state.currentTab === 'products') && dirty[state.currentTab]) {
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
    await loadImageData('seasonal');
    await loadImageData('products');

    switchTab('calendar');
    switchMode('edit');
    updatePublishButton();
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
