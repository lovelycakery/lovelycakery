# Web Admin 管理介面 — 完整技術文件

> 本文件供**開發者與 AI 助手**參考，描述 Web Admin 的完整架構、功能實作邏輯、資料流與修改指引。

---

## 目錄

1. [使用者操作指南](#使用者操作指南)
2. [檔案結構](#檔案結構)
3. [架構總覽](#架構總覽)
4. [認證機制](#認證機制)
5. [核心概念：本地編輯 + 一鍵發布](#核心概念本地編輯--一鍵發布)
6. [三個分頁的功能與實作](#三個分頁的功能與實作)
7. [GitHub API 封裝](#github-api-封裝)
8. [圖片壓縮](#圖片壓縮)
9. [iframe 通訊協定（postMessage）](#iframe-通訊協定postmessage)
10. [日曆 Cache 版本號機制](#日曆-cache-版本號機制)
11. [部署狀態監控](#部署狀態監控)
12. [資料結構](#資料結構)
13. [已知限制與設計決策](#已知限制與設計決策)
14. [修改指引](#修改指引)

---

## 使用者操作指南

### 前置條件

1. 合作者需要一個 **GitHub 帳號**
2. Repo 擁有者需把合作者加為 **Collaborator**：`Settings → Collaborators → Add people`

### 取得 Token

合作者登入自己的 GitHub 後，打開：

```
https://github.com/settings/tokens/new?scopes=repo&description=Lovely+Admin
```

- **Expiration**：建議選 90 天或 No expiration
- 確認 **repo** 已勾選
- 點 **Generate token**
- **立刻複製 token**（離開頁面就看不到了）

### 登入編輯頁面

1. 打開 `https://lovelycakery.github.io/lovelycakery/admin.html`
2. 貼上 Token → 點「登入」
3. Token 存在瀏覽器 `localStorage`，之後同一瀏覽器自動登入
4. 點右上角「登出」可清除 Token

### 操作流程

```
選擇分頁（日曆/季節限定/全部品項）
  → 編輯內容（改名稱、價格、日曆事件等）
  → 點「儲存」（只存在瀏覽器記憶體，預覽即時更新）
  → 可以繼續編輯其他內容
  → 全部改完後，點右上角「一鍵發布」
  → 所有變更打包成一次 commit 推到 GitHub
  → CI 自動部署，頁面顯示部署進度
```

---

## 檔案結構

```
site/
├── admin.html                          # 管理頁面入口（含登入畫面 + 編輯 UI）
├── assets/
│   ├── css/
│   │   └── admin.css                   # 管理介面暗色主題樣式
│   └── js/
│       ├── admin-github-api.js         # GitHub API 封裝模組
│       ├── admin-image-compress.js     # 瀏覽器端圖片壓縮模組
│       └── admin-app.js               # 主要 UI 邏輯（~900 行）
```

載入順序（在 `admin.html` 底部）：
```html
<script src="assets/js/admin-github-api.js"></script>   <!-- 1. API 層 -->
<script src="assets/js/admin-image-compress.js"></script> <!-- 2. 圖片壓縮 -->
<script src="assets/js/admin-app.js"></script>            <!-- 3. UI 邏輯 -->
```

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

1. **本地編輯，批次發布**：儲存時只改瀏覽器記憶體中的 `state`，不呼叫 GitHub API。所有變更累積後由「一鍵發布」一次 commit。
2. **即時預覽**：透過 `postMessage` 將修改後的資料送進 iframe，讓預覽頁面即時反映變更（不需等部署）。
3. **名稱與檔名分離**：商品名稱只存在 JSON 裡，改名稱不會動到圖片檔案。
4. **避免 gallery 重新渲染**：文字修改（名稱/價格/描述/標籤）不觸發 `sendImageDataToPreview`，避免重建 `<img>` 元素導致圖片閃爍。只有排序/上傳/刪除才重新渲染。

---

## 認證機制

**檔案**：`admin-github-api.js`

- Token 存在 `localStorage`，key 為 `lovely-admin-github-token`
- 頁面載入時檢查是否有 Token，有的話自動驗證（`GET /user`）
- 驗證通過後再檢查 repo 存取權限（`GET /repos/{owner}/{repo}`）
- 失敗則清除 Token，顯示登入畫面

### 登入流程（`handleLogin`）

```
使用者輸入 Token
  → GitHubAPI.setToken(token)     存到 localStorage
  → GitHubAPI.validateToken()     GET /user 驗證 Token 有效性
  → GitHubAPI.checkRepoAccess()   GET /repos/... 驗證 repo 權限
  → 成功 → showApp(login)         顯示主介面
  → 失敗 → clearToken()           清除並顯示錯誤
```

---

## 核心概念：本地編輯 + 一鍵發布

### State 結構（`admin-app.js`）

```javascript
const state = {
  calendarData: null,       // 日曆 JSON（啟動時從 GitHub 載入）
  eventsByDate: new Map(),  // date → event 的快速查詢表
  selectedDate: '',         // 目前選取的日期
  currentTab: 'calendar',   // 'calendar' | 'seasonal' | 'products'
  currentMode: 'edit',      // 'edit' | 'preview'
  imageData: {
    seasonal: { items: [] }, // 季節限定商品陣列
    products: { items: [] }, // 全部品項商品陣列
  },
  editingImageIndex: -1,    // 目前編輯的圖片索引（-1 = 未選取）
};
```

### Dirty Tracking

```javascript
const dirty = {
  calendar: false,       // 日曆資料是否有本地修改
  seasonal: false,       // 季節限定資料是否有本地修改
  products: false,       // 全部品項資料是否有本地修改
  pendingImages: [],     // 待上傳的圖片 [{repoPath, base64}]
  pendingDeletes: [],    // 待刪除的圖片路徑 [repoPath]
};
```

- 每次本地儲存後設定對應的 dirty flag
- `hasPendingChanges()` 檢查是否有任何待發布變更
- `updatePublishButton()` 更新按鈕文字和啟用狀態（顯示待發布數量）

---

## 三個分頁的功能與實作

### 1. 日曆分頁

**預覽**：iframe 載入 `calendar.html`，內嵌 `calendar-widget-readonly.html`（雙層 iframe）

**日期選取**：
- `tryInstallCalendarClickHook()` 在內層 iframe 的 `document` 上掛載 click 事件（capture phase）
- 因為雙層 iframe 載入時間不確定，用 `startHookWatcher()` 每 250ms 輪詢，最多等 12 秒
- 點擊 `.calendar-day` 元素 → 讀取 `data-date` 屬性 → `setSelectedDate(date)` 顯示編輯面板

**儲存事件**（`saveCalendarEvent`）：
1. 深拷貝 `state.calendarData`
2. 新增或更新 `events` 陣列中的對應日期
3. 按日期排序
4. `validateCalendarData()` 驗證
5. 更新 `state` 和 `dirty.calendar = true`
6. `sendCalendarDataToPreview()` 即時更新預覽

**清除事件**（`clearCalendarEvent`）：
1. `confirm()` 確認
2. 從 `events` 陣列過濾掉該日期
3. 更新 `state` 和 dirty flag
4. 送 postMessage 即時更新

**即時預覽**（`sendCalendarDataToPreview`）：
- 透過外層 iframe → 找到 `iframe.calendar-iframe` → 對內層 iframe 發送 `{type: 'admin-calendar-update', data}`
- 日曆 widget 收到後用新資料重新渲染

### 2. 季節限定 / 全部品項分頁

**預覽**：iframe 載入 `seasonal.html` 或 `all-items.html`，帶 `?adminPreview=1&mode=edit`

**圖片選取**：
- `gallery-loader.js` 在編輯模式下為每個圖片綁定 click 事件
- 點擊 → `postMessage({type: 'gallery-edit', index})` 通知 admin
- admin 收到 → `openImageEditPanel(type, index)` 顯示編輯面板

**編輯儲存**（`saveImageEdit`）：
1. 從表單收集所有欄位（名稱、英文名、價格、描述、標籤）
2. 直接修改 `state.imageData[type].items[index]`
3. 設定 `dirty[type] = true`
4. **不呼叫 `sendImageDataToPreview`**（避免重新渲染導致圖片失效）
5. 名稱和檔名分離：改名稱只改 JSON 的 `name` 欄位，`image` 路徑不變

**刪除圖片**（`deleteImage`）：
1. `confirm()` 確認
2. 將圖片路徑加入 `dirty.pendingDeletes`
3. 從 items 陣列移除
4. `sendImageDataToPreview()` 重新渲染（因為少了一張圖）

**上傳圖片**（`handleImageUpload`）：
1. 支援拖曳到上傳區域或點擊選擇檔案
2. `ImageCompress.compress(file)` 壓縮圖片
3. base64 結果存入 `dirty.pendingImages`（不立即上傳到 GitHub）
4. 建立 `_previewUrl`（blob URL）供本地預覽
5. 加入 items 陣列 → `sendImageDataToPreview()` 重新渲染
6. 自動選取新上傳的圖片並滾動到該位置

**拖曳排序**（`reorderImages`）：
1. `gallery-loader.js` 在編輯模式下啟用 HTML5 drag-and-drop
   - 設定 `img.draggable = false`（避免 IMG 原生拖曳被 `image-protection.js` 攔截）
   - `dragstart` 加 `e.stopPropagation()` 防止事件冒泡被攔截
   - `fromIndex` / `toIndex` 使用 `itemEl.dataset.index` 取得即時索引（DOM 重排後閉包變數會過期）
2. drop 後 → `postMessage({type: 'gallery-reorder', fromIndex, toIndex})`
3. admin 收到 → 修改 items 陣列順序
4. 發送 `{type: 'admin-gallery-reorder-dom', fromIndex, toIndex}` → gallery-loader 直接在 DOM 層面移動元素（不重新渲染，避免圖片失效）

### 3. 一鍵發布（`publish`）

**流程**：
```
confirm() 確認
  → 收集所有 dirty 變更
  → 建立 changes 陣列（每個變更 = {path, content, encoding}）
  → GitHubAPI.commitMultipleFiles(changes, message) 原子 commit
  → 刪除待刪圖片（Contents API，逐一刪除）
  → 重置所有 dirty flags
  → 重新從 GitHub 載入最新資料
  → watchDeployment() 開始監控部署狀態
```

**commit 內容依序**：
1. `calendar-data.json`（如果 dirty.calendar）
2. `calendar.html` + `calendar-widget-readonly.html` 的 `?v=` 版本號 bump（如果日曆有改）
3. `seasonal-data.json`（如果 dirty.seasonal）
4. `products-data.json`（如果 dirty.products）
5. 圖片二進位檔案（dirty.pendingImages，base64 編碼）
6. commit 完成後，逐一刪除 `dirty.pendingDeletes` 裡的檔案

**commit message 格式**：`更新：日曆、季節限定、全部品項、N 張圖片`（依實際有修改的部分組合）

---

## GitHub API 封裝

**檔案**：`admin-github-api.js`，暴露為 `window.GitHubAPI`

### 常數

```javascript
OWNER = 'lovelycakery'
REPO  = 'lovelycakery'
BRANCH = 'main'
```

### 核心函數

| 函數 | 用途 | GitHub API |
|------|------|-----------|
| `getFile(path)` | 讀取單一檔案（文字） | GET /repos/.../contents/{path} |
| `getJSON(path)` | 讀取 JSON 檔案 | 同上 + JSON.parse |
| `deleteFile(path, msg)` | 刪除單一檔案 | DELETE /repos/.../contents/{path} |
| `commitMultipleFiles(changes, msg)` | 多檔原子 commit | Git Data API（見下方） |
| `getLatestWorkflowRun()` | 查詢最新部署狀態 | GET /repos/.../actions/runs |
| `validateToken()` | 驗證 Token 有效性 | GET /user |
| `checkRepoAccess()` | 驗證 repo 存取權限 | GET /repos/{owner}/{repo} |

### 多檔原子 commit 流程（`commitMultipleFiles`）

```
1. GET refs/heads/main          → 取得目前 commit SHA
2. GET git/commits/{sha}        → 取得 base tree SHA
3. POST git/blobs (每個變更檔案)  → 建立 blob，取得 blob SHA
4. POST git/trees               → 建立新 tree（base_tree + 所有 blob）
5. POST git/commits             → 建立 commit（指向新 tree）
6. PATCH refs/heads/main        → 更新分支指向新 commit
```

包含衝突重試機制：如果 step 6 失敗（409 或 fast-forward error），等 500ms 後從 step 1 重試，最多 2 次。

---

## 圖片壓縮

**檔案**：`admin-image-compress.js`，暴露為 `window.ImageCompress`

### `compress(file)` 流程

```
1. createImageBitmap(file, {imageOrientation: 'from-image'})
   → 自動處理 EXIF 旋轉
2. 如果任一邊 > 2000px → 等比縮小到 2000px 以內
3. 繪製到 <canvas>
4. canvas.toBlob('image/jpeg', 0.85) → 第一次壓縮
5. 如果 > 500KB → canvas.toBlob('image/jpeg', 0.75) → 降低品質
6. 回傳 {blob, base64, width, height}
```

---

## iframe 通訊協定（postMessage）

### admin → iframe

| type | 方向 | 用途 | 接收方 |
|------|------|------|--------|
| `admin-calendar-update` | admin → 內層 calendar iframe | 即時更新日曆資料 | `calendar-widget-readonly.js` |
| `admin-gallery-update` | admin → gallery iframe | 完整重新渲染 gallery（上傳/刪除後用） | `gallery-loader.js` |
| `admin-gallery-reorder-dom` | admin → gallery iframe | DOM 層面移動元素（排序用） | `gallery-loader.js` |
| `gallery-select` | admin → gallery iframe | 標記/取消選取圖片 | `gallery-loader.js` |
| `gallery-scroll-to` | admin → gallery iframe | 滾動到指定圖片 | `gallery-loader.js` |

### iframe → admin

| type | 方向 | 用途 | 接收方 |
|------|------|------|--------|
| `gallery-edit` | gallery iframe → admin | 使用者點擊圖片，打開編輯面板 | `admin-app.js` |
| `gallery-reorder` | gallery iframe → admin | 使用者拖曳完成排序 | `admin-app.js` |

### 安全檢查

- admin 端：`e.origin !== location.origin` 時忽略
- gallery 端：只接受 same-origin 的訊息

---

## 日曆 Cache 版本號機制

### 為什麼需要

瀏覽器會快取 CSS/JS。版本號 `?v=YYYYMMDD-N` 強制瀏覽器重新下載。

### 格式

```
?v=20260405-2
     │         │
     UTC日期    當天第幾次更新
```

### 哪些檔案有 `?v=`

- `calendar.html`（引用 CSS/JS 時帶版本號）
- `calendar-widget-readonly.html`（同上）

### 何時 bump

- **Web Admin 發布時**：`admin-app.js` 的 `publish()` 在日曆有修改時自動讀取這 2 個 HTML → `computeNextCacheVersion()` 計算新版本 → 替換所有 `?v=` → 包含在同一個 commit 裡
- **本機開發時**：手動跑 `bash bump-calendar-cache.sh`

### CI 檢查

`check.sh` 驗證：
1. 2 個頁面的版本號必須完全一致
2. 如果日曆相關資源有變動，版本號必須跟上一個 commit 不同

---

## 部署狀態監控

**函數**：`watchDeployment()`

發布後每 5 秒查詢 GitHub Actions API（`GET /repos/.../actions/runs?branch=main&per_page=1`），顯示進度：

```
⏳ 部署中… (5秒)
⏳ 部署中… (10秒)
...
✅ 部署完成！網站已更新。    ← 成功：2 秒後自動重新整理預覽
❌ 部署失敗（failure）       ← 失敗：顯示錯誤
⚠️ 等待超時                  ← 超過 3 分鐘
```

---

## 資料結構

### calendar-data.json

```json
{
  "events": [
    {
      "date": "2026-04-05",
      "status": "available",       // "available" | "unavailable" | "closed"
      "description": "可留空"       // 點日曆時顯示的 tooltip 文字
    }
  ]
}
```

### seasonal-data.json / products-data.json

```json
{
  "schema_version": 1,
  "items": [
    {
      "image": "assets/images/seasonal/草莓千層3.jpg",   // 圖片路徑（不隨名稱改變）
      "name": "草莓千層",                                // 中文名稱
      "name_en": "Strawberry Mille Crepe",              // 英文名稱
      "prices": {
        "size6": "1800",                                 // 6吋價格（字串）
        "size8": "2000",                                 // 8吋價格
        "slice": "180"                                   // 切片價格
      },
      "description": "中文描述...",
      "description_en": "English description...",
      "tags": ["奶蛋素"]                                  // 允許值：奶蛋素、無咖啡因、含酒精
    }
  ]
}
```

**重要**：`image` 路徑在上傳時決定（基於原始檔名），之後不再因改名稱而改變。

---

## 已知限制與設計決策

1. **預覽延遲**：發布後預覽需等 GitHub Pages 部署完成（約 30 秒）才會顯示最新內容。本地編輯的即時預覽透過 postMessage 解決。

2. **文字修改不即時反映在預覽**：為避免重新渲染導致圖片失效，編輯名稱/價格/描述後預覽不會更新。需等發布+部署完成後預覽才會更新。

3. **圖片快取**：gallery-loader.js 在 admin 模式下 fetch JSON 時加 `?ts=時間戳` 避免快取。一般訪客不受影響。

4. **日曆 hook 用輪詢**：因為雙層 iframe 載入時間不可預測，用 `setInterval` 每 250ms 檢查是否可以安裝 click hook。這是 admin 專用邏輯，不影響訪客。

5. **刪除是分開的 commit**：`commitMultipleFiles` 用 Git Data API 只能新增/修改檔案。刪除用 Contents API 逐一操作，會產生額外的 commit。

---

## 修改指引

### 新增一個商品欄位（例如「過敏原」）

1. 修改 `admin.html`：在 `imageEditForm` 區塊加入新的輸入欄位
2. 修改 `admin-app.js`：
   - `openImageEditPanel()`：從 item 讀取欄位填入表單
   - `saveImageEdit()`：從表單讀取欄位寫入 item
   - `clearImageEditPanel()`：清空新欄位
3. 修改 `gallery-loader.js`：在 `renderGallery()` 和 `createImageModal()` 中顯示新欄位
4. 如果需要驗證：修改 `validateImageData()` 和 `checkAllFields()`

### 新增一個日曆狀態（例如「已額滿」）

1. 修改 `admin.html`：在 `statusSelect` 加入新選項
2. 修改 `admin-app.js`：`validateCalendarData()` 的 `allowed` 陣列加入新值
3. 修改 `calendar-widget-readonly.js`：在 `createDayElement()` 加入對應的 CSS class
4. 修改 `calendar-widget.css`：加入新狀態的樣式
5. 修改 `check.sh`：日曆 schema 驗證的 `allowed` 集合加入新值

### 修改 GitHub repo 設定（owner/repo/branch）

修改 `admin-github-api.js` 頂部的常數：
```javascript
const OWNER = 'lovelycakery';
const REPO = 'lovelycakery';
const BRANCH = 'main';
```

### 修改圖片壓縮參數

修改 `admin-image-compress.js` 頂部的常數：
```javascript
const MAX_DIMENSION = 2000;    // 最大邊長
const QUALITY_HIGH = 0.85;     // 第一次壓縮品質
const QUALITY_LOW = 0.75;      // 超過 SIZE_THRESHOLD 時降低品質
const SIZE_THRESHOLD = 500 * 1024;  // 500 KB
```

---

（最後更新：2026-04。）
