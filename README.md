# Lovely Cakery 網站

手工千層蛋糕網站，支援中英文切換。

## 部署到 GitHub Pages

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
   - 在 "Source" 選擇 "Deploy from a branch"
   - Branch 選擇 "main"，資料夾選擇 "/ (root)"
   - 點擊 "Save"

4. **等待部署完成**
   - 幾分鐘後，你的網站就會在以下網址上線：
   - `https://lovelycakery.github.io/lovelycakery/`

**之後更新網站：**
只需要執行：
```bash
./deploy.sh "更新內容描述"
```

### 手動部署

如果不想使用腳本，也可以手動執行：

```bash
git add .
git commit -m "更新內容"
git push origin main
```

## 本地測試

直接在瀏覽器開啟 `index.html` 即可預覽網站。

## 檔案結構

```
Cursor/
├── index.html          # 首頁
├── README.md          # 說明文件
├── deploy.sh          # 部署腳本
└── assets/            # 靜態資源
    ├── css/
    │   └── styles.css
    ├── js/
    │   └── script.js
    └── images/
        ├── cakes.jpg           # 首頁圖片
        ├── calendar/           # 日曆頁面圖片
        ├── seasonal/           # 季節限定頁面圖片
        ├── products/           # 全部品項頁面圖片
        ├── order/              # 訂購方式頁面圖片
        └── contact/            # 聯絡頁面圖片
```

## 圖片組織方式

**分頁圖片存放位置：**

- **首頁圖片**：直接放在 `assets/images/`（例如：`cakes.jpg`）
- **日曆頁面**：放在 `assets/images/calendar/`
- **季節限定頁面**：放在 `assets/images/seasonal/`
- **全部品項頁面**：放在 `assets/images/products/`
- **訂購方式頁面**：放在 `assets/images/order/`
- **聯絡頁面**：放在 `assets/images/contact/`

**使用範例：**
```html
<!-- 日曆頁面 -->
<img src="assets/images/calendar/calendar-hero.jpg" alt="Calendar">

<!-- 季節限定頁面 -->
<img src="assets/images/seasonal/spring-cake.jpg" alt="Spring Cake">

<!-- 產品圖片 -->
<img src="assets/images/products/matcha-cake.jpg" alt="Matcha Cake">
```

## 功能

- ✅ 響應式設計（支援手機、平板、電腦）
- ✅ 中英文切換
- ✅ 語言選擇記憶功能（使用 localStorage）

