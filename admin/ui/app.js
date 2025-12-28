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
};

function logStatus(msg) {
  const box = $('statusBox');
  const ts = new Date().toLocaleString();
  box.textContent = `[${ts}] ${msg}\n` + (box.textContent || '');
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
  $('selectedDate').textContent = state.selectedDate || '尚未選取';

  const has = state.selectedDate && state.eventsByDate.has(state.selectedDate);
  const ev = has ? state.eventsByDate.get(state.selectedDate) : null;

  $('statusSelect').value = ev && ev.status ? ev.status : 'available';
  $('descInput').value = ev && typeof ev.description === 'string' ? ev.description : '';

  $('saveBtn').disabled = !state.selectedDate;
  // Clear button only enabled if date is selected AND has an existing event
  $('clearBtn').disabled = !state.selectedDate || !has;
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

async function main() {
  state.siteInfo = await LovelyAdmin.getSiteInfo();
  $('siteInfo').textContent = state.siteInfo && state.siteInfo.siteDir ? state.siteInfo.siteDir : '';

  await refreshCalendarData();
  reloadPreview();

  const previewFrame = $('previewFrame');
  if (previewFrame) {
    // Re-install the click hook every time the preview reloads.
    previewFrame.addEventListener('load', () => {
      state.clickHookInstalled = false;
      startHookWatcher({ maxWaitMs: 12000, intervalMs: 250 });
    });
  }

  // Also start the watcher right away (covers the case where load fires before listener is attached).
  startHookWatcher({ maxWaitMs: 12000, intervalMs: 250 });

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
      logStatus(`✅ 已儲存：${state.selectedDate} (${status})`);
      reloadPreview();
    } catch (e) {
      logStatus(`❌ 儲存失敗：${e && e.message ? e.message : String(e)}`);
    }
  });

  $('clearBtn').addEventListener('click', async () => {
    if (!state.selectedDate || !state.eventsByDate.has(state.selectedDate)) return;
    const ok = confirm(`確定要清除 ${state.selectedDate} 的事件嗎？`);
    if (!ok) return;
    try {
      await LovelyAdmin.deleteCalendarEvent({ date: state.selectedDate });
      await LovelyAdmin.bumpCalendarVersion();
      await refreshCalendarData();
      logStatus(`✅ 已清除：${state.selectedDate}`);
      setSelectedDate(state.selectedDate);
      reloadPreview();
    } catch (e) {
      logStatus(`❌ 清除失敗：${e && e.message ? e.message : String(e)}`);
    }
  });

  $('publishBtn').addEventListener('click', async () => {
    const ok = confirm('確定要一鍵發布嗎？\n\n流程：本機檢查 → commit → push → CI 檢查通過才會部署。');
    if (!ok) return;

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

window.addEventListener('load', () => {
  main().catch((e) => {
    logStatus(`❌ 啟動失敗：${e && e.message ? e.message : String(e)}`);
  });
});


