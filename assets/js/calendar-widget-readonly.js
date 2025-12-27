// 日曆組件 JavaScript（只讀版本 / 訪客端）
// 維護重點：
// - 不提供編輯（read-only），事件用 hover tooltip 顯示（有 description 才顯示）
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
        this.selectedDate = null;
        this._tooltipEls = [];
        this._tooltipOpen = false;
        this._tooltipAnchorEl = null;
        this._resizeObserver = null;
        this._resizeRaf = 0;
        // 如果是本地文件模式，從 GitHub 載入數據；否則從本地載入
        const isLocalFile = window.location.protocol === 'file:';
        if (isLocalFile) {
            // 本地文件模式：從 GitHub 載入最新數據
            this.dataFile = 'https://raw.githubusercontent.com/lovelycakery/lovelycakery/main/assets/data/calendar-data.json';
        } else {
            this.dataFile = 'assets/data/calendar-data.json';
        }
        // Cache busting policy:
        // - Default: allow browser/CDN caching for speed.
        // - If the parent page provides a version (?v=...), reuse it to bust cache only when you deploy changes.
        this.cacheVersion = (function () {
            try {
                return new URLSearchParams(window.location.search).get('v') || '';
            } catch (e) {
                return '';
            }
        })();
        this.isReadonly = true; // 標記為只讀模式
        
        this.init();
    }
    
    async init() {
        // Render immediately so the user sees the full calendar grid without waiting for data fetch.
        // We'll load events in the background and re-render once ready.
        this.renderCalendar();
        this.attachEventListeners();
        // 自動回報高度（ResizeObserver / 事件驅動）
        this.setupAutoResize();
        // 點空白關閉 tooltip（手機互動）
        this.attachOutsideClickToClose();

        // Load events after initial paint; then apply language + re-render with indicators.
        await this.loadEvents();
        this.updateLanguage();
    }
    
    // 通知父窗口調整 iframe 高度
    notifyParentHeight() {
        try {
            // Get content height WITHOUT being biased by the iframe viewport height.
            // Using scrollHeight/clientHeight can create a feedback loop:
            // parent sets a big initial height -> iframe viewport becomes big -> reported height stays big forever.
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
                // Small buffer to avoid edge clipping due to font/layout settling.
                // Keep this minimal so the frame can visually hug the calendar.
                const bufferPx = 10;
                window.parent.postMessage({
                    type: 'calendar-resize',
                    // 留少量 buffer
                    height: Math.ceil(height) + bufferPx
                }, '*');
            }
        } catch (e) {
            // 跨域時忽略錯誤
        }
    }

    setupAutoResize() {
        // Initialize once
        if (this._resizeObserver) return;

        const target = document.querySelector('.calendar-container') || document.body;
        const send = () => {
            // throttle by rAF
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
            // ResizeObserver not available: fall back to a few scheduled sends
            setTimeout(() => this.notifyParentHeight(), 100);
            setTimeout(() => this.notifyParentHeight(), 500);
            setTimeout(() => this.notifyParentHeight(), 1000);
        }

        window.addEventListener('load', () => send());
        // initial
        send();

        // Extra one-shot reports to avoid parent/iframe message race conditions.
        // (Not polling; only during initial load.)
        setTimeout(() => this.notifyParentHeight(), 80);
        setTimeout(() => this.notifyParentHeight(), 250);
        setTimeout(() => this.notifyParentHeight(), 900);
    }

    attachOutsideClickToClose() {
        if (this._outsideClickBound) return;
        this._outsideClickBound = true;

        document.addEventListener('click', (e) => {
            if (!this._tooltipOpen) return;

            // If clicking the same anchor day again, day handler will stopPropagation.
            // Here: any other click should close.
            const anchor = this._tooltipAnchorEl;
            if (anchor && e && e.target && anchor.contains(e.target)) return;

            this.hideTooltip();
        });

        // Close on escape for desktop users
        document.addEventListener('keydown', (e) => {
            if (!this._tooltipOpen) return;
            if (e && e.key === 'Escape') this.hideTooltip();
        });
    }
    
    // 載入事件資料
    async loadEvents() {
        const isLocalFile = window.location.protocol === 'file:';
        try {
            const url = this.cacheVersion ? (this.dataFile + '?v=' + encodeURIComponent(this.cacheVersion)) : this.dataFile;
            const response = await fetch(url);
            if (response.ok) {
                const data = await response.json();
                this.events = {};
                if (data.events && Array.isArray(data.events)) {
                    data.events.forEach(event => {
                        const dateKey = event.date;
                        if (!this.events[dateKey]) {
                            this.events[dateKey] = [];
                        }
                        this.events[dateKey].push(event);
                    });
                }
                console.log(isLocalFile ? '從 GitHub 載入日曆資料' : '從本地檔案載入日曆資料');
            } else {
                console.warn('⚠️ 無法載入日曆資料檔案');
                this.events = {};
            }
        } catch (error) {
            console.error('載入日曆資料時發生錯誤:', error);
            this.events = {};
        }
        // 不在這裡調用 renderCalendar，由 init() 統一調用
    }
    
    // 渲染日曆
    renderCalendar() {
        const year = this.currentDate.getFullYear();
        const month = this.currentDate.getMonth();
        
        // 更新月份標題
        const monthNames = [
            '一月', '二月', '三月', '四月', '五月', '六月',
            '七月', '八月', '九月', '十月', '十一月', '十二月'
        ];
        const monthNamesEn = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];
        
        const currentLang = localStorage.getItem('language') || 'zh';
        const monthYearEl = document.getElementById('monthYear');
        if (monthYearEl) {
            monthYearEl.textContent = currentLang === 'en' 
                ? `${monthNamesEn[month]} ${year}`
                : `${year}年 ${monthNames[month]}`;
        }
        
        // 清空日曆網格
        const grid = document.getElementById('calendarGrid');
        if (!grid) return;
        grid.innerHTML = '';
        // 移除 tooltip（避免月份切換後 tooltip 漂在空中）
        this.hideTooltip();
        
        // 獲取月份的第一天和最後一天
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();
        const startingDayOfWeek = firstDay.getDay();
        
        // 上個月的日期
        const prevMonthLastDay = new Date(year, month, 0).getDate();
        for (let i = startingDayOfWeek - 1; i >= 0; i--) {
            const day = prevMonthLastDay - i;
            const dateKey = this.formatDateKey(year, month - 1, day);
            this.createDayElement(grid, day, true, dateKey);
        }
        
        // 當月的日期
        const today = new Date();
        for (let day = 1; day <= daysInMonth; day++) {
            const dateKey = this.formatDateKey(year, month, day);
            const isToday = year === today.getFullYear() && 
                           month === today.getMonth() && 
                           day === today.getDate();
            this.createDayElement(grid, day, false, dateKey, isToday);
        }
        
        // 下個月的日期（填滿網格）
        const totalCells = grid.children.length;
        const remainingCells = 42 - totalCells;
        for (let day = 1; day <= remainingCells; day++) {
            const dateKey = this.formatDateKey(year, month + 1, day);
            this.createDayElement(grid, day, true, dateKey);
        }
        
        // 渲染完成後回報高度（由 ResizeObserver 觸發；這裡再送一次保險）
        this.notifyParentHeight();
    }
    
    // 創建日期元素（只讀模式）
    createDayElement(container, day, isOtherMonth, dateKey, isToday = false) {
        const dayEl = document.createElement('div');
        dayEl.className = 'calendar-day read-only';
        if (isOtherMonth) {
            dayEl.classList.add('other-month');
        }
        if (isToday) {
            dayEl.classList.add('today');
        }
        
        const dayNumber = document.createElement('div');
        dayNumber.className = 'calendar-day-number';
        dayNumber.textContent = day;
        dayEl.appendChild(dayNumber);
        
        // 檢查是否有事件
        const events = this.events[dateKey] || [];
        if (events.length > 0) {
            dayEl.classList.add('has-event');
            const event = events[0];
            
            const indicator = document.createElement('div');
            indicator.className = `event-indicator ${event.status}`;
            dayEl.appendChild(indicator);
            
            // 如果事件有說明，添加說明指示器（星形）
            if (event.description && event.description.trim()) {
                const descIndicator = document.createElement('div');
                descIndicator.className = 'event-description-indicator';
                descIndicator.innerHTML = '★';
                dayEl.appendChild(descIndicator);
            }
            
            const hasDesc = !!(event.description && event.description.trim());

            // 桌機：保留 hover tooltip（有 description 才顯示）
            if (hasDesc) {
                dayEl.addEventListener('mouseenter', (e) => this.showTooltip(e, event));
                dayEl.addEventListener('mouseleave', () => this.hideTooltip());
            }

            // 手機：點一下顯示、點空白關閉（只有有 description 才需要）
            dayEl.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!hasDesc) return;
                this.toggleTooltip(dayEl, event);
            });
        }
        container.appendChild(dayEl);
    }
    
    // 格式化日期鍵
    formatDateKey(year, month, day) {
        const date = new Date(year, month, day);
        return date.toISOString().split('T')[0];
    }
    
    toggleTooltip(anchorEl, eventData) {
        if (this._tooltipOpen && this._tooltipAnchorEl === anchorEl) {
            this.hideTooltip();
            return;
        }
        // Create a synthetic event-like object for positioning
        this.showTooltip({ currentTarget: anchorEl }, eventData);
    }

    // 顯示提示框（hover / click）
    showTooltip(event, eventData) {
        // 移除現有的 tooltip
        this.hideTooltip();
        
        // 建立 tooltip 內容（只顯示描述，不顯示狀態文字）
        let tooltipContent = '';
        if (eventData.description && eventData.description.trim()) {
            tooltipContent = eventData.description.trim();
        }
        
        // 如果沒有描述內容，不顯示 tooltip
        if (!tooltipContent) {
            return;
        }
        
        // 建立 tooltip 元素
        const tooltip = document.createElement('div');
        tooltip.className = 'event-tooltip';
        tooltip.innerHTML = tooltipContent;
        document.body.appendChild(tooltip);
        this._tooltipOpen = true;
        this._tooltipAnchorEl = event.currentTarget;
        this._tooltipEls = [tooltip];
        
        // 計算位置（在日期框右上角）
        const rect = event.currentTarget.getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect();
        
        // 顯示在右上角，tooltip 的右邊緣對齊日期格子的右邊緣
        let left = rect.right - tooltipRect.width;
        let top = rect.top - tooltipRect.height - 12;
        let showBelow = false;
        
        // 確保 tooltip 不會超出視窗左側
        if (left < 10) {
            left = 10;
        }
        // 確保 tooltip 不會超出視窗右側
        if (left + tooltipRect.width > window.innerWidth - 10) {
            left = window.innerWidth - tooltipRect.width - 10;
        }
        // 如果上方空間不足，顯示在下方
        if (top < 10) {
            top = rect.bottom + 12;
            showBelow = true;
            tooltip.classList.add('tooltip-below');
        }
        
        tooltip.style.left = left + 'px';
        tooltip.style.top = top + 'px';
        
        // 添加顯示動畫
        setTimeout(() => {
            tooltip.classList.add('show');
        }, 10);
    }
    
    // 隱藏提示框
    hideTooltip() {
        const tooltips = document.querySelectorAll('.event-tooltip');
        tooltips.forEach(tooltip => {
            tooltip.classList.remove('show');
            setTimeout(() => {
                if (tooltip.parentNode) {
                    tooltip.parentNode.removeChild(tooltip);
                }
            }, 200);
        });
        this._tooltipOpen = false;
        this._tooltipAnchorEl = null;
    }
    
    // 附加事件監聽器
    attachEventListeners() {
        // 月份導航
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
        
        // 不再需要模態框控制（已改用滑鼠懸停提示）
    }
    
    // 更新語言
    updateLanguage() {
        const currentLang = localStorage.getItem('language') || 'zh';
        if (window.LovelyI18n && typeof window.LovelyI18n.applyLanguage === 'function') {
            window.LovelyI18n.applyLanguage(currentLang, document);
        } else {
            const elements = document.querySelectorAll('[data-en][data-zh]');
            elements.forEach(element => {
                if (currentLang === 'en') {
                    element.textContent = element.getAttribute('data-en');
                } else {
                    element.textContent = element.getAttribute('data-zh');
                }
            });
        }
        this.renderCalendar();
    }
}

// 初始化日曆
document.addEventListener('DOMContentLoaded', () => {
    // 防止被重複載入時重複初始化，造成事件監聽器/interval 疊加
    if (window.calendarWidgetReadonly) return;
    window.calendarWidgetReadonly = new CalendarWidgetReadonly();
    
    // 事件驅動：父頁語言切換時會 postMessage 通知（避免輪詢）
    window.addEventListener('message', (e) => {
        if (e && e.data && e.data.type === 'lovely-language') {
            if (typeof e.data.lang === 'string') {
                localStorage.setItem('language', e.data.lang);
            }
            window.calendarWidgetReadonly.updateLanguage();
        }
        // Parent handshake: request the widget to resend its height
        if (e && e.data && e.data.type === 'calendar-request-resize') {
            // Wait for next paint so measurements reflect the final layout (fonts/images/etc).
            requestAnimationFrame(() => window.calendarWidgetReadonly.notifyParentHeight());
        }
    });
});

