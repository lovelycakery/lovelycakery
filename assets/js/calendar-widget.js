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
        // 檢查 localStorage 是否有未同步的資料
        const hasUnsynced = localStorage.getItem('calendarEventsUnsynced') === 'true';
        const localData = localStorage.getItem('calendarEvents');
        
        // 如果有未同步的本地資料，優先使用它
        if (hasUnsynced && localData) {
            try {
                const data = JSON.parse(localData);
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
                console.log('從 localStorage 載入未同步的日曆資料');
                this.renderCalendar();
                return;
            } catch (error) {
                console.error('解析 localStorage 資料時發生錯誤:', error);
                // 繼續嘗試從 GitHub 載入
            }
        }
        
        // 從 GitHub 載入最新的資料
        try {
            const response = await fetch(this.dataFile + '?t=' + Date.now()); // 添加時間戳避免緩存
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
                console.log('從 GitHub 載入日曆資料');
                // 同步到 localStorage（作為備份）
                localStorage.setItem('calendarEvents', JSON.stringify(data));
                localStorage.removeItem('calendarEventsUnsynced');
            } else {
                console.log('日曆資料檔案不存在，使用 localStorage 或空資料');
                // 如果 GitHub 載入失敗但有 localStorage，嘗試使用它
                if (localData) {
                    try {
                        const data = JSON.parse(localData);
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
                        console.log('從 localStorage 載入備份資料');
                    } catch (error) {
                        console.error('載入備份資料失敗:', error);
                        this.events = {};
                    }
                } else {
                    this.events = {};
                }
            }
        } catch (error) {
            console.error('載入日曆資料時發生錯誤:', error);
            // 如果 GitHub 載入失敗但有 localStorage，嘗試使用它
            if (localData) {
                try {
                    const data = JSON.parse(localData);
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
                    console.log('從 localStorage 載入備份資料');
                } catch (parseError) {
                    console.error('載入備份資料失敗:', parseError);
                    this.events = {};
                }
            } else {
                this.events = {};
            }
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
        
        // 先保存到 localStorage（標記為未同步）
        localStorage.setItem('calendarEvents', JSON.stringify(data));
        localStorage.setItem('calendarEventsUnsynced', 'true');
        
        // 檢查是否啟用 GitHub API
        if (typeof checkGitHubConfig !== 'undefined') {
            const configCheck = checkGitHubConfig();
            if (configCheck.valid) {
                // 使用 GitHub API 自動更新
                const success = await this.updateGitHubFile(data);
                if (success) {
                    // 成功更新，清除未同步標記
                    localStorage.removeItem('calendarEventsUnsynced');
                    return; // 成功更新，不需要下載檔案
                } else {
                    // GitHub API 更新失敗，保留未同步標記
                    console.warn('GitHub API 更新失敗，資料保留在 localStorage 中');
                    alert('⚠️ 更新失敗\n\n資料已儲存在瀏覽器中，但尚未同步到 GitHub。\n\n請檢查網路連接或稍後再試。');
                }
            } else {
                // GitHub API 未配置，提供下載方式
                console.warn('GitHub API 未啟用:', configCheck.reason);
                localStorage.setItem('calendarEventsUnsynced', 'true');
            }
        } else {
            localStorage.setItem('calendarEventsUnsynced', 'true');
        }
        
        // 如果 GitHub API 未啟用或更新失敗，提供下載 JSON 檔案的功能
        this.downloadJSON(data, true); // silent = true，因為已經顯示過錯誤訊息
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
                console.log('GitHub 更新成功:', result);
                
                // 清除未同步標記
                localStorage.removeItem('calendarEventsUnsynced');
                
                // 等待一小段時間讓 GitHub 更新完成，然後重新載入資料確認
                setTimeout(async () => {
                    // 清除 localStorage 中的舊資料，強制從 GitHub 重新載入
                    localStorage.removeItem('calendarEvents');
                    await this.loadEvents();
                    console.log('已重新載入資料確認更新');
                }, 1500);
                
                alert('✅ 日曆資料已成功更新到 GitHub！\n\n請等待 1-2 秒後刷新頁面以確認更新。\n\n訪客重新整理頁面即可看到更新。');
                return true;
            } else {
                const errorText = await updateResponse.text();
                let errorMessage = `HTTP ${updateResponse.status}`;
                try {
                    const errorData = JSON.parse(errorText);
                    errorMessage = errorData.message || errorMessage;
                    if (errorData.errors) {
                        errorMessage += '\n' + JSON.stringify(errorData.errors);
                    }
                } catch (e) {
                    if (errorText) {
                        errorMessage = errorText.substring(0, 200);
                    }
                }
                console.error('GitHub API 錯誤詳情:', {
                    status: updateResponse.status,
                    statusText: updateResponse.statusText,
                    error: errorMessage
                });
                throw new Error(errorMessage);
            }
        } catch (error) {
            console.error('GitHub API 更新錯誤:', error);
            const errorMsg = error.message || '未知錯誤';
            alert(`❌ GitHub 更新失敗：${errorMsg}\n\n資料已儲存在瀏覽器中，請稍後再試或使用下載方式。\n\n詳細錯誤請查看瀏覽器控制台。`);
            // 保留 localStorage 中的資料，因為更新失敗
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
        const dateDisplay = document.getElementById('eventDateDisplay');
        const descInput = document.getElementById('eventDescription');
        const statusInput = document.getElementById('eventStatus');
        
        // 格式化日期顯示
        if (dateDisplay) {
            const date = new Date(dateKey);
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const currentLang = localStorage.getItem('language') || 'zh';
            if (currentLang === 'en') {
                const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
                dateDisplay.textContent = `${monthNames[date.getMonth()]} ${day}, ${year}`;
            } else {
                dateDisplay.textContent = `${year}年 ${month}月 ${day}日`;
            }
        }
        
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
        
        // 修改：只要有狀態就保存，即使說明為空
        if (!description && !status) {
            // 如果說明和狀態都為空，刪除事件
            delete this.events[this.selectedDate];
        } else {
            // 儲存事件（只要有狀態就保存）
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
        
        // 更新日期顯示（如果模態框已打開）
        if (this.selectedDate) {
            const dateDisplay = document.getElementById('eventDateDisplay');
            if (dateDisplay) {
                const date = new Date(this.selectedDate);
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                if (currentLang === 'en') {
                    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
                    dateDisplay.textContent = `${monthNames[date.getMonth()]} ${day}, ${year}`;
                } else {
                    dateDisplay.textContent = `${year}年 ${month}月 ${day}日`;
                }
            }
        }
        
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

