#!/bin/bash
# AI 语音日报 - 定时任务脚本
# 每天 8:30 执行

set -e

cd /root/.openclaw/workspace/ai-daily

echo "========================================"
echo "AI 语音日报 - $(date '+%Y-%m-%d %H:%M:%S')"
echo "========================================"

# 1. 抓取数据并生成日报
echo "[1/3] 生成日报..."
node scripts/generate_daily.js

# 2. 推送到 GitHub
echo ""
echo "[2/3] 推送到 GitHub..."
git add -A
git commit -m "Update: $(date '+%Y-%m-%d')" || echo "No changes to commit"
git push origin master

# 3. 推送到飞书
echo ""
echo "[3/3] 推送到飞书..."
node scripts/send_feishu.js

echo ""
echo "========================================"
echo "完成！"
echo "========================================"