# Lovely Cakery 網站

手工千層蛋糕網站，支援中英文切換。

## 專案結構

- `site/`：**網站本體**（GitHub Pages 部署目錄），包含 Web Admin 管理介面
- `scripts/`：圖片優化/驗證腳本
- `check.sh`：部署前檢查
- `deploy.sh`：部署腳本（push 前自動跑 check.sh）

## 管理網站內容

合作者直接打開 Web Admin 即可編輯：**`site/admin.html`**（部署後為 GitHub Pages 網址）

- 不需安裝任何工具，瀏覽器直接操作
- 使用 GitHub Personal Access Token 認證
- 支援日曆、季節限定、全部品項的編輯

## 部署

本專案使用 **GitHub Actions** 部署：push 到 `main` 後會先跑檢查（`check.sh`），通過才會部署 `site/`。
