-- 冪等性のためのマイグレーション
-- 目的: order_key 列を追加し、stripe_payment_intent_id に unique 制約を追加

-- 1. order_key 列を追加（冪等キー用）
ALTER TABLE public.purchase_history
ADD COLUMN IF NOT EXISTS order_key TEXT;

-- 2. order_key にユニーク制約を追加（NULLは許容）
-- 既存レコードは order_key = NULL なので衝突しない
CREATE UNIQUE INDEX IF NOT EXISTS idx_purchase_history_order_key_unique
ON public.purchase_history(order_key)
WHERE order_key IS NOT NULL;

-- 3. stripe_payment_intent_id にユニーク制約を追加（NULLは許容）
-- 既に同じ stripe_payment_intent_id が存在する場合はエラーになる
-- 先にデータ確認: SELECT stripe_payment_intent_id, COUNT(*) FROM purchase_history GROUP BY stripe_payment_intent_id HAVING COUNT(*) > 1;
CREATE UNIQUE INDEX IF NOT EXISTS idx_purchase_history_stripe_pi_unique
ON public.purchase_history(stripe_payment_intent_id)
WHERE stripe_payment_intent_id IS NOT NULL;

-- 4. コメント追加
COMMENT ON COLUMN public.purchase_history.order_key IS 
'フロントエンドで生成される冪等キー。同じorder_keyでの再送は重複挿入を防ぐ。';

COMMENT ON INDEX idx_purchase_history_order_key_unique IS 
'order_key の一意性を保証。同一購入フローの再送を防ぐ。';

COMMENT ON INDEX idx_purchase_history_stripe_pi_unique IS 
'stripe_payment_intent_id の一意性を保証。同一PaymentIntentの重複登録を防ぐ。';
