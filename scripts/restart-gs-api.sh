#!/bin/bash
set -e

echo "🔄 Restarting GS API..."

# 1. 既存プロセスの停止
echo "⏹️  Stopping existing GS API processes..."
pkill -f "tsx watch src/index.ts" || true
sleep 2

# 2. プロセスが完全に停止したか確認
if pgrep -f "tsx watch src/index.ts" > /dev/null; then
    echo "❌ GS API process still running. Force killing..."
    pkill -9 -f "tsx watch src/index.ts" || true
    sleep 1
fi

# 3. 作業ディレクトリに移動
cd /volume2/Project/MCD3/TUMON/mc-gate/apps/gs-api

# 4. GS API を起動
echo "▶️  Starting GS API..."
nohup npm run dev > /tmp/gs-api.log 2>&1 &
NEW_PID=$!
echo "   Started with PID: $NEW_PID"

# 5. 起動確認
echo "⏳ Waiting for GS API to start..."
sleep 3

# 6. ポート確認
if ss -lntp | grep -q 7070; then
    echo "✅ GS API is listening on port 7070"
else
    echo "❌ GS API is NOT listening on port 7070"
    echo "   Check logs: tail -50 /tmp/gs-api.log"
    exit 1
fi

# 7. ヘルスチェック
echo "🏥 Health check..."
HEALTH_RESPONSE=$(curl -sS http://127.0.0.1:7070/health 2>&1)
if echo "$HEALTH_RESPONSE" | grep -q "ok"; then
    echo "✅ Health check passed"
    echo "   Response: $HEALTH_RESPONSE"
else
    echo "❌ Health check failed"
    echo "   Response: $HEALTH_RESPONSE"
    echo "   Check logs: tail -50 /tmp/gs-api.log"
    exit 1
fi

# 8. 環境変数の検証（機密情報を除外）
echo "🔍 Validating environment (redacted)..."
NEW_ACTUAL_PID=$(pgrep -f "tsx watch src/index.ts" | head -1)
if [ -n "$NEW_ACTUAL_PID" ]; then
    echo "   Process PID: $NEW_ACTUAL_PID"
    tr '\0' '\n' < /proc/$NEW_ACTUAL_PID/environ \
        | egrep -v '(KEY|TOKEN|SECRET|PASSWORD|AUTH|OPENAI|ANTHROPIC|API_)' \
        | grep -E "^(NODE_ENV|PORT|PWD)=" || true
else
    echo "❌ Could not find GS API process"
    exit 1
fi

echo ""
echo "✅ GS API restart completed successfully"
echo "📋 View logs: tail -f /tmp/gs-api.log"
