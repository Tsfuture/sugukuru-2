#!/bin/bash
# purchase_history 監視スクリプト
# Supabase Management API経由で直近の購入履歴を取得

ACCESS_TOKEN=$(cat ~/.supabase/access-token 2>/dev/null)
PROJECT_REF="ghetymkklbfvczlvnxfu"
LIMIT="${1:-10}"

if [ -z "$ACCESS_TOKEN" ]; then
  echo "Error: Supabase access token not found. Run 'supabase login' first."
  exit 1
fi

echo "==================================="
echo " purchase_history 監視 (直近${LIMIT}件)"
echo "==================================="
echo ""

curl -s "https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query" \
  -X POST \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"query\": \"SELECT id, created_at, user_id, facility_name, quantity, unit_price, dynamic_fee, total_amount, stripe_payment_intent_id, status FROM purchase_history ORDER BY created_at DESC LIMIT ${LIMIT}\"}" 2>&1 \
  | jq -r 'if type == "array" and length > 0 then .[] | "[\(.created_at)] \(.facility_name) x\(.quantity) = ¥\(.total_amount) (status: \(.status))" else "データなし" end' 2>/dev/null || echo "クエリ失敗"

echo ""
echo "-----------------------------------"
echo "watch モード: watch -n 5 '$0 $LIMIT'"
