// 日曆組件 JavaScript

class CalendarWidget {
    constructor() {
        this.currentDate = new Date();
        this.events = {};
        this.selectedDate = null;
        this.dataFile = 'assets/data/calendar-data.json';
        
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
            const response = await fetch(this.dataFile);
            if (response.ok) {
                const data = await response.json();
                this.events = {};
                data.events.forEach(event => {
                    const dateKey = event.date;
                    if (!this.events[dateKey]) {
                        this.events[dateKey] = [];
                    }
                    this.events[dateKey].push(event);
                });
            } else {
                console.log('日曆資料檔案不存在，將使用空資料');
                this.events = {};
            }
        } catch (error) {
            console.log('載入日曆資料時發生錯誤:', error);
            this.events = {};
        }
        this.renderCalendar();
    }
    
    // 儲存事件資料
    async saveEvents() {
        const eventsArray = [];
        Object.keys(this.events).forEach(date => {
            this.events[date].forEach(event => {
                eventsArray.push(event);
            });
        });
        
        const data = { events: eventsArray };
        
        // 注意：由於瀏覽器安全限制，無法直接寫入檔案
        // 這裡我們使用 localStorage 作為備份，並提供下載功能
        localStorage.setItem('calendarEvents', JSON.stringify(data));
        
        // 提供下載 JSON 檔案的功能
        this.downloadJSON(data);
    }
    
    // 下載 JSON 檔案
    downloadJSON(data) {
        const dataStr = JSON.stringify(data, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'calendar-data.json';
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        console.log('日曆資料已下載，請將檔案放到 assets/data/calendar-data.json');
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
        const remainingCells = 42 - totalCells; // 6 行 x 7 列
        for (let day = 1; day <= remainingCells; day++) {
            const dateKey = this.formatDateKey(year, month + 1, day);
            this.createDayElement(grid, day, true, dateKey);
        }
    }
    
    // 創建日期元素
    createDayElement(container, day, isOtherMonth, dateKey, isToday = false) {
        const dayEl = document.createElement('div');
        dayEl.className = 'calendar-day';
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
            const event = events[0]; // 顯示第一個事件
            
            const indicator = document.createElement('div');
            indicator.className = `event-indicator ${event.status}`;
            dayEl.appendChild(indicator);
            
            if (event.title) {
                const title = document.createElement('div');
                title.className = 'event-title';
                title.textContent = event.title;
                dayEl.appendChild(title);
            }
        }
        
        dayEl.addEventListener('click', () => this.openEventModal(dateKey));
        container.appendChild(dayEl);
    }
    
    // 格式化日期鍵
    formatDateKey(year, month, day) {
        const date = new Date(year, month, day);
        return date.toISOString().split('T')[0];
    }
    
    // 打開事件編輯模態框
    openEventModal(dateKey) {
        this.selectedDate = dateKey;
        const modal = document.getElementById('eventModal');
        const dateInput = document.getElementById('eventDate');
        const titleInput = document.getElementById('eventTitle');
        const descInput = document.getElementById('eventDescription');
        const statusInput = document.getElementById('eventStatus');
        
        if (dateInput) dateInput.value = dateKey;
        
        const events = this.events[dateKey] || [];
        const event = events[0] || { title: '', description: '', status: 'available' };
        
        if (titleInput) titleInput.value = event.title || '';
        if (descInput) descInput.value = event.description || '';
        if (statusInput) statusInput.value = event.status || 'available';
        
        if (modal) modal.classList.add('active');
    }
    
    // 關閉模態框
    closeModal() {
        const modal = document.getElementById('eventModal');
        if (modal) modal.classList.remove('active');
        this.selectedDate = null;
    }
    
    // 儲存事件
    saveEvent() {
        if (!this.selectedDate) return;
        
        const titleInput = document.getElementById('eventTitle');
        const descInput = document.getElementById('eventDescription');
        const statusInput = document.getElementById('eventStatus');
        
        const title = titleInput ? titleInput.value.trim() : '';
        const description = descInput ? descInput.value.trim() : '';
        const status = statusInput ? statusInput.value : 'available';
        
        if (!title && !description) {
            // 如果標題和說明都為空，刪除事件
            delete this.events[this.selectedDate];
        } else {
            // 儲存事件
            if (!this.events[this.selectedDate]) {
                this.events[this.selectedDate] = [];
            }
            this.events[this.selectedDate] = [{
                date: this.selectedDate,
                title: title,
                description: description,
                status: status
            }];
        }
        
        this.saveEvents();
        this.renderCalendar();
        this.closeModal();
    }
    
    // 刪除事件
    deleteEvent() {
        if (!this.selectedDate) return;
        
        if (confirm('確定要刪除這個事件嗎？')) {
            delete this.events[this.selectedDate];
            this.saveEvents();
            this.renderCalendar();
            this.closeModal();
        }
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
        
        // 模態框控制
        const closeBtn = document.getElementById('closeModal');
        const cancelBtn = document.getElementById('cancelEvent');
        const saveBtn = document.getElementById('saveEvent');
        const deleteBtn = document.getElementById('deleteEvent');
        const modal = document.getElementById('eventModal');
        
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.closeModal());
        }
        
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => this.closeModal());
        }
        
        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.saveEvent());
        }
        
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => this.deleteEvent());
        }
        
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeModal();
                }
            });
        }
        
        // 鍵盤事件
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeModal();
            }
        });
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
        // 重新渲染日曆以更新月份名稱
        this.renderCalendar();
    }
}

// 初始化日曆
document.addEventListener('DOMContentLoaded', () => {
    window.calendarWidget = new CalendarWidget();
    
    // 監聽父頁面的語言切換（透過 storage 事件）
    window.addEventListener('storage', (e) => {
        if (e.key === 'language') {
            window.calendarWidget.updateLanguage();
        }
    });
    
    // 定期檢查語言變更（因為同源 iframe 可能無法監聽 storage 事件）
    let lastLang = localStorage.getItem('language') || 'zh';
    setInterval(() => {
        const currentLang = localStorage.getItem('language') || 'zh';
        if (currentLang !== lastLang) {
            lastLang = currentLang;
            window.calendarWidget.updateLanguage();
        }
    }, 500);
});

