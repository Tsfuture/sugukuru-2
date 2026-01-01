# カード登録（CardSetup）デバッグガイド

## 概要

カード登録フローは以下の2つの Edge Function を使用します：

1. **stripe-setup-intent** - SetupIntent を作成し `clientSecret` を返す
2. **setup-card** - フロントで confirm 後、PaymentMethod を Customer に紐づけ、プロフィール更新

## 必要な Secrets

```bash
# Supabase プロジェクトに Secret を設定
supabase secrets set STRIPE_SECRET_KEY=sk_test_xxx --project-ref ghetymkklbfvczlvnxfu
```

> ⚠️ `SUPABASE_URL` と `SUPABASE_SERVICE_ROLE_KEY` は Supabase が自動で提供します。

## デプロイ手順

```bash
# setup-card をデプロイ（JWTなしで許可しない）
supabase functions deploy setup-card --project-ref ghetymkklbfvczlvnxfu

# stripe-setup-intent をデプロイ
supabase functions deploy stripe-setup-intent --project-ref ghetymkklbfvczlvnxfu --no-verify-jwt
```

## ログ確認

> ⚠️ **注意**: Supabase CLI v2.x では `supabase functions logs` コマンドは利用できません。
> Supabase Dashboard のログエクスプローラを使用してください。

### Supabase Dashboard でログを確認

**Edge Functions ログ URL:**
https://supabase.com/dashboard/project/ghetymkklbfvczlvnxfu/logs/edge-functions

**フィルタ条件例:**
- `function_name = 'process-payment'`
- `function_name = 'setup-card'`
- `function_name = 'stripe-setup-intent'`

**purchase_history 関連の検索キーワード:**
- `purchase_history insert payload` → insert内容確認
- `purchase_history saved` → 保存成功
- `purchase_history insert error` → エラー詳細
- `purchase_history duplicate` → 重複(冪等)

### purchase_history 監視スクリプト

DBから直接購入履歴を確認:
```bash
# 直近の購入履歴を取得
bash scripts/watch-purchase-history.sh

# watch モードで5秒ごとに更新
watch -n 5 'bash scripts/watch-purchase-history.sh'
```

## よくあるエラー

### 1. `setup_intent_unexpected_state`

**原因**: 同じ SetupIntent を複数回 confirm しようとしている

**対処**: 
- フロントでは毎回新しい SetupIntent を作成するように修正済み
- 既に succeeded の場合は setup-card の呼び出しだけ再試行

### 2. `カード情報の保存に失敗しました`

**原因**: setup-card Edge Function が見つからない、またはエラー

**確認手順**:
1. Supabase Dashboard → Edge Functions で `setup-card` が存在するか確認
2. ログを確認して具体的なエラーコードを特定

### 3. `AUTH_MISSING` / `AUTH_INVALID`

**原因**: Authorization ヘッダーがない、または無効

**確認**:
- `supabase.functions.invoke()` は自動で Authorization を付与するはず
- ブラウザの Network タブでリクエストヘッダーを確認

### 4. `STRIPE_CONFIG_ERROR`

**原因**: `STRIPE_SECRET_KEY` が設定されていない

**対処**:
```bash
supabase secrets list --project-ref ghetymkklbfvczlvnxfu
# STRIPE_SECRET_KEY がなければ設定
```

## ローカル開発

```bash
# Edge Functions をローカルで起動
supabase functions serve --no-verify-jwt

# 別ターミナルで特定の function をテスト
curl -X POST http://localhost:54321/functions/v1/stripe-setup-intent \
  -H "Authorization: Bearer <YOUR_ACCESS_TOKEN>" \
  -H "Content-Type: application/json"
```

## AdBlock 注意

- AdBlock が `r.stripe.com` をブロックすると Stripe Elements が正常に動作しません
- テスト時は AdBlock を無効化するか、`r.stripe.com` を許可リストに追加してください

## フロー図

```
[CardSetup.tsx]
     │
     ▼ (1) supabase.functions.invoke("stripe-setup-intent")
[stripe-setup-intent]
     │
     ▼ clientSecret を返す
[CardSetup.tsx]
     │
     ▼ (2) stripe.confirmCardSetup(clientSecret, { payment_method: {...} })
[Stripe.js]
     │
     ▼ succeeded + paymentMethodId
[CardSetup.tsx]
     │
     ▼ (3) supabase.functions.invoke("setup-card", { body: { paymentMethodId } })
[setup-card]
     │
     ├── Stripe Customer 作成/取得
     ├── PaymentMethod を attach
     ├── default payment method に設定
     └── profiles テーブル更新 (has_payment_method = true)
     │
     ▼ { success: true }
[CardSetup.tsx]
     │
     ▼ navigate("/temp-ticket")
```