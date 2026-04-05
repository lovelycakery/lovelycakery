/* global GitHubAPI, ImageCompress */

// Lovely Admin — Web-based admin application logic
// Ported from admin/ui/app.js, adapted from Electron IPC to GitHub API
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  // ── Site path prefix (relative to repo root) ──────────────────────
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
    saving: false, // prevents double-save
  };

  // ── Helpers: sanitize (ported from main.js) ───────────────────────

  function sanitizeFilename(name) {
    return String(name || '')
      .replace(/[/\\:*?"<>|]/g, '-')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function getImageFilename(name) {
    const sanitized = sanitizeFilename(name);
    return sanitized ? sanitized + '.jpg' : 'untitled.jpg';
  }

  // ── Helpers: calendar validation (ported from main.js) ────────────

  function validateCalendarData(data) {
    if (!data || typeof data !== 'object') throw new Error('calendar-data.json must be an object.');
    var events = data.events;
    if (!Array.isArray(events)) throw new Error('calendar-data.json must contain an "events" array.');
    var allowedStatus = ['available', 'unavailable', 'closed'];
    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      if (!ev || typeof ev !== 'object') throw new Error('Each event must be an object.');
      if (typeof ev.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(ev.date)) {
        throw new Error('Invalid event.date: ' + String(ev.date));
      }
      if (typeof ev.status !== 'string' || allowedStatus.indexOf(ev.status) === -1) {
        throw new Error('Invalid event.status for ' + ev.date + ': ' + String(ev.status));
      }
      if (typeof ev.description !== 'string') {
        throw new Error('Invalid event.description for ' + ev.date + ': must be a string.');
      }
    }
  }

  // ── Helpers: image data validation (ported from main.js) ──────────

  function validateImageData(data) {
    if (!data || typeof data !== 'object') throw new Error('Data must be an object');
    if (!Array.isArray(data.items)) throw new Error('Data must contain items array');
    var allowedTags = ['無', '奶蛋素', '無咖啡因', '含酒精'];
    for (var i = 0; i < data.items.length; i++) {
      var item = data.items[i];
      if (!item || typeof item !== 'object') throw new Error('Each item must be an object');
      if (typeof item.name !== 'string') throw new Error('Item name must be a string');
      if (typeof item.image !== 'string') throw new Error('Item image path must be a string');
      if (!Array.isArray(item.tags)) throw new Error('Item tags must be an array');
      for (var j = 0; j < item.tags.length; j++) {
        if (allowedTags.indexOf(item.tags[j]) === -1) throw new Error('Invalid tag: ' + item.tags[j]);
      }
    }
  }

  // ── Helpers: cache version (ported from main.js) ──────────────────

  function computeNextCacheVersion(currentV) {
    var d = new Date();
    var y = d.getUTCFullYear();
    var m = String(d.getUTCMonth() + 1).padStart(2, '0');
    var day = String(d.getUTCDate()).padStart(2, '0');
    var today = '' + y + m + day;
    var nextSuffix = 1;
    var match = typeof currentV === 'string' ? currentV.match(/^(\d{8})-(\d+)$/) : null;
    if (match) {
      if (match[1] === today && Number.isFinite(Number(match[2]))) {
        nextSuffix = Number(match[2]) + 1;
      }
    }
    return today + '-' + nextSuffix;
  }

  // ── UI helpers ────────────────────────────────────────────────────

  function logStatus(msg) {
    var box = $('statusBox');
    if (!box) return;
    var ts = new Date().toLocaleString();
    box.textContent = '[' + ts + '] ' + msg + '\n' + (box.textContent || '');
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

  function showDeployHint() {
    var el = $('deployHint');
    if (el) {
      el.textContent = '已儲存到 GitHub。網站將在約 30 秒後自動更新。點擊「重新整理預覽」可手動更新。';
      el.style.display = 'flex';
      // Auto-hide after 15 seconds
      setTimeout(function () { if (el) el.style.display = 'none'; }, 15000);
    }
  }

  function setButtonLoading(btn, loading) {
    if (!btn) return;
    btn.disabled = loading;
    if (loading) {
      btn.dataset.origText = btn.textContent;
      btn.textContent = '處理中…';
    } else if (btn.dataset.origText) {
      btn.textContent = btn.dataset.origText;
      delete btn.dataset.origText;
    }
  }

  // ── Escape HTML (for modal innerHTML) ─────────────────────────────

  function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  // ── Login / Logout ────────────────────────────────────────────────

  async function handleLogin() {
    var token = $('tokenInput').value.trim();
    if (!token) {
      $('loginError').textContent = '請輸入 Token';
      return;
    }

    $('loginBtn').disabled = true;
    $('loginError').textContent = '驗證中…';

    GitHubAPI.setToken(token);

    var res = await GitHubAPI.validateToken();
    if (!res.ok) {
      $('loginError').textContent = res.error || 'Token 無效';
      GitHubAPI.clearToken();
      $('loginBtn').disabled = false;
      return;
    }

    var repoRes = await GitHubAPI.checkRepoAccess();
    if (!repoRes.ok) {
      $('loginError').textContent = '無法存取 repo：' + (repoRes.error || '權限不足');
      GitHubAPI.clearToken();
      $('loginBtn').disabled = false;
      return;
    }

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
    // The admin page is at site/admin.html, so the base is the same directory
    var loc = window.location;
    var base = loc.origin + loc.pathname.replace(/\/[^/]*$/, '');
    return base;
  }

  function reloadPreview() {
    var page = state.currentTab === 'calendar'
      ? 'calendar.html'
      : (state.currentTab === 'seasonal' ? 'seasonal.html' : 'all-items.html');
    var mode = state.currentMode === 'edit' ? 'edit' : 'preview';
    var iframe = $('previewFrame');
    iframe.src = getPreviewBaseUrl() + '/' + page + '?adminPreview=1&mode=' + mode + '&ts=' + Date.now();
    state.clickHookInstalled = false;
    if (state.hookTimer) {
      clearInterval(state.hookTimer);
      state.hookTimer = 0;
    }
  }

  // ── Calendar click hook (same approach as Electron — same-origin iframe) ──

  function tryInstallCalendarClickHook() {
    if (state.clickHookInstalled) return true;

    var outer = $('previewFrame');
    if (!outer || !outer.contentWindow || !outer.contentDocument) return false;

    var innerIframe = outer.contentDocument.querySelector('iframe.calendar-iframe');
    if (!innerIframe || !innerIframe.contentWindow || !innerIframe.contentDocument) return false;

    var doc = innerIframe.contentDocument;

    // Inject admin highlight style
    if (!doc.getElementById('lovely-admin-style')) {
      var style = doc.createElement('style');
      style.id = 'lovely-admin-style';
      style.textContent =
        '.calendar-day.lovely-admin-selected {' +
        '  outline: 3px solid rgba(212,165,116,0.95);' +
        '  outline-offset: 2px;' +
        '  box-shadow: 0 0 0 6px rgba(212,165,116,0.22);' +
        '}';
      if (doc.head) doc.head.appendChild(style);
    }

    doc.addEventListener('click', function (e) {
      try {
        var t = e && e.target ? e.target : null;
        var dayEl = t && t.closest ? t.closest('.calendar-day') : null;
        if (!dayEl) return;
        var date = dayEl.getAttribute('data-date') || '';
        if (!date) return;

        if (state.lastSelectedDayEl && state.lastSelectedDayEl !== dayEl) {
          state.lastSelectedDayEl.classList.remove('lovely-admin-selected');
        }
        dayEl.classList.add('lovely-admin-selected');
        state.lastSelectedDayEl = dayEl;

        e.preventDefault();
        e.stopPropagation();
        setSelectedDate(date);
      } catch (err) { /* ignore */ }
    }, true);

    state.clickHookInstalled = true;
    logStatus('✅ 日曆點擊已連結（可點日期編輯）');
    return true;
  }

  function startHookWatcher() {
    if (state.hookTimer) { clearInterval(state.hookTimer); state.hookTimer = 0; }
    var startedAt = Date.now();
    state.hookTimer = setInterval(function () {
      if (tryInstallCalendarClickHook()) {
        clearInterval(state.hookTimer);
        state.hookTimer = 0;
        return;
      }
      if (Date.now() - startedAt > 12000) {
        clearInterval(state.hookTimer);
        state.hookTimer = 0;
        logStatus('❌ 無法連結日曆點擊，請重新整理頁面再試。');
      }
    }, 250);
  }

  // ── Calendar data (GitHub API) ────────────────────────────────────

  async function refreshCalendarData() {
    var res = await GitHubAPI.getJSON(SITE + '/assets/data/calendar-data.json');
    state.calendarData = res.data;
    state.calendarDataSha = res.sha;
    state.eventsByDate = buildEventsMap(res.data);
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

  function setSelectedDate(dateStr) {
    state.selectedDate = dateStr || '';
    clearSuccess();

    var displayText = state.selectedDate ? '選取日期：' + state.selectedDate : '選取日期：尚未選取';
    $('selectedDate').textContent = displayText;

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

  async function saveCalendarEvent() {
    if (!state.selectedDate || state.saving) return;
    state.saving = true;
    var btn = $('saveBtn');
    setButtonLoading(btn, true);

    try {
      var status = $('statusSelect').value;
      var description = $('descInput').value || '';

      // Re-read latest data to avoid conflicts
      await refreshCalendarData();
      var data = JSON.parse(JSON.stringify(state.calendarData));
      var events = Array.isArray(data.events) ? data.events : [];

      var idx = events.findIndex(function (e) { return e && e.date === state.selectedDate; });
      var nextEvent = { date: state.selectedDate, status: status, description: description };
      if (idx >= 0) events[idx] = nextEvent;
      else events.push(nextEvent);
      events.sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
      data.events = events;

      validateCalendarData(data);

      // Build multi-file commit: calendar data + version bump
      var changes = [];

      // 1. Calendar data JSON
      changes.push({
        path: SITE + '/assets/data/calendar-data.json',
        content: JSON.stringify(data, null, 2) + '\n',
      });

      // 2. Version bump on HTML files
      var targets = ['calendar.html', 'calendar-widget-readonly.html'];
      var curMatch = null;
      for (var i = 0; i < targets.length; i++) {
        try {
          var file = await GitHubAPI.getFile(SITE + '/' + targets[i]);
          if (!curMatch) {
            var m = file.content.match(/\?v=([0-9]{8}-[0-9]+)/);
            curMatch = m ? m[1] : '';
          }
          var nextV = computeNextCacheVersion(curMatch);
          var updated = file.content.replace(/\?v=([0-9]{8}-[0-9]+)/g, '?v=' + nextV);
          if (updated !== file.content) {
            changes.push({ path: SITE + '/' + targets[i], content: updated });
          }
        } catch (e) {
          // File might not exist, skip
        }
      }

      var statusText = status === 'available' ? '可預訂' : (status === 'unavailable' ? '不可預訂' : '休息');
      await GitHubAPI.commitMultipleFiles(changes, '更新日曆：' + state.selectedDate + ' (' + statusText + ')');

      await refreshCalendarData();
      setSelectedDate(state.selectedDate);
      showSuccess('已儲存：' + state.selectedDate + ' (' + statusText + ')');
      showDeployHint();
    } catch (e) {
      showError('儲存失敗：' + (e.message || String(e)));
    } finally {
      state.saving = false;
      setButtonLoading(btn, false);
    }
  }

  async function clearCalendarEvent() {
    if (!state.selectedDate || !state.eventsByDate.has(state.selectedDate) || state.saving) return;
    if (!confirm('確定要清除 ' + state.selectedDate + ' 的日曆事件嗎？')) return;

    state.saving = true;
    var btn = $('clearBtn');
    setButtonLoading(btn, true);

    try {
      await refreshCalendarData();
      var data = JSON.parse(JSON.stringify(state.calendarData));
      data.events = (data.events || []).filter(function (e) { return !(e && e.date === state.selectedDate); });
      validateCalendarData(data);

      var changes = [];
      changes.push({
        path: SITE + '/assets/data/calendar-data.json',
        content: JSON.stringify(data, null, 2) + '\n',
      });

      // Version bump
      var targets = ['calendar.html', 'calendar-widget-readonly.html'];
      var curMatch = null;
      for (var i = 0; i < targets.length; i++) {
        try {
          var file = await GitHubAPI.getFile(SITE + '/' + targets[i]);
          if (!curMatch) {
            var m = file.content.match(/\?v=([0-9]{8}-[0-9]+)/);
            curMatch = m ? m[1] : '';
          }
          var nextV = computeNextCacheVersion(curMatch);
          var updated = file.content.replace(/\?v=([0-9]{8}-[0-9]+)/g, '?v=' + nextV);
          if (updated !== file.content) {
            changes.push({ path: SITE + '/' + targets[i], content: updated });
          }
        } catch (e) { /* skip */ }
      }

      await GitHubAPI.commitMultipleFiles(changes, '清除日曆事件：' + state.selectedDate);
      var cleared = state.selectedDate;
      await refreshCalendarData();
      setSelectedDate(state.selectedDate);
      showSuccess('已清除：' + cleared);
      showDeployHint();
    } catch (e) {
      showError('清除失敗：' + (e.message || String(e)));
    } finally {
      state.saving = false;
      setButtonLoading(btn, false);
    }
  }

  // ── Image data (GitHub API) ───────────────────────────────────────

  async function loadImageData(type) {
    try {
      var filename = type === 'seasonal' ? 'seasonal-data.json' : 'products-data.json';
      var res = await GitHubAPI.getJSON(SITE + '/assets/data/' + filename);
      state.imageData[type] = res.data;
      state.imageData[type]._sha = res.sha;
    } catch (e) {
      logStatus('❌ 載入 ' + type + ' 資料失敗：' + (e.message || String(e)));
    }
  }

  async function saveImageData(type, commitMsg) {
    var filename = type === 'seasonal' ? 'seasonal-data.json' : 'products-data.json';
    var data = { schema_version: 1, items: state.imageData[type].items };
    validateImageData(data);

    await GitHubAPI.commitMultipleFiles(
      [{ path: SITE + '/assets/data/' + filename, content: JSON.stringify(data, null, 2) + '\n' }],
      commitMsg || ('更新' + (type === 'seasonal' ? '季節限定' : '全部品項') + '資料')
    );

    await loadImageData(type);
  }

  // ── Image edit panel ──────────────────────────────────────────────

  function openImageEditPanel(type, index) {
    clearError();
    clearSuccess();
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

    document.querySelectorAll('.tag-checkboxes input[type="checkbox"]').forEach(function (cb) {
      cb.checked = false;
    });
    if (item.tags && Array.isArray(item.tags)) {
      item.tags.forEach(function (tag) {
        var id = tag === '奶蛋素' ? 'tag-vegetarian' : (tag === '無咖啡因' ? 'tag-caffeine-free' : (tag === '含酒精' ? 'tag-alcohol' : ''));
        var cb = id ? $(id) : null;
        if (cb) cb.checked = true;
      });
    }

    $('imageEditForm').style.display = 'block';
    $('imageEditSaveBtn').disabled = false;
    $('imageEditDeleteBtn').disabled = false;

    // Notify iframe
    var iframe = $('previewFrame');
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage({ type: 'gallery-select', index: index }, '*');
    }

    // Focus name input
    requestAnimationFrame(function () {
      var input = $('imageNameInput');
      if (input) { input.focus(); input.select(); }
    });
  }

  function clearImageEditPanel() {
    state.editingImageIndex = -1;
    $('selectedImage').textContent = '選取圖片：尚未選取';
    $('imageNameInput').value = '';
    $('imageNameEnInput').value = '';
    $('imagePriceSize6Input').value = '';
    $('imagePriceSize8Input').value = '';
    $('imagePriceSliceInput').value = '';
    $('imageDescInput').value = '';
    $('imageDescEnInput').value = '';
    document.querySelectorAll('.tag-checkboxes input[type="checkbox"]').forEach(function (cb) { cb.checked = false; });
    $('imageEditForm').style.display = 'none';
    $('imageEditSaveBtn').disabled = true;
    $('imageEditDeleteBtn').disabled = true;

    var iframe = $('previewFrame');
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage({ type: 'gallery-select', index: -1 }, '*');
    }
  }

  async function saveImageEdit(type) {
    if (state.saving) return;
    var index = state.editingImageIndex;
    if (index < 0) return;

    var name = $('imageNameInput').value.trim();
    if (!name) { alert('請輸入圖片名稱'); return; }

    state.saving = true;
    var btn = $('imageEditSaveBtn');
    setButtonLoading(btn, true);

    var item = state.imageData[type].items[index];
    var originalName = item.name || '';

    try {
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
      document.querySelectorAll('.tag-checkboxes input[type="checkbox"]:checked').forEach(function (cb) {
        tags.push(cb.value);
      });
      item.tags = tags;

      // Handle filename rename if name changed
      var expectedFilename = getImageFilename(name);
      var currentFilename = item.image.split('/').pop();
      var changes = [];

      if (currentFilename !== expectedFilename) {
        // Need to rename: copy content to new path, delete old path
        // For GitHub API, we read the old file, create new blob, and delete old in one commit
        var imageDir = type === 'seasonal' ? 'assets/images/seasonal' : 'assets/images/products';
        var oldPath = SITE + '/' + item.image;
        var newPath = SITE + '/' + imageDir + '/' + expectedFilename;

        try {
          var oldFile = await GitHubAPI.getFile(oldPath);
          // Re-encode: the content from getFile is text, but we need the raw base64
          // Actually we need to fetch raw content for binary files
          // Use the blob approach instead
          var fileData = await fetch(
            'https://api.github.com/repos/' + GitHubAPI.OWNER + '/' + GitHubAPI.REPO + '/contents/' + oldPath + '?ref=' + GitHubAPI.BRANCH,
            { headers: { Authorization: 'token ' + GitHubAPI.getToken(), Accept: 'application/vnd.github+json' } }
          ).then(function (r) { return r.json(); });

          changes.push({ path: newPath, content: fileData.content.replace(/\n/g, ''), encoding: 'base64' });
          item.image = imageDir + '/' + expectedFilename;
        } catch (e) {
          // If rename fails, keep old path
          logStatus('⚠️ 無法重命名圖片檔案：' + e.message);
        }
      }

      // Save JSON data
      var filename = type === 'seasonal' ? 'seasonal-data.json' : 'products-data.json';
      var jsonData = { schema_version: 1, items: state.imageData[type].items };
      validateImageData(jsonData);
      changes.push({
        path: SITE + '/assets/data/' + filename,
        content: JSON.stringify(jsonData, null, 2) + '\n',
      });

      var typeName = type === 'seasonal' ? '季節限定' : '全部品項';
      await GitHubAPI.commitMultipleFiles(changes, '更新' + typeName + '：' + name);

      // If we renamed, delete the old file in a separate commit
      if (currentFilename !== expectedFilename && changes.length > 1) {
        try {
          await GitHubAPI.deleteFile(SITE + '/' + (type === 'seasonal' ? 'assets/images/seasonal' : 'assets/images/products') + '/' + currentFilename, '刪除舊圖片檔：' + currentFilename);
        } catch (e) {
          logStatus('⚠️ 舊檔案刪除失敗（可手動清理）：' + e.message);
        }
      }

      await loadImageData(type);
      $('selectedImage').textContent = '選取圖片：' + name;
      showSuccess('已更新：' + name);
      showDeployHint();
    } catch (e) {
      item.name = originalName;
      $('imageNameInput').value = originalName;
      showError('儲存失敗：' + (e.message || String(e)));
    } finally {
      state.saving = false;
      setButtonLoading(btn, false);
    }
  }

  async function deleteImage(type, index) {
    var item = state.imageData[type].items[index];
    if (!item) return;
    if (!confirm('確定要刪除「' + item.name + '」嗎？\n這會同時刪除圖片檔案和 JSON 記錄。')) return;

    if (state.saving) return;
    state.saving = true;
    var btn = $('imageEditDeleteBtn');
    setButtonLoading(btn, true);

    try {
      var deletedName = item.name;

      // Remove from array
      state.imageData[type].items.splice(index, 1);

      // Save JSON
      await saveImageData(type, '刪除圖片：' + deletedName);

      // Delete image file
      try {
        await GitHubAPI.deleteFile(SITE + '/' + item.image, '刪除圖片檔：' + item.image.split('/').pop());
      } catch (e) {
        logStatus('⚠️ 圖片檔案刪除失敗（可手動清理）：' + e.message);
      }

      clearImageEditPanel();
      showSuccess('已刪除：' + deletedName);
      showDeployHint();
    } catch (e) {
      showError('刪除失敗：' + (e.message || String(e)));
    } finally {
      state.saving = false;
      setButtonLoading(btn, false);
    }
  }

  // ── Image upload ──────────────────────────────────────────────────

  async function handleImageUpload(type, files) {
    if (!files || files.length === 0) return;
    if (state.saving) return;
    state.saving = true;

    try {
      var lastUploadedName = null;
      var imageDir = type === 'seasonal' ? 'assets/images/seasonal' : 'assets/images/products';

      for (var i = 0; i < files.length; i++) {
        var file = files[i];
        var baseName = file.name.replace(/\.[^.]+$/, '') || 'untitled';
        var sanitized = sanitizeFilename(baseName);
        var filename = getImageFilename(sanitized);

        logStatus('⏳ 壓縮圖片：' + file.name + '…');

        try {
          var compressed = await ImageCompress.compress(file);
          var changes = [];

          // Upload image
          changes.push({
            path: SITE + '/' + imageDir + '/' + filename,
            content: compressed.base64,
            encoding: 'base64',
          });

          // Add to items and save JSON
          var newItem = {
            image: imageDir + '/' + filename,
            name: sanitized,
            name_en: '',
            prices: { size6: '', size8: '', slice: '' },
            description: '',
            description_en: '',
            tags: [],
          };
          state.imageData[type].items.push(newItem);

          var jsonFilename = type === 'seasonal' ? 'seasonal-data.json' : 'products-data.json';
          var jsonData = { schema_version: 1, items: state.imageData[type].items };
          changes.push({
            path: SITE + '/assets/data/' + jsonFilename,
            content: JSON.stringify(jsonData, null, 2) + '\n',
          });

          var typeName = type === 'seasonal' ? '季節限定' : '全部品項';
          await GitHubAPI.commitMultipleFiles(changes, '新增' + typeName + '圖片：' + sanitized);

          logStatus('✅ 已上傳：' + file.name + ' → ' + filename);
          lastUploadedName = sanitized;
        } catch (e) {
          showError('上傳失敗：' + (e.message || String(e)));
        }
      }

      // Reload data and select last uploaded
      await loadImageData(type);

      if (lastUploadedName) {
        var idx = state.imageData[type].items.findIndex(function (it) {
          return it.name === lastUploadedName;
        });
        if (idx >= 0) {
          openImageEditPanel(type, idx);
          state.scrollToImageIndex = idx;
        }
        showSuccess('已上傳圖片：' + lastUploadedName);
        showDeployHint();
      }
    } catch (e) {
      showError('上傳處理失敗：' + (e.message || String(e)));
    } finally {
      state.saving = false;
    }
  }

  // ── Image reorder ─────────────────────────────────────────────────

  async function reorderImages(type, fromIndex, toIndex) {
    if (state.saving) return;
    state.saving = true;

    try {
      var items = state.imageData[type].items;
      var moved = items.splice(fromIndex, 1)[0];
      items.splice(toIndex, 0, moved);

      var typeName = type === 'seasonal' ? '季節限定' : '全部品項';
      await saveImageData(type, '重新排序' + typeName);
      showSuccess('已重新排序');
      showDeployHint();
    } catch (e) {
      showError('排序失敗：' + (e.message || String(e)));
    } finally {
      state.saving = false;
    }
  }

  // ── Validation ────────────────────────────────────────────────────

  async function runValidation(type) {
    try {
      await loadImageData(type);
      var items = state.imageData[type].items || [];
      var issues = [];
      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        if (!item.name || !item.name.trim()) {
          issues.push(type + ' #' + (i + 1) + '：缺少名稱');
        }
      }
      if (issues.length === 0) {
        logStatus('✅ ' + (type === 'seasonal' ? '季節限定' : '全部品項') + ' 資料驗證通過');
      } else {
        logStatus('⚠️ 發現 ' + issues.length + ' 個問題：\n' + issues.join('\n'));
      }
    } catch (e) {
      logStatus('❌ 驗證失敗：' + (e.message || String(e)));
    }
  }

  function checkAllFields() {
    var missing = [];

    ['seasonal', 'products'].forEach(function (type) {
      var items = state.imageData[type].items || [];
      items.forEach(function (item, index) {
        var missingFields = [];
        var missingRequired = [];

        if (!item.name || !item.name.trim()) missingRequired.push('名稱');
        if (!item.name_en || !item.name_en.trim()) missingFields.push('名稱 (英文)');
        var hasPrices = item.prices && typeof item.prices === 'object' && (item.prices.size6 || item.prices.size8 || item.prices.slice);
        if (!hasPrices && !(item.price && item.price.trim())) missingFields.push('價格');
        if (!item.description || !item.description.trim()) missingFields.push('描述');
        if (!item.description_en || !item.description_en.trim()) missingFields.push('描述 (英文)');
        if (!item.tags || !Array.isArray(item.tags) || item.tags.length === 0) missingFields.push('標籤');

        if (missingRequired.length > 0 || missingFields.length > 0) {
          missing.push({
            type: type === 'seasonal' ? '季節限定' : '全部品項',
            name: item.name || '未命名',
            required: missingRequired,
            fields: missingFields,
          });
        }
      });
    });

    showCheckResultModal(missing);
  }

  function showCheckResultModal(missingItems) {
    var modal = $('checkResultModal');
    var title = missingItems.length === 0 ? '✅ 檢查完成' : '⚠️ 發現 ' + missingItems.length + ' 個圖片缺少欄位';
    $('checkResultModalTitle').textContent = title;

    var body = $('checkResultModalBody');
    if (missingItems.length === 0) {
      body.innerHTML = '<div style="text-align:center;padding:20px 0;color:var(--accent);">所有圖片都已填寫完整欄位！</div>';
    } else {
      var html = '';
      missingItems.forEach(function (m, idx) {
        html += '<div class="check-item">';
        html += '<div class="check-item-name">' + (idx + 1) + '. ' + escapeHtml(m.type) + ' - ' + escapeHtml(m.name) + '</div>';
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
    var esc = function (e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); } };
    document.addEventListener('keydown', esc);
  }

  // ── Tab / Mode switching ──────────────────────────────────────────

  function switchTab(tabName) {
    state.currentTab = tabName;

    if (tabName !== 'calendar' && state.hookTimer) {
      clearInterval(state.hookTimer);
      state.hookTimer = 0;
      state.clickHookInstalled = false;
    }

    document.querySelectorAll('.tab-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    clearError();
    clearSuccess();

    if (tabName === 'calendar') {
      $('calendarPanel').style.display = 'block';
      $('imagePanel').style.display = 'none';
    } else {
      $('calendarPanel').style.display = 'none';
      $('imagePanel').style.display = 'block';
      loadImageData(tabName);
      clearImageEditPanel();
    }

    reloadPreview();
  }

  function switchMode(mode) {
    state.currentMode = mode;
    var main = $('mainContainer');
    $('editModeBtn').classList.toggle('active', mode === 'edit');
    $('previewModeBtn').classList.toggle('active', mode === 'preview');
    $('topbarCenter').style.display = mode === 'preview' ? 'none' : 'flex';

    if (mode === 'preview') {
      main.classList.add('preview-mode');
      if (state.hookTimer) { clearInterval(state.hookTimer); state.hookTimer = 0; state.clickHookInstalled = false; }
    } else {
      main.classList.remove('preview-mode');
      if (state.currentTab === 'calendar') {
        state.clickHookInstalled = false;
        startHookWatcher();
      }
    }

    reloadPreview();
  }

  // ── PostMessage listener (from iframe) ────────────────────────────

  window.addEventListener('message', function (e) {
    if (e.origin !== location.origin) return;
    if (!e.data || typeof e.data !== 'object' || !e.data.type) return;

    if (e.data.type === 'gallery-reorder') {
      var type = state.currentTab === 'seasonal' ? 'seasonal' : 'products';
      if (typeof e.data.fromIndex === 'number' && typeof e.data.toIndex === 'number') {
        reorderImages(type, e.data.fromIndex, e.data.toIndex);
      }
    } else if (e.data.type === 'gallery-edit') {
      var type2 = state.currentTab === 'seasonal' ? 'seasonal' : 'products';
      var items = state.imageData[type2] && state.imageData[type2].items;
      if (typeof e.data.index === 'number' && items && e.data.index < items.length) {
        openImageEditPanel(type2, e.data.index);
      }
    }
  });

  // ── Init ──────────────────────────────────────────────────────────

  async function initApp() {
    // Mode buttons
    $('editModeBtn').addEventListener('click', function () { switchMode('edit'); });
    $('previewModeBtn').addEventListener('click', function () { switchMode('preview'); });

    // Status toggle
    var toggle = $('statusToggle');
    var box = $('statusBox');
    toggle.addEventListener('click', function () {
      var expanded = box.classList.contains('show');
      box.classList.toggle('show', !expanded);
      toggle.classList.toggle('expanded', !expanded);
    });

    // Tabs
    document.querySelectorAll('.tab-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { switchTab(btn.dataset.tab); });
    });

    // Calendar buttons
    $('saveBtn').addEventListener('click', saveCalendarEvent);
    $('clearBtn').addEventListener('click', clearCalendarEvent);

    // Image buttons
    $('imageEditSaveBtn').addEventListener('click', function () {
      if (state.currentTab === 'seasonal' || state.currentTab === 'products') {
        saveImageEdit(state.currentTab);
      }
    });
    $('imageEditDeleteBtn').addEventListener('click', function () {
      if (state.currentTab === 'seasonal' || state.currentTab === 'products') {
        deleteImage(state.currentTab, state.editingImageIndex);
      }
    });
    $('validateBtn').addEventListener('click', function () {
      if (state.currentTab === 'seasonal' || state.currentTab === 'products') {
        runValidation(state.currentTab);
      }
    });
    $('checkEnglishBtn').addEventListener('click', async function () {
      await loadImageData('seasonal');
      await loadImageData('products');
      checkAllFields();
    });

    // Image upload: drag-drop
    var uploadArea = $('imageUploadArea');
    var fileInput = $('imageFileInput');

    uploadArea.addEventListener('dragover', function (e) { e.preventDefault(); uploadArea.classList.add('dragover'); });
    uploadArea.addEventListener('dragleave', function () { uploadArea.classList.remove('dragover'); });
    uploadArea.addEventListener('drop', function (e) {
      e.preventDefault();
      uploadArea.classList.remove('dragover');
      var files = Array.from(e.dataTransfer.files || []);
      if (files.length > 0 && (state.currentTab === 'seasonal' || state.currentTab === 'products')) {
        handleImageUpload(state.currentTab, files);
      }
    });
    uploadArea.addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function () {
      var files = Array.from(fileInput.files || []);
      if (files.length > 0 && (state.currentTab === 'seasonal' || state.currentTab === 'products')) {
        handleImageUpload(state.currentTab, files);
      }
      fileInput.value = '';
    });

    // Logout
    $('logoutBtn').addEventListener('click', handleLogout);

    // iframe load handler
    var previewFrame = $('previewFrame');
    previewFrame.setAttribute('tabindex', '-1'); // Prevent auto-focus
    previewFrame.addEventListener('load', function () {
      if (state.currentTab === 'calendar' && state.currentMode === 'edit') {
        state.clickHookInstalled = false;
        startHookWatcher();
      }
      // Re-select image after reload
      if (state.editingImageIndex >= 0 && state.currentMode === 'edit' && previewFrame.contentWindow) {
        setTimeout(function () {
          previewFrame.contentWindow.postMessage({ type: 'gallery-select', index: state.editingImageIndex }, '*');
        }, 300);
      }
      if (state.scrollToImageIndex >= 0 && previewFrame.contentWindow) {
        setTimeout(function () {
          previewFrame.contentWindow.postMessage({ type: 'gallery-scroll-to', index: state.scrollToImageIndex }, '*');
          state.scrollToImageIndex = -1;
        }, 300);
      }
    });

    // Load initial data and start
    try {
      await refreshCalendarData();
      logStatus('✅ 日曆資料已載入');
    } catch (e) {
      logStatus('❌ 載入日曆資料失敗：' + (e.message || String(e)));
    }

    switchTab('calendar');
    switchMode('edit');
  }

  // ── Boot ──────────────────────────────────────────────────────────

  window.addEventListener('load', function () {
    // Login
    $('loginBtn').addEventListener('click', handleLogin);
    $('tokenInput').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') handleLogin();
    });

    // Check if already has token
    if (GitHubAPI.hasToken()) {
      // Auto-login
      GitHubAPI.validateToken().then(function (res) {
        if (res.ok) {
          showApp(res.login);
        } else {
          GitHubAPI.clearToken();
        }
      });
    }
  });
})();
