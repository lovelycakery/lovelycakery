# Lovely Cakery 網站

手工千層蛋糕網站，支援中英文切換。

## 專案資料夾結構（重要）

- `site/`：**網站本體（會部署到 GitHub Pages）**，包含 Web Admin 管理介面
- `admin/`：已刪除（舊版 Electron 管理工具，已被 Web Admin 完全取代）

## 管理網站內容

合作者直接打開 Web Admin 即可編輯：**`site/admin.html`**（部署後為 GitHub Pages 網址）

- 不需安裝任何工具，瀏覽器直接操作
- 使用 GitHub Personal Access Token 認證
- 支援日曆、季節限定、全部品項的編輯

## 文件入口

- `site/README.md`：網站頁面結構、預覽、部署
- `site/AI_MAINTENANCE_GUIDE.md`：完整架構說明（檔案職責、日曆 iframe、快取版本、維護操作）

## 部署到 GitHub Pages

> 本專案使用 **GitHub Actions** 部署：push 到 `main` 後會先跑檢查（`check.sh`），檢查通過才會部署 `site/`。

更完整的部署/本機測試/圖片壓縮流程請看：`site/README.md`。

