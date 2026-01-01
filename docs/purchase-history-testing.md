# purchase_history 冪等性テスト手順

## 概要

`process-payment` Edge Function は冪等性を持ち、同じ `order_key` で複数回リクエストしても購入履歴が二重に作成されません。

## 冪等性の仕組み

1. **フロントエンド**: `TempTicket.tsx` でコンポーネントマウント時に `orderKey = crypto.randomUUID()` を生成
2. **Stripe**: `idempotencyKey: orderKey` で PaymentIntent 作成の冪等化
3. **DB保存前検索**: `order_key` または `stripe_payment_intent_id` で既存レコードを検索
4. **重複時**: 既存レコードの ID を返して成功扱い
5. **Unique制約**: `idx_purchase_history_order_key_unique` で DB レベルでも保護

## Dashboard ログで見るキーワード

Edge Functions → Logs で以下を検索:

| キーワード | 意味 |
|-----------|------|
| `Processing payment for user` | リクエスト受信開始 |
| `Price calculation` | 価格計算完了 |
| `Creating PaymentIntent with idempotencyKey` | Stripe リクエスト開始 |
| `PaymentIntent created` | Stripe 成功 |
| `purchase_history insert payload` | DB INSERT 直前 |
| `purchase_history saved` | DB 保存成功 |
| `purchase_history already exists (idempotent)` | 既存レコードあり（成功扱い） |
| `purchase_history duplicate key (idempotent)` | 同時リクエストで重複検出（成功扱い） |
| `purchase_history insert error` | DB 保存失敗（エラー詳細あり） |

## DB 確認 SQL

### 最新5件の購入履歴を確認

```sql
SELECT 
  id,
  user_id,
  facility_name,
  quantity,
  total_amount,
  order_key,
  stripe_payment_intent_id,
  status,
  created_at
FROM public.purchase_history
ORDER BY created_at DESC
LIMIT 5;
```

### order_key の一意性を確認

```sql
SELECT order_key, COUNT(*) as cnt
FROM public.purchase_history
WHERE order_key IS NOT NULL
GROUP BY order_key
HAVING COUNT(*) > 1;
-- 結果が0件であれば正常（重複なし）
```

### stripe_payment_intent_id の一意性を確認

```sql
SELECT stripe_payment_intent_id, COUNT(*) as cnt
FROM public.purchase_history
WHERE stripe_payment_intent_id IS NOT NULL
GROUP BY stripe_payment_intent_id
HAVING COUNT(*) > 1;
-- 結果が0件であれば正常（重複なし）
```

## 冪等性テスト手順

### 準備

1. Supabase Dashboard の Edge Functions Logs を開く
2. SQL Editor で上記の「最新5件」クエリを準備

### テスト実行

1. **通常購入テスト**
   - ブラウザで仮チケットページを開く
   - 購入ボタンを押す
   - Dashboard ログで `purchase_history saved` を確認
   - DB で新しいレコードを確認

2. **冪等性テスト（ブラウザ再送）**
   - Chrome DevTools → Network タブを開く
   - 購入を実行
   - 成功レスポンス後、Network タブで `process-payment` リクエストを右クリック → "Replay XHR"
   - Dashboard ログで `purchase_history already exists (idempotent)` または `duplicate key (idempotent)` を確認
   - **重要**: DB で行数が増えていないことを確認

3. **ページリロードテスト**
   - 購入成功後にブラウザの戻るボタン
   - 再度購入ボタンを押す
   - 新しい `orderKey` が生成されるため、**新規購入として処理される**（これは正常動作）
   - ※ 同一フロー中のリトライのみ冪等。ページ遷移後は新規購入扱い

### 期待結果

| シナリオ | order_key | 結果 |
|---------|-----------|------|
| 初回購入 | UUID-A | 新規レコード作成 |
| DevTools Replay | UUID-A (同じ) | 既存レコード返却、行増えない |
| ページ戻って再購入 | UUID-B (新規) | 新規レコード作成 |

## トラブルシューティング

### `PGRST204` schema cache error

原因: PostgREST のスキーマキャッシュが古い
対処: Supabase Dashboard → Database → Restart でリスタート

### `MISSING_ORDER_KEY` エラー

原因: フロントエンドが `orderKey` を送っていない
対処: `TempTicket.tsx` の `orderKey` 生成と送信を確認

### 行が増える（冪等性が効いていない）

確認: 
1. 同じ `orderKey` が送信されているか（ログ確認）
2. `idx_purchase_history_order_key_unique` インデックスが存在するか

```sql
SELECT indexname FROM pg_indexes 
WHERE tablename = 'purchase_history' 
AND indexname LIKE '%order_key%';
```
