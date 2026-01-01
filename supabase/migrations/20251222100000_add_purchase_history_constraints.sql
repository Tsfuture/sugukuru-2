-- 決済履歴の整合性強化マイグレーション
-- 目的: stripe_payment_intent_id にダミー値が入らないよう制約を追加
-- 注意: 全ての制約はDOブロックで「既存チェック」して安全化

-- 1. stripe_payment_intent_id が pi_ で始まることを保証する制約を追加
-- 注意: 既存のNULL値は許容（Webhook経由の非同期保存を考慮）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'purchase_history_stripe_pi_format_check'
  ) THEN
    ALTER TABLE public.purchase_history
    ADD CONSTRAINT purchase_history_stripe_pi_format_check
    CHECK (stripe_payment_intent_id IS NULL OR stripe_payment_intent_id LIKE 'pi_%');
  END IF;
END $$;

-- 2. total_amount が正の整数であることを保証
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'purchase_history_total_amount_positive_check'
  ) THEN
    ALTER TABLE public.purchase_history
    ADD CONSTRAINT purchase_history_total_amount_positive_check
    CHECK (total_amount > 0);
  END IF;
END $$;

-- 3. unit_price が正の整数であることを保証
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'purchase_history_unit_price_positive_check'
  ) THEN
    ALTER TABLE public.purchase_history
    ADD CONSTRAINT purchase_history_unit_price_positive_check
    CHECK (unit_price > 0);
  END IF;
END $$;

-- 4. quantity が1〜6の範囲であることを保証
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'purchase_history_quantity_range_check'
  ) THEN
    ALTER TABLE public.purchase_history
    ADD CONSTRAINT purchase_history_quantity_range_check
    CHECK (quantity >= 1 AND quantity <= 6);
  END IF;
END $$;

-- 5. total_amount = unit_price * quantity であることを保証
-- 注意: dynamic_feeは既にunit_priceに含まれている前提
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'purchase_history_amount_consistency_check'
  ) THEN
    ALTER TABLE public.purchase_history
    ADD CONSTRAINT purchase_history_amount_consistency_check
    CHECK (total_amount = unit_price * quantity);
  END IF;
END $$;

-- 6. インデックス追加（stripe_payment_intent_idで検索する場合のパフォーマンス向上）
CREATE INDEX IF NOT EXISTS idx_purchase_history_stripe_pi 
ON public.purchase_history(stripe_payment_intent_id) 
WHERE stripe_payment_intent_id IS NOT NULL;

-- 7. ダミー値（pi_test_*, pi_dummy_* など）が入っている既存レコードを確認するビュー
-- 本番で不要なら削除可能
CREATE OR REPLACE VIEW public.purchase_history_invalid_pi AS
SELECT id, user_id, stripe_payment_intent_id, total_amount, created_at
FROM public.purchase_history
WHERE stripe_payment_intent_id IS NOT NULL
  AND stripe_payment_intent_id NOT LIKE 'pi_%';

COMMENT ON VIEW public.purchase_history_invalid_pi IS 
'不正な stripe_payment_intent_id を持つレコードを表示するビュー。マイグレーション後は0件になるはず。';
