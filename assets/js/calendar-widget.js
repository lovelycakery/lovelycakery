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
        
        // 使用 localStorage 作為備份
        localStorage.setItem('calendarEvents', JSON.stringify(data));
        
        // 檢查是否啟用 GitHub API
        if (typeof checkGitHubConfig !== 'undefined') {
            const configCheck = checkGitHubConfig();
            if (configCheck.valid) {
                // 使用 GitHub API 自動更新
                const success = await this.updateGitHubFile(data);
                if (success) {
                    return; // 成功更新，不需要下載檔案
                } else {
                    // GitHub API 更新失敗，回退到下載方式
                    console.warn('GitHub API 更新失敗，改用下載方式');
                }
            }
        }
        
        // 如果 GitHub API 未啟用或更新失敗，提供下載 JSON 檔案的功能
        this.downloadJSON(data);
    }
    
    // 使用 GitHub API 更新檔案
    async updateGitHubFile(data) {
        try {
            const configCheck = checkGitHubConfig();
            if (!configCheck.valid) {
                console.warn('GitHub 配置檢查失敗:', configCheck.reason);
                return false;
            }
            
            const { token, owner, repo, filePath } = GITHUB_CONFIG;
            const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;
            
            // 1. 獲取檔案當前的 SHA（GitHub 需要這個來更新檔案）
            const getFileResponse = await fetch(apiUrl, {
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'LovelyCakery-Calendar'
                }
            });
            
            if (!getFileResponse.ok && getFileResponse.status !== 404) {
                throw new Error(`無法取得檔案資訊: ${getFileResponse.status}`);
            }
            
            let currentSha = null;
            if (getFileResponse.ok) {
                const fileData = await getFileResponse.json();
                currentSha = fileData.sha;
            }
            
            // 2. 準備更新資料
            const content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2)))); // Base64 編碼
            
            const updateData = {
                message: '更新日曆資料',
                content: content
            };
            
            if (currentSha) {
                updateData.sha = currentSha; // 更新現有檔案需要 SHA
            }
            
            // 3. 更新檔案
            const updateResponse = await fetch(apiUrl, {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json',
                    'User-Agent': 'LovelyCakery-Calendar'
                },
                body: JSON.stringify(updateData)
            });
            
            if (updateResponse.ok) {
                const result = await updateResponse.json();
                alert('✅ 日曆資料已成功更新到 GitHub！\n\n訪客重新整理頁面即可看到更新。');
                console.log('GitHub 更新成功:', result);
                return true;
            } else {
                const errorData = await updateResponse.json();
                throw new Error(errorData.message || `更新失敗: ${updateResponse.status}`);
            }
        } catch (error) {
            console.error('GitHub API 更新錯誤:', error);
            alert(`❌ 更新失敗：${error.message}\n\n將改用下載方式。`);
            return false;
        }
    }
    
    // 下載 JSON 檔案（備用方案或同步到本地）
    downloadJSON(data, silent = false) {
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
        
        if (!silent) {
            alert('📥 日曆資料已下載\n\n請將檔案放到 assets/data/calendar-data.json 並上傳到 GitHub。');
        } else {
            console.log('📥 日曆資料已下載，請將檔案放到 assets/data/calendar-data.json 以同步本地檔案。');
        }
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
            
            // 不再顯示標題
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
        const descInput = document.getElementById('eventDescription');
        const statusInput = document.getElementById('eventStatus');
        
        if (dateInput) dateInput.value = dateKey;
        
        const events = this.events[dateKey] || [];
        const event = events[0] || { description: '', status: 'available' };
        
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
        
        const descInput = document.getElementById('eventDescription');
        const statusInput = document.getElementById('eventStatus');
        
        const description = descInput ? descInput.value.trim() : '';
        const status = statusInput ? statusInput.value : 'available';
        
        if (!description) {
            // 如果說明為空，刪除事件
            delete this.events[this.selectedDate];
        } else {
            // 儲存事件（不包含標題）
            if (!this.events[this.selectedDate]) {
                this.events[this.selectedDate] = [];
            }
            this.events[this.selectedDate] = [{
                date: this.selectedDate,
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

