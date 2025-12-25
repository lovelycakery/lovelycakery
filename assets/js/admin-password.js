// 管理員密碼驗證功能

class AdminPasswordManager {
    constructor() {
        this.isAuthenticated = false;
        this.init();
    }
    
    init() {
        // 檢查是否啟用密碼保護
        if (!ADMIN_PASSWORD_CONFIG.enabled) {
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
        
        if (!passwordInput) return;
        
        const enteredPassword = passwordInput.value.trim();
        const correctPassword = ADMIN_PASSWORD_CONFIG.password;
        
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
document.addEventListener('DOMContentLoaded', () => {
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
});

