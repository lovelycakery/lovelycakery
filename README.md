# Lovely Cakery 網站

手工千層蛋糕網站，支援中英文切換。

## 專案資料夾結構（重要）

- `site/`：**網站本體（會部署到 GitHub Pages）**
- `admin/`：本機管理工具（不會被部署；給合作者用）

## 維護手冊（給「新的對話」/未來維護用）

請先閱讀 `AI_MAINTENANCE_GUIDE.md`，裡面包含：
- 架構與檔案職責
- 語言切換 / 日曆 iframe / GitHub API 設定方式
- 常見修改流程與踩雷清單
- 快速檢查指令（避免缺檔、避免輪詢回歸）
- 圖片最佳化與部署前檢查（避免上傳超大圖）
- 避免 CLS（圖片加 width/height）

## 部署到 GitHub Pages

> 本專案使用 **GitHub Actions** 部署：push 到 `main` 後會先跑檢查（`check.sh`），檢查通過才會部署 `site/`。

### 快速部署（使用腳本）

**第一次部署：**
1. 確保 GitHub 儲存庫已建立：`lovelycakery/lovelycakery`
2. 在專案資料夾執行：
   ```bash
   ./deploy.sh
   ```
   或指定提交訊息：
   ```bash
   ./deploy.sh "Initial commit: Lovely Cakery website"
   ```

3. **啟用 GitHub Pages**（只需做一次）
   - 進入儲存庫頁面：https://github.com/lovelycakery/lovelycakery
   - 點擊 "Settings"（設定）
   - 在左側選單找到 "Pages"
   - 在 "Source" 選擇 **GitHub Actions**

4. **等待部署完成**
   - 幾分鐘後，你的網站就會在以下網址上線：
   - `https://lovelycakery.github.io/lovelycakery/`

**之後更新網站：**
只需要執行：
```bash
./deploy.sh "更新內容描述"
```

> `deploy.sh` 會在 push 前自動執行 `./check.sh`（缺檔/載入順序/輪詢回歸/私密設定誤提交等檢查）。
> 你也可以單獨先跑：`./check.sh`
>
> `deploy.sh` 也會自動：
> - 壓縮本次變更的圖片（`scripts/optimize_images.py --only-changed`）
> - 更新日曆相關資源的快取版本號（`bump-calendar-cache.sh`，會統一更新相關頁面的 `?v=...`）

## 圖片最佳化（建議每次新增/替換圖片都做）

這個專案已內建兩個腳本（並且 `check.sh` 會自動驗證）：

```bash
# 1) 先把 products/seasonal + 首頁 cakes.jpg 壓到適合網頁的尺寸/體積
python3 scripts/optimize_images.py

# 或只處理「本次 git 變更/新增」的圖片（更快，推薦日常使用）
python3 scripts/optimize_images.py --only-changed

# 2) 部署前檢查（deploy.sh 會自動跑 check.sh，check.sh 會跑這個）
python3 scripts/verify_images.py
```

### 手動部署

如果不想使用腳本，也可以手動執行：

```bash
git add .
git commit -m "更新內容"
git push origin main
```

## 本地測試

直接在瀏覽器開啟 `site/index.html` 即可預覽網站。

> 與**程式架構**相關的說明（檔案職責、檔案結構、圖片/資產規範、script 載入順序、踩雷點）請一律以 `AI_MAINTENANCE_GUIDE.md` 為準。

