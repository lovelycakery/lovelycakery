# Lovely Admin Tool — Architecture & Safety Documentation

> **⚠️ 此文件描述的是舊版 Electron 管理工具。**
> 目前推薦使用 Web Admin（`site/admin.html`），透過 GitHub API 直接操作。
> 請參考 `site/AI_MAINTENANCE_GUIDE.md` 取得最新架構說明。

本文檔詳細說明舊版 Electron 管理工具（`admin/`）的程式架構與安全規則，僅供歷史參考。

> **⚠️ 安全規則（MUST FOLLOW）**：本工具的核心要求是「不能意外破壞網站」。所有安全規則定義在[安全架構](#安全架構)章節，**必須嚴格遵守**。

---

## 目錄

### 第一部分：安全架構（必讀）

1. [安全架構](#安全架構) ⚠️ **必須遵守**
   - [Scope & Separation](#scope--separation)
   - [Write Guardrails](#write-guardrails-hard-requirements)
   - [Publish Guardrails](#publish-guardrails)
   - [Image Management Safety](#image-management-safety)
   - [Deletion Policy](#deletion-policy-general)

### 第二部分：技術架構

2. [整體架構](#整體架構)
3. [檔案結構](#檔案結構)
4. [Electron 架構](#electron-架構)
5. [IPC API 完整清單](#ipc-api-完整清單)
6. [UI 狀態管理](#ui-狀態管理)
7. [資料流程](#資料流程)
8. [圖片管理流程](#圖片管理流程)
9. [安全機制實作細節](#安全機制實作細節)
10. [實作細節](#實作細節)
    - [焦點管理與對話框（重要：避免焦點問題）](#焦點管理與對話框重要避免焦點問題)
11. [擴展指南](#擴展指南)

---

## 安全架構

> **⚠️ 本節定義不可協商的安全護欄。未來的 AI/維護者必須遵守。**

This `admin/` tool is **local-only** and is allowed to modify the website under `site/`, but the #1 requirement is:

> **The admin tool must not be able to accidentally break the website.**

### Scope & Separation

- **Website** lives in `site/` and is deployed as-is to GitHub Pages.
- **Admin tool** lives in `admin/` and is never deployed.
- The website must never depend on admin-only code or assets to run.

### Write Guardrails (Hard Requirements)

#### 1) Strict path allowlist (default: data-only)

The admin tool must only write to explicitly allowlisted paths under the selected `site/` folder.

- Default allowlist:
  - **Data files:**
    - `assets/data/calendar-data.json`
    - `assets/data/seasonal-data.json`
    - `assets/data/products-data.json`
  - **Calendar pages** (for cache-busting version bump):
    - `calendar.html`
    - `calendar-widget-readonly.html`
    - `calendar-widget.html`
    - `calendar-manager-local.html` (legacy; optional but kept consistent)
  - **Image directories** (write access to files within):
    - `assets/images/seasonal/` (directory; relative paths validated)
    - `assets/images/products/` (directory; relative paths validated)

Everything else is **read-only** unless a maintainer explicitly expands the allowlist.

#### 2) Site path locking + validation

- On first run, the tool auto-detects the `site/` folder (no manual selection allowed).
- The tool stores the chosen path in `userData/config.json`.
- **Before any write**, the tool must verify marker files exist (minimum):
  - `calendar.html`
  - `assets/data/calendar-data.json`
- If validation fails, **refuse to write** and show a clear error.

#### 3) Atomic writes

All writes must be atomic:

- Write to `*.tmp-{pid}-{timestamp}` in the same directory
- Rename to final filename
- No partial writes.

#### 4) Automatic backups (outside repo)

- Before overwriting any allowlisted file, create a timestamped backup.
- Backups must be stored **outside the git repository** (e.g., in Electron `userData/backups/`).
- Do not commit `.bak` files into the repo.

#### 5) Strict schema validation

Before saving:

- Validate JSON is parseable
- Validate required fields exist
- Validate enums (e.g., calendar status must be one of `available|unavailable|closed`)
- Reject invalid inputs with actionable messages

Include `schema_version` when introducing new schemas.

#### 6) Dry-run / preview of changes

**注意**：目前發布流程中尚未實作完整的 dry-run/preview 功能。發布流程會：
- 執行本地 preflight 檢查（Gate 1）
- 檢查是否有變更（unstaged 或 untracked files）
- 如果檢查通過，直接執行 commit 和 push

**未來改進**：可以考慮在發布前顯示：
- 哪些檔案會改變（至少：data 檔案 + version-bumped HTML 檔案）
- 變更摘要（例如：編輯的日期）

### Publish Guardrails

#### 1) Local preflight gate (first gate)

The tool must run local checks before pushing:

- Equivalent to essential parts of `check.sh`
- Plus any relevant schema validation

If preflight fails, **do not commit/push**.
Show clear errors that a non-technical collaborator can copy/paste.

#### 2) CI gate (second gate)

GitHub Actions is the second gate:

- Push triggers CI checks
- Only if CI passes does GitHub Pages deploy

The tool should display a concise "CI deploy failed" summary when needed, without requiring the collaborator to use GitHub UI.

### Image Management Safety

#### File naming and consistency

- Image filenames must match the `name` field in JSON (after sanitization).
- Filename sanitization removes/replaces invalid characters: `/ \ : * ? " < > |`
- When editing image names, files are automatically renamed to match the new name.
- Before renaming, the tool checks for filename conflicts and rejects if target filename exists.

#### Upload safety

- All uploaded images are compressed using `sharp`:
  - Maximum dimension: 2000px (longest side)
  - Format: JPG (quality 85%, mozjpeg)
  - Target size: < 500KB (recompressed at 75% quality if needed)
- Filename conflicts are checked before upload; duplicate names are rejected.
- Images are stored in allowlisted directories only (`assets/images/seasonal/` or `assets/images/products/`).

#### Data consistency validation

- The tool validates JSON records against actual files:
  - Missing files (recorded in JSON but file doesn't exist)
  - Unrecorded files (file exists but not in JSON)
  - Filename mismatches (file name doesn't match JSON `name` field)
- Validation is run during preflight checks and can be triggered manually.

### Deletion Policy (General)

- Prefer **reversible** operations.
- **Image deletion**: Deletes both the file and JSON record. The file deletion is non-reversible (not moved to trash), but backups of JSON files are created before updates.
- **Calendar event deletion**: Only removes the event entry from JSON (reversible via backup).

---

## 整體架構

### 核心設計原則

1. **本地工具**：管理工具僅在本地執行，不會部署到 GitHub Pages
2. **直接檔案操作**：透過 Node.js 直接讀寫 `site/` 目錄下的檔案
3. **安全第一**：所有寫入操作都必須通過嚴格的安全檢查（見[安全架構](#安全架構)章節）
4. **預覽即真實**：預覽 iframe 直接載入 `site/` 的檔案，確保所見即所得

### 技術棧

- **Electron**：跨平台桌面應用框架
- **Express**：本地 HTTP 伺服器（用於提供 `site/` 和 `admin/ui/` 的靜態檔案）
- **sharp**：圖片壓縮與格式轉換（Node.js）
- **純 JavaScript**：無框架，使用原生 DOM API

---

## 檔案結構

```
admin/
├── src/
│   ├── main.js          # Electron 主進程（Node.js 環境）
│   └── preload.js       # 預載腳本（橋接 main 與 renderer）
├── ui/
│   ├── index.html       # UI 結構
│   ├── app.js           # Renderer 進程邏輯（瀏覽器環境）
│   └── styles.css       # 樣式
├── package.json         # 依賴與腳本
├── README.md            # 使用說明
└── ARCHITECTURE.md      # 本文檔（架構與安全規則）
```

### 檔案職責

#### `src/main.js`（主進程）
- **環境**：Node.js（完整檔案系統存取）
- **職責**：
  - 啟動 Express 伺服器（提供 `site/` 和 `admin/ui/`）
  - 建立 Electron 視窗
  - 處理所有 IPC 請求（檔案讀寫、git 操作）
  - 實作安全檢查（allowlist、路徑驗證、schema 驗證）
  - 圖片壓縮（sharp）
  - Git 操作（commit、push）

#### `src/preload.js`（橋接層）
- **環境**：特殊的 Electron 環境（可存取 `ipcRenderer`，但不可直接存取 Node.js）
- **職責**：
  - 透過 `contextBridge` 暴露安全的 API 給 renderer
  - 將 renderer 的呼叫轉發到 main 進程的 IPC handlers
  - **重要**：這是 renderer 與 main 之間唯一的通訊管道

#### `ui/app.js`（Renderer 進程）
- **環境**：瀏覽器環境（受限，無法直接存取檔案系統）
- **職責**：
  - UI 狀態管理
  - 事件處理（按鈕點擊、表單提交）
  - 與 main 進程通訊（透過 `window.LovelyAdmin` API）
  - 預覽 iframe 的互動（日曆點擊 hook）
  - 圖片列表渲染與拖曳排序

#### `ui/index.html`
- UI 結構（HTML）
- 包含：
  - Topbar（模式切換、分頁、發布按鈕）
  - 預覽 iframe
  - 編輯面板（日曆 / 圖片管理）
  - 圖片編輯 modal

---

## Electron 架構

### 進程分離

Electron 使用多進程架構：

```
┌─────────────────────────────────────┐
│  Main Process (Node.js)             │
│  - src/main.js                      │
│  - 檔案系統存取                      │
│  - IPC handlers                     │
└──────────────┬──────────────────────┘
               │ IPC (Inter-Process Communication)
               │
┌──────────────▼──────────────────────┐
│  Preload Script                     │
│  - src/preload.js                   │
│  - contextBridge.exposeInMainWorld   │
└──────────────┬──────────────────────┘
               │ window.LovelyAdmin API
               │
┌──────────────▼──────────────────────┐
│  Renderer Process (Browser)         │
│  - ui/app.js                        │
│  - DOM 操作                         │
│  - 受限環境（無檔案系統存取）         │
└─────────────────────────────────────┘
```

### 通訊流程

1. **Renderer → Main**：
   ```javascript
   // Renderer (ui/app.js)
   const result = await window.LovelyAdmin.readCalendarData();
   
   // Preload (src/preload.js) 轉發
   readCalendarData: () => ipcRenderer.invoke('calendar:read')
   
   // Main (src/main.js) 處理
   ipcMain.handle('calendar:read', async () => { ... });
   ```

2. **Main → Renderer**：
   - 透過 IPC 回傳值（Promise resolve）
   - 不支援主動推送（如需推送，使用 `webContents.send` + `ipcRenderer.on`）

### 本地伺服器

`main.js` 啟動 Express 伺服器，提供：
- `/admin/*` → `admin/ui/` 目錄（管理工具 UI）
- `/site/*` → `site/` 目錄（網站預覽）

**重要**：預覽 iframe 載入 `http://127.0.0.1:PORT/site/calendar.html`，確保與實際網站行為一致。

---

## IPC API 完整清單

所有 API 都透過 `window.LovelyAdmin` 暴露給 renderer。以下是完整清單：

### 網站資訊

#### `getSiteInfo()`
- **用途**：取得 `site/` 目錄路徑與 Git 資訊
- **回傳**：`{ ok: true, siteDir: string, repoRoot: string }`
- **實作**：`ipcMain.handle('site:getInfo')`

### 日曆管理

#### `readCalendarData()`
- **用途**：讀取 `site/assets/data/calendar-data.json`
- **回傳**：`{ ok: true, data: { events: [...] } }`
- **實作**：`ipcMain.handle('calendar:read')`

#### `upsertCalendarEvent(payload)`
- **用途**：新增或更新日曆事件
- **參數**：`{ date: 'YYYY-MM-DD', status: 'available'|'unavailable'|'closed', description: string }`
- **回傳**：`{ ok: true }`
- **實作**：`ipcMain.handle('calendar:upsertEvent')`
- **安全**：驗證日期格式、status 枚舉、自動備份、atomic write

#### `deleteCalendarEvent(payload)`
- **用途**：刪除日曆事件
- **參數**：`{ date: 'YYYY-MM-DD' }`
- **回傳**：`{ ok: true }`
- **實作**：`ipcMain.handle('calendar:deleteEvent')`

#### `bumpCalendarVersion()`
- **用途**：更新日曆相關 HTML 的 `?v=` 參數（快取破壞）
- **回傳**：`{ ok: true }`
- **實作**：`ipcMain.handle('calendar:bumpVersion')`
- **影響檔案**：`calendar.html`, `calendar-widget.html`, `calendar-widget-readonly.html`, `calendar-manager-local.html`

### 圖片管理

#### `readImageData(payload)`
- **用途**：讀取圖片資料 JSON
- **參數**：`{ type: 'seasonal' | 'products' }`
- **回傳**：`{ ok: true, data: { schema_version: 1, items: [...] } }`
- **實作**：`ipcMain.handle('images:read')`
- **檔案**：`site/assets/data/seasonal-data.json` 或 `products-data.json`

#### `validateImageData(payload)`
- **用途**：驗證 JSON 與實際圖檔的一致性
- **參數**：`{ type: 'seasonal' | 'products' }`
- **回傳**：`{ ok: boolean, issues: Array<{ type, message, ... }> }`
- **檢查項目**：
  - JSON 中記錄但檔案不存在
  - 檔案存在但未記錄在 JSON
  - 檔名與 JSON 中的 `name` 不一致
- **實作**：`ipcMain.handle('images:validate')`

#### `selectImageFiles()`
- **用途**：開啟檔案選擇對話框
- **回傳**：`{ ok: true, files: string[] }` 或 `{ ok: false, files: [] }`
- **實作**：`ipcMain.handle('images:selectFiles')`
- **過濾器**：JPG, JPEG, PNG, WebP

#### `uploadImage(payload)`
- **用途**：上傳並壓縮圖片
- **參數**：`{ type: 'seasonal' | 'products', filePath: string, name: string }`
- **回傳**：`{ ok: true, imagePath: string, name: string }`
- **實作**：`ipcMain.handle('images:upload')`
- **流程**：
  1. 驗證 `site/` 目錄
  2. 清理檔名：
     - 使用 `sanitizeFilename(name.trim())` 移除特殊字元並清理空白
     - 使用 `getImageFilename()` 加上 `.jpg` 副檔名
  3. 檢查檔名是否已存在（如果存在則拋出錯誤）
  4. 使用 `sharp` 壓縮圖片（最大 2000px，JPG quality 85%，目標 < 500KB）
  5. 儲存到 `assets/images/seasonal/` 或 `assets/images/products/`
- **檔名規則**：`{sanitizedName}.jpg`（與 JSON 中的 `name` 一致，不含副檔名的 `name` 欄位對應檔名不含 `.jpg`）

#### `updateImageData(payload)`
- **用途**：更新圖片資料（包括重新排序、編輯 metadata、重新命名檔案）
- **參數**：`{ type: 'seasonal' | 'products', items: Array<{ name, image, price, description, tags }> }`
- **回傳**：`{ ok: true }`
- **實作**：`ipcMain.handle('images:update')`
- **流程**：
  1. 驗證 schema
  2. 檢查檔名一致性，必要時重新命名檔案：
     - 計算預期檔名（`getImageFilename(item.name)`）
     - 如果當前檔名與預期不符，執行重新命名
     - **安全檢查**：重新命名前檢查目標檔名是否已存在（避免覆蓋其他檔案）
     - 如果目標檔名已存在且不是同一個檔案，拋出錯誤
  3. Atomic write + 備份
- **重要**：`items` 陣列順序即為顯示順序

#### `deleteImage(payload)`
- **用途**：刪除圖片實體檔案
- **參數**：`{ type: 'seasonal' | 'products', imagePath: string }`
- **回傳**：`{ ok: true }`
- **實作**：`ipcMain.handle('images:delete')`
- **流程**：
  1. 驗證 `site/` 目錄
  2. 刪除實體檔案（如果檔案不存在，忽略錯誤）
- **注意**：此 API 僅刪除檔案，不更新 JSON。JSON 更新由 UI 層（`app.js` 的 `deleteImage()` 函數）處理：先呼叫此 API 刪除檔案，再從 `state.imageData` 移除項目，最後呼叫 `updateImageData()` 更新 JSON。

### 發布

#### `runPreflight()`
- **用途**：執行本地檢查（等同 `check.sh` 的核心檢查）
- **回傳**：`{ ok: boolean, errors: string[] }`
- **實作**：`ipcMain.handle('publish:preflight')`
- **檢查項目**：
  1. **缺少的資源檔案**：檢查 HTML 檔案中引用的 `assets/` 路徑是否存在
  2. **Script 載入順序**：驗證 `calendar-widget-readonly.html` 中必要的 script 是否存在且順序正確
  3. **禁止 polling loops**：檢查 `assets/js/` 中是否有 `setInterval(`（不允許）
  4. **快取版本一致性**：檢查所有 calendar 相關 HTML 檔案的 `?v=` 參數是否一致
  5. **圖片資料一致性**：驗證 `seasonal-data.json` 和 `products-data.json` 與實際圖檔的一致性
- **注意**：此檢查在本地執行，不依賴 `check.sh` 腳本，但檢查項目與 `check.sh` 的核心功能對應

#### `publish(payload)`
- **用途**：一鍵發布（本機檢查 → commit → push）
- **參數**：`{ message?: string }`（可選的 commit message，預設為 "Update calendar data"）
- **回傳**：`{ ok: boolean, phase: string, message: string, authHint?: string }`
- **實作**：`ipcMain.handle('publish:run')`
- **流程**：
  1. 驗證 `site/` 目錄
  2. **Gate 1：執行 `runPreflight()`**
     - 如果檢查失敗，立即返回錯誤，不執行 Git 操作
  3. 取得 Git repository root（從 `site/` 目錄向上尋找）
  4. 檢查是否有變更：
     - 檢查 `site/` 目錄下的 unstaged changes
     - 檢查 `site/` 目錄下的 untracked files
     - 如果沒有變更，返回錯誤提示
  5. `git add site/`（只 stage `site/` 目錄，避免意外提交 `admin/`）
  6. 再次確認有 staged changes（避免檔案被忽略的情況）
  7. `git commit -m "{message}"`（使用參數中的 message 或預設值）
  8. `git push origin main`
- **錯誤處理**：
  - 區分認證錯誤與其他錯誤，提供友善提示（`authHint`）
  - 顯示完整的錯誤訊息、stdout 和 exit code 以便診斷

---

## UI 狀態管理

### 狀態物件（`state`）

定義於 `ui/app.js`：

```javascript
const state = {
  siteInfo: null,                    // 網站資訊
  calendarData: null,                 // 日曆資料（完整 JSON）
  eventsByDate: new Map(),            // 日曆事件索引（date -> event）
  selectedDate: '',                   // 目前選取的日期（YYYY-MM-DD）
  clickHookInstalled: false,         // 日曆點擊 hook 是否已安裝
  hookTimer: 0,                       // hook watcher 的 timer ID
  lastSelectedDayEl: null,            // 最後選取的日期元素（用於視覺反饋）
  currentTab: 'calendar',             // 目前分頁：'calendar' | 'seasonal' | 'products'
  currentMode: 'edit',                 // 目前模式：'edit' | 'preview'
  imageData: {                         // 圖片資料快取
    seasonal: { items: [] },
    products: { items: [] },
  },
  editingImageIndex: -1,              // 正在編輯的圖片索引（-1 表示無）
};
```

### 模式切換

#### 編輯模式（`edit`）
- 顯示 topbar 分頁按鈕
- 顯示右側編輯面板
- 顯示預覽提示
- 啟用日曆點擊 hook（僅在 calendar 分頁）

#### 預覽模式（`preview`）
- 隱藏 topbar 分頁按鈕
- 隱藏右側編輯面板
- 隱藏預覽提示
- 全螢幕預覽 iframe
- 停用日曆點擊 hook

**實作**：`switchMode(mode)` 函數

### 分頁切換

#### 日曆分頁（`calendar`）
- 載入 `calendar.html` 到預覽 iframe
- 顯示日曆編輯面板
- 啟動日曆點擊 hook（僅在編輯模式）

#### 季節限定分頁（`seasonal`）
- 載入 `seasonal.html` 到預覽 iframe
- 顯示圖片管理面板
- 載入 `seasonal-data.json`

#### 全部品項分頁（`products`）
- 載入 `all-items.html` 到預覽 iframe
- 顯示圖片管理面板
- 載入 `products-data.json`

**實作**：`switchTab(tabName)` 函數

### 日曆點擊 Hook

**架構說明**：預覽 iframe 採用雙層結構（外層載入 `calendar.html`，內層載入 `calendar-widget.html`）。為了在編輯模式下讓使用者點擊日曆日期進行編輯，需要在內層 iframe 的日曆上安裝點擊事件監聽器。

**實作機制**：
1. **雙層 iframe 結構**：
   - 外層：`previewFrame`（載入 `calendar.html`）
   - 內層：`iframe.calendar-iframe`（載入 `calendar-widget.html`，包含實際日曆）

2. **Hook 安裝流程**：
   - `startHookWatcher()`：定期嘗試安裝 hook（最多等待 12 秒，每 250ms 檢查一次）
   - `tryInstallCalendarClickHook()`：實際安裝邏輯
     - 存取 `previewFrame.contentDocument`（外層 iframe）
     - 找到 `iframe.calendar-iframe`（內層 iframe）
     - 存取 `innerIframe.contentDocument`
     - 注入 CSS（`.lovely-admin-selected` 樣式，用於視覺反饋）
     - 安裝 click 事件監聽器（capture phase，捕獲所有點擊）
   - 在 iframe `load` 事件時重新啟動 watcher（因為 iframe 重新載入會清除事件監聽器）

3. **狀態管理**：
   - `state.clickHookInstalled`：標記 hook 是否已成功安裝
   - `state.hookTimer`：watcher 的 timer ID（用於清除）
   - Hook 僅在 `currentTab === 'calendar'` 且 `currentMode === 'edit'` 時啟動
   - 切換分頁或模式時，自動清除 `hookTimer` 並重置 `clickHookInstalled`

4. **錯誤處理**：
   - 所有跨 iframe 存取都使用 `try-catch` 包裹
   - 如果存取失敗（CORS 或載入時機），watcher 會持續重試直到成功或超時

---

## 資料流程

### 日曆資料流程

```
1. 使用者點擊日曆日期
   ↓
2. tryInstallCalendarClickHook() 捕獲點擊
   ↓
3. setSelectedDate(dateStr) 更新 state
   ↓
4. UI 更新（顯示選取日期、載入現有事件資料）
   ↓
5. 使用者編輯狀態/說明，點擊「儲存」
   ↓
6. LovelyAdmin.upsertCalendarEvent({ date, status, description })
   ↓
7. main.js: ipcMain.handle('calendar:upsertEvent')
   - 驗證 site/ 目錄
   - 讀取現有 calendar-data.json
   - 更新/新增事件
   - 驗證 schema
   - Atomic write + 備份
   ↓
8. LovelyAdmin.bumpCalendarVersion()
   - 更新 HTML 檔案的 ?v= 參數
   ↓
9. refreshCalendarData() 重新載入資料
   ↓
10. reloadPreview() 重新載入預覽 iframe
```

### 圖片上傳流程

```
1. 使用者選擇檔案（拖曳或點擊）
   ↓
2. promptImageName() 顯示 modal 要求輸入名稱
   ↓
3. LovelyAdmin.uploadImage({ type, filePath, name })
   ↓
4. main.js: ipcMain.handle('images:upload')
   - 驗證 site/ 目錄
   - 清理檔名（sanitizeFilename）
   - 檢查檔名衝突
   - 壓縮圖片（sharp）
   - 儲存到 assets/images/{type}/
   ↓
5. 回傳 { imagePath, name }
   ↓
6. UI 層（app.js）：
   - 新增項目到 state.imageData[type].items（記憶體快取）
   - 如果有多個檔案，重複步驟 2-6
   ↓
7. 所有檔案上傳完成後，呼叫 LovelyAdmin.updateImageData({ type, items })
   ↓
8. main.js: ipcMain.handle('images:update')
   - 驗證 schema
   - 檢查檔名一致性（必要時重新命名）
   - Atomic write + 備份
   ↓
9. UI 層重新載入資料（loadImageData）並重新渲染列表（renderImageList）
```

### 圖片編輯流程

#### 方式一：從右側面板編輯
```
1. 使用者點擊圖片列表中的「編輯」
   ↓
2. openImageEditModal(index) 顯示 modal
   ↓
3. 使用者編輯名稱/價格/描述/標籤
   ↓
4. 點擊「儲存」
   ↓
5. saveImageEdit() 更新 state.imageData[type].items[index]
   ↓
6. LovelyAdmin.updateImageData({ type, items })
   ↓
7. main.js 處理（同上傳流程的步驟 8-9）
   - 如果名稱改變，會自動重新命名檔案
```

#### 方式二：從預覽頁面點擊編輯（admin 模式）
```
1. 使用者在預覽 iframe 中點擊圖片
   ↓
2. gallery-loader.js 檢測到 admin 模式（URL 參數 adminPreview=1）
   ↓
3. 點擊事件觸發，發送 postMessage 給父窗口
   ↓
4. app.js 的 message 監聽器接收 'gallery-edit' 訊息
   ↓
5. 驗證索引有效性後，呼叫 openImageEditModal(type, index)
   ↓
6. 後續流程同方式一的步驟 3-7
```

**重要**：拖曳和點擊事件會衝突，必須正確區分：
- **拖曳操作**：按住圖片並移動，用於重新排序
- **點擊操作**：單擊圖片，用於打開編輯 modal
- **區分機制**：使用 `hasDragged` 標記和時間閾值（200ms）來判斷是否為拖曳操作

### 圖片刪除流程

```
1. 使用者點擊「刪除」
   ↓
2. 確認對話框
   ↓
3. LovelyAdmin.deleteImage({ type, imagePath })
   ↓
4. main.js: ipcMain.handle('images:delete')
   - 驗證 site/ 目錄
   - 刪除實體檔案（如果檔案不存在，忽略錯誤）
   ↓
5. UI 層（app.js: deleteImage()）：
   - 從 state.imageData[type].items 移除項目
   - 呼叫 updateImageData() 更新 JSON（包含 atomic write + 備份）
   ↓
6. renderImageList() 重新渲染列表
```

### 圖片拖曳排序流程

```
1. 使用者在預覽 iframe 中拖曳圖片
   ↓
2. gallery-loader.js 檢測到 admin 模式，啟用拖曳功能
   ↓
3. dragstart 事件：設置 hasDragged = false，記錄 dragStartTime
   ↓
4. dragover 事件：當滑鼠移動到其他項目上時，設置 hasDragged = true
   ↓
5. drop 事件：驗證索引有效性，發送 postMessage 給父窗口
   ↓
6. app.js 的 message 監聽器接收 'gallery-reorder' 訊息
   ↓
7. 驗證索引有效性後，呼叫 reorderImages(type, fromIndex, toIndex)
   ↓
8. 更新 state.imageData[type].items 陣列順序
   ↓
9. 呼叫 updateImageData() 更新 JSON（包含 atomic write + 備份）
   ↓
10. 重新載入預覽 iframe 和圖片列表
```

**關鍵機制：拖曳與點擊的區分**

為了避免拖曳後誤觸發點擊事件，實作了以下機制：

1. **狀態追蹤**：
   - `hasDragged`：標記是否實際發生了拖曳移動（在 `dragover` 時設置為 `true`）
   - `dragStartTime`：記錄拖曳開始的時間戳

2. **點擊事件檢查**：
   ```javascript
   // 檢查是否為拖曳操作：
   // - hasDragged = true：已發生拖曳移動
   // - timeSinceDragStart < 200ms：拖曳開始後短時間內點擊（可能是拖曳的一部分）
   if (hasDragged || timeSinceDragStart < 200) {
     // 不觸發點擊編輯
     return;
   }
   ```

3. **延遲重置**：
   - `dragend` 事件後，延遲 100ms 重置 `hasDragged` 標記
   - 確保 `click` 事件能正確判斷是否為拖曳操作

**常見問題與解決方案**：

- **問題**：拖曳後點擊圖片會打開編輯 modal
  - **原因**：`hasDragged` 標記未正確設置或重置時機不對
  - **解決**：確保在 `dragover` 時設置 `hasDragged = true`，並在 `dragend` 後延遲重置

- **問題**：點擊圖片沒有反應
  - **原因**：點擊事件被拖曳邏輯誤判為拖曳操作
  - **解決**：檢查 `hasDragged` 和時間閾值的邏輯，確保正常點擊不會被阻擋

**修改時的注意事項**：

1. **不要移除 `hasDragged` 檢查**：這是區分拖曳和點擊的關鍵
2. **不要縮短時間閾值**：200ms 是經過測試的合理值，太短可能無法正確區分
3. **確保 `dragover` 設置標記**：只有當滑鼠真正移動到其他項目上時才設置 `hasDragged = true`
4. **延遲重置是必要的**：`dragend` 後立即重置可能導致 `click` 事件誤判

---

## 圖片管理流程

### 資料結構

#### `seasonal-data.json` / `products-data.json`

```json
{
  "schema_version": 1,
  "items": [
    {
      "name": "草莓千層",
      "image": "assets/images/seasonal/草莓千層.jpg",
      "price": "680",
      "description": "新鮮草莓...",
      "tags": ["無", "奶蛋素"]
    }
  ]
}
```

**重要規則**：
- `name` 必須與檔名（不含副檔名）一致
- `image` 路徑必須是 `assets/images/{type}/{name}.jpg`
- `price` 是字串（純數字，如 "680"）
- `tags` 是陣列，選項：`"無"`, `"奶蛋素"`, `"無咖啡因"`, `"含酒精"`
- `items` 陣列順序即為顯示順序

### 檔名處理

#### `sanitizeFilename(name)`
- 移除或替換無效字元：`/ \ : * ? " < > |`
- 多個空格合併為單一空格
- 去除首尾空白

#### `getImageFilename(name)`
- 呼叫 `sanitizeFilename(name)`
- 加上 `.jpg` 副檔名
- 如果名稱為空，回傳 `untitled.jpg`

**重要**：上傳時，使用者輸入的名稱會直接作為檔名（經過清理）。編輯名稱時，如果名稱改變，會自動重新命名檔案。

### 圖片壓縮

#### `compressImage(inputPath, outputPath)`

流程：
1. 讀取圖片 metadata（`sharp`）
2. 如果最長邊 > 2000px，縮放至 2000px（保持比例）
3. 轉換為 JPG（quality 85%，mozjpeg）
4. 檢查檔案大小
5. 如果 > 500KB，重新壓縮（quality 75%）

**注意**：壓縮後的檔案大小可能仍 > 500KB（取決於圖片內容），但會盡量控制在合理範圍。

### 資料一致性驗證

#### `validateImageDataConsistency(siteDir, type)`

檢查項目：
1. **JSON 讀取錯誤**：無法解析 JSON
2. **缺少檔案**：JSON 中記錄但檔案不存在
3. **檔名不一致**：檔案存在但檔名與 JSON 中的 `name` 不一致
4. **未記錄檔案**：資料夾中有 `.jpg` 檔案但未記錄在 JSON

**回傳**：`{ ok: boolean, issues: Array<{ type, message, ... }> }`

**注意**：驗證不會自動修復問題，僅報告。

---

## 安全機制實作細節

### 1. 路徑 Allowlist

**定義**：`WRITE_ALLOWLIST`（`main.js`）

```javascript
const WRITE_ALLOWLIST = new Set([
  'assets/data/calendar-data.json',
  'assets/data/seasonal-data.json',
  'assets/data/products-data.json',
  'calendar.html',
  'calendar-widget-readonly.html',
  'calendar-widget.html',
  'calendar-manager-local.html',
  'assets/images/seasonal',    // 目錄（允許寫入其中的檔案）
  'assets/images/products',     // 目錄（允許寫入其中的檔案）
]);
```

**檢查**：所有寫入操作前，必須驗證目標路徑在 allowlist 中。

**擴展**：新增允許寫入的路徑時，必須：
1. 更新 `WRITE_ALLOWLIST`
2. 更新本文檔的[安全架構](#安全架構)章節
3. 確保有適當的驗證與備份機制

### 2. 路徑遍歷防護

**實作**：`joinUnderSite(siteDir, rel)`

```javascript
function joinUnderSite(siteDir, rel) {
  const base = normalizePath(siteDir);
  const target = normalizePath(path.join(base, rel));
  if (!target.startsWith(base + path.sep)) {
    throw new Error('Refusing path traversal outside site directory.');
  }
  return target;
}
```

**原理**：確保解析後的絕對路徑必須以 `siteDir + path.sep` 開頭，防止 `../` 攻擊。

### 3. Site 目錄驗證

**實作**：`ensureSiteLooksValid(siteDir)`

**檢查項目**：
- `calendar.html` 存在
- `assets/data/calendar-data.json` 存在

**時機**：每次寫入操作前（透過 `ensureSiteDir()` 呼叫）。

### 4. Site 目錄自動偵測與鎖定

**實作**：`ensureSiteDir()`

流程：
1. 檢查記憶體快取（`__siteDir`）
   - 如果已設定，直接返回（整個會話期間鎖定）
2. 讀取設定檔（`userData/config.json`）
3. 如果設定檔中有 `siteDir`，驗證該路徑：
   - 呼叫 `ensureSiteLooksValid()` 檢查必要檔案
   - 如果有效，設定為 `__siteDir` 並返回
   - 如果無效，忽略設定檔中的值
4. 如果設定檔無效或不存在，嘗試自動偵測（`tryAutoDetectSiteDir()`）
   - 從以下候選位置尋找 `site/` 目錄：
     - `process.cwd()/site`
     - `process.cwd()/../site`
     - `app.getAppPath()/../site`
     - `app.getPath('exe')/../site`
   - 對每個候選位置，呼叫 `ensureSiteLooksValid()` 驗證
   - 如果找到有效路徑，設定為 `__siteDir` 並儲存到設定檔
5. 如果找不到，拋出錯誤（**不允許手動選擇**，必須保持 `admin/` 和 `site/` 為兄弟目錄）

**重要**：
- 一旦鎖定，整個會話期間不會改變
- 不提供 UI 讓使用者手動選擇 `site/` 目錄（安全考量：避免編輯錯誤的專案）

### 5. Atomic Write

**實作**：`atomicWriteWithBackup()`

流程：
1. 建立備份（如果檔案存在）
   - **注意**：此函數假設目標檔案已存在（用於更新現有檔案）
   - 如果檔案不存在，`fsp.copyFile` 會失敗
   - 目前所有使用此函數的地方都是更新現有的 JSON 檔案（`calendar-data.json`, `seasonal-data.json`, `products-data.json`），這些檔案在 `ensureSiteLooksValid()` 中已驗證存在
2. 寫入到 `{target}.tmp-{pid}-{timestamp}`
3. 重新命名為目標檔名

**優點**：避免部分寫入導致的資料損壞。

**使用場景**：
- 此函數僅用於更新現有的 JSON 資料檔案
- 新檔案（如圖片上傳）直接使用 `fsp.writeFile` 寫入，不使用此函數（因為新檔案不需要備份）

**未來改進**：如果需要在檔案不存在時也能使用，應先檢查檔案是否存在再決定是否建立備份。

### 6. 自動備份

**位置**：`{Electron userData}/backups/`

**檔名格式**：`{filename}.{timestamp}.bak`

**重要**：備份儲存在 repo 外，不會被 commit。

### 7. Schema 驗證

#### 日曆資料

**實作**：`validateCalendarData(data)`

檢查：
- `events` 是陣列
- 每個事件有 `date`（格式：`YYYY-MM-DD`）
- 每個事件有 `status`（`'available' | 'unavailable' | 'closed'`）
- 每個事件有 `description`（字串，可為空）

**注意**：`validateCalendarData` 函數本身不檢查重複日期。重複日期的防止是通過 `calendar:upsertEvent` IPC handler 的邏輯實現的：在更新或新增事件時，會先查找相同日期的現有事件（`findIndex`），如果存在則替換，不存在則新增。這確保了每個日期只有一個事件記錄。

#### 圖片資料

**實作**：`validateImageData(data)`

檢查：
- `items` 是陣列
- 每個項目有 `name`（字串）
- 每個項目有 `image`（字串，路徑）
- 每個項目有 `price`（字串，可選）
- 每個項目有 `description`（字串，可選）
- 每個項目有 `tags`（陣列）
- `tags` 中的值必須是允許的選項

**注意**：寫入時會自動設定 `schema_version: 1`，但讀取時目前不驗證 `schema_version`（因為目前只有一個版本）。未來如果需要支援多個版本，應在讀取時檢查並處理版本相容性。

---

## 實作細節

### 跨 iframe 存取機制

**架構設計**：預覽 iframe 採用雙層結構（外層載入 `calendar.html`，內層載入 `calendar-widget.html`）。為了在編輯模式下捕獲日曆點擊，需要存取內層 iframe 的 DOM。

**實作方式**：
- 必須等待 iframe 完全載入（監聽 `load` 事件）
- 使用重試機制（`startHookWatcher`）處理載入時機問題
- 所有跨 iframe 存取都使用 `try-catch` 包裹，避免 CORS 或存取失敗導致程式崩潰

**實作範例**：
```javascript
const outer = $('previewFrame');
const innerIframe = outer.contentDocument.querySelector('iframe.calendar-iframe');
const doc = innerIframe.contentDocument;
```

### 日期格式化

**架構設計**：日期使用 `YYYY-MM-DD` 字串格式儲存，避免時區轉換問題。

**實作方式**：使用手動格式化，避免 `Date.toISOString()` 的時區轉換：

```javascript
function formatDateKey(year, month, day) {
  const y = String(year);
  const m = String(month + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
```

**位置**：`site/assets/js/calendar-shared.js`（網站端）和 `ui/app.js`（管理工具端）

### 檔名與 JSON 一致性

**架構設計**：圖片檔名（不含副檔名）必須與 JSON 中的 `name` 欄位一致，確保資料一致性。

**實作方式**：
- 上傳時，使用者輸入的名稱經過 `sanitizeFilename()` 清理後，再通過 `getImageFilename()` 加上 `.jpg` 副檔名作為實際檔名
- 編輯名稱時，如果名稱改變，自動重新命名檔案（`images:update` handler）
- 驗證時檢查一致性（`validateImageDataConsistency`）：檢查實際檔名是否與 `getImageFilename(item.name)` 的結果一致

**檔名清理規則**：特殊字元（`/ \ : * ? " < > |`）會被替換為 `-`，多個空格合併為單一空格，最後加上 `.jpg` 副檔名。

### 圖片壓縮策略

**架構設計**：上傳的圖片自動壓縮，目標檔案大小 < 500KB。

**實作方式**：
- 第一次壓縮：quality 85%，最大邊長 2000px
- 如果 > 500KB，重新壓縮：quality 75%
- 注意：某些複雜圖片可能仍 > 500KB，這是可接受的

**位置**：`src/main.js` 的 `compressImage()` 函數

### Git 操作錯誤處理

**架構設計**：發布流程包含 Git 操作，需要區分不同類型的錯誤並提供友善提示。

**實作方式**：
- 檢查錯誤訊息中的關鍵字（`auth`, `authentication`, `permission`, `denied`, `publickey`）
- 如果是認證錯誤，提供友善的提示訊息（`authHint`）
- 其他錯誤顯示完整的錯誤訊息和 exit code

**位置**：`src/main.js` 的 `publish:run` IPC handler

### 狀態同步機制

**架構設計**：UI 狀態（如 `state.imageData`）必須與實際檔案保持同步。

**實作方式**：
- 每次寫入後，重新讀取資料（`refreshCalendarData()`, `loadImageData()`）
- 重新載入預覽 iframe（`reloadPreview()`）確保預覽顯示最新內容

**位置**：`ui/app.js` 中的各個寫入操作後

### Hook 生命週期管理

**架構設計**：日曆點擊 hook 僅在特定條件下啟用，切換模式或分頁時必須正確清理。

**實作方式**：
- `switchMode()` 和 `switchTab()` 中檢查並清除 `hookTimer`
- 僅在 `currentTab === 'calendar'` 且 `currentMode === 'edit'` 時啟動 watcher
- 預覽模式或非日曆分頁時，自動停止 watcher

**位置**：`ui/app.js` 的 `switchMode()` 和 `switchTab()` 函數

### 使用者輸入處理

**架構設計**：Electron renderer 不支援 `window.prompt()` 等阻塞式 API。

**實作方式**：使用自訂 modal（如 `promptImageName()`）處理使用者輸入，透過 Promise 回傳結果。

**位置**：`ui/app.js` 的 `promptImageName()` 函數

### 焦點管理與對話框（重要：避免焦點問題）

**⚠️ 關鍵問題**：在 Electron 中，**絕對不要使用 `window.confirm()` 或 `window.alert()`**。這些同步阻塞式對話框會導致嚴重的焦點管理問題。

**問題症狀**：
- 使用 `confirm()` 後，輸入框無法獲得焦點（點擊沒有反應，無法輸入）
- 切換到其他視窗再切回來後，輸入框又能正常使用
- 這是因為 `confirm()` 會破壞 Electron 渲染進程的焦點管理

**解決方案**：
- **必須使用 Electron 的 `dialog.showMessageBox` API**（在主進程執行）
- 透過 IPC 呼叫：在 `main.js` 中實作 `ipcMain.handle('dialog:confirm')`
- 在 `preload.js` 中暴露 `confirmDialog` API
- 在 `ui/app.js` 中使用 `LovelyAdmin.confirmDialog()` 替代 `confirm()`

**實作範例**：

```javascript
// main.js
ipcMain.handle('dialog:confirm', async (event, payload) => {
  const { message, detail } = payload || {};
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showMessageBox(win, {
    type: 'question',
    buttons: ['取消', '確定'],
    defaultId: 1,
    cancelId: 0,
    message: message || '確認',
    detail: detail || '',
  });
  return { ok: result.response === 1 };
});

// preload.js
confirmDialog: (payload) => ipcRenderer.invoke('dialog:confirm', payload),

// app.js
const result = await LovelyAdmin.confirmDialog({
  message: '確定要清除日曆事件嗎？',
  detail: `日期：${state.selectedDate}`,
});
if (!result || !result.ok) return;
```

**重要規則**：
- ❌ **禁止**：`confirm()`, `alert()`, `prompt()` 等瀏覽器原生對話框
- ✅ **必須**：使用 Electron `dialog` API（透過 IPC 呼叫）
- ✅ **允許**：自訂的 UI modal（非阻塞式）

**位置**：
- IPC Handler：`src/main.js` 的 `dialog:confirm` handler
- API 暴露：`src/preload.js` 的 `confirmDialog` 方法
- 使用範例：`ui/app.js` 的 `clearBtn` 事件處理器

**歷史記錄**：
- 此問題在 2025 年 12 月被發現並修復
- 問題根源：刪除日曆事件時使用 `confirm()`，導致後續在圖片分頁選取圖片時輸入框無法獲得焦點
- 修復方式：將所有 `confirm()` 呼叫改為使用 Electron dialog API

---

## 擴展指南

### 新增管理功能

1. **定義資料結構**：
   - 決定 JSON 檔案位置（必須在 allowlist 中）
   - 定義 schema（包含 `schema_version`）

2. **實作 IPC handlers**（`main.js`）：
   - 讀取：`ipcMain.handle('feature:read')`
   - 寫入：`ipcMain.handle('feature:write')`
   - 驗證：`ipcMain.handle('feature:validate')`
   - 遵循安全規則（allowlist、atomic write、備份、schema 驗證）

3. **暴露 API**（`preload.js`）：
   - 在 `contextBridge.exposeInMainWorld('LovelyAdmin')` 中新增方法

4. **實作 UI**（`ui/app.js`）：
   - 新增狀態管理
   - 新增事件處理
   - 新增渲染函數

5. **更新文件**：
   - 更新本文檔的相關章節
   - 如果新增 allowlist 項目，更新[安全架構](#安全架構)章節

### 新增分頁

1. **更新 HTML**（`ui/index.html`）：
   - 新增 tab 按鈕
   - 新增對應的 panel

2. **更新狀態**（`ui/app.js`）：
   - 新增 `currentTab` 選項
   - 更新 `switchTab()` 函數

3. **更新預覽**：
   - 在 `reloadPreviewForCurrentTab()` 中新增對應的 HTML 檔案

### 修改安全規則

**重要**：任何修改安全規則的變更都必須：
1. 更新本文檔的[安全架構](#安全架構)章節
2. 更新 `WRITE_ALLOWLIST`（如果涉及路徑）
3. 確保所有相關的 IPC handlers 都遵循新規則
4. 在本文檔的[安全機制實作細節](#安全機制實作細節)章節記錄變更

---

## 快速參考

### 修改程式碼時的檢查清單

1. **閱讀相關章節**：了解你要修改的部分的架構
2. **遵循安全規則**：所有寫入操作必須通過安全檢查（見[安全架構](#安全架構)章節）
3. **保持一致性**：檔名、JSON、UI 狀態必須同步
4. **錯誤處理**：跨 iframe 存取、Git 操作等可能失敗，需要適當的錯誤處理
5. **更新文件**：如果新增功能或修改架構，更新本文檔

### 關鍵檔案位置

- **IPC Handlers**：`src/main.js`（搜尋 `ipcMain.handle`）
- **API 暴露**：`src/preload.js`（`contextBridge.exposeInMainWorld`）
- **UI 邏輯**：`ui/app.js`（狀態管理、事件處理）
- **UI 結構**：`ui/index.html`（HTML 結構）
- **安全規則**：本文檔的[安全架構](#安全架構)章節（必須遵守）

### 常見修改場景

- **新增 IPC API**：在 `main.js` 新增 handler → 在 `preload.js` 暴露 → 在 `app.js` 使用
- **新增分頁**：更新 `index.html` → 更新 `app.js` 的 `switchTab()` → 更新 `reloadPreviewForCurrentTab()`
- **新增資料類型**：定義 schema → 更新 `WRITE_ALLOWLIST` → 實作 IPC handlers → 更新 UI

---

## 程式碼優化建議

### admin/src/main.js 模組化（可選重構）

**目前狀態：**
`admin/src/main.js` 檔案目前約有 1063 行，包含了多種不同的功能：
- 檔案系統操作
- 日曆資料管理 IPC handlers
- 圖片管理 IPC handlers
- 預檢（preflight）檢查
- Git 操作
- IPC 處理器註冊

**未來可考慮的重構方向：**
如果需要提高可維護性，可以考慮將 `main.js` 拆分成多個模組：

- `admin/src/file-operations.js` - 檔案系統操作（`joinUnderSite`, `normalizePath`, `atomicWriteWithBackup` 等）
- `admin/src/calendar-handler.js` - 日曆相關 IPC 處理器
- `admin/src/image-handler.js` - 圖片相關 IPC 處理器
- `admin/src/preflight.js` - 預檢檢查邏輯
- `admin/src/git-operations.js` - Git 操作

**注意：**
這是一個較大的重構，目前程式碼運作良好，**只有在真正需要時才進行**。如果要進行此重構，必須：
1. 充分測試所有 IPC 功能
2. 確保安全規則在所有模組中都得到遵守
3. 更新本文檔的相關章節

