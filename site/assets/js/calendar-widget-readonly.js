// 日曆組件 JavaScript（只讀版本 / 訪客端）
// 維護重點：
// - 不提供編輯（read-only），格內直接顯示 item.text，hover 顯示 item.detail
// - 透過 postMessage({type:'calendar-resize', height}) 通知父頁（calendar.html）調整 iframe 高度
// - 語言：使用 localStorage.language，並支援接收 postMessage({type:'lovely-language', lang}) 即時更新

// 防止載入錯誤的版本
if (typeof CalendarWidget !== 'undefined') {
    console.error('錯誤：只讀版本不應該與可編輯版本同時載入');
}

class CalendarWidgetReadonly {
    constructor() {
        this.currentDate = new Date();
        this.events = {};
        this.maxItems = 3;
        this._tooltipOpen = false;
        this._tooltipAnchorEl = null;
        this._tooltipEl = null;
        this._resizeObserver = null;
        this._resizeRaf = 0;
        // Shared config (dataFile + cacheVersion)
        const shared = window.LovelyCalendarShared;
        this.dataFile = shared ? shared.getDefaultDataFile() : 'assets/data/calendar-data.json';
        this.cacheVersion = shared ? shared.getCacheVersion() : '';
        this.isReadonly = true; // 標記為只讀模式

        this.init();
    }

    async init() {
        // Render immediately so the user sees the full calendar grid without waiting for data fetch.
        this.renderCalendar();
        this.attachEventListeners();
        this.setupAutoResize();
        this.attachOutsideClickToClose();

        await this.loadEvents();
        this.updateLanguage();
    }

    // 通知父窗口調整 iframe 高度
    notifyParentHeight() {
        try {
            let height = 0;
            const container = document.querySelector('.calendar-container');
            if (container && container.getBoundingClientRect) {
                const rect = container.getBoundingClientRect();
                height = rect && rect.height ? rect.height : 0;
            }
            if (!height || height <= 0) {
                height = Math.max(
                    document.body.offsetHeight,
                    document.documentElement.offsetHeight,
                    document.body.scrollHeight,
                    document.documentElement.scrollHeight
                );
            }
            if (height > 0 && window.parent && window.parent !== window) {
                const bufferPx = 10;
                window.parent.postMessage({
                    type: 'calendar-resize',
                    height: Math.ceil(height) + bufferPx
                }, '*');
            }
        } catch (e) {
            // 跨域時忽略錯誤
        }
    }

    setupAutoResize() {
        if (this._resizeObserver) return;

        const target = document.querySelector('.calendar-container') || document.body;
        const send = () => {
            if (this._resizeRaf) cancelAnimationFrame(this._resizeRaf);
            this._resizeRaf = requestAnimationFrame(() => {
                this._resizeRaf = 0;
                this.notifyParentHeight();
            });
        };

        try {
            this._resizeObserver = new ResizeObserver(() => send());
            this._resizeObserver.observe(target);
        } catch (e) {
            setTimeout(() => this.notifyParentHeight(), 100);
            setTimeout(() => this.notifyParentHeight(), 500);
            setTimeout(() => this.notifyParentHeight(), 1000);
        }

        window.addEventListener('load', () => send());
        send();
        setTimeout(() => this.notifyParentHeight(), 80);
        setTimeout(() => this.notifyParentHeight(), 250);
        setTimeout(() => this.notifyParentHeight(), 900);
    }

    attachOutsideClickToClose() {
        if (this._outsideClickBound) return;
        this._outsideClickBound = true;

        document.addEventListener('click', (e) => {
            if (!this._tooltipOpen) return;
            const anchor = this._tooltipAnchorEl;
            if (anchor && e && e.target && anchor.contains(e.target)) return;
            this.hideTooltip();
        });

        document.addEventListener('keydown', (e) => {
            if (!this._tooltipOpen) return;
            if (e && e.key === 'Escape') this.hideTooltip();
        });
    }

    // 載入事件資料
    async loadEvents() {
        const isLocalFile = window.location.protocol === 'file:';
        try {
            const shared = window.LovelyCalendarShared;
            const url = shared ? shared.withCacheVersion(this.dataFile, this.cacheVersion) : (this.cacheVersion ? (this.dataFile + '?v=' + encodeURIComponent(this.cacheVersion)) : this.dataFile);
            const response = await fetch(url);
            if (response.ok) {
                const data = await response.json();
                if (typeof data.maxItems === 'number' && data.maxItems > 0) {
                    this.maxItems = data.maxItems;
                }
                this.events = (shared && typeof shared.eventsArrayToMap === 'function')
                    ? shared.eventsArrayToMap(data)
                    : {};
                console.log(isLocalFile ? '從 GitHub 載入日曆資料' : '從本地檔案載入日曆資料');
            } else {
                console.warn('⚠️ 無法載入日曆資料檔案');
                this.events = {};
                this._loadFailed = true;
            }
        } catch (error) {
            console.error('載入日曆資料時發生錯誤:', error);
            this.events = {};
            this._loadFailed = true;
        }
    }

    // 渲染日曆
    renderCalendar() {
        const year = this.currentDate.getFullYear();
        const month = this.currentDate.getMonth();

        // 通知父頁目前顯示的月份（admin 用來決定批次翻譯範圍）
        try {
            const monthStr = year + '-' + String(month + 1).padStart(2, '0');
            window.parent.postMessage({ type: 'calendar-month-changed', month: monthStr }, '*');
        } catch (_) { /* ignore */ }

        const currentLang = localStorage.getItem('language') || 'zh';
        const monthYearEl = document.getElementById('monthYear');
        if (monthYearEl) {
            const shared = window.LovelyCalendarShared;
            monthYearEl.textContent = shared
                ? shared.getMonthYearLabel(this.currentDate, currentLang)
                : monthYearEl.textContent;
        }

        const grid = document.getElementById('calendarGrid');
        if (!grid) return;
        grid.innerHTML = '';
        this.hideTooltip();

        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();
        const startingDayOfWeek = firstDay.getDay();

        const shared = window.LovelyCalendarShared;
        const formatDateKey = (y, m, d) => {
            return shared ? shared.formatDateKey(y, m, d) : (new Date(y, m, d)).toISOString().split('T')[0];
        };

        const fragment = document.createDocumentFragment();

        // 上個月
        const prevMonthLastDay = new Date(year, month, 0).getDate();
        for (let i = startingDayOfWeek - 1; i >= 0; i--) {
            const day = prevMonthLastDay - i;
            const dateKey = formatDateKey(year, month - 1, day);
            this.createDayElement(fragment, day, true, dateKey);
        }

        // 當月
        const today = new Date();
        for (let day = 1; day <= daysInMonth; day++) {
            const dateKey = formatDateKey(year, month, day);
            const isToday = year === today.getFullYear() &&
                           month === today.getMonth() &&
                           day === today.getDate();
            this.createDayElement(fragment, day, false, dateKey, isToday);
        }

        // 下個月（填滿網格）
        const totalCells = fragment.children.length;
        const remainingCells = 42 - totalCells;
        for (let day = 1; day <= remainingCells; day++) {
            const dateKey = formatDateKey(year, month + 1, day);
            this.createDayElement(fragment, day, true, dateKey);
        }

        grid.appendChild(fragment);

        if (this._loadFailed) {
            const hint = document.createElement('p');
            hint.style.cssText = 'text-align:center;padding:12px;color:#6b5d4f;font-size:14px;';
            const lang = localStorage.getItem('language') || 'zh';
            hint.textContent = lang === 'en' ? 'Calendar data unavailable. Please try again later.' : '日曆資料暫時無法載入，請稍後再試。';
            grid.parentNode.insertBefore(hint, grid.nextSibling);
        }

        this.notifyParentHeight();
    }

    // 創建日期元素（只讀模式）
    createDayElement(container, day, isOtherMonth, dateKey, isToday = false) {
        const dayEl = document.createElement('div');
        dayEl.className = 'calendar-day read-only';
        dayEl.setAttribute('data-date', dateKey);
        if (isOtherMonth) dayEl.classList.add('other-month');
        if (isToday) dayEl.classList.add('today');

        const dayNumber = document.createElement('div');
        dayNumber.className = 'calendar-day-number';
        dayNumber.textContent = day;
        dayEl.appendChild(dayNumber);

        // 所有日期格都通知父層（供 admin 使用）
        dayEl.addEventListener('click', (e) => {
            try {
                window.parent.postMessage({ type: 'calendar-day-clicked', date: dateKey }, '*');
            } catch (ex) { /* ignore */ }
        });

        // 檢查是否有事件
        const eventData = this.events[dateKey];
        if (eventData && eventData.items && eventData.items.length > 0) {
            dayEl.classList.add('has-event');
            const items = eventData.items.slice(0, this.maxItems);

            // 渲染格內文字
            const itemsContainer = document.createElement('div');
            itemsContainer.className = 'event-items';
            const lang = localStorage.getItem('language') || 'zh';
            items.forEach((item) => {
                const itemEl = document.createElement('div');
                itemEl.className = 'event-item';
                const displayText = (lang === 'en' && item.text_en) ? item.text_en : (item.text || '');
                itemEl.textContent = displayText;
                if (item.color) itemEl.style.color = item.color;
                // 桌面 hover：顯示單項詳情
                if (displayText) {
                    const tooltipHtml = this.buildItemTooltipHtml(item);
                    itemEl.addEventListener('mouseenter', (e) => {
                        this.showTooltip(e, tooltipHtml);
                    });
                    itemEl.addEventListener('mouseleave', () => {
                        if (this._tooltipAnchorEl === itemEl) this.hideTooltip();
                    });
                }
                itemsContainer.appendChild(itemEl);
            });
            dayEl.appendChild(itemsContainer);

            // 點擊整個日期格 → 顯示當天所有項目（手機與桌面通用），會持續直到外部點擊
            const dayTooltipHtml = this.buildDayTooltipHtml(eventData);
            dayEl.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleTooltip(dayEl, dayTooltipHtml);
            });
        }
        container.appendChild(dayEl);
    }

    buildDayTooltipHtml(eventData) {
        const lang = localStorage.getItem('language') || 'zh';
        const items = (eventData && Array.isArray(eventData.items)) ? eventData.items : [];
        if (items.length === 0) return '';
        let html = '';
        items.forEach((item, i) => {
            const titleColor = item.color || 'var(--cal-ink)';
            const title = (lang === 'en' && item.text_en) ? item.text_en : (item.text || '');
            const detail = (lang === 'en' && item.detail_en) ? item.detail_en : (item.detail || '');
            if (!title) return;
            const sep = i > 0 ? 'margin-top:10px;padding-top:10px;border-top:1px solid rgba(0,0,0,0.08);' : '';
            html += '<div style="' + sep + '">'
                + '<div style="font-size:16px;font-weight:700;color:' + titleColor + ';line-height:1.4;">'
                + this.escapeHtml(title) + '</div>';
            if (detail && detail.trim()) {
                html += '<div style="margin-top:3px;font-size:13px;font-weight:500;color:var(--cal-ink);line-height:1.5;">'
                    + this.escapeHtml(detail) + '</div>';
            }
            html += '</div>';
        });
        return html;
    }

    buildItemTooltipHtml(item) {
        const lang = localStorage.getItem('language') || 'zh';
        const titleColor = item.color || 'var(--cal-ink)';
        const title = (lang === 'en' && item.text_en) ? item.text_en : (item.text || '');
        const detail = (lang === 'en' && item.detail_en) ? item.detail_en : (item.detail || '');
        let html = '<div style="font-size:17px;font-weight:700;color:' + titleColor + ';line-height:1.4;">'
            + this.escapeHtml(title) + '</div>';
        if (detail && detail.trim()) {
            html += '<div style="margin-top:4px;font-size:14px;font-weight:500;color:var(--cal-ink);line-height:1.5;">'
                + this.escapeHtml(detail) + '</div>';
        }
        return html;
    }

    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    toggleTooltip(anchorEl, detailHtml) {
        if (this._tooltipOpen && this._tooltipAnchorEl === anchorEl) {
            this.hideTooltip();
            return;
        }
        this.showTooltip({ currentTarget: anchorEl }, detailHtml);
    }

    // 顯示提示框
    showTooltip(event, detailHtml) {
        this.hideTooltip();

        if (!detailHtml) return;

        const tooltip = document.createElement('div');
        tooltip.className = 'event-tooltip';
        tooltip.innerHTML = detailHtml;
        document.body.appendChild(tooltip);
        this._tooltipOpen = true;
        this._tooltipAnchorEl = event.currentTarget;
        this._tooltipEl = tooltip;

        const rect = event.currentTarget.getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect();

        let left = rect.right - tooltipRect.width;
        let top = rect.top - tooltipRect.height - 12;
        if (left < 10) left = 10;
        if (left + tooltipRect.width > window.innerWidth - 10) {
            left = window.innerWidth - tooltipRect.width - 10;
        }
        if (top < 10) {
            top = rect.bottom + 12;
            tooltip.classList.add('tooltip-below');
        }

        tooltip.style.left = left + 'px';
        tooltip.style.top = top + 'px';

        setTimeout(() => { tooltip.classList.add('show'); }, 10);
    }

    // 隱藏提示框
    hideTooltip() {
        const tooltip = this._tooltipEl;
        if (tooltip) {
            tooltip.classList.remove('show');
            setTimeout(() => {
                if (tooltip.parentNode) tooltip.parentNode.removeChild(tooltip);
            }, 200);
        }
        this._tooltipOpen = false;
        this._tooltipAnchorEl = null;
        this._tooltipEl = null;
    }

    // 附加事件監聽器
    attachEventListeners() {
        const prevBtn = document.getElementById('prevMonth');
        const nextBtn = document.getElementById('nextMonth');

        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                this.currentDate.setMonth(this.currentDate.getMonth() - 1);
                this.renderCalendar();
            });
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                this.currentDate.setMonth(this.currentDate.getMonth() + 1);
                this.renderCalendar();
            });
        }
    }

    // 更新語言
    updateLanguage() {
        const currentLang = localStorage.getItem('language') || 'zh';
        const shared = window.LovelyCalendarShared;
        if (shared && typeof shared.applyLanguageToDocument === 'function') {
            shared.applyLanguageToDocument(currentLang);
        } else if (window.LovelyI18n && typeof window.LovelyI18n.applyLanguage === 'function') {
            window.LovelyI18n.applyLanguage(currentLang, document);
        }
        this.renderCalendar();
    }
}

// 初始化日曆
document.addEventListener('DOMContentLoaded', () => {
    if (window.calendarWidgetReadonly) return;
    window.calendarWidgetReadonly = new CalendarWidgetReadonly();

    window.addEventListener('message', (e) => {
        // 安全：只接受同源或本機 dev 的訊息
        if (!e) return;
        const isSameOrigin = e.origin === window.location.origin;
        const isLocalDev = e.origin === 'null' || e.origin === 'file://'
            || (typeof e.origin === 'string' && (e.origin.startsWith('http://127.0.0.1:') || e.origin.startsWith('http://localhost:')));
        if (!isSameOrigin && !isLocalDev) return;
        if (!e.data || typeof e.data !== 'object') return;

        if (e.data.type === 'lovely-language') {
            if (typeof e.data.lang === 'string') {
                localStorage.setItem('language', e.data.lang);
            }
            window.calendarWidgetReadonly.updateLanguage();
            return;
        }
        if (e.data.type === 'calendar-request-resize') {
            requestAnimationFrame(() => window.calendarWidgetReadonly.notifyParentHeight());
            return;
        }
        // Admin instant preview: receive updated calendar data and re-render
        if (e.data.type === 'admin-calendar-update') {
            const data = e.data.data;
            if (!data || typeof data !== 'object' || !Array.isArray(data.events)) return;
            const shared = window.LovelyCalendarShared;
            if (typeof data.maxItems === 'number' && data.maxItems > 0) {
                window.calendarWidgetReadonly.maxItems = data.maxItems;
            }
            window.calendarWidgetReadonly.events = (shared && typeof shared.eventsArrayToMap === 'function')
                ? shared.eventsArrayToMap(data)
                : {};
            window.calendarWidgetReadonly._loadFailed = false;
            window.calendarWidgetReadonly.renderCalendar();
        }
    });
});
