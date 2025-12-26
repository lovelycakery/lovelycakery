// 語言切換功能（共用模組）
// 需要在 HTML 先載入 assets/js/i18n.js
if (window.LovelyI18n) {
    window.LovelyI18n.initLanguageSwitcher();
} else {
    console.warn('LovelyI18n 未載入：請確認 assets/js/i18n.js 已在 script.js 之前載入');
}
