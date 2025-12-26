# GitHub API 自動更新設定指南

本指南將教你如何設定 GitHub API 自動更新功能，讓日曆資料可以自動同步到 GitHub，無需手動下載和上傳檔案。

## 📋 前置需求

- GitHub 帳號
- 對儲存庫的寫入權限

## 🔑 步驟 1：建立 GitHub Personal Access Token

### 1.1 前往 GitHub 設定頁面

1. 登入 GitHub（如果還沒登入）
2. 點擊右上角你的頭像
3. 選擇 **Settings**（設定）

### 1.2 找到 Developer settings

在 Settings 頁面的左側選單中：
1. 滾動到底部
2. 找到 **Developer settings**（開發者設定）
3. 點擊進入

### 1.3 建立 Personal Access Token

1. 在 Developer settings 頁面中，找到 **Personal access tokens**（個人存取權杖）
2. 點擊 **Tokens (classic)**（傳統權杖）
   - ⚠️ 注意：要選擇 **Tokens (classic)**，不是 Fine-grained tokens
3. 如果這是第一次建立，會看到說明頁面
4. 點擊 **Generate new token**（產生新權杖）
5. 選擇 **Generate new token (classic)**（產生傳統權杖）

### 替代路徑（直接連結）

如果找不到，可以直接前往：
- **Tokens (classic)**：https://github.com/settings/tokens
- 或：https://github.com/settings/tokens?type=beta（如果看到新版本）

### 1.3 設定 Token 權限

在建立 Token 的頁面中：

- **Note**（備註）：輸入 `Lovely Cakery Calendar API`（或任何你喜歡的名稱）
- **Expiration**（過期時間）：選擇適當的期限（建議選擇較長的時間，如 90 天或 1 年）
- **Select scopes**（選擇權限）：**必須勾選以下權限**：
  - ✅ `repo` - 完整儲存庫存取權限
    - 這會自動勾選所有子權限，包括 `repo:status`, `repo_deployment`, `public_repo`, `repo:invite`, `security_events`

### 1.4 產生並複製 Token

1. 滾動到頁面底部
2. 點擊 **Generate token**（產生權杖）
3. **⚠️ 重要：立即複製 Token！** 你只會看到這一次，之後就看不到了
4. 將 Token 安全地儲存在某處（建議使用密碼管理器）

## ⚙️ 步驟 2：設定配置檔案

### 2.1 編輯配置檔案

建立/開啟 `assets/js/github-config.local.js`（只放本機，不提交），填入以下資訊：

```javascript
const GITHUB_CONFIG = {
    token: 'ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', // 貼上你剛才複製的 Token
    owner: 'lovelycakery',      // 你的 GitHub 使用者名稱或組織名稱
    repo: 'lovelycakery',       // 儲存庫名稱
    filePath: 'assets/data/calendar-data.json',  // 要更新的檔案路徑
    enabled: true  // 設為 true 啟用自動更新
};
```

### 2.2 確認資訊正確

- **token**：貼上步驟 1.4 複製的 Token
- **owner**：你的 GitHub 使用者名稱（例如：`lovelycakery`）
- **repo**：儲存庫名稱（例如：`lovelycakery`）
- **filePath**：通常不需要修改，除非你的檔案路徑不同
- **enabled**：設為 `true` 啟用功能

## 🔒 步驟 3：保護 Token 安全

### 3.1 不要提交 Token 到 GitHub

⚠️ **重要安全提醒**：

- **絕對不要**將包含 Token 的 `github-config.local.js` 提交到 GitHub
- Token 一旦洩露，任何人都可以修改你的儲存庫

### 3.2 檢查 .gitignore

確認 `.gitignore` 檔案中有以下內容（或類似）：

```
# GitHub 配置檔案（包含敏感資訊）
# assets/js/github-config.local.js
```

### 3.3 如果已經提交了 Token

如果意外提交了包含 Token 的檔案：

1. **立即撤銷 Token**：
   - 前往 GitHub → Settings → Developer settings → Personal access tokens
   - 找到對應的 Token
   - 點擊 **Revoke**（撤銷）

2. **建立新的 Token**：重複步驟 1

3. **從 Git 歷史中移除**（進階）：
   ```bash
   git filter-branch --force --index-filter \
     "git rm --cached --ignore-unmatch assets/js/github-config.local.js" \
     --prune-empty --tag-name-filter cat -- --all
   ```

## ✅ 步驟 4：測試功能

### 4.1 測試自動更新

1. 開啟 `calendar-admin.html`（管理員版日曆）
2. 點擊任何日期進行編輯
3. 修改內容後點擊「儲存」
4. 如果設定正確，應該會看到：
   - ✅ 成功訊息：「日曆資料已成功更新到 GitHub！」
   - 不會下載檔案

### 4.2 檢查更新

1. 前往 GitHub 儲存庫
2. 查看 `assets/data/calendar-data.json` 檔案
3. 應該可以看到最新的更新時間和內容

### 4.3 驗證訪客端

1. 開啟 `calendar.html`（訪客版）
2. 重新整理頁面
3. 應該可以看到剛才更新的內容

## 🐛 常見問題

### Q1: 出現「無法取得檔案資訊」錯誤

**可能原因**：
- Token 權限不足
- 檔案路徑錯誤
- 儲存庫名稱或使用者名稱錯誤

**解決方法**：
- 確認 Token 有 `repo` 權限
- 檢查 `owner` 和 `repo` 是否正確
- 確認 `filePath` 路徑正確

### Q2: 出現「更新失敗」錯誤

**可能原因**：
- Token 已過期或被撤銷
- 沒有寫入權限
- 網路連線問題

**解決方法**：
- 檢查 Token 是否仍然有效
- 確認對儲存庫有寫入權限
- 檢查網路連線

### Q3: 仍然下載檔案而不是自動更新

**可能原因**：
- `enabled` 設為 `false`
- Token 未填入
- 配置檢查失敗

**解決方法**：
- 確認 `enabled: true`
- 確認 Token 已正確填入
- 開啟瀏覽器開發者工具（F12）查看 Console 錯誤訊息

### Q4: Token 洩露了怎麼辦？

**立即處理**：
1. 前往 GitHub → Settings → Developer settings → Personal access tokens
2. 找到洩露的 Token
3. 點擊 **Revoke**（撤銷）
4. 建立新的 Token
5. 更新 `github-config.local.js` 中的 Token

## 📝 注意事項

1. **Token 安全**：
   - 不要分享 Token 給任何人
   - 不要將 Token 提交到公開儲存庫
   - 定期更換 Token

2. **權限最小化**：
   - 只給予必要的權限（`repo`）
   - 如果只需要更新特定檔案，考慮使用更細緻的權限

3. **備份**：
   - 即使有自動更新功能，建議定期備份 `calendar-data.json`
   - 可以透過 GitHub 的版本歷史查看所有變更

4. **測試環境**：
   - 建議先在測試分支測試功能
   - 確認無誤後再在主要分支使用

## 🚀 進階設定

### 使用環境變數（更安全）

如果要在正式環境使用，建議將 Token 放在環境變數中，而不是直接寫在程式碼裡。這需要後端支援。

### 限制 Token 權限

如果可能，可以建立只針對特定儲存庫的 Token，而不是全域 Token。

## 📞 需要幫助？

如果遇到問題：
1. 檢查瀏覽器 Console（F12）的錯誤訊息
2. 確認所有設定步驟都已完成
3. 查看 GitHub API 文件：https://docs.github.com/en/rest

---

**最後更新**：2025-12-25

