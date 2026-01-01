# Lovely Admin (Local-only)

This folder contains the collaborator-facing **local admin tool**.

Goals:
- Preview should match the visitor website (loads `site/` pages directly).
- Admin tool can safely edit the website content by writing allowlisted files under `site/`.
- “One-button publish”: local preflight checks → commit+push → CI deploy gate.

Non-negotiable rules are documented in `ADMIN_SAFETY_GUIDE.md`.

## Run (dev mode)

### 前置需求

1. **安裝 Node.js**（如果還沒安裝）
   - 下載：https://nodejs.org/
   - 建議安裝 LTS 版本
   - 安裝後，重新開啟命令提示字元

2. **確認 Node.js 已安裝**
   - 開啟「命令提示字元」（CMD）或「PowerShell」
   - 執行：`node --version` 和 `npm --version`
   - 應該會顯示版本號碼

### 執行步驟

**在命令提示字元（CMD）或 PowerShell 中執行：**

```cmd
cd admin
npm install
npm start
```

> **注意**：請使用「命令提示字元」（CMD）或 PowerShell），不要直接在檔案總管中雙擊檔案。

### Windows 用戶注意事項

如果在 Windows 上遇到 `sharp` 模組錯誤，請參考 `WINDOWS_FIX.md` 進行修復。

**快速修復步驟：**

1. 開啟「命令提示字元」（以系統管理員身分執行，如果需要的話）
2. 切換到專案目錄：
   ```cmd
   cd C:\path\to\lovely\Cursor\admin
   ```
   （請將路徑改為您的實際專案路徑）

3. 執行修復指令：
   ```cmd
   npm install --os=win32 --cpu=x64 sharp
   npm start
   ```

**如果還是不行，請嘗試完整重新安裝：**

```cmd
cd admin
rmdir /s /q node_modules
del package-lock.json
npm install
npm start
```

> **提示**：在 Windows CMD 中，`rm -rf` 指令無效，請使用 `rmdir /s /q` 來刪除資料夾。

## How it works

### Calendar tab
- Preview loads `site/calendar.html` in an iframe.
- In admin context, clicking a day selects a `YYYY-MM-DD` date (the widget exposes `data-date`).
- Save writes `site/assets/data/calendar-data.json` with strict validation + atomic write + backup (outside repo).
- It also bumps the calendar cache version (`?v=...`) so visitors see updates after deploy.

### Image management (Seasonal/Products tabs)
- Preview loads `site/seasonal.html` or `site/all-items.html` in an iframe.
- **Drag & Drop**: Drag images in the preview to reorder them (changes are saved immediately).
- **Click to Edit**: Click an image to open the edit modal (name, price, description, tags).
- **Important**: The drag and click events are carefully separated to avoid conflicts:
  - If you drag an image, click events are suppressed for 200ms after drag ends.
  - This prevents accidental edit modal opening after reordering.
- Changes are saved to `site/assets/data/seasonal-data.json` or `site/assets/data/products-data.json`.

## Publish button

“一鍵發布” will:

- Run local preflight checks (collaborator-friendly errors)
- If OK: `git add site/` → commit → push `main`
- CI (GitHub Actions) is the second gate and deploys Pages only if checks pass

If push fails due to auth, the tool will show a “please login/configure git” hint.


