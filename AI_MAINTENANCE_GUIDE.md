# AI 維護手冊（給「新的對話」快速上手用）

> 這個專案是 **純靜態網站**（HTML/CSS/JS），沒有 build system、沒有框架。  
> 新的對話無法讀取舊對話，所以本文件把「架構意圖、檔案職責、常見修改流程、踩雷點」一次寫清楚。

## 架構總覽（你要先知道的 5 件事）

1. **主站頁面**：`index.html`, `calendar.html`, `seasonal.html`, `all-items.html`, `order.html`, `contact.html`
2. **共用語言切換**：`assets/js/i18n.js`（唯一語言模組）
3. **主站啟動腳本**：`assets/js/script.js`（只做：啟動 i18n）
4. **日曆採 iframe 隔離**：`calendar.html` 內嵌 `calendar-widget-readonly.html`
5. **日曆資料來源**：`assets/data/calendar-data.json`（訪客端讀）、管理端可寫入（可選 GitHub API 或下載 JSON）

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

### JS（核心）
- `assets/js/i18n.js`
  - **唯一語言模組**
  - 機制：
    - 讀寫 `localStorage.language`（值：`zh` / `en`）
    - `applyLanguage()`：把所有 `[data-en][data-zh]` 的文字替換
    - `initLanguageSwitcher()`：綁 `.lang-btn` 點擊事件
    - 切換時會 **postMessage** 給所有 iframe：`{type:'lovely-language', lang}`
- `assets/js/script.js`
  - 主站入口，只呼叫：`LovelyI18n.initLanguageSwitcher()`
- `assets/js/calendar-embed.js`
  - `calendar.html` 專用：負責 iframe 高度 + 縮放計算
  - 監聽 iframe `postMessage({type:'calendar-resize', height})`
- `assets/js/calendar-widget.js`
  - 可編輯日曆（管理端）
  - 讀寫 localStorage：
    - `calendarEvents`：事件資料備份
    - `calendarEventsUnsynced`：是否未同步到 GitHub
  - GitHub API 更新：**可選**
    - 若存在 `GITHUB_CONFIG` + `checkGitHubConfig()` 且 valid → 走 GitHub API
    - 否則 → 下載 `calendar-data.json`（手動上傳）
- `assets/js/calendar-widget-readonly.js`
  - 只讀日曆（訪客端）
  - 只讀：不提供編輯，只提供 hover tooltip（有 description 才顯示）
  - render 後會 `postMessage({type:'calendar-resize', height})` 讓父頁調整 iframe 高度

---

## 「本機私密設定」規範（非常重要）

- GitHub API Token **不要**提交到 repo
- 本機建立：`assets/js/github-config.local.js`（被 `.gitignore` 忽略）
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

> `calendar-widget.html` / `calendar-manager-local.html` 會嘗試載入 `github-config.local.js`；沒找到就自動走下載模式。

---

## 常見維護任務（照做最不容易出 bug）

### A) 新增一個「主站分頁」
1. 複製任一頁（例如 `seasonal.html`）
2. **保留**底部兩行 script 引用（順序不能錯）：
   - `assets/js/i18n.js`
   - `assets/js/script.js`
3. 文案要支援雙語：用 `data-en` / `data-zh`

### B) 修改導覽列（header/nav）
目前導覽列是 **6 份 HTML 重複**（純靜態常見）。  
修改時要同步改：
- `index.html`
- `calendar.html`
- `seasonal.html`
- `all-items.html`
- `order.html`
- `contact.html`

（想降低重複：可引入簡單模板或靜態產生器，但目前專案刻意保持零 build。）

### C) 修改日曆 UI / 規則
- 只讀端：改 `calendar-widget-readonly.html/.js` + `assets/css/calendar-widget.css`
- 管理端：改 `calendar-widget.html` / `calendar-manager-local.html` / `assets/js/calendar-widget.js`
- **不要**把主站 `styles.css` 拿去改日曆格子的樣式（日曆在 iframe 內）

### D) 語言切換相關需求
只改 `assets/js/i18n.js`（不要在各頁重複寫切換程式）

---

## 容易踩雷的點（請新的對話特別注意）

- **script 載入順序**
  - 主站頁：必須先 `i18n.js` 再 `script.js`
  - 日曆嵌入頁 `calendar.html`：再加上 `calendar-embed.js`
- **不要重新加回 setInterval 輪詢語言**
  - 目前語言同步用 postMessage（事件驅動），更不容易出 bug
- **GitHub Token**
  - 只能放 `github-config.local.js`（不要放回 repo、不要改成固定檔名）
- **iframe 高度/縮放**
  - 只改 `assets/js/calendar-embed.js`
  - widget 內高度回報在 `calendar-widget-readonly.js` 的 postMessage

---

## 快速檢查（改完必做）

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
rg "setInterval\\(" assets/js
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


