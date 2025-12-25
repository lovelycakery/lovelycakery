// 管理員密碼驗證功能

// 如果配置檔案未載入，使用預設配置
if (typeof ADMIN_PASSWORD_CONFIG === 'undefined') {
    console.warn('⚠️ admin-password-config.js 未載入，使用預設配置');
    window.ADMIN_PASSWORD_CONFIG = {
        password: 'doobee0312', // 預設密碼（用於 GitHub Pages 部署）
        enabled: true
    };
}

class AdminPasswordManager {
    constructor() {
        this.isAuthenticated = false;
        this.init();
    }
    
    init() {
        // 確保使用全局配置（如果存在）
        const config = window.ADMIN_PASSWORD_CONFIG || ADMIN_PASSWORD_CONFIG;
        
        // 檢查是否啟用密碼保護
        if (!config || !config.enabled) {
            // 未啟用密碼保護，直接顯示內容
            this.showContent();
            return;
        }
        
        // 檢查是否已經驗證過（使用 sessionStorage，關閉瀏覽器後失效）
        const sessionAuth = sessionStorage.getItem('adminAuthenticated');
        if (sessionAuth === 'true') {
            this.isAuthenticated = true;
            this.showContent();
            return;
        }
        
        // 需要驗證，顯示密碼輸入框
        this.showPasswordModal();
        this.attachEventListeners();
    }
    
    showPasswordModal() {
        const modal = document.getElementById('passwordModal');
        const content = document.getElementById('calendarContent');
        if (modal) modal.style.display = 'flex';
        if (content) content.style.display = 'none';
    }
    
    showContent() {
        const modal = document.getElementById('passwordModal');
        const content = document.getElementById('calendarContent');
        if (modal) modal.style.display = 'none';
        if (content) content.style.display = 'block';
    }
    
    verifyPassword() {
        const passwordInput = document.getElementById('adminPasswordInput');
        const errorMsg = document.getElementById('passwordError');
        
        if (!passwordInput) {
            console.error('找不到密碼輸入框');
            return;
        }
        
        // 使用全局配置
        const config = window.ADMIN_PASSWORD_CONFIG || ADMIN_PASSWORD_CONFIG;
        if (!config) {
            console.error('無法獲取密碼配置');
            if (errorMsg) {
                errorMsg.textContent = '配置錯誤：無法載入密碼配置';
                errorMsg.style.display = 'block';
            }
            return;
        }
        
        const enteredPassword = passwordInput.value.trim();
        const correctPassword = config.password;
        
        if (!correctPassword) {
            if (errorMsg) {
                errorMsg.textContent = '管理員密碼未設定，請在 admin-password-config.js 中設定密碼';
                errorMsg.style.display = 'block';
            }
            return;
        }
        
        if (enteredPassword === correctPassword) {
            // 密碼正確
            this.isAuthenticated = true;
            sessionStorage.setItem('adminAuthenticated', 'true');
            this.showContent();
            
            // 清空密碼輸入框
            passwordInput.value = '';
            if (errorMsg) errorMsg.style.display = 'none';
        } else {
            // 密碼錯誤
            if (errorMsg) {
                const currentLang = localStorage.getItem('language') || 'zh';
                errorMsg.textContent = currentLang === 'en' 
                    ? 'Incorrect password. Please try again.' 
                    : '密碼錯誤，請重試。';
                errorMsg.style.display = 'block';
            }
            passwordInput.value = '';
            passwordInput.focus();
            
            // 添加錯誤動畫
            passwordInput.classList.add('password-input-error');
            setTimeout(() => {
                passwordInput.classList.remove('password-input-error');
            }, 500);
        }
    }
    
    attachEventListeners() {
        const passwordInput = document.getElementById('adminPasswordInput');
        const submitBtn = document.getElementById('passwordSubmitBtn');
        
        if (passwordInput) {
            // Enter 鍵提交
            passwordInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.verifyPassword();
                }
            });
        }
        
        if (submitBtn) {
            submitBtn.addEventListener('click', () => {
                this.verifyPassword();
            });
        }
        
        // 更新語言
        this.updateLanguage();
    }
    
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
    }
}

// 初始化密碼管理器
function initAdminPassword() {
    // 確保配置已設定（如果配置檔案未載入，已在上方設定預設值）
    const config = window.ADMIN_PASSWORD_CONFIG;
    if (!config) {
        console.warn('⚠️ 使用預設配置（配置檔案未載入）');
        window.ADMIN_PASSWORD_CONFIG = {
            password: 'admin',
            enabled: true
        };
    }
    
    window.adminPasswordManager = new AdminPasswordManager();
    
    // 監聽語言切換
    const langButtons = document.querySelectorAll('.lang-btn');
    langButtons.forEach(button => {
        button.addEventListener('click', () => {
            setTimeout(() => {
                if (window.adminPasswordManager) {
                    window.adminPasswordManager.updateLanguage();
                }
            }, 100);
        });
    });
}

// 如果 DOM 已準備好，直接初始化；否則等待 DOMContentLoaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAdminPassword);
} else {
    // DOM 已準備好，但可能腳本還在載入，稍等一下
    setTimeout(initAdminPassword, 50);
}

