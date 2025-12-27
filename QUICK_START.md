# 🚀 GitHub API 自動更新 - 快速開始

## ✅ 部署前小提醒（效能 / 圖片）

新增或替換「全部品項 / 季節限定 / 首頁」圖片後，建議先跑：

```bash
python3 scripts/optimize_images.py
```

部署前 `./deploy.sh` 會自動跑 `./check.sh`，而 `check.sh` 會驗證圖片是否已符合大小/尺寸門檻（不符合會擋下部署）。

## 3 步驟快速設定

### 步驟 1：建立 GitHub Token（約 2 分鐘）

**方法 A：直接連結（推薦）**
1. 前往：https://github.com/settings/tokens
2. 如果看到兩個選項，選擇 **Tokens (classic)**
3. 點擊 **Generate new token** → **Generate new token (classic)**
4. 輸入名稱：`Lovely Cakery Calendar`
5. 勾選權限：✅ **repo**（完整儲存庫存取）
6. 點擊 **Generate token**
7. **立即複製 Token**（只會顯示一次！）

**方法 B：從設定頁面導航**
1. 登入 GitHub
2. 點擊右上角頭像 → **Settings**
3. 左側選單滾動到底部 → **Developer settings**
4. 點擊 **Personal access tokens** → **Tokens (classic)**
5. 點擊 **Generate new token** → **Generate new token (classic)**
6. 輸入名稱和權限（同上）
7. **立即複製 Token**

### 步驟 2：填入配置（約 1 分鐘）

建立/開啟 `assets/js/github-config.local.js`（只放本機，不提交），修改：

```javascript
const GITHUB_CONFIG = {
    token: 'ghp_你的Token貼在這裡',  // ← 貼上步驟 1 的 Token
    owner: 'lovelycakery',           // ← 你的 GitHub 使用者名稱
    repo: 'lovelycakery',            // ← 儲存庫名稱
    filePath: 'assets/data/calendar-data.json',
    enabled: true                     // ← 改為 true 啟用
};
```

### 步驟 3：測試（約 30 秒）

1. 開啟 `calendar-manager-local.html`
2. 編輯任何日期的事件
3. 點擊「儲存」
4. 應該看到：✅「日曆資料已成功更新到 GitHub！」

## ⚠️ 重要安全提醒

- **不要**將包含 Token 的 `github-config.local.js` 提交到 GitHub
- 如果已經提交，立即撤銷 Token 並建立新的

## 📖 詳細說明

查看 `GITHUB_API_SETUP.md` 獲取完整設定指南和故障排除。

> 註：管理工具頁面是 `calendar-manager-local.html`（會內嵌 `calendar-widget.html`）。

