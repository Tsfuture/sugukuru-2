#!/bin/bash
# Edge Functions ログ取得スクリプト
# Supabase Dashboard で直接確認するための代替手段

PROJECT_REF="ghetymkklbfvczlvnxfu"
FUNCTION_NAME="${1:-process-payment}"

echo "==================================="
echo " Edge Functions ログ監視ガイド"
echo "==================================="
echo ""
echo "■ Supabase Dashboard でログを確認:"
echo "  https://supabase.com/dashboard/project/${PROJECT_REF}/logs/edge-functions"
echo ""
echo "■ フィルタ条件:"
echo "  function_name = '${FUNCTION_NAME}'"
echo ""
echo "■ 検索キーワード (purchase_history関連):"
echo "  - 'purchase_history insert payload'  → insert内容確認"
echo "  - 'purchase_history saved'           → 保存成功"
echo "  - 'purchase_history insert error'    → エラー詳細"
echo "  - 'purchase_history duplicate'       → 重複(冪等)"
echo ""
echo "■ CLI代替 (watch方式でポーリング):"
echo "  watch -n 5 'curl -s ... | jq .'"
echo ""
echo "==================================="
echo ""

# ダッシュボードを開く
echo "Dashboardを開きますか? [y/N]"
read -r answer
if [[ "$answer" =~ ^[Yy]$ ]]; then
  "$BROWSER" "https://supabase.com/dashboard/project/${PROJECT_REF}/logs/edge-functions"
fi
