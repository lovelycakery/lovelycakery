# 網站維護手冊

> 這個專案是**純靜態網站**（HTML/CSS/JS），沒有 build system、沒有框架。  
> 本文件描述「網站本體」的架構、模組職責與維護注意事項。編輯模式（Web Admin）相關內容請見 `ADMIN_GUIDE.md`。

## 重要：專案資料夾結構

- `site/`：**網站本體**（部署目錄）
- 本文件提到的路徑若未特別註明，一律以 `site/` 內為準（例如 `assets/js/i18n.js` 實際位置是 `site/assets/js/i18n.js`）

### 部署平台（雙重部署）

`push` 到 `main` 會**同時觸發兩條部署管線**，兩站內容一致：

| 平台 | 網址 | 機制 | 特點 |
|------|------|------|------|
| **Cloudflare Pages** | `lovelycakery.pages.dev` | Git 整合自動部署 | 讀 `site/_headers`（cache 策略） |
| **GitHub Pages** | `lovelycakery.github.io/lovelycakery/` | `.github/workflows/pages.yml`（含 `check.sh` 預檢） | 不讀 `_headers`，用 GitHub 預設 cache |

> `site/_headers` 是 Cloudflare 專用格式（GitHub Pages 會忽略它），設定 HTML `max-age=0, must-revalidate` 解決舊 HTML 引用舊版 `?v=` 的 cache 死角。

## 架構總覽

1. **主站頁面**：`index.html`, `calendar.html`, `seasonal.html`, `all-items.html`, `sets.html`, `order.html`, `contact.html`（另有 `404.html` 為自訂錯誤頁）
2. **共用導覽列/header**：`assets/js/site-header.js`（主站各頁共用，由 JS 動態生成）
3. **共用語言切換**：`assets/js/i18n.js`（唯一語言模組；頁面有 `.lang-btn` 時自動初始化）
4. **日曆採 iframe 隔離**：`calendar.html` 內嵌 `calendar-widget-readonly.html`
5. **商品/季節圖片動態載入**：`assets/js/gallery-loader.js` 從 JSON 資料檔動態產生相簿（透過 `.gallery-grid[data-gallery-type]` 自動初始化，不需 inline script）
6. **圖片防護**：`assets/js/image-protection.js` 載入於所有頁面，禁用右鍵與圖片拖曳

---

## 檔案結構

```
site/
├── index.html                         # 首頁
├── calendar.html                      # 日曆頁（嵌入只讀 widget）
├── seasonal.html                      # 季節限定 / 新品上市（gallery-loader.js 動態載入）
├── all-items.html                     # 全部品項（gallery-loader.js 動態載入）
├── sets.html                          # 優惠組合（gallery-loader.js 動態載入）
├── order.html                         # 訂購方式
├── contact.html                       # 聯絡/地圖
├── calendar-widget-readonly.html      # 只讀日曆 widget（iframe 內）
├── admin.html                         # Web Admin 管理頁面
├── 404.html                           # 自訂 404 錯誤頁
├── _headers                           # Cloudflare Pages cache 策略（GitHub Pages 忽略）
└── assets/
    ├── css/
    │   ├── styles.css                 # 主站共用樣式
    │   ├── skin.css                   # 視覺皮膚（CSS 變數覆蓋配色/字體，可替換）
    │   ├── calendar-widget.css        # 日曆 widget 專用（iframe 內隔離）
    │   ├── calendar-frame.css         # 日曆裝飾外框（可選）
    │   └── admin.css                  # Web Admin 專用樣式
    ├── js/
    │   ├── site-header.js             # 共用 header/nav 產生器
    │   ├── i18n.js                    # 語言切換模組
    │   ├── calendar-embed.js          # 日曆 iframe 高度同步
    │   ├── calendar-shared.js         # 日曆共用工具
    │   ├── calendar-widget-readonly.js# 只讀日曆 widget
    │   ├── gallery-loader.js          # 相簿動態載入（seasonal / all-items / sets 共用）
    │   ├── image-protection.js        # 圖片防護（禁右鍵/拖曳）
    │   ├── jszip.min.js               # Web Admin: ZIP 函式庫（第三方）
    │   ├── admin-github-api.js        # Web Admin: GitHub API 封裝
    │   ├── admin-image-compress.js    # Web Admin: 圖片壓縮
    │   ├── admin-translate.js         # Web Admin: Claude API 中→英翻譯
    │   └── admin-app.js              # Web Admin: UI 邏輯
    ├── data/
    │   ├── calendar-data.json         # 日曆事件資料
    │   ├── products-data.json         # 全部品項資料
    │   ├── seasonal-data.json         # 季節限定 / 新品上市資料
    │   └── sets-data.json             # 優惠組合資料
    └── images/
        ├── logo/                      # Logo 圖片
        ├── calendar/                  # 日曆頁面圖片
        │   └── frames/                # 日曆外框圖片
        ├── seasonal/                  # 季節限定頁面圖片
        ├── products/                  # 全部品項頁面圖片
        ├── sets/                      # 優惠組合頁面圖片
        ├── order/                     # 訂購方式頁面圖片
        ├── contact/                   # 地圖頁面圖片
        └── _originals/                # 原始圖片備份（不部署）
```

---

## 檔案職責

### HTML（頁面）

- `index.html`：首頁
- `calendar.html`：日曆頁（iframe 嵌入只讀日曆）
- `seasonal.html`：季節限定 / 新品上市頁（由 gallery-loader.js 動態載入圖片）
- `all-items.html`：全部品項頁（由 gallery-loader.js 動態載入圖片）
- `sets.html`：優惠組合頁（由 gallery-loader.js 動態載入圖片）
- `order.html`：訂購方式頁
- `contact.html`：聯絡/地圖頁
- `calendar-widget-readonly.html`：只讀日曆 widget 頁（iframe 內）
- `admin.html`：Web Admin 管理頁面（詳見 `ADMIN_GUIDE.md`）
- `404.html`：自訂 404 錯誤頁

### CSS

- `assets/css/styles.css`：主站共用樣式（header/nav、各分頁版面）
- `assets/css/skin.css`：視覺皮膚，載入於 `styles.css` 之後，用 CSS 變數覆蓋全站配色與字體。換膚只需修改 `:root` 變數值；移除 `<link>` 即恢復原樣
- `assets/css/calendar-widget.css`：日曆 widget 專用樣式（iframe 內隔離）
- `assets/css/calendar-frame.css`：日曆裝飾外框（可選；目前未預設啟用）
- `assets/css/admin.css`：Web Admin 管理頁面專用樣式

### JS（訪客端）

- `assets/js/site-header.js`
  - 主站共用 header/nav 產生器
  - 導覽列內容（新增/改名稱/改順序）以 `renderNavItems()` 裡的 items 陣列為單一來源
  - 同時負責 Google Fonts 非阻塞載入（`preload` + `media=print onload` 模式）
- `assets/js/i18n.js`
  - 唯一語言模組
  - 讀寫 `localStorage.language`（值：`zh` / `en`）
  - `applyLanguage()`：替換所有 `[data-en][data-zh]` 元素的文字
  - `initLanguageSwitcher()`：綁 `.lang-btn` 點擊事件
  - 切換時 `postMessage({type:'lovely-language', lang})` 通知所有 iframe
- `assets/js/calendar-shared.js`
  - 日曆共用工具（readonly / editable 共用，避免重複邏輯）
  - 包含：dataFile/cacheVersion、events array → map、月份標題、日期 key、語言套用 helper
- `assets/js/calendar-embed.js`
  - `calendar.html` 專用：iframe 高度同步（不做 transform 縮放）
  - 監聽 iframe `postMessage({type:'calendar-resize', height})`
- `assets/js/calendar-widget-readonly.js`
  - 只讀日曆（訪客端）
  - 不提供編輯，只提供 hover tooltip（有 description 才顯示）
  - render 後 `postMessage({type:'calendar-resize', height})` 讓父頁調整 iframe 高度
  - 每個日期格帶 `data-date="YYYY-MM-DD"`
- `assets/js/gallery-loader.js`
  - 相簿動態載入器（`seasonal.html`、`all-items.html`、`sets.html` 共用）
  - 從 JSON 資料檔（`products-data.json` / `seasonal-data.json` / `sets-data.json`）動態載入商品圖片
  - 自動初始化：偵測 `.gallery-grid[data-gallery-type="seasonal|products|sets"]`，不需 inline script
  - 提供圖片彈窗（modal）、標籤篩選、標籤圖例
  - 在 Admin 編輯模式下另有拖曳排序與點擊編輯功能（詳見 `ADMIN_GUIDE.md`）
- `assets/js/image-protection.js`
  - 圖片防護（防止一般使用者透過右鍵下載圖片）
  - 禁用右鍵選單、開發者工具快捷鍵（F12、Ctrl+Shift+I 等）、圖片拖曳與選取

### JS（Admin 端）

Admin 相關 JS 的詳細說明見 `ADMIN_GUIDE.md`：
- `assets/js/jszip.min.js`：第三方 ZIP 函式庫
- `assets/js/admin-github-api.js`：GitHub API 封裝（token 管理、Contents API、Git Data API 多檔原子 commit）
- `assets/js/admin-image-compress.js`：瀏覽器端圖片壓縮（Canvas API）
- `assets/js/admin-translate.js`：Claude API 中→英自動翻譯（品名/描述/日曆標籤）
- `assets/js/admin-app.js`：主要 UI 邏輯（本地編輯 + 即時預覽 + 一鍵發布）

---

## Script 載入順序

所有 `<script>` 皆使用 `defer`（平行下載、依序執行、不阻塞 HTML 解析）。

- **主站頁**：`site-header.js` → `i18n.js` → `image-protection.js`
- **相簿頁**（`seasonal.html` / `all-items.html`）：`site-header.js` → `i18n.js` → `gallery-loader.js` → `image-protection.js`
- **日曆嵌入頁** `calendar.html`：`site-header.js` → `i18n.js` → `calendar-embed.js` → `image-protection.js`
- **日曆 widget 頁**：`i18n.js` + `calendar-shared.js` → `calendar-widget-readonly.js` → `image-protection.js`

---

## 常見維護任務

### A) 新增一個主站分頁

1. 複製任一頁（例如 `seasonal.html`）
2. 確保頁面有 header 佔位元素：`<header class="header" id="site-header"></header>`
3. 保留底部共用腳本載入順序（皆須加 `defer`）：
   - `assets/js/site-header.js`
   - `assets/js/i18n.js`
   - `assets/js/image-protection.js`（放在最後載入）
4. 文案要支援雙語：用 `data-en` / `data-zh`

### B) 修改導覽列（header/nav）

改 `assets/js/site-header.js`（`renderNavItems()` 裡的 items 陣列）

### C) 修改日曆 UI / 規則

- 只讀端：改 `calendar-widget-readonly.html/.js` + `assets/css/calendar-widget.css`
- **不要**把主站 `styles.css` 拿去改日曆格子的樣式（日曆在 iframe 內）

### C.1) 日曆外框（可每月更換、可一鍵關閉）

- **外框樣式模組**：`assets/css/calendar-frame.css`
- **外框圖片**：`assets/images/calendar/frames/frame-current.png`（每月更換只要替換這張圖，檔名不變）
- **啟用方式**：`calendar.html` 引入 `calendar-frame.css`，iframe 外層包上 `.calendar-frame` / `.calendar-frame__inner`
- **關閉外框**：在 `<body>` 加上 `data-frame="off"`

### D) 語言切換

只改 `assets/js/i18n.js`（不要在各頁重複寫切換程式）

### E) 視覺皮膚（skin.css）

`assets/css/skin.css` 是獨立的視覺覆蓋層，載入於 `styles.css` 之後，用 CSS 變數覆蓋全站配色與字體。

**架構設計**：
- `styles.css` 保持不動（所有原始樣式硬編碼在此）
- `skin.css` 在 `:root` 定義 CSS 變數，再用這些變數覆蓋 `styles.css` 的對應屬性
- 已載入到 6 個訪客頁面（index / calendar / seasonal / all-items / order / contact），admin.html 不載入

**CSS 變數一覽**：
| 變數 | 用途 | 預設值 |
|------|------|--------|
| `--skin-text` | 主文字 | `#3d2817` |
| `--skin-text-secondary` | 次要文字、active 狀態 | `#8b6f47` |
| `--skin-text-muted` | 輔助文字 | `#6b5d4f` |
| `--skin-bg` | 頁面背景 | `#f5f3f0` |
| `--skin-bg-white` | Header / 卡片背景 | `#ffffff` |
| `--skin-bg-section` | 區塊背景 | `#f0ede8` |
| `--skin-accent` | 強調色（價格、focus） | `#c8a24a` |
| `--skin-button` | 按鈕背景 | `#e8d5c4` |
| `--skin-button-hover` | 按鈕 hover | `#d4c0a8` |
| `--skin-border` | 邊框色 | `rgba(61,40,23,0.08)` |
| `--skin-shadow` | 陰影 | `rgba(61,40,23,0.1)` |
| `--skin-shadow-hover` | 陰影 hover | `rgba(61,40,23,0.15)` |
| `--skin-font-body` | 內文字體 | `'Inter', sans-serif` |
| `--skin-font-heading` | 標題字體 | `'Playfair Display', serif` |

**換膚方式**：
- 改配色：修改 `:root` 裡的變數值即可，整站自動套用
- 做多套皮膚：複製成 `skin-dark.css` 等，換 HTML 裡的 `<link>` 即可切換
- 恢復原樣：把 `<link rel="stylesheet" href="assets/css/skin.css">` 註解掉或移除

**注意事項**：
- 只覆蓋視覺屬性（顏色、字體、陰影），不要動佈局（間距、grid、flex）
- 社群平台品牌色（Facebook 藍、Instagram 漸層）不納入變數，保持品牌一致性
- 日曆 widget 在 iframe 內，不受 skin.css 影響

---

## 容易踩雷的點

- **不要重新加回 setInterval 輪詢語言**：目前語言同步用 postMessage（事件驅動）
- **GitHub Token**：只能放 `github-config.local.js`（不要放回 repo）
- **iframe 高度/縮放**：只改 `calendar-embed.js`，widget 內高度回報在 `calendar-widget-readonly.js`
- **`image-protection.js` 與編輯模式拖曳衝突**：`image-protection.js` 會攔截 IMG 的 `dragstart` 事件。`gallery-loader.js` 在編輯模式下已做防護（`img.draggable = false`、`e.stopPropagation()`），不要移除 `image-protection.js` 的 dragstart 攔截

---

## 效能規範

### 圖片優化

- `scripts/optimize_images.py`：最大邊縮到 1600px + JPEG quality=82 + progressive
  ```bash
  python3 scripts/optimize_images.py              # 全量
  python3 scripts/optimize_images.py --only-changed # 只處理 git 變更的圖片
  ```
- `scripts/verify_images.py`：部署前由 `check.sh` 自動執行，門檻 ≤ 1.2MB 且最大邊 ≤ 1600px

### 避免 CLS（版面跳動）

- `<img>` 補上 `width`/`height`
- 相簿頁用 `.gallery-image-wrapper { aspect-ratio: 1; }` 預留版面

### 日曆資料快取策略

- 預設允許快取，帶 `?v=...` 時做版本式 cache-busting（配合 `bump-calendar-cache.sh`）

---

## 快速檢查（變更後必做）

```bash
./check.sh
```

`deploy.sh` 會在 push 前自動執行 `check.sh`。

---

## 開發風格建議

- 小檔案 + 明確職責
- 避免把大量 JS 放在 HTML inline script
- 優先事件驅動（postMessage、storage event），不要輪詢
- 全域變數用 `window.__xxxInit` guard 避免重複綁定
