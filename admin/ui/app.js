/* global LovelyAdmin */

const $ = (id) => document.getElementById(id);

const state = {
  siteInfo: null,
  calendarData: null,
  eventsByDate: new Map(),
  selectedDate: '',
  clickHookInstalled: false,
  hookTimer: 0,
  lastSelectedDayEl: null,
  currentTab: 'calendar', // 'calendar' | 'seasonal' | 'products'
  currentMode: 'edit', // 'edit' | 'preview'
  imageData: {
    seasonal: { items: [] },
    products: { items: [] },
  },
  editingImageIndex: -1,
  scrollToImageIndex: -1, // 需要滾動到的圖片索引（-1 表示不需要滾動）
};

function logStatus(msg) {
  const box = $('statusBox');
  if (!box) return;
  
  const ts = new Date().toLocaleString();
  box.textContent = `[${ts}] ${msg}\n` + (box.textContent || '');
  // 狀態欄會正常記錄所有狀態，但不會自動展開
}

function showErrorMessage(msg) {
  const errorEl = $('errorMessage');
  if (errorEl) {
    errorEl.textContent = msg;
    errorEl.style.display = 'flex';
  }
  // 同時記錄到狀態欄
  logStatus(`⚠️ ${msg}`);
}

function clearErrorMessage() {
  const errorEl = $('errorMessage');
  if (errorEl) {
    errorEl.style.display = 'none';
    errorEl.textContent = '';
  }
}

function showSuccessMessage(msg) {
  const successEl = $('successMessage');
  const errorEl = $('errorMessage');
  if (successEl) {
    // 先清除錯誤訊息
    if (errorEl) {
      errorEl.style.display = 'none';
      errorEl.textContent = '';
    }
    // 顯示成功訊息
    successEl.textContent = msg;
    successEl.style.display = 'flex';
  }
  // 同時記錄到狀態欄
  logStatus(`✅ ${msg}`);
}

function clearSuccessMessage() {
  const successEl = $('successMessage');
  if (successEl) {
    successEl.style.display = 'none';
    successEl.textContent = '';
  }
}

function buildEventsMap(data) {
  const map = new Map();
  const events = data && Array.isArray(data.events) ? data.events : [];
  for (const ev of events) {
    if (!ev || !ev.date) continue;
    map.set(ev.date, ev);
  }
  return map;
}

async function refreshCalendarData() {
  const res = await LovelyAdmin.readCalendarData();
  if (!res || !res.ok) throw new Error('Failed to read calendar data.');
  state.calendarData = res.data;
  state.eventsByDate = buildEventsMap(res.data);
}

function setSelectedDate(dateStr) {
  state.selectedDate = dateStr || '';
  
  // 清除成功訊息
  clearSuccessMessage();
  
  // 更新顯示格式為「選取日期：（日期）」
  const displayText = state.selectedDate ? `選取日期：${state.selectedDate}` : '選取日期：尚未選取';
  $('selectedDate').textContent = displayText;

  const calendarEditForm = $('calendarEditForm');
  const calendarPanel = $('calendarPanel');
  
  // 關鍵修復：只在日曆分頁時才顯示/操作日曆相關元素
  // 如果不在日曆分頁，確保日曆面板和表單都隱藏，避免覆蓋圖片面板
  if (state.currentTab !== 'calendar') {
    if (calendarPanel) {
      calendarPanel.style.display = 'none';
    }
    if (calendarEditForm) {
      calendarEditForm.style.display = 'none';
    }
    return; // 提前返回，不執行後續邏輯
  }
  
  if (state.selectedDate) {
    // 有選取日期時，顯示編輯表單
    if (calendarEditForm) {
      calendarEditForm.style.display = 'block';
    }
    
    const has = state.eventsByDate.has(state.selectedDate);
    const ev = has ? state.eventsByDate.get(state.selectedDate) : null;

    $('statusSelect').value = ev && ev.status ? ev.status : 'available';
    $('descInput').value = ev && typeof ev.description === 'string' ? ev.description : '';

    $('saveBtn').disabled = false;
    // Clear button only enabled if date has an existing event
    $('clearBtn').disabled = !has;
  } else {
    // 沒有選取日期時，隱藏編輯表單
    if (calendarEditForm) {
      calendarEditForm.style.display = 'none';
    }
    
    $('saveBtn').disabled = true;
    $('clearBtn').disabled = true;
  }
}

function getPreviewBaseUrl() {
  // Same origin (admin server), site is mounted at /site
  return `${location.origin}/site`;
}

function reloadPreview() {
  const iframe = $('previewFrame');
  // Force refresh by adding a timestamp query.
  const url = `${getPreviewBaseUrl()}/calendar.html?adminPreview=1&ts=${Date.now()}`;
  iframe.src = url;
  state.clickHookInstalled = false;
  if (state.hookTimer) {
    clearInterval(state.hookTimer);
    state.hookTimer = 0;
  }
}

function tryInstallCalendarClickHook() {
  if (state.clickHookInstalled) return true;

  const outer = $('previewFrame');
  if (!outer || !outer.contentWindow || !outer.contentDocument) return false;

  // calendar.html contains iframe.calendar-iframe pointing to the widget
  const innerIframe = outer.contentDocument.querySelector('iframe.calendar-iframe');
  if (!innerIframe || !innerIframe.contentWindow || !innerIframe.contentDocument) return false;

  const doc = innerIframe.contentDocument;

  // Inject highlight styles once per iframe document (admin-only; does not ship to the site).
  try {
    if (!doc.getElementById('lovely-admin-style')) {
      const style = doc.createElement('style');
      style.id = 'lovely-admin-style';
      style.textContent = `
        .calendar-day.lovely-admin-selected {
          outline: 3px solid rgba(212, 165, 116, 0.95);
          outline-offset: 2px;
          box-shadow: 0 0 0 6px rgba(212, 165, 116, 0.22);
        }
      `;
      doc.head && doc.head.appendChild(style);
    }
  } catch (e) {
    // ignore
  }

  // Hook once, in capture phase, so we can treat all clicks as "edit" in admin context.
  doc.addEventListener(
    'click',
    (e) => {
      try {
        const t = e && e.target ? e.target : null;
        const dayEl = t && t.closest ? t.closest('.calendar-day') : null;
        if (!dayEl) return;
        const date = dayEl.getAttribute('data-date') || '';
        if (!date) return;

        // Visual selection highlight
        try {
          if (state.lastSelectedDayEl && state.lastSelectedDayEl !== dayEl) {
            state.lastSelectedDayEl.classList.remove('lovely-admin-selected');
          }
          dayEl.classList.add('lovely-admin-selected');
          state.lastSelectedDayEl = dayEl;
        } catch (e2) {
          // ignore
        }

        // Admin behavior: click always opens editor (sidebar), not tooltip.
        e.preventDefault();
        e.stopPropagation();
        setSelectedDate(date);
        logStatus(`選取日期：${date}`);
      } catch (err) {
        // ignore
      }
    },
    true
  );

  state.clickHookInstalled = true;
  logStatus('✅ 日曆點擊已連結（可點日期編輯）');
  return true;
}

function startHookWatcher(options = {}) {
  const maxWaitMs = typeof options.maxWaitMs === 'number' ? options.maxWaitMs : 12000;
  const intervalMs = typeof options.intervalMs === 'number' ? options.intervalMs : 250;

  if (state.hookTimer) {
    clearInterval(state.hookTimer);
    state.hookTimer = 0;
  }

  const startedAt = Date.now();
  let lastHintAt = 0;

  state.hookTimer = setInterval(() => {
    try {
      const ok = tryInstallCalendarClickHook();
      if (ok) {
        clearInterval(state.hookTimer);
        state.hookTimer = 0;
        return;
      }

      // Periodic hint so users understand why save is disabled.
      const elapsed = Date.now() - startedAt;
      if (elapsed - lastHintAt > 1500) {
        lastHintAt = elapsed;
        logStatus('⏳ 等待日曆載入（尚未連結點擊）…');
      }

      if (elapsed > maxWaitMs) {
        clearInterval(state.hookTimer);
        state.hookTimer = 0;
        logStatus(
          '❌ 無法連結日曆點擊。\n' +
            '請確認左側預覽日曆有正常顯示；若仍無法點選日期，請關閉工具後重開或回報此訊息。'
        );
      }
    } catch (e) {
      // ignore
    }
  }, intervalMs);
}

async function runPreflightAndReport() {
  const res = await LovelyAdmin.runPreflight();
  if (!res || !res.ok) {
    const errs = res && Array.isArray(res.errors) ? res.errors : ['Unknown preflight error'];
    logStatus('❌ 本機檢查失敗：\n' + errs.map((e) => `- ${e}`).join('\n'));
    return { ok: false, errors: errs };
  }
  logStatus('✅ 本機檢查通過');
  return { ok: true };
}

function switchTab(tabName) {
  state.currentTab = tabName;
  
  // Stop hook watcher if switching away from calendar
  if (tabName !== 'calendar' && state.hookTimer) {
    clearInterval(state.hookTimer);
    state.hookTimer = 0;
    state.clickHookInstalled = false;
  }
  
  // Update tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    if (btn.dataset.tab === tabName) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  
  // Show/hide panels
  clearErrorMessage(); // 切換分頁時清除錯誤訊息
  clearSuccessMessage(); // 切換分頁時清除成功訊息
  
  const calendarPanel = $('calendarPanel');
  const imagePanel = $('imagePanel');
  if (tabName === 'calendar') {
    calendarPanel.style.display = 'block';
    imagePanel.style.display = 'none';
  } else {
    calendarPanel.style.display = 'none';
    imagePanel.style.display = 'block';
    loadImageData(tabName);
    // 切換分頁時清空編輯面板
    clearImageEditPanel();
  }
  
  // Reload preview
  reloadPreviewForCurrentTab();
}

function reloadPreviewForCurrentTab() {
  const page = state.currentTab === 'calendar' ? 'calendar.html' : (state.currentTab === 'seasonal' ? 'seasonal.html' : 'all-items.html');
  const previewBase = getPreviewBaseUrl();
  const iframe = $('previewFrame');
  // 傳遞當前模式，讓 iframe 知道是編輯模式還是預覽模式
  const mode = state.currentMode === 'edit' ? 'edit' : 'preview';
  iframe.src = `${previewBase}/${page}?adminPreview=1&mode=${mode}&ts=${Date.now()}`;
}

// ============================================
// 監聽來自 iframe 的訊息（拖曳排序和點擊編輯）
// ============================================
// 重要：此處理器接收來自預覽 iframe 的兩種訊息：
// 1. 'gallery-reorder': 拖曳排序操作
// 2. 'gallery-edit': 點擊編輯操作
// 
// 安全檢查：
// - 只接受同源訊息（e.origin === location.origin）
// - 驗證訊息類型和參數有效性
// - 驗證當前標籤頁是否為 seasonal 或 products
// ============================================
window.addEventListener('message', async (e) => {
  // 安全檢查：只接受來自同源的訊息
  if (e.origin !== location.origin) {
    console.warn('Rejected message from different origin:', e.origin);
    return;
  }
  
  // 驗證訊息格式
  if (!e.data || typeof e.data !== 'object' || !e.data.type) {
    console.warn('Invalid message format:', e.data);
    return;
  }
  
  // 處理拖曳排序訊息
  if (e.data.type === 'gallery-reorder') {
    const { fromIndex, toIndex } = e.data;
    const type = state.currentTab === 'seasonal' ? 'seasonal' : 'products';
    
    // 驗證：只處理 seasonal 或 products 標籤頁
    if (type !== 'seasonal' && type !== 'products') {
      console.warn('Invalid tab for reorder:', state.currentTab);
      return;
    }
    
    // 驗證索引有效性
    if (typeof fromIndex !== 'number' || typeof toIndex !== 'number' ||
        fromIndex < 0 || toIndex < 0 || isNaN(fromIndex) || isNaN(toIndex)) {
      console.warn('Invalid indices for reorder:', { fromIndex, toIndex });
      logStatus(`❌ 排序失敗：無效的索引 (${fromIndex} → ${toIndex})`);
      return;
    }
    
    try {
      // 執行排序
      reorderImages(type, fromIndex, toIndex);
      // 成功訊息會在 updateImageData 中顯示
    } catch (err) {
      console.error('Reorder failed:', err);
      const errorMsg = err && err.message ? err.message : String(err);
      logStatus(`❌ 排序失敗：${errorMsg}`);
      showErrorMessage(`排序失敗：${errorMsg}`);
    }
  } 
  // 處理點擊編輯訊息
  else if (e.data.type === 'gallery-edit') {
    const { index } = e.data;
    const type = state.currentTab === 'seasonal' ? 'seasonal' : 'products';
    
    // 驗證：只處理 seasonal 或 products 標籤頁
    if (type !== 'seasonal' && type !== 'products') {
      console.warn('Invalid tab for edit:', state.currentTab);
      return;
    }
    
    // 驗證索引有效性
    if (typeof index !== 'number' || index < 0 || isNaN(index)) {
      console.warn('Invalid index for edit:', index);
      logStatus(`❌ 編輯失敗：無效的圖片索引 (${index})`);
      return;
    }
    
    // 驗證索引是否在範圍內
    const items = state.imageData[type] && state.imageData[type].items;
    if (!items || !Array.isArray(items) || index >= items.length) {
      console.warn('Index out of range:', { index, length: items ? items.length : 0 });
      logStatus(`❌ 編輯失敗：圖片索引超出範圍 (${index + 1}/${items ? items.length : 0})`);
      return;
    }
    
    try {
      // 關鍵修復：在打開編輯面板之前，立即強制移除 iframe 的焦點
      // 因為 postMessage 是從 iframe 發送的，此時焦點可能在 iframe 上
      const iframe = $('previewFrame');
      if (iframe && document.activeElement === iframe) {
        // 強制將焦點移開 iframe
        document.body.focus();
        // 使用 requestAnimationFrame 確保在下一幀執行，避免被 iframe 搶回焦點
        requestAnimationFrame(() => {
          document.body.focus();
        });
      }
      
      // 在右側面板中顯示編輯表單
      openImageEditPanel(type, index);
      logStatus(`📝 編輯圖片：${index + 1}`);
    } catch (err) {
      console.error('Open edit panel failed:', err);
      logStatus(`❌ 打開編輯失敗：${err && err.message ? err.message : String(err)}`);
    }
  } else {
    // 未知的訊息類型
    console.warn('Unknown message type:', e.data.type);
  }
});

function switchMode(mode) {
  state.currentMode = mode;
  const mainContainer = $('mainContainer');
  const editModeBtn = $('editModeBtn');
  const previewModeBtn = $('previewModeBtn');
  const topbarCenter = $('topbarCenter');
  
  if (mode === 'preview') {
    mainContainer.classList.add('preview-mode');
    editModeBtn.classList.remove('active');
    previewModeBtn.classList.add('active');
    topbarCenter.style.display = 'none';
    
    // 切換到預覽模式時，清除圖片選取狀態
    if ((state.currentTab === 'seasonal' || state.currentTab === 'products') && state.editingImageIndex >= 0) {
      const iframe = $('previewFrame');
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({
          type: 'gallery-select',
          index: -1, // -1 表示取消選取
        }, '*');
      }
    }
    
    // Stop hook watcher in preview mode
    if (state.hookTimer) {
      clearInterval(state.hookTimer);
      state.hookTimer = 0;
      state.clickHookInstalled = false;
    }
  } else {
    mainContainer.classList.remove('preview-mode');
    editModeBtn.classList.add('active');
    previewModeBtn.classList.remove('active');
    topbarCenter.style.display = 'flex';
    
    // 切換回編輯模式時，如果有選取的圖片，會在 iframe load 事件中重新標記
    
    // Restart hook watcher if on calendar tab
    if (state.currentTab === 'calendar') {
      state.clickHookInstalled = false;
      startHookWatcher({ maxWaitMs: 12000, intervalMs: 250 });
    }
  }
  
  // Reload preview to reflect mode change
  reloadPreviewForCurrentTab();
}

async function loadImageData(type) {
  try {
    const res = await LovelyAdmin.readImageData({ type });
    if (res && res.ok) {
      state.imageData[type] = res.data;
      // 不再需要渲染圖片列表，點擊圖片時直接在面板中編輯
    } else {
      logStatus(`❌ 無法載入 ${type} 資料`);
    }
  } catch (e) {
    logStatus(`❌ 載入 ${type} 資料失敗：${e && e.message ? e.message : String(e)}`);
  }
}

async function main() {
  state.siteInfo = await LovelyAdmin.getSiteInfo();

  // Initialize mode switcher
  $('editModeBtn').addEventListener('click', () => switchMode('edit'));
  $('previewModeBtn').addEventListener('click', () => switchMode('preview'));
  
  // Initialize status toggle
  const statusToggle = $('statusToggle');
  const statusBox = $('statusBox');
  if (statusToggle && statusBox) {
    // 狀態欄預設隱藏，只能手動點擊打開
    statusToggle.addEventListener('click', () => {
      const isExpanded = statusBox.classList.contains('show');
      if (isExpanded) {
        statusBox.classList.remove('show');
        statusToggle.classList.remove('expanded');
      } else {
        statusBox.classList.add('show');
        statusToggle.classList.add('expanded');
      }
    });
  }
  
  // Initialize image edit panel buttons (disabled by default)
  $('imageEditSaveBtn').disabled = true;
  $('imageEditDeleteBtn').disabled = true;

  // Initialize tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      switchTab(btn.dataset.tab);
    });
  });
  
  // Start with calendar tab in edit mode
  switchTab('calendar');
  switchMode('edit');
  
  await refreshCalendarData();

  const previewFrame = $('previewFrame');
  if (previewFrame) {
    // Re-install the click hook every time the preview reloads (only for calendar tab in edit mode).
    previewFrame.addEventListener('load', () => {
      // Only start hook watcher if we're on the calendar tab and in edit mode
      if (state.currentTab === 'calendar' && state.currentMode === 'edit') {
        state.clickHookInstalled = false;
        startHookWatcher({ maxWaitMs: 12000, intervalMs: 250 });
      }
      
      // 關鍵修復：如果不在日曆分頁，且正在編輯圖片，確保焦點不會停留在 iframe 上
      if ((state.currentTab === 'seasonal' || state.currentTab === 'products') && 
          state.editingImageIndex >= 0 && 
          state.currentMode === 'edit') {
        // 延遲一下，確保 iframe 完全載入
        setTimeout(() => {
          // 方法1：暫時移除 iframe 的 tabindex，防止它自動獲得焦點
          const originalTabIndex = previewFrame.getAttribute('tabindex');
          previewFrame.setAttribute('tabindex', '-1');
          
          // 方法2：如果焦點在 iframe 上，強制移開
          if (document.activeElement === previewFrame) {
            const nameInput = $('imageNameInput');
            if (nameInput && nameInput.offsetParent !== null) {
              nameInput.focus();
              nameInput.select();
            } else {
              document.body.focus();
            }
          }
          
          // 方法3：使用 requestAnimationFrame 確保在下一幀執行
          requestAnimationFrame(() => {
            const nameInput = $('imageNameInput');
            if (nameInput && nameInput.offsetParent !== null) {
              nameInput.focus();
              nameInput.select();
            }
            // 恢復 iframe 的 tabindex（如果需要）
            if (originalTabIndex !== null) {
              previewFrame.setAttribute('tabindex', originalTabIndex);
            } else {
              previewFrame.removeAttribute('tabindex');
            }
          });
        }, 100);
      }
      
      // 如果有需要滾動到的圖片索引，發送滾動消息
      if (state.scrollToImageIndex >= 0 && 
          (state.currentTab === 'seasonal' || state.currentTab === 'products') &&
          previewFrame.contentWindow) {
        // 使用 setTimeout 確保 iframe 內容已完全渲染
        setTimeout(() => {
          previewFrame.contentWindow.postMessage({
            type: 'gallery-scroll-to',
            index: state.scrollToImageIndex,
          }, '*');
          // 重置索引，避免重複滾動
          state.scrollToImageIndex = -1;
        }, 300);
      }
      
      // 如果已經有選取的圖片，且是編輯模式，重新標記選取狀態
      if (state.editingImageIndex >= 0 && 
          (state.currentTab === 'seasonal' || state.currentTab === 'products') &&
          state.currentMode === 'edit' &&
          previewFrame.contentWindow) {
        setTimeout(() => {
          previewFrame.contentWindow.postMessage({
            type: 'gallery-select',
            index: state.editingImageIndex,
          }, '*');
        }, 300);
      }
    });
  }

  // Also start the watcher right away if on calendar tab in edit mode (covers the case where load fires before listener is attached).
  if (state.currentTab === 'calendar' && state.currentMode === 'edit') {
    startHookWatcher({ maxWaitMs: 12000, intervalMs: 250 });
  }

  $('preflightBtn').addEventListener('click', async () => {
    await runPreflightAndReport();
  });

  $('saveBtn').addEventListener('click', async () => {
    if (!state.selectedDate) return;
    const status = $('statusSelect').value;
    const description = $('descInput').value || '';
    try {
      await LovelyAdmin.upsertCalendarEvent({ date: state.selectedDate, status, description });
      await LovelyAdmin.bumpCalendarVersion();
      await refreshCalendarData();
      const statusText = status === 'available' ? '可預訂' : status === 'unavailable' ? '不可預訂' : '休息';
      showSuccessMessage(`已儲存：${state.selectedDate} (${statusText})`);
      
      // 只在日曆分頁時才重新載入預覽，避免在其他分頁時重新載入 iframe 導致焦點問題
      if (state.currentTab === 'calendar') {
        reloadPreviewForCurrentTab();
      }
    } catch (e) {
      const errorMsg = e && e.message ? e.message : String(e);
      logStatus(`❌ 儲存失敗：${errorMsg}`);
      showErrorMessage(`儲存失敗：${errorMsg}`);
    }
  });

  $('clearBtn').addEventListener('click', async () => {
    if (!state.selectedDate || !state.eventsByDate.has(state.selectedDate)) return;
    
    // 使用 Electron dialog API（在主進程執行，不會影響渲染進程焦點）
    const result = await LovelyAdmin.confirmDialog({
      message: '確定要清除日曆事件嗎？',
      detail: `日期：${state.selectedDate}`,
    });
    
    if (!result || !result.ok) return;
    
    try {
      await LovelyAdmin.deleteCalendarEvent({ date: state.selectedDate });
      await LovelyAdmin.bumpCalendarVersion();
      await refreshCalendarData();
      const clearedDate = state.selectedDate; // 保存日期，因為 setSelectedDate 會清除成功訊息
      setSelectedDate(state.selectedDate);
      showSuccessMessage(`已清除：${clearedDate}`); // 在 setSelectedDate 之後顯示，避免被清除

      // 只在日曆分頁時才重新載入預覽
      if (state.currentTab === 'calendar') {
        reloadPreviewForCurrentTab();
      }
    } catch (e) {
      const errorMsg = e && e.message ? e.message : String(e);
      logStatus(`❌ 清除失敗：${errorMsg}`);
      showErrorMessage(`清除失敗：${errorMsg}`);
    }
  });

  $('publishBtn').addEventListener('click', async () => {
    const result = await LovelyAdmin.confirmDialog({
      message: '確定要一鍵發布嗎？',
      detail: '流程：本機檢查 → commit → push → CI 檢查通過才會部署。',
    });
    if (!result || !result.ok) return;

    const pre = await runPreflightAndReport();
    if (!pre.ok) return;

    try {
      const r = await LovelyAdmin.publish({ message: 'Update calendar data' });
      if (r && r.ok) {
        logStatus('✅ 已上傳（push）完成。CI 會自動檢查與部署。');
      } else {
        const phase = r && r.phase ? String(r.phase) : 'unknown';
        const m = r && r.message ? String(r.message) : 'Publish failed';
        const hint = r && r.authHint ? String(r.authHint) : '';
        logStatus(`❌ 發布失敗（階段：${phase}）：\n${m}${hint ? '\n\n' + hint : ''}\n\n請把完整錯誤訊息複製給我以便診斷。`);
      }
    } catch (e) {
      logStatus(`❌ 發布失敗：${e && e.message ? e.message : String(e)}`);
    }
  });
}

// renderImageList 已移除：不再需要圖片列表，點擊預覽頁面的圖片即可在右側面板編輯

async function validateImageData(type) {
  try {
    const res = await LovelyAdmin.validateImageData({ type });
    if (res && res.issues && res.issues.length > 0) {
      const issues = res.issues.map(i => `- ${i.message}`).join('\n');
      logStatus(`⚠️ ${type === 'seasonal' ? '季節限定' : '全部品項'} 資料驗證發現問題：\n${issues}`);
    } else {
      logStatus(`✅ ${type === 'seasonal' ? '季節限定' : '全部品項'} 資料驗證通過`);
    }
  } catch (e) {
    logStatus(`❌ 驗證失敗：${e && e.message ? e.message : String(e)}`);
  }
}

async function checkEnglishFields() {
  try {
    // 確保已經載入兩個類型的資料
    // 強制重新載入，確保數據是最新的
    await loadImageData('seasonal');
    await loadImageData('products');
    
    const missing = [];
    
    // 檢查季節限定
    const seasonalItems = state.imageData.seasonal?.items || [];
    seasonalItems.forEach((item, index) => {
      const missingFields = [];
      const missingRequired = [];
      
      // 必填欄位
      if (!item.name || item.name.trim() === '') {
        missingRequired.push('名稱');
      }
      
      // 建議填寫的欄位
      if (!item.name_en || item.name_en.trim() === '') {
        missingFields.push('名稱 (英文)');
      }
      // 檢查價格（支持新的 prices 結構和舊的 price 結構）
      const hasPrices = item.prices && typeof item.prices === 'object' && 
        (item.prices.size6 || item.prices.size8 || item.prices.slice);
      const hasOldPrice = item.price && item.price.trim() !== '';
      if (!hasPrices && !hasOldPrice) {
        missingFields.push('價格（至少填寫一個尺寸）');
      }
      if (!item.description || item.description.trim() === '') {
        missingFields.push('描述');
      }
      if (!item.description_en || item.description_en.trim() === '') {
        missingFields.push('描述 (英文)');
      }
      if (!item.tags || !Array.isArray(item.tags) || item.tags.length === 0) {
        missingFields.push('標籤');
      }
      
      if (missingRequired.length > 0 || missingFields.length > 0) {
        missing.push({
          type: '季節限定',
          name: item.name || '未命名',
          index: index,
          required: missingRequired,
          fields: missingFields,
        });
      }
    });
    
    // 檢查全部品項
    const productsItems = state.imageData.products?.items || [];
    productsItems.forEach((item, index) => {
      const missingFields = [];
      const missingRequired = [];
      
      // 必填欄位
      if (!item.name || item.name.trim() === '') {
        missingRequired.push('名稱');
      }
      
      // 建議填寫的欄位
      if (!item.name_en || item.name_en.trim() === '') {
        missingFields.push('名稱 (英文)');
      }
      // 檢查價格（支持新的 prices 結構和舊的 price 結構）
      const hasPrices = item.prices && typeof item.prices === 'object' && 
        (item.prices.size6 || item.prices.size8 || item.prices.slice);
      const hasOldPrice = item.price && item.price.trim() !== '';
      if (!hasPrices && !hasOldPrice) {
        missingFields.push('價格（至少填寫一個尺寸）');
      }
      if (!item.description || item.description.trim() === '') {
        missingFields.push('描述');
      }
      if (!item.description_en || item.description_en.trim() === '') {
        missingFields.push('描述 (英文)');
      }
      if (!item.tags || !Array.isArray(item.tags) || item.tags.length === 0) {
        missingFields.push('標籤');
      }
      
      if (missingRequired.length > 0 || missingFields.length > 0) {
        missing.push({
          type: '全部品項',
          name: item.name || '未命名',
          index: index,
          required: missingRequired,
          fields: missingFields,
        });
      }
    });
    
    // 構建狀態欄訊息（完整列表）
    const requiredCount = missing.filter(m => m.required.length > 0).length;
    const statusLines = ['📋 欄位檢查結果：'];
    if (missing.length > 0) {
      statusLines.push(`共發現 ${missing.length} 個圖片缺少欄位（其中 ${requiredCount} 個缺少必填欄位）：\n`);
      
      missing.forEach((m, idx) => {
        statusLines.push(`${idx + 1}. ${m.type} - ${m.name}`);
        if (m.required.length > 0) {
          statusLines.push(`   ⚠️ 必填缺少：${m.required.join('、')}`);
        }
        if (m.fields.length > 0) {
          statusLines.push(`   ⚠️ 建議填寫：${m.fields.join('、')}`);
        }
      });
    } else {
      statusLines.push('所有圖片都已填寫完整欄位！');
    }
    
    // 記錄到狀態欄
    logStatus(statusLines.join('\n'));
    
    // 顯示結果
    if (missing.length === 0) {
      showCheckResultModal(
        '✅ 檢查完成',
        '所有圖片都已填寫完整欄位！',
        []
      );
    } else {
      showCheckResultModal(
        `⚠️ 發現 ${missing.length} 個圖片缺少欄位`,
        `共發現 ${missing.length} 個圖片缺少欄位（其中 ${requiredCount} 個缺少必填欄位）`,
        missing
      );
    }
  } catch (e) {
    const errorMsg = e && e.message ? e.message : String(e);
    logStatus(`❌ 檢查欄位失敗：${errorMsg}`);
    showErrorMessage(`檢查失敗：${errorMsg}`);
  }
}

function showCheckResultModal(title, summary, missingItems) {
  const modal = $('checkResultModal');
  const modalTitle = $('checkResultModalTitle');
  const modalBody = $('checkResultModalBody');
  const modalClose = $('checkResultModalClose');
  const modalOk = $('checkResultModalOk');
  const modalOverlay = modal.querySelector('.check-result-modal__overlay');
  
  modalTitle.textContent = title;
  
  // 構建內容
  let bodyHTML = `<div style="margin-bottom: 12px; color: var(--muted);">${summary}</div>`;
  
  if (missingItems.length === 0) {
    bodyHTML += '<div style="text-align: center; padding: 20px 0; color: var(--accent);">✅ 完美！</div>';
  } else {
    bodyHTML += '<div style="margin-top: 16px;">';
    missingItems.forEach((m, idx) => {
      bodyHTML += '<div class="check-item">';
      bodyHTML += `<div class="check-item-name">${idx + 1}. ${m.type} - ${m.name}</div>`;
      
      if (m.required.length > 0) {
        bodyHTML += `<div class="check-item-field">⚠️ 必填缺少：${m.required.join('、')}</div>`;
      }
      if (m.fields.length > 0) {
        bodyHTML += `<div class="check-item-field">⚠️ 建議填寫：${m.fields.join('、')}</div>`;
      }
      
      bodyHTML += '</div>';
    });
    bodyHTML += '</div>';
  }
  
  modalBody.innerHTML = bodyHTML;
  
  // 顯示對話框
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  
  // 關閉對話框的函數
  const closeModal = () => {
    modal.style.display = 'none';
    document.body.style.overflow = '';
  };
  
  // 綁定關閉事件
  modalClose.onclick = closeModal;
  modalOk.onclick = closeModal;
  modalOverlay.onclick = closeModal;
  
  // ESC 鍵關閉
  const escHandler = (e) => {
    if (e.key === 'Escape' && modal.style.display === 'flex') {
      closeModal();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);
}

// 更新選取圖片顯示的輔助函數
function updateSelectedImageDisplay(imageName) {
  const displayText = imageName ? `選取圖片：${imageName}` : '選取圖片：尚未選取';
  $('selectedImage').textContent = displayText;
}

function openImageEditPanel(type, index) {
  clearErrorMessage(); // 清除錯誤訊息
  clearSuccessMessage(); // 清除成功訊息
  
  const item = state.imageData[type].items[index];
  if (!item) return;
  
  state.editingImageIndex = index;
  
  // 更新選取的圖片顯示（合併為一行）
  updateSelectedImageDisplay(item.name || '未命名');
  
  // 填充表單
  $('imageNameInput').value = item.name || '';
  $('imageNameEnInput').value = item.name_en || '';
  
  // 處理價格（支持新的 prices 結構和舊的 price 結構）
  if (item.prices && typeof item.prices === 'object') {
    $('imagePriceSize6Input').value = item.prices.size6 || '';
    $('imagePriceSize8Input').value = item.prices.size8 || '';
    $('imagePriceSliceInput').value = item.prices.slice || '';
  } else if (item.price) {
    // 向後兼容：如果有舊的 price，將其設為 8吋的價格
    $('imagePriceSize6Input').value = '';
    $('imagePriceSize8Input').value = item.price || '';
    $('imagePriceSliceInput').value = '';
  } else {
    $('imagePriceSize6Input').value = '';
    $('imagePriceSize8Input').value = '';
    $('imagePriceSliceInput').value = '';
  }
  
  $('imageDescInput').value = item.description || '';
  $('imageDescEnInput').value = item.description_en || '';
  
  // Reset checkboxes
  document.querySelectorAll('.tag-checkboxes input[type="checkbox"]').forEach(cb => {
    cb.checked = false;
  });
  
  // Set checkboxes from tags
  if (item.tags && Array.isArray(item.tags)) {
    item.tags.forEach(tag => {
      const cb = document.querySelector(`#tag-${tag === '奶蛋素' ? 'vegetarian' : tag === '無咖啡因' ? 'caffeine-free' : tag === '含酒精' ? 'alcohol' : ''}`);
      if (cb) cb.checked = true;
    });
  }
  
  // 顯示編輯表單
  $('imageEditForm').style.display = 'block';
  
  // 啟用按鈕
  $('imageEditSaveBtn').disabled = false;
  $('imageEditDeleteBtn').disabled = false;
  
  // 通知 iframe 標記選取的圖片
  const iframe = $('previewFrame');
  if (iframe && iframe.contentWindow) {
    iframe.contentWindow.postMessage({
      type: 'gallery-select',
      index: index,
    }, '*');
  }
  
  // 強制聚焦到輸入框，確保即使焦點在 iframe 上也能正常輸入
  // 使用多層延遲和重試機制，確保焦點能正確轉移
  const focusInput = () => {
    const nameInput = $('imageNameInput');
    if (!nameInput || nameInput.offsetParent === null) return false; // 元素不可見
    
    // 先嘗試移除 iframe 的焦點（如果有的話）
    const iframe = $('previewFrame');
    if (iframe && (document.activeElement === iframe || document.activeElement === iframe.contentDocument?.activeElement)) {
      // 強制將焦點移開 iframe
      document.body.focus();
      // 使用 requestAnimationFrame 確保在下一幀執行
      requestAnimationFrame(() => {
        document.body.focus();
      });
    }
    
    // 聚焦到輸入框
    nameInput.focus();
    
    // 檢查是否成功
    if (document.activeElement === nameInput) {
      nameInput.select(); // 選中現有文字，方便直接輸入
      return true;
    }
    return false;
  };
  
  // 立即嘗試一次
  if (!focusInput()) {
    // 如果失敗，使用 requestAnimationFrame 在下一幀再試
    requestAnimationFrame(() => {
      if (!focusInput()) {
        // 如果還是失敗，延遲再試
        setTimeout(() => {
          if (!focusInput()) {
            // 如果還是失敗，再延遲一次（可能是 iframe 正在載入）
            setTimeout(() => {
              focusInput();
            }, 200);
          }
        }, 100);
      }
    });
  }
}

function clearImageEditPanel() {
  state.editingImageIndex = -1;
  updateSelectedImageDisplay(null); // 使用輔助函數更新顯示
  $('imageNameInput').value = '';
  $('imageNameEnInput').value = '';
  $('imagePriceSize6Input').value = '';
  $('imagePriceSize8Input').value = '';
  $('imagePriceSliceInput').value = '';
  $('imageDescInput').value = '';
  $('imageDescEnInput').value = '';
  
  // Reset checkboxes
  document.querySelectorAll('.tag-checkboxes input[type="checkbox"]').forEach(cb => {
    cb.checked = false;
  });
  
  // 隱藏編輯表單
  $('imageEditForm').style.display = 'none';
  
  // 禁用按鈕
  $('imageEditSaveBtn').disabled = true;
  $('imageEditDeleteBtn').disabled = true;
  
  // 通知 iframe 取消選取標記
  const iframe = $('previewFrame');
  if (iframe && iframe.contentWindow) {
    iframe.contentWindow.postMessage({
      type: 'gallery-select',
      index: -1, // -1 表示取消選取
    }, '*');
  }
}

async function saveImageEdit(type) {
  const name = $('imageNameInput').value.trim();
  const nameEn = $('imageNameEnInput').value.trim();
  const priceSize6 = $('imagePriceSize6Input').value.trim();
  const priceSize8 = $('imagePriceSize8Input').value.trim();
  const priceSlice = $('imagePriceSliceInput').value.trim();
  const description = $('imageDescInput').value.trim();
  const descriptionEn = $('imageDescEnInput').value.trim();
  
  if (!name) {
    await LovelyAdmin.alertDialog({
      message: '請輸入圖片名稱',
    });
    return;
  }
  
  const tags = [];
  document.querySelectorAll('.tag-checkboxes input[type="checkbox"]:checked').forEach(cb => {
    tags.push(cb.value);
  });
  
  const index = state.editingImageIndex;
  if (index < 0) return;
  
  const item = state.imageData[type].items[index];
  // 保存原始名稱，以便失敗時恢復
  const originalName = item.name || '';
  
  item.name = name;
  item.name_en = nameEn || ''; // 如果为空，保持空字符串，与现有数据结构一致
  
  // 處理價格（使用新的 prices 結構）
  const prices = {};
  if (priceSize6) prices.size6 = priceSize6;
  if (priceSize8) prices.size8 = priceSize8;
  if (priceSlice) prices.slice = priceSlice;
  
  // 如果有任何價格，使用新的 prices 結構，否則刪除價格欄位
  if (Object.keys(prices).length > 0) {
    item.prices = prices;
    // 移除舊的 price 欄位（如果存在）
    delete item.price;
  } else {
    // 如果沒有價格，刪除 prices 和 price
    delete item.prices;
    delete item.price;
  }
  
  item.description = description;
  item.description_en = descriptionEn || ''; // 如果为空，保持空字符串
  item.tags = tags;
  
  // Update will handle file renaming
  try {
    await updateImageData(type); // 這會顯示「已更新 季節限定/全部品項 資料」
    // 更新後保持編輯狀態，但更新選取的圖片顯示
    const updatedItem = state.imageData[type].items[index];
    if (updatedItem) {
      updateSelectedImageDisplay(updatedItem.name || '未命名');
    }
  } catch (e) {
    // 如果更新失敗（特別是重複命名錯誤），恢復原始名稱
    const errorMsg = e && e.message ? e.message : String(e);
    if (errorMsg.includes('目標檔名已存在') || errorMsg.includes('檔名已存在')) {
      // 恢復原始名稱到輸入欄位和資料
      item.name = originalName;
      $('imageNameInput').value = originalName;
      // 更新顯示
      updateSelectedImageDisplay(originalName || '未命名');
      // 顯示錯誤訊息
      showErrorMessage(errorMsg);
    } else {
      // 其他錯誤也顯示
      logStatus(`❌ 儲存失敗：${errorMsg}`);
      showErrorMessage(`儲存失敗：${errorMsg}`);
    }
    // 不再重新拋出錯誤，因為已經處理了
  }
}

async function updateImageData(type) {
  try {
    await LovelyAdmin.updateImageData({ type, items: state.imageData[type].items });
    await loadImageData(type);
    const typeName = type === 'seasonal' ? '季節限定' : '全部品項';
    showSuccessMessage(`已更新 ${typeName} 資料`);
    
    // Reload preview - 使用 reloadPreviewForCurrentTab 確保傳遞正確的 mode 參數
    // 這樣 iframe 重新載入後才能正確判斷是編輯模式還是預覽模式
    reloadPreviewForCurrentTab();
  } catch (e) {
    let errorMsg = e && e.message ? e.message : String(e);
    
    // 簡化錯誤訊息：去掉 "Error invoking remote method 'images:update': Error:" 前綴
    if (errorMsg.includes('Error invoking remote method')) {
      // 提取實際的錯誤訊息
      const match = errorMsg.match(/Error:\s*(.+)$/);
      if (match && match[1]) {
        errorMsg = `Error: ${match[1]}`;
      } else {
        // 如果沒有匹配到，嘗試提取最後的錯誤訊息
        const parts = errorMsg.split('Error:');
        if (parts.length > 1) {
          errorMsg = `Error: ${parts[parts.length - 1].trim()}`;
        }
      }
    }
    
    logStatus(`❌ 更新失敗：${errorMsg}`);
    // 如果是檔名衝突的錯誤，顯示在上方
    if (errorMsg.includes('目標檔名已存在') || errorMsg.includes('檔名已存在')) {
      showErrorMessage(errorMsg);
    }
    // 重新拋出錯誤，讓調用者可以處理
    throw e;
  }
}

async function deleteImage(type, index) {
  const item = state.imageData[type].items[index];
  if (!item) return;
  
  const result = await LovelyAdmin.confirmDialog({
    message: `確定要刪除「${item.name}」嗎？`,
    detail: '這會同時刪除檔案和 JSON 記錄。',
  });
  if (!result || !result.ok) return;
  
  try {
    // Delete file
    await LovelyAdmin.deleteImage({ type, imagePath: item.image });
    
    // Remove from array
    state.imageData[type].items.splice(index, 1);
    
    // Update JSON (這會顯示成功訊息，但我們要顯示刪除訊息)
    const typeName = type === 'seasonal' ? '季節限定' : '全部品項';
    try {
      await LovelyAdmin.updateImageData({ type, items: state.imageData[type].items });
      await loadImageData(type);
      showSuccessMessage(`已刪除圖片：${item.name}`);
      reloadPreviewForCurrentTab();
    } catch (e) {
      const errorMsg = e && e.message ? e.message : String(e);
      logStatus(`❌ 更新資料失敗：${errorMsg}`);
      showErrorMessage(`刪除失敗：${errorMsg}`);
      // 清空編輯面板
      clearImageEditPanel();
      return; // 不再繼續執行
    }
    
    // 清空編輯面板
    clearImageEditPanel();
  } catch (e) {
    const errorMsg = e && e.message ? e.message : String(e);
    logStatus(`❌ 刪除失敗：${errorMsg}`);
    showErrorMessage(`刪除失敗：${errorMsg}`);
    // 清空編輯面板
    clearImageEditPanel();
  }
}

function reorderImages(type, fromIndex, toIndex) {
  const items = state.imageData[type].items;
  const [moved] = items.splice(fromIndex, 1);
  items.splice(toIndex, 0, moved);
  // 使用自訂成功訊息
  updateImageData(type, `已重新排序：從位置 ${fromIndex + 1} 移動到位置 ${toIndex + 1}`);
}

function promptImageName(defaultName) {
  return new Promise((resolve) => {
    // 直接使用檔名（去掉副檔名）作為圖片名稱
    // 上傳後可以在右側面板編輯名稱
    const name = defaultName.replace(/\.[^.]+$/, '') || 'untitled';
    resolve(name.trim());
  });
}

async function handleDroppedFiles(type, files) {
  try {
    let lastUploadedImagePath = null; // 記錄最後上傳的圖片路徑
    
    for (const file of files) {
      try {
        // 在 Electron 33+ 中，file.path 已被移除，需要使用 webUtils.getPathForFile
        let filePath;
        if (file.path) {
          // 舊版本 Electron 可能還有 path 屬性
          filePath = file.path;
        } else if (LovelyAdmin.getPathForFile) {
          // 使用 webUtils.getPathForFile 獲取檔案路徑（Electron 33+）
          filePath = LovelyAdmin.getPathForFile(file);
        } else {
          logStatus(`❌ 無法獲取檔案路徑：${file.name || '未知檔案'}（不支援的 Electron 版本）`);
          continue;
        }
        
        // 驗證：必須有路徑
        if (!filePath) {
          logStatus(`❌ 無法獲取檔案路徑：${file.name || '未知檔案'}`);
          continue;
        }
        
        // 驗證：路徑必須看起來像完整路徑（包含路徑分隔符）
        if (!filePath.includes('/') && !filePath.includes('\\') && !filePath.match(/^[A-Za-z]:/)) {
          logStatus(`❌ 無效的檔案路徑：${filePath}`);
          continue;
        }
        
        const fileName = filePath.split(/[/\\]/).pop();
        logStatus(`⏳ 準備上傳：${fileName}...`);
        
        // 使用檔名（去掉副檔名）作為圖片名稱
        const name = await promptImageName(fileName);
        if (!name || !name.trim()) {
          logStatus(`❌ 跳過：${fileName}（無法產生有效名稱）`);
          continue;
        }
        
        const uploadRes = await LovelyAdmin.uploadImage({ 
          type, 
          filePath, 
          name: name.trim() 
        });
        
        if (uploadRes && uploadRes.ok) {
          // Add to items array
          const newItem = {
            image: uploadRes.imagePath,
            name: uploadRes.name,
            name_en: '',
            prices: {
              size6: '',
              size8: '',
              slice: '',
            },
            description: '',
            description_en: '',
            tags: [],
          };
          state.imageData[type].items.push(newItem);
          lastUploadedImagePath = uploadRes.imagePath; // 記錄最後上傳的圖片路徑
          logStatus(`✅ 已上傳：${fileName} → ${uploadRes.name}.jpg`);
        } else {
          const errorMsg = `上傳失敗：${fileName}`;
          logStatus(`❌ ${errorMsg}`);
          showErrorMessage(errorMsg);
        }
      } catch (e) {
        const errorMsg = e && e.message ? e.message : String(e);
        logStatus(`❌ 上傳失敗：${errorMsg}`);
        // 顯示錯誤訊息
        showErrorMessage(`上傳失敗：${errorMsg}`);
      }
    }
    
    // Update JSON after all uploads
    // 如果有上傳成功的圖片，顯示上傳成功訊息；否則顯示更新資料訊息
    if (lastUploadedImagePath && state.imageData[type] && state.imageData[type].items) {
      const uploadedItem = state.imageData[type].items.find(item => item.image === lastUploadedImagePath);
      const uploadedName = uploadedItem ? uploadedItem.name : '圖片';
      const typeName = type === 'seasonal' ? '季節限定' : '全部品項';
      await updateImageData(type, `已上傳圖片到 ${typeName}：${uploadedName}`);
    } else {
      await updateImageData(type);
    }
    
    // 如果有上傳成功的圖片，自動選取最後上傳的那一張並滾動到該位置
    if (lastUploadedImagePath && state.imageData[type] && state.imageData[type].items) {
      const index = state.imageData[type].items.findIndex(item => item.image === lastUploadedImagePath);
      if (index !== -1) {
        openImageEditPanel(type, index);
        
        // 設置需要滾動到的索引，iframe 載入完成後會自動滾動
        state.scrollToImageIndex = index;
      }
    }
  } catch (e) {
    const errorMsg = e && e.message ? e.message : String(e);
    logStatus(`❌ 處理拖曳檔案失敗：${errorMsg}`);
    showErrorMessage(`處理拖曳檔案失敗：${errorMsg}`);
  }
}

async function handleImageUpload(type) {
  try {
    // Use Electron dialog to select files
    const res = await LovelyAdmin.selectImageFiles();
    if (!res || !res.ok || !res.files || res.files.length === 0) {
      return;
    }
    
    // 將檔案路徑轉換為 File 物件格式（用於統一處理）
    const files = res.files.map(filePath => ({
      path: filePath,
      name: filePath.split(/[/\\]/).pop(),
    }));
    
    await handleDroppedFiles(type, files);
  } catch (e) {
    const errorMsg = e && e.message ? e.message : String(e);
    logStatus(`❌ 選擇檔案失敗：${errorMsg}`);
    showErrorMessage(`選擇檔案失敗：${errorMsg}`);
  }
}

window.addEventListener('load', () => {
  main().catch((e) => {
    logStatus(`❌ 啟動失敗：${e && e.message ? e.message : String(e)}`);
  });
  
  // Image upload handlers
  const uploadArea = $('imageUploadArea');
  
  uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
  });
  
  uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragover');
  });
  
  uploadArea.addEventListener('drop', async (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    
    if (state.currentTab !== 'seasonal' && state.currentTab !== 'products') {
      return;
    }
    
    // 獲取拖曳的檔案
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length === 0) {
      // 如果沒有檔案，回退到檔案選擇對話框
      await handleImageUpload(state.currentTab);
      return;
    }
    
    // 處理拖曳的檔案
    await handleDroppedFiles(state.currentTab, files);
  });
  
  // 單一點擊監聽器：使用 Electron dialog 選擇檔案
  uploadArea.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (state.currentTab === 'seasonal' || state.currentTab === 'products') {
      await handleImageUpload(state.currentTab);
    }
  });
  
  // Image edit panel handlers
  $('imageEditSaveBtn').addEventListener('click', () => {
    if (state.currentTab === 'seasonal' || state.currentTab === 'products') {
      if (state.editingImageIndex >= 0) {
        saveImageEdit(state.currentTab);
      }
    }
  });
  
  $('imageEditDeleteBtn').addEventListener('click', () => {
    if (state.currentTab === 'seasonal' || state.currentTab === 'products') {
      if (state.editingImageIndex >= 0) {
        deleteImage(state.currentTab, state.editingImageIndex);
      }
    }
  });
  
  $('validateBtn').addEventListener('click', () => {
    if (state.currentTab === 'seasonal' || state.currentTab === 'products') {
      validateImageData(state.currentTab);
    }
  });
  
  $('checkEnglishBtn').addEventListener('click', () => {
    checkEnglishFields();
  });
});


