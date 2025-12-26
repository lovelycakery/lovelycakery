#!/bin/bash

# Lovely Cakery - GitHub Pages 部署腳本
# 使用方法: ./deploy.sh

set -e  # 遇到錯誤時停止執行

# 顏色輸出
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 開始部署到 GitHub Pages...${NC}\n"

# 檢查是否已經初始化 git
if [ ! -d ".git" ]; then
    echo -e "${YELLOW}📦 初始化 Git 儲存庫...${NC}"
    git init
    git branch -M main
fi

# 自動壓縮本次變更的商品/季節/首頁圖片（只處理 git 變更，避免每次全量重跑）
if [ -f "./scripts/optimize_images.py" ]; then
    echo -e "${BLUE}🖼️  自動壓縮本次變更的圖片（products/seasonal/hero）...${NC}"
    python3 ./scripts/optimize_images.py --only-changed || true
    echo
fi

# 自動更新日曆相關資源的快取版本號（只在有相關變更時才會更新）
if [ -f "./bump-calendar-cache.sh" ]; then
    echo -e "${BLUE}🧹 自動更新日曆快取版本號（?v=...）...${NC}"
    bash ./bump-calendar-cache.sh
    echo
fi

# 部署前檢查（避免缺檔、錯誤載入順序、誤提交私密設定等）
if [ -f "./check.sh" ]; then
    echo -e "${BLUE}🔎 執行部署前檢查（check.sh）...${NC}"
    bash ./check.sh
    echo
else
    echo -e "${YELLOW}⚠️  找不到 check.sh，將跳過檢查（不建議）${NC}\n"
fi

# 設定遠端倉庫（如果還沒設定）
REMOTE_URL="git@github.com:lovelycakery/lovelycakery.git"
CURRENT_REMOTE=$(git remote get-url origin 2>/dev/null || echo "")

if [ "$CURRENT_REMOTE" != "$REMOTE_URL" ]; then
    if [ -n "$CURRENT_REMOTE" ]; then
        echo -e "${YELLOW}🔄 更新遠端倉庫地址...${NC}"
        git remote set-url origin "$REMOTE_URL"
    else
        echo -e "${YELLOW}🔗 設定遠端倉庫...${NC}"
        git remote add origin "$REMOTE_URL"
    fi
fi

# 添加所有檔案
echo -e "${BLUE}📝 添加檔案到 Git...${NC}"
git add .

# 檢查是否有變更
if git diff --staged --quiet; then
    echo -e "${YELLOW}⚠️  沒有變更需要提交${NC}"
else
    # 提交變更
    echo -e "${BLUE}💾 提交變更...${NC}"
    COMMIT_MSG="${1:-Update website}"
    git commit -m "$COMMIT_MSG" || echo -e "${YELLOW}⚠️  沒有新變更需要提交${NC}"
fi

# 推送到 GitHub
echo -e "${BLUE}📤 推送到 GitHub...${NC}"
git push -u origin main || git push

echo -e "\n${GREEN}✅ 部署完成！${NC}\n"
echo -e "${GREEN}🌐 你的網站應該會在幾分鐘後在以下網址上線：${NC}"
echo -e "${BLUE}   https://lovelycakery.github.io/lovelycakery/${NC}\n"
echo -e "${YELLOW}💡 提示：如果這是第一次部署，請記得在 GitHub 儲存庫設定中啟用 Pages：${NC}"
echo -e "${BLUE}   Settings → Pages → Source: main branch → Save${NC}\n"

