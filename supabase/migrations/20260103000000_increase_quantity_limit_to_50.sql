-- 購入枚数上限を6枚から50枚に変更するマイグレーション
-- 変更理由: ビジネス要件として1グループ最大50名までの購入を許可する

-- 1. 既存の quantity range check 制約を削除
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'purchase_history_quantity_range_check'
  ) THEN
    ALTER TABLE public.purchase_history
    DROP CONSTRAINT purchase_history_quantity_range_check;
  END IF;
END $$;

-- 2. 新しい制約を追加（1〜50枚の範囲）
-- MAX_GROUP_SIZE = 50 に対応
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'purchase_history_quantity_range_check'
  ) THEN
    ALTER TABLE public.purchase_history
    ADD CONSTRAINT purchase_history_quantity_range_check
    CHECK (quantity >= 1 AND quantity <= 50);
  END IF;
END $$;

-- 3. 確認用コメント
COMMENT ON CONSTRAINT purchase_history_quantity_range_check ON public.purchase_history IS 
  '購入枚数の範囲制約: 1〜50枚（MAX_GROUP_SIZE = 50）。2026-01-03に6枚から50枚に変更。';
