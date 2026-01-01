// 日曆組件 JavaScript（可編輯 / 管理端）
// 維護重點：
// - 資料來源：assets/data/calendar-data.json（訪客端），本檔案負責載入/編輯/保存
// - 保存策略：先寫 localStorage（calendarEvents + calendarEventsUnsynced），再嘗試 GitHub API
// - GitHub API 設定：本機可放 assets/js/github-config.local.js（被 .gitignore 忽略）
// - 語言：使用 localStorage.language（由 assets/js/i18n.js 管理），並支援 postMessage 事件驅動更新

class CalendarWidget {
    constructor() {
        this.currentDate = new Date();
        this.events = {};
        this.selectedDate = null;
        this._lastSyncStatus = null; // 'synced' | 'unsynced'
        // Shared config (dataFile + cacheVersion)
        const shared = window.LovelyCalendarShared;
        this.dataFile = shared ? shared.getDefaultDataFile() : 'assets/data/calendar-data.json';
        this.cacheVersion = shared ? shared.getCacheVersion() : '';
        
        this.init();
    }
    
    async init() {
        await this.loadEvents();
        this.updateLanguage();
        this.renderCalendar();
        this.attachEventListeners();
        
        // 檢查同步狀態
        this.checkSyncStatus();
    }
    
    // 檢查同步狀態
    checkSyncStatus() {
        const hasUnsynced = localStorage.getItem('calendarEventsUnsynced') === 'true';
        if (hasUnsynced) {
            console.warn('⚠️ 發現未同步的資料。頁面已從 GitHub 載入最新資料。');
            // 可以在這裡添加視覺提示，比如在頁面上顯示一個警告訊息
        }
        this.postSyncStatus(hasUnsynced ? 'unsynced' : 'synced');
    }

    postSyncStatus(status) {
        try {
            if (this._lastSyncStatus === status) return;
            this._lastSyncStatus = status;
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({ type: 'calendar-sync-status', status }, '*');
            }
        } catch (e) {
            // ignore
        }
    }
    
    // 載入事件資料
    async loadEvents() {
        const localData = localStorage.getItem('calendarEvents');
        const hasUnsynced = localStorage.getItem('calendarEventsUnsynced') === 'true';
        
        // 檢查是否在本地環境（file://）或網頁環境（http/https）
        const isLocalFile = window.location.protocol === 'file:';
        
        // 在本地文件模式下，如果 localStorage 中有已同步的資料（沒有未同步標記），優先使用
        // 因為 GitHub CDN 可能有緩存延遲
        if (isLocalFile && localData && !hasUnsynced) {
            try {
                const data = JSON.parse(localData);
                const shared = window.LovelyCalendarShared;
                this.events = (shared && typeof shared.eventsArrayToMap === 'function')
                    ? shared.eventsArrayToMap(data)
                    : {};
                console.log('從 localStorage 載入已同步的資料（本地文件模式）');
                
                // 在後台嘗試從 GitHub 載入最新資料以確認（但不阻塞顯示）
                this.loadFromGitHubInBackground();
                return; // 已從 localStorage 載入，直接返回
            } catch (error) {
                console.error('載入 localStorage 資料失敗:', error);
                // 繼續執行後續的載入邏輯
            }
        }
        
        // 優先從檔案載入資料（無論是從 GitHub 還是本地）
        let loadSuccess = false;
        
        try {
            // 先嘗試載入資料（從 GitHub 或本地檔案）
            const shared = window.LovelyCalendarShared;
            const url = shared ? shared.withCacheVersion(this.dataFile, this.cacheVersion) : (this.cacheVersion ? (this.dataFile + '?v=' + encodeURIComponent(this.cacheVersion)) : this.dataFile);
            const response = await fetch(url);
            if (response.ok) {
                const data = await response.json();
                this.events = (shared && typeof shared.eventsArrayToMap === 'function')
                    ? shared.eventsArrayToMap(data)
                    : {};
                console.log(isLocalFile ? '從 GitHub 載入日曆資料' : '從本地檔案載入日曆資料');
                
                // 同步到 localStorage（作為備份）
                localStorage.setItem('calendarEvents', JSON.stringify(data));
                
                // 如果有未同步標記，檢查本地資料是否與檔案不同
                if (hasUnsynced && localData) {
                    try {
                        const localDataObj = JSON.parse(localData);
                        const localStr = JSON.stringify(localDataObj.events?.sort((a, b) => a.date.localeCompare(b.date)) || []);
                        const fileStr = JSON.stringify(data.events?.sort((a, b) => a.date.localeCompare(b.date)) || []);
                        
                        if (localStr !== fileStr) {
                            console.warn('⚠️ 發現本地有未同步的資料，但檔案的資料已經更新。將使用檔案的資料。');
                            // 清除未同步標記，使用檔案的資料
                            localStorage.removeItem('calendarEventsUnsynced');
                        } else {
                            // 資料相同，清除未同步標記
                            localStorage.removeItem('calendarEventsUnsynced');
                        }
                    } catch (compareError) {
                        console.error('比較資料時發生錯誤:', compareError);
                        localStorage.removeItem('calendarEventsUnsynced');
                    }
                }
                loadSuccess = true;
                this.postSyncStatus('synced');
            } else {
                // 載入失敗，使用 localStorage 備份（如果有的話）
                console.warn('⚠️ 無法載入資料檔案，嘗試使用 localStorage 備份');
                loadSuccess = false;
            }
        } catch (error) {
            console.error('載入日曆資料時發生錯誤:', error);
            loadSuccess = false;
        }
        
        // 如果載入失敗，嘗試使用 localStorage 備份
        if (!loadSuccess) {
            if (localData) {
                try {
                    const data = JSON.parse(localData);
                    const shared = window.LovelyCalendarShared;
                    this.events = (shared && typeof shared.eventsArrayToMap === 'function')
                        ? shared.eventsArrayToMap(data)
                        : {};
                    console.log('從 localStorage 載入備份資料');
                    if (hasUnsynced) {
                        console.warn('⚠️ 使用未同步的本地資料。請確保網路連接正常，並稍後重新整理以同步到 GitHub。');
                        this.postSyncStatus('unsynced');
                    }
                } catch (error) {
                    console.error('載入備份資料失敗:', error);
                    this.events = {};
                }
            } else {
                console.log('沒有備份資料，使用空資料（日曆仍會顯示，只是沒有事件）');
                this.events = {};
            }
        }
        // 不在這裡調用 renderCalendar，由 init() 統一調用
    }
    
    // 在後台從 GitHub 載入資料以確認（不阻塞顯示）
    async loadFromGitHubInBackground() {
        try {
            const shared = window.LovelyCalendarShared;
            const url = shared ? shared.withCacheVersion(this.dataFile, this.cacheVersion) : (this.cacheVersion ? (this.dataFile + '?v=' + encodeURIComponent(this.cacheVersion)) : this.dataFile);
            const response = await fetch(url);
            if (response.ok) {
                const data = await response.json();
                const localData = localStorage.getItem('calendarEvents');
                if (localData) {
                    const localDataObj = JSON.parse(localData);
                    const localStr = JSON.stringify(localDataObj.events?.sort((a, b) => a.date.localeCompare(b.date)) || []);
                    const fileStr = JSON.stringify(data.events?.sort((a, b) => a.date.localeCompare(b.date)) || []);
                    
                    if (localStr !== fileStr) {
                        console.log('檢測到 GitHub 資料已更新，更新 localStorage');
                        localStorage.setItem('calendarEvents', JSON.stringify(data));
                        // 如果資料不同，可以選擇重新載入或提示用戶
                    }
                }
            }
        } catch (error) {
            // 後台載入失敗不影響顯示，靜默失敗
            console.log('後台載入 GitHub 資料失敗（不影響顯示）:', error);
        }
    }
    
    // 將目前 events 序列化成 JSON 資料
    buildData() {
        const eventsArray = [];
        Object.keys(this.events).forEach(date => {
            this.events[date].forEach(event => {
                eventsArray.push(event);
            });
        });
        
        return { events: eventsArray };
    }

    // 儲存到本機（不自動上傳）
    saveLocalOnly() {
        const data = this.buildData();
        localStorage.setItem('calendarEvents', JSON.stringify(data));
        localStorage.setItem('calendarEventsUnsynced', 'true');
        this.postSyncStatus('unsynced');
    }

    // 由使用者明確觸發的同步（可由 manager shell 透過 postMessage 呼叫）
    async syncToGitHub(options = {}) {
        const silent = !!options.silent;
        const data = this.buildData();

        // 檢查並準備 GitHub 配置（支援配置文件或預設配置）
        let githubConfig = null;
        if (typeof GITHUB_CONFIG !== 'undefined' && typeof checkGitHubConfig !== 'undefined') {
            const configCheck = checkGitHubConfig();
            if (configCheck.valid) {
                githubConfig = GITHUB_CONFIG;
            }
        }

        // 如果配置文件未載入：無法在公開網站安全地自動同步（不應自動下載造成干擾）
        if (!githubConfig) {
            console.warn('⚠️ github-config.local.js 未載入，無法自動更新到 GitHub');
            const msg = '無法自動同步：缺少 github-config.local.js（請在本機建立 Token 設定後再同步）';
            if (!silent) {
                alert('⚠️ 無法自動同步到 GitHub\n\n原因：未載入 github-config.local.js（內含 Token，不能提交到公開倉庫）。\n\n請在本機建立設定後再同步。');
            }
            return { ok: false, message: msg, mode: 'config_missing' };
        }

        if (!(githubConfig && githubConfig.enabled)) {
            const msg = 'GitHub API 未啟用（github-config.local.js enabled=false）';
            if (!silent) alert('⚠️ 無法同步\n\nGitHub API 未啟用，請檢查 github-config.local.js。');
            return { ok: false, message: msg };
        }

        const success = await this.updateGitHubFileWithConfig(data, githubConfig, { silent });
        if (success) {
            localStorage.removeItem('calendarEventsUnsynced');
            this.postSyncStatus('synced');
            return { ok: true };
        }

        // 失敗：保留未同步標記
        localStorage.setItem('calendarEventsUnsynced', 'true');
        this.postSyncStatus('unsynced');
        return { ok: false, message: 'GitHub API 更新失敗（詳情請查看 console）' };
    }
    
    // 使用 GitHub API 更新檔案（使用提供的配置）
    async updateGitHubFileWithConfig(data, config, options = {}) {
        const silent = !!options.silent;
        try {
            if (!config || !config.enabled || !config.token) {
                console.warn('GitHub 配置無效');
                return false;
            }
            
            const { token, owner, repo, filePath } = config;
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
                
                // 更新 localStorage 為最新的資料（作為備份）
                localStorage.setItem('calendarEvents', JSON.stringify(data));
                // 清除未同步標記
                localStorage.removeItem('calendarEventsUnsynced');
                
                // 立即更新日曆顯示（使用剛剛保存的資料）
                // 注意：這裡使用 this.events，因為它已經包含最新的資料
                this.renderCalendar();
                
                // 不需要重新載入資料，因為 this.events 已經包含最新的資料
                // 重新載入可能會因為 CDN 緩存而載入到舊資料
                console.log('日曆顯示已更新為最新資料');
                
                if (!silent) {
                    alert('✅ 日曆資料已成功更新到 GitHub！\n\n頁面已自動更新顯示。\n\n訪客重新整理頁面即可看到更新。');
                }
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
            if (!silent) {
                alert(`❌ GitHub 更新失敗：${errorMsg}\n\n資料已儲存在瀏覽器中，請稍後再試或使用下載方式。\n\n詳細錯誤請查看瀏覽器控制台。`);
            }
            // 保留 localStorage 中的資料，因為更新失敗
            return false;
        }
    }
    
    // 使用 GitHub API 更新檔案（保持向後兼容）
    async updateGitHubFile(data) {
        // 檢查是否有配置
        if (typeof GITHUB_CONFIG !== 'undefined' && typeof checkGitHubConfig !== 'undefined') {
            const configCheck = checkGitHubConfig();
            if (configCheck.valid) {
                return await this.updateGitHubFileWithConfig(data, GITHUB_CONFIG);
            }
        }
        
        // 沒有配置，無法更新
        console.error('GitHub 配置未載入，無法更新');
        return false;
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
        const currentLang = localStorage.getItem('language') || 'zh';
        const monthYearEl = document.getElementById('monthYear');
        if (monthYearEl) {
            const shared = window.LovelyCalendarShared;
            monthYearEl.textContent = shared
                ? shared.getMonthYearLabel(this.currentDate, currentLang)
                : monthYearEl.textContent;
        }
        
        // 清空日曆網格
        const grid = document.getElementById('calendarGrid');
        if (!grid) {
            console.error('找不到 calendarGrid 元素，無法渲染日曆');
            return;
        }
        grid.innerHTML = '';
        
        // 獲取月份的第一天和最後一天
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();
        const startingDayOfWeek = firstDay.getDay();
        
        // 使用 shared 格式化函數
        const shared = window.LovelyCalendarShared;
        const formatDateKey = (y, m, d) => {
            return shared ? shared.formatDateKey(y, m, d) : (new Date(y, m, d)).toISOString().split('T')[0];
        };
        
        // 上個月的日期
        const prevMonthLastDay = new Date(year, month, 0).getDate();
        for (let i = startingDayOfWeek - 1; i >= 0; i--) {
            const day = prevMonthLastDay - i;
            const dateKey = formatDateKey(year, month - 1, day);
            this.createDayElement(grid, day, true, dateKey);
        }
        
        // 當月的日期
        const today = new Date();
        for (let day = 1; day <= daysInMonth; day++) {
            const dateKey = formatDateKey(year, month, day);
            const isToday = year === today.getFullYear() && 
                           month === today.getMonth() && 
                           day === today.getDate();
            this.createDayElement(grid, day, false, dateKey, isToday);
        }
        
        // 下個月的日期（填滿網格）
        const totalCells = grid.children.length;
        const remainingCells = 42 - totalCells; // 6 行 x 7 列
        for (let day = 1; day <= remainingCells; day++) {
            const dateKey = formatDateKey(year, month + 1, day);
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
            
            // 如果事件有說明，添加說明指示器（星形）
            if (event.description && event.description.trim()) {
                const descIndicator = document.createElement('div');
                descIndicator.className = 'event-description-indicator';
                descIndicator.innerHTML = '★';
                dayEl.appendChild(descIndicator);
            }
            
            // 不再顯示標題
        }
        
        dayEl.addEventListener('click', () => this.openEventModal(dateKey));
        container.appendChild(dayEl);
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
        
        this.saveLocalOnly();
        this.renderCalendar();
        this.closeModal();
    }
    
    // 刪除事件
    deleteEvent() {
        if (!this.selectedDate) return;
        
        if (confirm('確定要刪除這個事件嗎？')) {
            delete this.events[this.selectedDate];
            this.saveLocalOnly();
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
        const shared = window.LovelyCalendarShared;
        if (shared && typeof shared.applyLanguageToDocument === 'function') {
            shared.applyLanguageToDocument(currentLang);
        } else if (window.LovelyI18n && typeof window.LovelyI18n.applyLanguage === 'function') {
            window.LovelyI18n.applyLanguage(currentLang, document);
        }
        
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
    // 防止被重複載入時重複初始化，造成事件監聽器/interval 疊加
    if (window.calendarWidget) return;
    window.calendarWidget = new CalendarWidget();
    
    // 監聽父頁面的語言切換（透過 storage 事件）
    window.addEventListener('storage', (e) => {
        if (e.key === 'language') {
            window.calendarWidget.updateLanguage();
        }
    });

    // 事件驅動：父頁語言切換時會 postMessage 通知（避免輪詢）
    window.addEventListener('message', (e) => {
        if (e && e.data && e.data.type === 'lovely-language') {
            // 確保 localStorage 跟父頁一致（父頁已寫入，但這裡保險）
            if (typeof e.data.lang === 'string') {
                localStorage.setItem('language', e.data.lang);
            }
            window.calendarWidget.updateLanguage();
        }

        // Manager shell: explicit sync request (save stays local; sync only on request)
        if (e && e.data && e.data.type === 'calendar-sync-request') {
            (async () => {
                try {
                    const result = await window.calendarWidget.syncToGitHub({ silent: true });
                    if (window.parent && window.parent !== window) {
                        window.parent.postMessage({ type: 'calendar-sync-result', ok: !!result.ok, message: result.message || '' }, '*');
                    }
                } catch (err) {
                    const msg = (err && err.message) ? err.message : '同步失敗';
                    if (window.parent && window.parent !== window) {
                        window.parent.postMessage({ type: 'calendar-sync-result', ok: false, message: msg }, '*');
                    }
                }
            })();
        }
    });
});

