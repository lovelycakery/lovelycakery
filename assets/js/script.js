// 語言切換功能
document.addEventListener('DOMContentLoaded', function() {
    // 獲取語言切換按鈕
    const langButtons = document.querySelectorAll('.lang-btn');
    const currentLang = localStorage.getItem('language') || 'zh'; // 預設為中文
    
    // 初始化語言
    switchLanguage(currentLang);
    
    // 為每個語言按鈕添加點擊事件
    langButtons.forEach(button => {
        button.addEventListener('click', function() {
            const lang = this.getAttribute('data-lang');
            switchLanguage(lang);
            // 保存語言選擇到 localStorage
            localStorage.setItem('language', lang);
        });
    });
    
    function switchLanguage(lang) {
        // 更新按鈕狀態
        langButtons.forEach(btn => {
            if (btn.getAttribute('data-lang') === lang) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        
        // 更新所有帶有 data-en 和 data-zh 屬性的元素
        const elements = document.querySelectorAll('[data-en][data-zh]');
        elements.forEach(element => {
            if (lang === 'en') {
                element.textContent = element.getAttribute('data-en');
            } else {
                element.textContent = element.getAttribute('data-zh');
            }
        });
        
        // 更新 HTML lang 屬性
        document.documentElement.lang = lang === 'en' ? 'en' : 'zh-TW';
    }
});
