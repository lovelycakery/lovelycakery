# AI 維護手冊（以「目前架構」為準）

> 這個專案是 **純靜態網站**（HTML/CSS/JS），沒有 build system、沒有框架。  
> 新的對話無法讀取舊對話，所以本文件把「目前程式架構、模組職責、對外介面契約、維護操作與注意事項」集中在同一處，避免資訊分散。

## 重要：專案資料夾結構（2025-12 起）

- `site/`：**網站本體**（GitHub Pages 會部署這個資料夾）
- `admin/`：本機管理工具（不部署；給合作者用）

> 本文件後續提到的「網站檔案路徑」若未特別註明，一律以 `site/` 內為準（例如 `assets/js/i18n.js` 實際位置是 `site/assets/js/i18n.js`）。

## 架構總覽（你要先知道的 5 件事）

1. **主站頁面**：`index.html`, `calendar.html`, `seasonal.html`, `all-items.html`, `order.html`, `contact.html`
2. **共用導覽列/header**：`assets/js/site-header.js`（主站 6 頁共用，避免 6 份 HTML 重複）
3. **共用語言切換**：`assets/js/i18n.js`（唯一語言模組；頁面有 `.lang-btn` 時自動初始化）
4. **日曆採 iframe 隔離**：`calendar.html` 內嵌 `calendar-widget-readonly.html`
5. **日曆資料來源**：`assets/data/calendar-data.json`（訪客端讀；管理端可更新資料檔）

---

## 檔案職責（必讀）

### HTML（頁面）
- `index.html`：首頁
- `calendar.html`：日曆頁（iframe 嵌入只讀日曆）
- `calendar-widget-readonly.html`：只讀日曆 widget 頁（iframe 內）
- `calendar-widget.html`：可編輯日曆 widget 頁（給管理用）
- `calendar-manager-local.html`：管理工具（包一層 UI + 載入可編輯 widget）

### CSS
- `assets/css/styles.css`：主站共用樣式（header/nav、各分頁版面）
- `assets/css/calendar-widget.css`：日曆 widget 專用樣式（iframe 內隔離）
- `assets/css/calendar-frame.css`：日曆裝飾外框（可選；目前未預設啟用）

### JS（核心）
- `assets/js/site-header.js`
  - **主站共用 header/nav 產生器**
  - 導覽列內容（新增/改名稱/改順序）以此檔為單一來源
- `assets/js/i18n.js`
  - **唯一語言模組**
  - 機制：
    - 讀寫 `localStorage.language`（值：`zh` / `en`）
    - `applyLanguage()`：把所有 `[data-en][data-zh]` 的文字替換
  - `initLanguageSwitcher()`：綁 `.lang-btn` 點擊事件（若頁面有 `.lang-btn` 會自動初始化）
    - 切換時會 **postMessage** 給所有 iframe：`{type:'lovely-language', lang}`
- `assets/js/calendar-shared.js`
  - 日曆共用工具（避免 readonly / editable 兩份重複邏輯）
  - 負責：dataFile/cacheVersion、events array → map、月份標題、日期 key、語言套用 helper
- `assets/js/calendar-embed.js`
  - `calendar.html` 專用：負責 iframe 高度同步（不做 transform 縮放）
  - 監聽 iframe `postMessage({type:'calendar-resize', height})`
- `assets/js/calendar-widget.js`
  - 可編輯日曆 widget（管理端 iframe 內）
  - **儲存策略（架構契約）**：
    - 「儲存」：只寫入本機 `localStorage`（不會自動上傳）
    - 「同步」：由管理工具頁 `calendar-manager-local.html` 透過 `postMessage` 明確觸發，才會嘗試用 GitHub API 上傳
  - 讀寫 localStorage：
    - `calendarEvents`：事件資料備份
    - `calendarEventsUnsynced`：是否仍有未同步變更
  - GitHub API 同步（需要本機私密設定）：
    - 若存在 `GITHUB_CONFIG` + `checkGitHubConfig()` 且 valid → 走 GitHub API 更新 `assets/data/calendar-data.json`
    - 若缺少設定 → 會提示無法同步（此時需改用手動方式更新 JSON）
- `assets/js/calendar-widget-readonly.js`
  - 只讀日曆（訪客端）
  - 只讀：不提供編輯，只提供 hover tooltip（有 description 才顯示）
  - render 後會 `postMessage({type:'calendar-resize', height})` 讓父頁調整 iframe 高度

---

## 檔案結構（架構相關，一律以此為準）

```
repo-root/
├── site/                          # ✅ 網站本體（部署目錄）
│   ├── index.html                 # 首頁
│   ├── calendar.html              # 日曆頁（嵌入只讀 widget）
│   ├── calendar-widget-readonly.html # 只讀日曆 widget（iframe 內）
│   ├── calendar-widget.html          # 可編輯日曆 widget（舊管理用；訪客不會用到）
│   ├── calendar-manager-local.html   # 舊日曆管理頁（訪客不會用到）
│   └── assets/                    # 靜態資源
│       ├── css/
│       │   ├── styles.css
│       │   ├── calendar-widget.css
│       │   └── calendar-frame.css
│       ├── js/
│       │   ├── site-header.js
│       │   ├── i18n.js
│       │   ├── calendar-embed.js
│       │   ├── calendar-shared.js
│       │   ├── calendar-widget-readonly.js
│       │   └── calendar-widget.js
│       ├── data/
│       │   └── calendar-data.json
│       └── images/
│           └── ...
├── admin/                         # ✅ 本機管理工具（不部署）
│   ├── ADMIN_SAFETY_GUIDE.md
│   └── ...
├── check.sh                       # 部署/CI 檢查（會檢查 site/）
├── bump-calendar-cache.sh         # 更新日曆相關頁面 cache-busting（寫入 site/）
└── deploy.sh                      # 手動部署腳本（主要用於 push；Pages 由 Actions 部署）
```

## 圖片組織方式（架構相關，一律以此為準）

- **首頁圖片**：放在 `assets/images/`（例如：`cakes.jpg`）
- **日曆頁面**：放在 `assets/images/calendar/`
- **季節限定頁面**：放在 `assets/images/seasonal/`
- **全部品項頁面**：放在 `assets/images/products/`
- **訂購方式頁面**：放在 `assets/images/order/`
- **地圖頁面**：放在 `assets/images/contact/`

使用範例：

```html
<!-- 日曆頁面 -->
<img src="assets/images/calendar/calendar-hero.jpg" alt="Calendar">

<!-- 季節限定頁面 -->
<img src="assets/images/seasonal/spring-cake.jpg" alt="Spring Cake">

<!-- 產品圖片 -->
<img src="assets/images/products/matcha-cake.jpg" alt="Matcha Cake">
```

## 「本機私密設定」規範（非常重要）

- GitHub API Token **不要**提交到 repo
- 本機建立：`site/assets/js/github-config.local.js`（被 `.gitignore` 忽略）
- 內容格式（範例）：

```javascript
const GITHUB_CONFIG = {
  token: 'ghp_xxx',
  owner: 'lovelycakery',
  repo: 'lovelycakery',
  filePath: 'assets/data/calendar-data.json',
  enabled: true
};
function checkGitHubConfig() { /* calendar-widget.js 會呼叫 */ }
```

> `calendar-widget.html` / `calendar-manager-local.html` 會嘗試載入 `github-config.local.js`；若沒找到就無法使用 GitHub API 同步（仍可先在本機儲存變更）。
> 補充：目前「下載 JSON」沒有做成 UI 按鈕；若要走手動流程，建議直接編輯 `assets/data/calendar-data.json` 後部署，或自行加一個下載按鈕呼叫 `downloadJSON()`。

---

## 常見維護任務（照做最不容易出 bug）

### A) 新增一個「主站分頁」
1. 複製任一頁（例如 `seasonal.html`）
2. 確保頁面有 header 佔位元素：
   - `<header class="header" id="site-header"></header>`
3. **保留**底部共用腳本載入順序：
   - `assets/js/site-header.js`
   - `assets/js/i18n.js`（語言切換會在 `.lang-btn` 存在時自動初始化；`.lang-btn` 由 header 產生）
3. 文案要支援雙語：用 `data-en` / `data-zh`

### B) 修改導覽列（header/nav）
導覽列採用 **由 JS 生成**（主站 6 頁共用）。  
調整導覽列請改：
- `assets/js/site-header.js`（`renderNavItems()` 裡的 items 陣列）

### C) 修改日曆 UI / 規則
- 只讀端：改 `calendar-widget-readonly.html/.js` + `assets/css/calendar-widget.css`
- 管理端：改 `calendar-widget.html` / `calendar-manager-local.html` / `assets/js/calendar-widget.js`
- **不要**把主站 `styles.css` 拿去改日曆格子的樣式（日曆在 iframe 內）

### C.1) 日曆外框（可每月更換、可一鍵關閉）
日曆外框是 **可插拔模組**，設計目標是「換框/關框不影響日曆本體與載入邏輯」。

- **外框樣式模組**：`assets/css/calendar-frame.css`
- **外框圖片入口（固定檔名，最容易維護）**：`assets/images/calendar/frames/frame-current.png`
  - 每月更換外框：只要替換這張圖片內容（檔名不變），不用改任何 HTML/CSS/JS
  - 圖片建議：PNG/WebP（需保留透明中心），尺寸建議 1024px 左右即可
- **啟用方式（目前需手動接線一次）**：
  - `calendar.html` 額外引入 `assets/css/calendar-frame.css`
  - 並把 iframe 外層包上 `.calendar-frame` / `.calendar-frame__inner`（外框會疊在 iframe 上方，且 `pointer-events: none` 不會擋操作）
- **外框開關（啟用後只改一行）**：在 `calendar.html` 的 `<body class="calendar-page-body">` 加上：
  - 關閉外框：`data-frame="off"`（預設不加或 `on` 則顯示）

> 備註：外框會以 overlay 方式疊在 iframe 上方，且 `pointer-events: none` 不會擋日曆操作。
> 由於外框是圖片資源，建議在部署前跑圖片壓縮（見下方效能章節）。

### D) 語言切換相關需求
只改 `assets/js/i18n.js`（不要在各頁重複寫切換程式）

---

## 容易踩雷的點（請新的對話特別注意）

- **script 載入順序**
  - 主站頁：`site-header.js` → `i18n.js`
  - 日曆嵌入頁 `calendar.html`：`site-header.js` → `i18n.js` → `calendar-embed.js`
  - 日曆 widget 頁：`i18n.js` + `calendar-shared.js` 再載入各自的 widget 腳本
- **不要重新加回 setInterval 輪詢語言**
  - 目前語言同步用 postMessage（事件驅動），更不容易出 bug
- **GitHub Token**
  - 只能放 `github-config.local.js`（不要放回 repo、不要改成固定檔名）
- **iframe 高度/縮放**
  - 只改 `assets/js/calendar-embed.js`
  - widget 內高度回報在 `calendar-widget-readonly.js` 的 postMessage

---

## 快速檢查（變更後必做）
（以下是「變更後」建議一定要跑的檢查，避免缺檔/順序錯誤/快取沒更新等問題。）

### 1) 檔案引用完整性檢查（避免缺檔 404）
在 repo 根目錄跑：

```bash
python3 - <<'PY'
import re, pathlib, sys
root = pathlib.Path('.')
html_files = list(root.glob('*.html'))
missing = []
pattern = re.compile(r'(?:src|href)=["\'](assets/[^"\'#?]+)')
for f in html_files:
    text = f.read_text(encoding='utf-8', errors='ignore')
    for m in pattern.finditer(text):
        p = root / m.group(1)
        if not p.exists():
            missing.append((str(f), m.group(1)))
if missing:
    print('MISSING ASSETS:')
    for f, a in missing:
        print(f'  {f}: {a}')
    sys.exit(1)
print('OK: all referenced local assets exist')
PY
```

### 2) 確認沒有語言輪詢
```bash
# 若有安裝 ripgrep 可用 rg；否則用 grep 也可以
rg "setInterval\\(" assets/js || grep -R --line-number --fixed-string "setInterval(" assets/js
```

### 3) 一鍵檢查（推薦）
專案根目錄有 `check.sh`，部署前可直接跑：

```bash
./check.sh
```

而 `deploy.sh` 會在 push 前自動執行 `check.sh`。

---

## 效能優化與資產規範（2025-12）

### 1) 圖片（products / seasonal / homepage hero）
這個站點「體感慢」的最大來源通常是圖片體積。專案已內建 **圖片優化 + 部署前檢查**：

- `scripts/optimize_images.py`
  - 目標：`assets/images/products/*.jpg`、`assets/images/seasonal/*.jpg`、`assets/images/cakes.jpg`
  - 預設策略：最大邊縮到 `1600px` + JPEG `quality=82` + progressive/optimize
  - 用法：
    ```bash
    python3 scripts/optimize_images.py
    ```
  - 只處理「本次 git 變更/新增」的圖片（避免圖片變多後每次全量重跑很慢）：
    ```bash
    python3 scripts/optimize_images.py --only-changed
    ```
    若要略過首頁圖：
    ```bash
    python3 scripts/optimize_images.py --no-hero
    ```

- `scripts/verify_images.py`（部署前會由 `check.sh` 自動執行）
  - 預設門檻：每張 `<= 1.2MB` 且最大邊 `<= 1600px`
  - 用法：
    ```bash
    python3 scripts/verify_images.py
    ```
  - 若檢查失敗，通常先跑：
    ```bash
    python3 scripts/optimize_images.py
    ```

> 新增/替換商品或季節圖片時：**先跑 optimize，再 deploy**，避免把 5–7MB 的原圖推到線上。
> `deploy.sh` 也會自動嘗試執行 `python3 scripts/optimize_images.py --only-changed`，通常不需要手動挑檔名。

（補充）日曆外框圖片也屬於「每次進日曆頁都會下載」的資產，建議同樣跑：
`python3 scripts/optimize_images.py --only-changed`

### 2) 避免 CLS（版面跳動）
為了避免圖片載入時推擠文字/版面跳動（CLS），已採用：

- 在 `index.html` / `all-items.html` / `seasonal.html` 的 `<img>` 補上 `width`/`height`
- 相簿頁本身也用 `.gallery-image-wrapper { aspect-ratio: 1; }` 預留正方形版面

新增圖片時，建議同步補上對應的 `width`/`height`（以圖片實際像素為準）。

### 3) Google Fonts 非阻塞載入
主站頁面已改用 `preload` + `media=print onload` 的方式載入 Google Fonts，避免阻塞首屏渲染。

### 4) 日曆資料快取策略（避免每次都慢）
日曆 widget 讀取 `assets/data/calendar-data.json` 時：
- **預設允許快取**（速度更好）
- 只有在頁面帶 `?v=...` 時才做版本式 cache-busting（配合 `bump-calendar-cache.sh`）

---

## 新功能開發時的建議風格（讓我之後最好維護）

- **小檔案 + 明確職責**（像 `i18n.js`、`calendar-embed.js`）
- **避免把大量 JS 放在 HTML inline script**（除非非常短）
- **優先事件驅動**（postMessage、storage event）不要輪詢
- **必要的全域變數要有 `window.__xxxInit` guard**（避免重複載入/重複綁定）

---

（本文件由 AI 生成，用於跨對話維護接力。）


