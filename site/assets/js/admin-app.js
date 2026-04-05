/* global GitHubAPI, ImageCompress */

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
    var allowed = ['available', 'unavailable', 'closed'];
    for (var i = 0; i < data.events.length; i++) {
      var ev = data.events[i];
      if (!ev || typeof ev !== 'object') throw new Error('Each event must be an object.');
      if (typeof ev.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(ev.date)) throw new Error('Invalid date: ' + ev.date);
      if (typeof ev.status !== 'string' || allowed.indexOf(ev.status) === -1) throw new Error('Invalid status: ' + ev.status);
      if (typeof ev.description !== 'string') throw new Error('Description must be a string.');
    }
  }

  // ── Helpers: image data validation ────────────────────────────────

  function validateImageData(data) {
    if (!data || typeof data !== 'object') throw new Error('Data must be an object');
    if (!Array.isArray(data.items)) throw new Error('Data must contain items array');
    var allowedTags = ['無', '奶蛋素', '無咖啡因', '含酒精'];
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
    // calendar.html embeds calendar-widget-readonly.html in a nested iframe.
    // We send to the outer iframe; calendar-embed.js or the widget itself will pick it up.
    // The widget listens for 'admin-calendar-update' on its own window,
    // so we need to reach the inner iframe.
    try {
      var innerIframe = iframe.contentDocument && iframe.contentDocument.querySelector('iframe.calendar-iframe');
      if (innerIframe && innerIframe.contentWindow) {
        innerIframe.contentWindow.postMessage({
          type: 'admin-calendar-update',
          data: state.calendarData,
        }, '*');
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
    state.calendarData = res.data;
    state.eventsByDate = buildEventsMap(res.data);
  }

  function buildEventsMap(data) {
    var map = new Map();
    var events = data && Array.isArray(data.events) ? data.events : [];
    for (var i = 0; i < events.length; i++) {
      if (events[i] && events[i].date) map.set(events[i].date, events[i]);
    }
    return map;
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
      $('statusSelect').value = ev && ev.status ? ev.status : 'available';
      $('descInput').value = ev && typeof ev.description === 'string' ? ev.description : '';
      $('saveBtn').disabled = false;
      $('clearBtn').disabled = !has;
    } else {
      form.style.display = 'none';
      $('saveBtn').disabled = true;
      $('clearBtn').disabled = true;
    }
  }

  // ── Calendar save (LOCAL — instant preview) ───────────────────────

  function saveCalendarEvent() {
    if (!state.selectedDate) return;
    var status = $('statusSelect').value;
    var description = $('descInput').value || '';
    var data = JSON.parse(JSON.stringify(state.calendarData));
    var events = Array.isArray(data.events) ? data.events : [];
    var idx = events.findIndex(function (e) { return e && e.date === state.selectedDate; });
    var next = { date: state.selectedDate, status: status, description: description };
    if (idx >= 0) events[idx] = next; else events.push(next);
    events.sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
    data.events = events;
    try { validateCalendarData(data); } catch (e) { showError('驗證失敗：' + e.message); return; }

    state.calendarData = data;
    state.eventsByDate = buildEventsMap(data);
    dirty.calendar = true;
    updatePublishButton();

    var statusText = status === 'available' ? '可預訂' : (status === 'unavailable' ? '不可預訂' : '休息');
    showSuccess('已儲存（本地）：' + state.selectedDate + ' (' + statusText + ')');
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

  function openImageEditPanel(type, index) {
    clearError(); clearSuccess();
    var item = state.imageData[type].items[index];
    if (!item) return;
    state.editingImageIndex = index;
    $('selectedImage').textContent = '選取圖片：' + (item.name || '未命名');
    $('imageNameInput').value = item.name || '';
    $('imageNameEnInput').value = item.name_en || '';
    if (item.prices && typeof item.prices === 'object') {
      $('imagePriceSize6Input').value = item.prices.size6 || '';
      $('imagePriceSize8Input').value = item.prices.size8 || '';
      $('imagePriceSliceInput').value = item.prices.slice || '';
    } else {
      $('imagePriceSize6Input').value = '';
      $('imagePriceSize8Input').value = item.price || '';
      $('imagePriceSliceInput').value = '';
    }
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
    if (Object.keys(prices).length > 0) { item.prices = prices; delete item.price; }
    else { delete item.prices; delete item.price; }
    item.description = $('imageDescInput').value.trim();
    item.description_en = $('imageDescEnInput').value.trim();
    var tags = [];
    document.querySelectorAll('.tag-checkboxes input[type="checkbox"]:checked').forEach(function (cb) { tags.push(cb.value); });
    item.tags = tags;

    // Track rename intent — don't change item.image now (preview still needs old path)
    // The actual rename happens on publish
    var expectedFilename = getImageFilename(name);
    var currentFilename = (item._oldImage || item.image).split('/').pop();
    if (currentFilename !== expectedFilename) {
      if (!item._oldImage) item._oldImage = item.image; // remember original path
    }

    dirty[type] = true;
    updatePublishButton();

    $('selectedImage').textContent = '選取圖片：' + name;
    showSuccess('已儲存（本地）：' + name);
    sendImageDataToPreview(type);
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
    sendImageDataToPreview(type);
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

      // 5. Handle renames (_oldImage → new filename based on item.name)
      var renameDeletes = [];
      for (var ri = 0; ri < ['seasonal', 'products'].length; ri++) {
        var rType = ['seasonal', 'products'][ri];
        for (var rj = 0; rj < state.imageData[rType].items.length; rj++) {
          var rItem = state.imageData[rType].items[rj];
          if (rItem._oldImage) {
            var rImageDir = rType === 'seasonal' ? 'assets/images/seasonal' : 'assets/images/products';
            var rNewFilename = getImageFilename(rItem.name);
            var rNewPath = rImageDir + '/' + rNewFilename;
            // Copy old file to new path
            try {
              var rOldRepoPath = SITE + '/' + rItem._oldImage;
              var rFileData = await fetch(
                'https://api.github.com/repos/' + GitHubAPI.OWNER + '/' + GitHubAPI.REPO + '/contents/' + rOldRepoPath + '?ref=' + GitHubAPI.BRANCH,
                { headers: { Authorization: 'token ' + GitHubAPI.getToken(), Accept: 'application/vnd.github+json' } }
              ).then(function (r) { return r.json(); });
              changes.push({ path: SITE + '/' + rNewPath, content: rFileData.content.replace(/\n/g, ''), encoding: 'base64' });
              renameDeletes.push(rOldRepoPath);
            } catch (e) {
              logStatus('⚠️ 無法讀取舊圖片進行重命名：' + e.message);
            }
            // Update item.image to new path
            rItem.image = rNewPath;
            delete rItem._oldImage;
          }
        }
      }

      // Re-generate JSON data after renames applied
      if (dirty.seasonal) {
        var sData2 = { schema_version: 1, items: cleanItemsForCommit(state.imageData.seasonal.items) };
        // Find and replace the seasonal JSON in changes
        for (var ci = 0; ci < changes.length; ci++) {
          if (changes[ci].path === SITE + '/assets/data/seasonal-data.json') {
            changes[ci].content = JSON.stringify(sData2, null, 2) + '\n';
            break;
          }
        }
      }
      if (dirty.products) {
        var pData2 = { schema_version: 1, items: cleanItemsForCommit(state.imageData.products.items) };
        for (var ci2 = 0; ci2 < changes.length; ci2++) {
          if (changes[ci2].path === SITE + '/assets/data/products-data.json') {
            changes[ci2].content = JSON.stringify(pData2, null, 2) + '\n';
            break;
          }
        }
      }

      // Commit all changes
      if (changes.length > 0) {
        var msg = '更新：' + parts.join('、');
        await GitHubAPI.commitMultipleFiles(changes, msg);
        logStatus('✅ 已 commit：' + msg);
      }

      // Delete files (renames + explicit deletes) — must be after commit
      var allDeletes = renameDeletes.concat(dirty.pendingDeletes);
      for (var k = 0; k < allDeletes.length; k++) {
        try {
          await GitHubAPI.deleteFile(allDeletes[k], '刪除：' + allDeletes[k].split('/').pop());
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

      showSuccess('已發布！網站將在約 30 秒後更新。');
    } catch (e) {
      showError('發布失敗：' + (e.message || String(e)));
    } finally {
      state.saving = false;
      setButtonLoading(btn, false);
      updatePublishButton();
    }
  }

  // Remove internal fields before committing
  function cleanItemsForCommit(items) {
    return items.map(function (item) {
      var clean = Object.assign({}, item);
      delete clean._previewUrl;
      delete clean._oldImage;
      delete clean._sha;
      return clean;
    });
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
        if (!hasPrices && !(item.price && item.price.trim())) mf.push('價格');
        if (!item.description || !item.description.trim()) mf.push('描述');
        if (!item.description_en || !item.description_en.trim()) mf.push('描述 (英文)');
        if (!item.tags || item.tags.length === 0) mf.push('標籤');
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
    if (e.origin !== location.origin) return;
    if (!e.data || typeof e.data !== 'object' || !e.data.type) return;
    if (e.data.type === 'gallery-reorder') {
      var type = state.currentTab === 'seasonal' ? 'seasonal' : 'products';
      if (typeof e.data.fromIndex === 'number' && typeof e.data.toIndex === 'number') reorderImages(type, e.data.fromIndex, e.data.toIndex);
    } else if (e.data.type === 'gallery-edit') {
      var type2 = state.currentTab === 'seasonal' ? 'seasonal' : 'products';
      var items = state.imageData[type2] && state.imageData[type2].items;
      if (typeof e.data.index === 'number' && items && e.data.index < items.length) openImageEditPanel(type2, e.data.index);
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
