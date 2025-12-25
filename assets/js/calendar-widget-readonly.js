// 日曆組件 JavaScript（只讀版本）

// 防止載入錯誤的版本
if (typeof CalendarWidget !== 'undefined') {
    console.error('錯誤：只讀版本不應該與可編輯版本同時載入');
}

class CalendarWidgetReadonly {
    constructor() {
        this.currentDate = new Date();
        this.events = {};
        this.selectedDate = null;
        this.dataFile = 'assets/data/calendar-data.json';
        this.isReadonly = true; // 標記為只讀模式
        
        this.init();
    }
    
    async init() {
        await this.loadEvents();
        this.updateLanguage();
        this.renderCalendar();
        this.attachEventListeners();
    }
    
    // 載入事件資料
    async loadEvents() {
        try {
            // 添加時間戳避免緩存問題，確保載入最新資料
            const isLocalFile = window.location.protocol === 'file:';
            const response = await fetch(this.dataFile + '?t=' + Date.now());
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
                console.log(isLocalFile ? '從本地檔案載入日曆資料（只讀版本）' : '從 GitHub 載入日曆資料（只讀版本）');
            } else {
                console.log('日曆資料檔案不存在或無法載入');
                this.events = {};
            }
        } catch (error) {
            console.error('載入日曆資料時發生錯誤:', error);
            this.events = {};
        }
        this.renderCalendar();
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
            
            // 只讀模式：滑鼠懸停顯示提示
            dayEl.addEventListener('mouseenter', (e) => this.showTooltip(e, event, dateKey));
            dayEl.addEventListener('mouseleave', () => this.hideTooltip());
        }
        container.appendChild(dayEl);
    }
    
    // 格式化日期鍵
    formatDateKey(year, month, day) {
        const date = new Date(year, month, day);
        return date.toISOString().split('T')[0];
    }
    
    // 顯示提示框（滑鼠懸停）
    showTooltip(event, eventData, dateKey) {
        // 移除現有的 tooltip
        this.hideTooltip();
        
        // 狀態文字
        const statusText = {
            'available': '可預訂',
            'unavailable': '不可預訂',
            'closed': '休息'
        };
        const statusTextEn = {
            'available': 'Available',
            'unavailable': 'Unavailable',
            'closed': 'Closed'
        };
        const currentLang = localStorage.getItem('language') || 'zh';
        const statusLabel = currentLang === 'en' 
            ? statusTextEn[eventData.status] || eventData.status
            : statusText[eventData.status] || eventData.status;
        
        // 建立 tooltip 內容
        let tooltipContent = statusLabel;
        if (eventData.description && eventData.description.trim()) {
            tooltipContent += '<br>' + eventData.description.trim();
        }
        
        // 建立 tooltip 元素
        const tooltip = document.createElement('div');
        tooltip.className = 'event-tooltip';
        tooltip.innerHTML = tooltipContent;
        document.body.appendChild(tooltip);
        
        // 計算位置（在日期框上方）
        const rect = event.currentTarget.getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect();
        
        let left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
        let top = rect.top - tooltipRect.height - 10;
        let showBelow = false;
        
        // 確保 tooltip 不會超出視窗
        if (left < 10) left = 10;
        if (left + tooltipRect.width > window.innerWidth - 10) {
            left = window.innerWidth - tooltipRect.width - 10;
        }
        if (top < 10) {
            // 如果上方空間不足，顯示在下方
            top = rect.bottom + 10;
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
        const elements = document.querySelectorAll('[data-en][data-zh]');
        elements.forEach(element => {
            if (currentLang === 'en') {
                element.textContent = element.getAttribute('data-en');
            } else {
                element.textContent = element.getAttribute('data-zh');
            }
        });
        this.renderCalendar();
    }
}

// 初始化日曆
document.addEventListener('DOMContentLoaded', () => {
    window.calendarWidgetReadonly = new CalendarWidgetReadonly();
    
    // 監聽父頁面的語言切換
    window.addEventListener('storage', (e) => {
        if (e.key === 'language') {
            window.calendarWidgetReadonly.updateLanguage();
        }
    });
    
    let lastLang = localStorage.getItem('language') || 'zh';
    setInterval(() => {
        const currentLang = localStorage.getItem('language') || 'zh';
        if (currentLang !== lastLang) {
            lastLang = currentLang;
            window.calendarWidgetReadonly.updateLanguage();
        }
    }, 500);
});

