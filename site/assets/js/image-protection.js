// Image protection: Disable right-click context menu and common shortcuts
// This prevents casual users from easily downloading images via right-click
(function () {
  'use strict';

  // 禁用右鍵選單
  document.addEventListener('contextmenu', function (e) {
    e.preventDefault();
    return false;
  });

  // 禁用常見的快捷鍵
  document.addEventListener('keydown', function (e) {
    // F12 - 開發者工具
    if (e.key === 'F12') {
      e.preventDefault();
      return false;
    }
    
    // Ctrl+Shift+I - 開發者工具 (Chrome/Edge)
    // Ctrl+Shift+C - 元素選擇器 (Chrome/Edge)
    // Ctrl+Shift+J - 控制台 (Chrome/Edge)
    if (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'C' || e.key === 'J')) {
      e.preventDefault();
      return false;
    }
    
    // Ctrl+U - 查看原始碼 (某些瀏覽器)
    if (e.ctrlKey && e.key === 'U') {
      e.preventDefault();
      return false;
    }

    // Ctrl+S / Cmd+S - 儲存頁面
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      return false;
    }

    // Ctrl+P / Cmd+P - 列印頁面
    if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
      e.preventDefault();
      return false;
    }
  });

  // 禁用圖片拖拽
  document.addEventListener('dragstart', function (e) {
    if (e.target.tagName === 'IMG') {
      e.preventDefault();
      return false;
    }
  });

  // 禁用圖片選取
  document.addEventListener('selectstart', function (e) {
    if (e.target.tagName === 'IMG') {
      e.preventDefault();
      return false;
    }
  });
})();

