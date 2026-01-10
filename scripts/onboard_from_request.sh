#!/bin/bash
# ====================================================================
# onboard_from_request.sh
# onboarding_requests の1行から facilities を正式作成するヘルパースクリプト
# ====================================================================
set -euo pipefail

# 使用方法を表示
usage() {
  echo "Usage: $0 <request-id> [--publish] [--send-email] [--dry-run]"
  echo ""
  echo "Arguments:"
  echo "  <request-id>   onboarding_requests.id (UUID)"
  echo ""
  echo "Options:"
  echo "  --publish      is_published=true で施設を公開 (デフォルト: false)"
  echo "  --send-email   Gmail下書きを作成 (デフォルト: false)"
  echo "  --dry-run      DB変更を行わずログ出力のみ"
  echo ""
  echo "Environment Variables (必須):"
  echo "  APP_BASE_URL   購入URLのベースURL (例: https://sugukuru-2.pages.dev)"
  echo ""
  echo "Example:"
  echo "  APP_BASE_URL=https://sugukuru-2.pages.dev $0 18c59bc7-3249-4248-874c-6c1dbbb7953d --publish"
  exit 1
}

# 引数チェック
if [ $# -lt 1 ]; then
  usage
fi

REQUEST_ID="$1"
shift

# UUIDフォーマット簡易チェック
if ! [[ "$REQUEST_ID" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]]; then
  echo "❌ エラー: request-id は有効なUUID形式である必要があります"
  echo "   入力値: $REQUEST_ID"
  exit 1
fi

# APP_BASE_URL 必須チェック
if [ -z "${APP_BASE_URL:-}" ]; then
  echo "❌ エラー: 環境変数 APP_BASE_URL が設定されていません"
  echo ""
  echo "例:"
  echo "  export APP_BASE_URL=https://sugukuru-2.pages.dev"
  echo "  $0 $REQUEST_ID $*"
  echo ""
  echo "または:"
  echo "  APP_BASE_URL=https://sugukuru-2.pages.dev $0 $REQUEST_ID $*"
  exit 1
fi

# オプションをパース
PUBLISH="false"
SEND_EMAIL="false"
DRY_RUN=""

for arg in "$@"; do
  case $arg in
    --publish)
      PUBLISH="true"
      ;;
    --send-email)
      SEND_EMAIL="true"
      ;;
    --dry-run)
      DRY_RUN="--dry-run"
      ;;
    *)
      echo "⚠️ 警告: 不明なオプション '$arg' は無視されます"
      ;;
  esac
done

# 実行内容を表示
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 施設オンボード実行"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Request ID: $REQUEST_ID"
echo "APP_BASE_URL: $APP_BASE_URL"
echo "Publish: $PUBLISH"
echo "Send Email: $SEND_EMAIL"
[ -n "$DRY_RUN" ] && echo "Mode: DRY RUN (DB変更なし)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# npm run onboard:facility を実行
npm run onboard:facility -- \
  --request-id "$REQUEST_ID" \
  --publish "$PUBLISH" \
  --send-email "$SEND_EMAIL" \
  $DRY_RUN

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ 完了"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📋 確認用クエリ:"
echo ""
echo "-- 施設確認"
echo "SELECT id, name, is_published, buy_url, category FROM facilities WHERE name ILIKE '%<施設名>%';"
echo ""
echo "-- 営業時間確認"
echo "SELECT * FROM facility_open_intervals WHERE facility_id = '<facilityId>';"
echo ""
echo "-- 写真確認"
echo "SELECT * FROM facility_photos WHERE facility_id = '<facilityId>' ORDER BY sort_order;"
echo ""
echo "-- 申請ステータス確認"
echo "SELECT id, status, updated_at FROM onboarding_requests WHERE id = '$REQUEST_ID';"
