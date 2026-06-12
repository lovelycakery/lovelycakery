# Lovely Cakery 網站專案

> **開始工作前，請先讀完 [WEB_GUIDE.md](WEB_GUIDE.md) 和 [ADMIN_GUIDE.md](ADMIN_GUIDE.md)**，了解網站架構、模組職責與修改指引。

純靜態網站（HTML/CSS/JS），沒有 build system、沒有框架。push 到 `main` 會**同時部署到 Cloudflare Pages（`lovelycakery.pages.dev`）與 GitHub Pages（`lovelycakery.github.io/lovelycakery/`）**，兩站內容一致（詳見 WEB_GUIDE.md 部署平台章節）。

## 專案結構

- `site/` — 網站本體（部署目錄）
- `scripts/` — 圖片優化/驗證腳本
- `check.sh` — 部署前檢查（引用完整性、schema 驗證、圖片大小等）
- `deploy.sh` — 部署腳本（push 前自動跑 check.sh）
- `bump-calendar-cache.sh` — 更新日曆 cache-busting 版本號

## 主站 7 頁

index.html / calendar.html / seasonal.html / all-items.html / sets.html / order.html / contact.html

共用 header 由 `site-header.js` 動態生成，語言切換由 `i18n.js` 統一處理（zh/en 雙語）。

## Web Admin

`admin.html` 提供瀏覽器端管理介面，透過 GitHub API 直接編輯日曆、商品資料與圖片，一鍵發布為原子 commit。

## 詳細文件

- [WEB_GUIDE.md](WEB_GUIDE.md) — 網站架構、模組職責、載入順序、維護任務與注意事項
- [ADMIN_GUIDE.md](ADMIN_GUIDE.md) — Web Admin 的架構、認證、資料流、iframe 通訊協定與修改指引

## 開發注意事項

- 變更後跑 `./check.sh` 確認無問題
- 改到 `styles.css` 或其他日曆會引用的共用資源時，`check.sh` 會要求 bump 日曆 cache 版本，請跑 `./bump-calendar-cache.sh` 再部署
- 新增/替換圖片先跑 `python3 scripts/optimize_images.py --only-changed`
- 語言同步用 postMessage，不要用 setInterval 輪詢
- `image-protection.js` 會攔截 IMG dragstart，編輯模式的拖曳在 `gallery-loader.js` 內處理衝突
- 若 `git push` 出現 SSH port 22 被封鎖，改用：`git remote set-url origin "ssh://git@ssh.github.com:443/lovelycakery/lovelycakery.git" && git push && git remote set-url origin git@github.com:lovelycakery/lovelycakery.git`
