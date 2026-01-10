#!/bin/bash
# =============================================================================
# tally-intake Edge Function テストスクリプト
# =============================================================================
# 使用方法:
#   1. 環境変数を設定:
#      export ONBOARDING_WEBHOOK_SECRET="your-secret-here"
#   2. スクリプトを実行:
#      bash scripts/test_tally_intake.sh
# =============================================================================

set -e

SUPABASE_URL="https://ghetymkklbfvczlvnxfu.supabase.co"
FUNCTION_ENDPOINT="${SUPABASE_URL}/functions/v1/tally-intake"

if [ -z "$ONBOARDING_WEBHOOK_SECRET" ]; then
  echo "Error: ONBOARDING_WEBHOOK_SECRET is not set."
  echo "Usage: export ONBOARDING_WEBHOOK_SECRET='your-secret' && bash $0"
  exit 1
fi

echo "=========================================="
echo "テスト1: 簡易ペイロード"
echo "=========================================="
curl -i -X POST "$FUNCTION_ENDPOINT" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ONBOARDING_WEBHOOK_SECRET" \
  -d '{
    "eventType": "FORM_RESPONSE",
    "eventId": "test-simple-001",
    "createdAt": "2026-01-10T10:00:00.000Z",
    "data": {
      "responseId": "resp-001",
      "formId": "form-001",
      "formName": "店舗オンボーディングフォーム",
      "fields": [
        {
          "key": "facility_name",
          "label": "店舗名（Webサイト・購入ページに表示されます）",
          "type": "INPUT_TEXT",
          "value": "テスト店舗 Simple"
        },
        {
          "key": "contact_email",
          "label": "導入に関する連絡先メールアドレス",
          "type": "INPUT_EMAIL",
          "value": "test-simple@example.com"
        }
      ]
    }
  }'

echo ""
echo ""
echo "=========================================="
echo "テスト2: 本番に近いダミーペイロード"
echo "=========================================="
curl -i -X POST "$FUNCTION_ENDPOINT" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ONBOARDING_WEBHOOK_SECRET" \
  -d '{
    "eventType": "FORM_RESPONSE",
    "eventId": "test-full-001",
    "createdAt": "2026-01-10T10:00:00.000Z",
    "data": {
      "responseId": "resp-full-001",
      "formId": "form-001",
      "formName": "店舗オンボーディングフォーム",
      "fields": [
        {
          "key": "facility_name",
          "label": "店舗名（Webサイト・購入ページに表示されます）",
          "type": "INPUT_TEXT",
          "value": "テスト居酒屋 本番風"
        },
        {
          "key": "contact_email",
          "label": "導入に関する連絡先メールアドレス",
          "type": "INPUT_EMAIL",
          "value": "izakaya-test@example.com"
        },
        {
          "key": "min_price",
          "label": "最低価格 (min)",
          "type": "INPUT_NUMBER",
          "value": 3000
        },
        {
          "key": "max_price",
          "label": "最高価格 (max)",
          "type": "INPUT_NUMBER",
          "value": 8000
        },
        {
          "key": "open_hours",
          "label": "営業時間（休憩時間を含む詳細）",
          "type": "TEXTAREA",
          "value": "Mon 11:00-14:00, 17:00-23:00 / Tue 11:00-14:00, 17:00-23:00 / Wed closed / Thu 11:00-14:00, 17:00-23:00 / Fri 11:00-14:00, 17:00-24:00 / Sat 11:00-24:00 / Sun 11:00-22:00"
        },
        {
          "key": "category",
          "label": "カテゴリを選択してください",
          "type": "DROPDOWN",
          "value": "opt-restaurant",
          "options": [
            { "id": "opt-restaurant", "text": "レストラン" },
            { "id": "opt-beauty", "text": "美容" },
            { "id": "opt-clinic", "text": "クリニック" },
            { "id": "opt-other", "text": "その他" }
          ]
        },
        {
          "key": "photos",
          "label": "店舗写真をアップロードしてください",
          "type": "FILE_UPLOAD",
          "value": [
            {
              "url": "https://picsum.photos/seed/test1/400/300",
              "name": "storefront.jpg",
              "mimeType": "image/jpeg"
            },
            {
              "url": "https://picsum.photos/seed/test2/400/300",
              "name": "interior.png",
              "mimeType": "image/png"
            }
          ]
        }
      ]
    }
  }'

echo ""
echo ""
echo "=========================================="
echo "テスト完了"
echo "=========================================="
echo "Supabase Dashboard の Table Editor で onboarding_requests を確認してください。"
echo "https://supabase.com/dashboard/project/ghetymkklbfvczlvnxfu/editor"
