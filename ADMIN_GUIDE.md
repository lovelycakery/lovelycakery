# Web Admin 管理介面技術文件

> 本文件描述 Web Admin（`admin.html`）的架構、功能實作與修改指引。  
> 網站本體的架構請見 `WEB_GUIDE.md`。

---

## 使用者操作指南

### 前置條件

1. 合作者需要一個 **GitHub 帳號**
2. Repo 擁有者需把合作者加為 **Collaborator**：`Settings → Collaborators → Add people`

### 取得 Token

合作者登入 GitHub 後打開：
```
https://github.com/settings/tokens/new?scopes=repo&description=Lovely+Admin
```
- Expiration 建議 90 天或 No expiration
- 確認 **repo** 已勾選 → Generate token → 立刻複製

### 登入

1. 打開 `https://lovelycakery.github.io/lovelycakery/admin.html`
2. 貼上 Token → 登入（Token 存 `localStorage`，之後自動登入）

### 操作流程

```
選擇分頁（日曆/本週切片／優惠組合/新品上市/全部品項）
  → 編輯內容（可用 Claude API 一鍵翻譯中→英）
  → 點「儲存」（只存瀏覽器記憶體，預覽即時更新）
  → 全部改完後，點「一鍵發布」
  → 所有變更打包成一次 commit 推到 GitHub
  → Cloudflare Pages + GitHub Pages 自動部署（兩站同步）
```

> 分頁對應：`seasonal` = 新品上市、`products` = 全部品項、`sets` = 本週切片／優惠組合（同一個分頁）、`calendar` = 日曆。

---

## 檔案結構

```
site/
├── admin.html                          # 入口（登入 + 編輯 UI）
├── assets/
│   ├── css/
│   │   └── admin.css                   # 暗色主題樣式
│   └── js/
│       ├── jszip.min.js                # 第三方 ZIP 函式庫
│       ├── admin-github-api.js         # GitHub API 封裝
│       ├── admin-image-compress.js     # 瀏覽器端圖片壓縮
│       ├── admin-translate.js          # Claude API 中→英翻譯
│       └── admin-app.js               # 主要 UI 邏輯
```

載入順序：`jszip.min.js` → `admin-github-api.js` → `admin-image-compress.js` → `admin-translate.js` → `admin-app.js`

---

## 架構總覽

```
┌─────────────────────────────────────────────────────┐
│  admin.html                                         │
│  ┌──────────────┐  ┌────────────────────────────┐   │
│  │  預覽區域      │  │  編輯面板（右側）            │   │
│  │  <iframe>     │  │  - 日曆：狀態/說明          │   │
│  │  載入實際頁面   │  │  - 圖片：名稱/價格/描述/標籤 │   │
│  │  (同源)       │  │  - 上傳區域                 │   │
│  └──────────────┘  └────────────────────────────┘   │
│                                                     │
│  ┌─ admin-app.js (state + dirty tracking) ────────┐ │
│  │  state.calendarData  ←→  iframe (postMessage)  │ │
│  │  state.imageData     ←→  iframe (postMessage)  │ │
│  │  dirty.calendar / seasonal / products          │ │
│  │  dirty.pendingImages / pendingDeletes          │ │
│  └────────────────────────────────────────────────┘ │
│           │                                         │
│           │ 「一鍵發布」                              │
│           ▼                                         │
│  ┌─ admin-github-api.js ──────────────────────────┐ │
│  │  Git Data API: 多檔原子 commit                  │ │
│  │  Contents API: 檔案刪除                         │ │
│  │  Actions API: 部署狀態查詢                      │ │
│  └────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

### 關鍵設計原則

1. **本地編輯，批次發布**：儲存時只改瀏覽器記憶體中的 `state`，所有變更累積後由「一鍵發布」一次 commit
2. **即時預覽**：透過 `postMessage` 將修改後的資料送進 iframe 即時反映
3. **名稱與檔名分離**：商品名稱只存在 JSON 裡，改名稱不動圖片檔案
4. **避免 gallery 重新渲染**：文字修改不觸發 `sendImageDataToPreview`，只有排序/上傳/刪除才重新渲染

---

## 認證機制

**檔案**：`admin-github-api.js`

- Token 存 `localStorage`，key 為 `lovely-admin-github-token`
- 頁面載入時自動驗證（`GET /user` + `GET /repos/{owner}/{repo}`）
- 失敗則清除 Token，顯示登入畫面

---

## State 與 Dirty Tracking

```javascript
const state = {
  calendarData: null,       // 日曆 JSON
  eventsByDate: new Map(),  // date → event 快速查詢
  selectedDate: '',
  currentTab: 'calendar',   // 'calendar' | 'seasonal' | 'products' | 'sets'
  currentMode: 'edit',      // 'edit' | 'preview'
  imageData: {
    seasonal: { items: [] },
    products: { items: [] },
    sets: { items: [] },
  },
  editingImageIndex: -1,
};

const dirty = {
  calendar: false,
  seasonal: false,
  products: false,
  sets: false,
  pendingImages: [],     // 待上傳 [{repoPath, base64}]
  pendingDeletes: [],    // 待刪除 [repoPath]
};

// 圖片型分頁常數（admin-app.js 頂部）
const IMAGE_TYPES = ['seasonal', 'products', 'sets'];
// sets 沒有價格與標籤欄位，編輯面板會隱藏對應區塊
```

---

## 三個分頁的功能與實作

### 1. 日曆分頁

**預覽**：iframe 載入 `calendar.html`，內嵌 `calendar-widget-readonly.html`（雙層 iframe）

**日期選取**：
- `tryInstallCalendarClickHook()` 在內層 iframe 掛載 click 事件（capture phase）
- 因為雙層 iframe 載入時間不確定，用 `startHookWatcher()` 每 250ms 輪詢，最多等 12 秒
- 點擊 `.calendar-day` → 讀取 `data-date` → 顯示編輯面板

**儲存事件**（`saveCalendarEvent`）：深拷貝 → 更新 events 陣列 → 驗證 → 更新 state + dirty → postMessage 即時更新預覽

**清除事件**（`clearCalendarEvent`）：confirm → 過濾掉該日期 → 更新 state + dirty → postMessage

### 2. 圖片型分頁（新品上市 / 全部品項 / 優惠組合）

三個分頁（`seasonal` / `products` / `sets`）共用同一套圖片編輯邏輯（見 `IMAGE_TYPES`）。差異：`sets`（優惠組合）沒有價格與標籤欄位，編輯面板會自動隱藏這兩個區塊。

**預覽**：iframe 載入對應頁面（`seasonal.html` / `all-items.html` / `sets.html`），帶 `?adminPreview=1&mode=edit`

**圖片選取**：`gallery-loader.js` 在編輯模式下為每個圖片綁定 click → `postMessage({type: 'gallery-edit', index})` → admin 打開編輯面板

**編輯儲存**（`saveImageEdit`）：收集表單欄位 → 修改 items → dirty = true → **不重新渲染**（避免圖片閃爍）

**刪除圖片**（`deleteImage`）：confirm → 加入 pendingDeletes → 從 items 移除 → 重新渲染

**上傳圖片**（`handleImageUpload`）：
1. 支援拖曳到上傳區域或點擊選擇
2. `ImageCompress.compress(file)` 壓縮
3. base64 存入 `dirty.pendingImages`
4. blob URL 供本地預覽
5. 加入 items → 重新渲染 → 自動選取並滾動到新圖片

**拖曳排序**（`reorderImages`）：
1. `gallery-loader.js` 在編輯模式下啟用 HTML5 drag-and-drop
   - 設定 `img.draggable = false`（避免 IMG 原生拖曳被 `image-protection.js` 攔截）
   - `dragstart` 加 `e.stopPropagation()` 防止事件冒泡被攔截
   - `fromIndex` / `toIndex` 使用 `itemEl.dataset.index` 取得即時索引（不用閉包變數，因為 DOM 重排後會過期）
2. drop → `postMessage({type: 'gallery-reorder', fromIndex, toIndex})`
3. admin 修改 items 陣列順序
4. admin 發送 `{type: 'admin-gallery-reorder-dom', fromIndex, toIndex}` → gallery-loader 直接移動 DOM 元素（不重新渲染）

### 2.3 首頁分頁

「首頁」分頁（`home`）編輯首頁的主圖、圖片下方的文字（選填）、標題、說明文字、按鈕文字（各有中／英）與按鈕連結，存到 `home-data.json`：

- 文字欄位邊打邊即時預覽（`admin-home-update` → `home-loader.js`），算 `dirty.home`。
- 「按鈕連到哪裡」是下拉選單：全部品項的各個分頁（`all-items.html#<分類 id>`）與其他頁面。
- 「更換圖片」：壓縮後上傳到 `assets/images/home/hero-<時間戳>.jpg`，`image` 欄位改指向新檔。舊圖若也在 `assets/images/home/` 會被排入刪除；預設的 `assets/images/cakes.jpg` 不會被刪。
- 標題與按鈕文字不能留空（發布時會擋）。

相關函式：`loadHomeData()`、`renderHomePanel()`、`replaceHomeImage()`、`sendHomeToPreview()`。

### 2.4 全部品項頁的分類分頁（分頁管理）

全部品項頁上方的分頁（草莓季限定／新品上市／季節品項…）存在 `products-data.json` 的 `categories`，在 Admin「全部品項」分頁最上方的「分頁管理」編輯：

- 勾選框：是否在網站上顯示（取消後該分頁與裡面的品項都不顯示，資料保留）
- 名稱、▲▼ 調整順序、✕ 移除（僅自訂分頁）、「+ 新增分頁」
- 「更多設定」：英文名稱、沒有品項時顯示的文字（中／英）、分頁按鈕樣式（`CATEGORY_STYLES`）

品項歸屬規則（`admin-app.js` 與 `gallery-loader.js` 的 `normalizeCategories()` / `itemsForCategory()` 必須一致）：

| 分類 id | 品項來源 |
|---|---|
| `seasonal`（新品上市，內建） | Admin「新品上市」分頁（`seasonal-data.json`） |
| `products`（季節品項，內建） | `products-data.json` 中沒有 `category`、或 `category` 指向已不存在分類的品項 |
| 其他（自訂） | `products-data.json` 中 `item.category === 分類 id` 的品項；在品項編輯面板的「所屬分頁」下拉指定 |

- 兩個內建分類不能移除（只能隱藏）；資料裡若漏掉會自動補在最後。
- 移除自訂分類時，裡面的品項不會被刪，`category` 欄位被清掉 → 回到季節品項。
- 一個品項只能屬於一個分類。
- 編輯模式的預覽是不分類的單一相簿，看不到分類效果；切到「預覽」模式才是分類後的頁面（未發布的分類變更會透過 `admin-categories-update` / `admin-gallery-update` 送進去）。

### 2.5 本週切片分頁與顯示開關

「優惠組合」與「本週切片」顯示在同一個訪客頁（`sets.html`，選單名稱是「本週切片」），資料都存在 `sets-data.json`，Admin 上也是同一個分頁「本週切片／優惠組合」（`sets`），右側面板分成上下兩段：

- **優惠組合**：一般的圖片型編輯區，可上傳圖片。最上方有「在網站上顯示『優惠組合』」勾選框（`showSets`）。
- **本週切片**（`#weeklySlicesPanel`）：不上傳圖片，從「全部品項 + 新品上市」勾選品項，存成 `weeklySlices`（圖片路徑陣列）。另有：
  - 「在網站上顯示『本週切片』」勾選框（`showWeeklySlices`）
  - 沒有勾選任何切片時顯示的文字，中／英兩個輸入框（`weeklyEmptyText` / `weeklyEmptyText_en`）

行為：

- 開關關掉 → 該區塊整段隱藏，資料與圖片保留。
- 本週切片開著但清單是空的（或勾選的品項已被刪除）→ 顯示 `weeklyEmptyText`。
- 這些設定都算 `dirty.sets`，跟優惠組合品項一起寫進 `sets-data.json`。
- **預覽**：編輯模式下，預覽網址會帶 `forceShow=all`，設成不顯示的區塊照樣顯示（否則無從編輯），但會變半透明並標上「目前設定為不在網站上顯示」；切到「預覽」模式則完全照訪客看到的樣子。

相關函式：`syncSetsVisibilityUI()`、`setSetsVisibility()`、`setWeeklyEmptyText()`、`sendSetsVisibilityToPreview()`（`admin-app.js`）；`applySetsVisibility()`、`renderWeeklyEmpty()`（`gallery-loader.js`）。

### 3. 一鍵發布（`publish`）

```
confirm() → 收集 dirty 變更 → commitMultipleFiles() 原子 commit
  → 刪除待刪圖片（Contents API 逐一刪除）
  → 重置 dirty flags → 重新載入資料
  → watchDeployment() 監控部署狀態
```

commit 內容：calendar-data.json → cache version bump → seasonal-data.json → products-data.json → sets-data.json → 圖片二進位 → 刪除檔案

### 自動翻譯（`admin-translate.js`）

編輯面板提供「翻譯」按鈕，把中文品名/描述（或日曆標籤）送 Claude API 產生英文，填入 `name_en` / `description_en`（日曆為 `text_en` / `detail_en`）。

- 暴露為 `window.AdminTranslate`：`translate(zhName, zhDesc)`、`translateCalendar(zhText, zhDetail)`、`get/set/clear/hasApiKey()`
- 模型：`claude-haiku-4-5-20251001`，端點 `https://api.anthropic.com/v1/messages`（瀏覽器直連，帶 `anthropic-dangerous-direct-browser-access: true`）
- API Key 存 `localStorage`，key 為 `lovely-admin-claude-api-key`（與 GitHub token 分開）
- 系統提示要求只回傳 JSON；錯誤碼（401/403/429/5xx）各有對應中文提示

---

## GitHub API 封裝

**檔案**：`admin-github-api.js`，暴露為 `window.GitHubAPI`

```javascript
OWNER = 'lovelycakery'
REPO  = 'lovelycakery'
BRANCH = 'main'
```

| 函數 | 用途 | GitHub API |
|------|------|-----------|
| `getFile(path)` | 讀取單一檔案 | GET /repos/.../contents/{path} |
| `getJSON(path)` | 讀取 JSON | 同上 + JSON.parse |
| `deleteFile(path, msg)` | 刪除檔案 | DELETE /repos/.../contents/{path} |
| `commitMultipleFiles(changes, msg)` | 多檔原子 commit | Git Data API |
| `getLatestWorkflowRun()` | 部署狀態 | GET /repos/.../actions/runs |
| `validateToken()` | 驗證 Token | GET /user |
| `checkRepoAccess()` | 驗證權限 | GET /repos/{owner}/{repo} |

### 多檔原子 commit 流程

1. GET refs/heads/main → commit SHA
2. GET git/commits/{sha} → base tree SHA
3. POST git/blobs（每個檔案）→ blob SHA
4. POST git/trees → 新 tree
5. POST git/commits → 新 commit
6. PATCH refs/heads/main → 更新分支

衝突重試：step 6 失敗（409）時等 500ms 重試，最多 2 次。

---

## 圖片壓縮

**檔案**：`admin-image-compress.js`，暴露為 `window.ImageCompress`

```javascript
MAX_DIMENSION = 2000        // 最大邊長
QUALITY_HIGH = 0.85         // 第一次壓縮品質
QUALITY_LOW = 0.75          // 超過 SIZE_THRESHOLD 時降低
SIZE_THRESHOLD = 500 * 1024 // 500 KB
```

流程：`createImageBitmap`（處理 EXIF 旋轉）→ 等比縮小 → canvas → toBlob → 若 > 500KB 再壓一次

---

## iframe 通訊協定（postMessage）

### admin → iframe

| type | 用途 | 接收方 |
|------|------|--------|
| `admin-calendar-update` | 即時更新日曆資料 | `calendar-widget-readonly.js` |
| `admin-gallery-update` | 完整重新渲染 gallery | `gallery-loader.js` |
| `admin-gallery-reorder-dom` | DOM 移動元素（排序） | `gallery-loader.js` |
| `admin-weekly-slices-update` | 即時更新本週切片的品項 | `gallery-loader.js` |
| `admin-home-update` | 即時更新首頁的文字、連結與主圖 | `home-loader.js` |
| `admin-categories-update` | 即時更新全部品項頁的分類設定（預覽模式的分類頁才會處理） | `gallery-loader.js` |
| `admin-sets-visibility` | 即時更新優惠組合／本週切片的顯示開關與空白提示文字 | `gallery-loader.js` |
| `gallery-select` | 標記/取消選取圖片 | `gallery-loader.js` |
| `gallery-scroll-to` | 滾動到指定圖片 | `gallery-loader.js` |

### iframe → admin

| type | 用途 | 接收方 |
|------|------|--------|
| `gallery-edit` | 點擊圖片，打開編輯面板 | `admin-app.js` |
| `gallery-reorder` | 拖曳完成排序 | `admin-app.js` |

安全檢查：雙方都檢查 `e.origin`，只接受 same-origin 訊息。

---

## 日曆 Cache 版本號機制

格式：`?v=YYYYMMDD-N`（UTC 日期 + 當天第幾次更新）

- Web Admin 發布時自動 bump（`computeNextCacheVersion()`）
- 本機開發用 `bash bump-calendar-cache.sh`
- `check.sh` 驗證 `calendar.html` 和 `calendar-widget-readonly.html` 版本號一致

---

## 部署狀態監控

`watchDeployment()` 發布後每 5 秒查詢 GitHub Actions API，顯示進度直到成功/失敗/超時（3 分鐘）。成功後 2 秒自動重新整理預覽。

> 監控的是 **GitHub Pages** 那條管線（`.github/workflows/pages.yml`）。Cloudflare Pages 走自己的 Git 整合並行部署，不在此監控範圍，但同一個 commit 兩站都會更新。

---

## 已知限制

1. **文字修改不即時反映在預覽**：為避免重新渲染導致圖片失效，編輯名稱/價格/描述後需等發布+部署完成
2. **刪除是分開的 commit**：`commitMultipleFiles` 只能新增/修改，刪除用 Contents API 逐一操作

---

## 資料結構

### calendar-data.json

```json
{
  "events": [
    { "date": "2026-04-05", "status": "available", "description": "可留空" }
  ]
}
```
status 允許值：`"available"` | `"unavailable"` | `"closed"`

### seasonal-data.json / products-data.json

```json
{
  "schema_version": 1,
  "items": [
    {
      "image": "assets/images/seasonal/草莓千層3.jpg",
      "name": "草莓千層",
      "name_en": "Strawberry Mille Crepe",
      "prices": { "size6": "1800", "size8": "2000", "slice": "180" },
      "description": "中文描述...",
      "description_en": "English description...",
      "tags": ["奶蛋素"]
    }
  ]
}
```
`image` 路徑在上傳時決定，之後不因改名稱而改變。  
tags 允許值：`奶蛋素`、`無咖啡因`、`無酒精`、`可宅配`

### home-data.json

```json
{
  "schema_version": 1,
  "headline": "美好蛋糕店", "headline_en": "Lovely Cakery",
  "description": "用愛精心製作，層層堆疊。僅接受預訂。", "description_en": "Crafted with love, layer by layer. Pre-order only.",
  "buttonText": "草莓季限定品項 🍓", "buttonText_en": "STRAWBERRY SEASON ITEMS 🍓",
  "buttonLink": "all-items.html#strawberry",
  "image": "assets/images/cakes.jpg",
  "imageCaption": "", "imageCaption_en": ""
}
```

英文欄位留空時沿用中文。`imageCaption` 留空就不顯示圖片下方的文字。按鈕結尾的線條小草莓是 CSS（`.home-page .cta-button::after`）畫的，不是文字，所以 `buttonText` 不必加 emoji；按鈕的樣式（復古雙線框、磚紅色、Noto Serif TC 襯線字，字型由 `home-loader.js` 載入）寫在 `styles.css` 的 `.home-page .cta-button`。`buttonLink` 只接受站內相對路徑，其他會退回 `all-items.html`。

`headline`（店名）目前在首頁**視覺上隱藏**：店名「美好蛋糕店」改放在全站導覽列的品牌名旁（`site-header.js` 的 `.logo-zh`，寫死在程式裡、不從這個檔讀）。首頁的 `<h2 class="main-headline">` 仍保留給螢幕閱讀器與搜尋引擎，所以 admin 改 `headline` 只影響這個隱藏標題。`description` 留空時整行隱藏。

### products-data.json 的 categories

除了 `items`，`products-data.json` 還有全部品項頁的分類清單（順序＝網站上的順序）：

```json
{
  "schema_version": 1,
  "items": [{ "image": "…", "name": "…", "tags": [], "category": "strawberry" }],
  "categories": [
    { "id": "strawberry", "name": "草莓季限定", "name_en": "Strawberry Season", "show": true,
      "emptyText": "🍓 草莓季限定籌備中，敬請期待～", "emptyText_en": "", "style": "pink" },
    { "id": "seasonal", "name": "新品上市", "name_en": "Seasonal Specials", "show": true,
      "emptyText": "🍰 新品籌備中，敬請期待～ ✨", "emptyText_en": "Coming Soon — Stay Tuned!", "style": "" },
    { "id": "products", "name": "季節品項", "name_en": "Menu", "show": true, "emptyText": "", "emptyText_en": "", "style": "" }
  ]
}
```

- `style`：分頁按鈕樣式，對應 `styles.css` 的 `.order-tag--<style>`；空字串＝預設淡黃。
- `emptyText` 留空時顯示「籌備中，敬請期待～」。
- 舊資料沒有 `categories` 時，等同只有新品上市＋季節品項。

### sets-data.json

`items` 結構同上（優惠組合沒有價格與標籤），另外多了本週切片相關欄位：

```json
{
  "schema_version": 1,
  "items": [],
  "weeklySlices": ["assets/images/products/某品項.jpg"],
  "showSets": false,
  "showWeeklySlices": true,
  "weeklyEmptyText": "本週切片暫停，期待下週見面～ 🌸",
  "weeklyEmptyText_en": ""
}
```

- `weeklySlices`：被勾選品項的 `image` 路徑（參照全部品項／新品上市）。對應品項被刪除後，該路徑會被略過。
- `showSets` / `showWeeklySlices`：缺少時視為 `true`。
- `weeklyEmptyText_en` 留空時：中文是預設句就用預設英文，否則沿用中文。

---

## 修改指引

### 新增商品欄位（例如「過敏原」）

1. `admin.html`：`imageEditForm` 加入輸入欄位
2. `admin-app.js`：`openImageEditPanel()` 讀取 / `saveImageEdit()` 寫入 / `clearImageEditPanel()` 清空
3. `gallery-loader.js`：`renderGallery()` 和 `createImageModal()` 顯示新欄位
4. 如需驗證：修改 `validateImageData()` 和 `checkAllFields()`

### 新增日曆狀態（例如「已額滿」）

1. `admin.html`：`statusSelect` 加入選項
2. `admin-app.js`：`validateCalendarData()` 的 `allowed` 加入新值
3. `calendar-widget-readonly.js`：`createDayElement()` 加入對應 CSS class
4. `calendar-widget.css`：加入新狀態樣式
5. `check.sh`：schema 驗證的 `allowed` 加入新值

### 修改 GitHub repo 設定

改 `admin-github-api.js` 頂部常數：`OWNER`、`REPO`、`BRANCH`

### 修改圖片壓縮參數

改 `admin-image-compress.js` 頂部常數：`MAX_DIMENSION`、`QUALITY_HIGH`、`QUALITY_LOW`、`SIZE_THRESHOLD`

---

## 暫時隱藏的內容

### 訂購說明 — 匯款資料 section

`site/order.html` 內的 `#payment` section（台新銀行 812-28881013902388）目前用 HTML 註解 `<!-- ... -->` 包起來，並在標籤列也移除對應的 tag。內容完整保留，要恢復只要：

1. 拿掉 `site/order.html` 裡 `<!-- 匯款資料... -->` 與對應 `-->` 註解標記
2. 把 `<a class="order-tag" href="#payment" ...>匯款資料</a>` 加回 `.order-tags` 導覽列
