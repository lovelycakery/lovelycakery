# Lovely Cakery 網站

手工千層蛋糕網站，支援中英文切換。

## 專案資料夾結構（重要）

- `site/`：**網站本體（會部署到 GitHub Pages）**
- `admin/`：本機管理工具（不會被部署；給合作者用）

## 文件入口（建議從這裡開始）

- **網站本體（`site/`）**
  - `site/README.md`：網站頁面/資產結構、如何本機預覽、如何更新內容
  - `site/AI_MAINTENANCE_GUIDE.md`：網站架構真相（檔案職責、日曆 iframe、快取版本、踩雷點）
- **管理工具（`admin/`）**
  - `admin/README.md`：如何啟動/使用管理工具
  - `admin/ADMIN_SAFETY_GUIDE.md`：管理工具安全護欄（必遵守）

## 部署到 GitHub Pages

> 本專案使用 **GitHub Actions** 部署：push 到 `main` 後會先跑檢查（`check.sh`），檢查通過才會部署 `site/`。

更完整的部署/本機測試/圖片壓縮流程請看：`site/README.md`。

