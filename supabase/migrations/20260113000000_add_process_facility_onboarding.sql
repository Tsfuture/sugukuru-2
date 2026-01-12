-- =========================================================================
-- 施設オンボーディング自動処理用の追加マイグレーション
-- =========================================================================
-- 🔴 手動実行: このSQLをSupabase SQL Editorで実行してください

-- =========================================================================
-- A) facility_onboarding_submissions に追加カラム・制約
-- =========================================================================

-- source カラム追加（どのフォームサービスから来たか）
ALTER TABLE public.facility_onboarding_submissions 
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'typeform';

-- error_message カラム追加（処理失敗時のエラーメッセージ）
ALTER TABLE public.facility_onboarding_submissions 
  ADD COLUMN IF NOT EXISTS error_message TEXT;

-- status の CHECK 制約を更新して 'failed' を追加
-- 既存の制約を削除してから新しい制約を追加
ALTER TABLE public.facility_onboarding_submissions 
  DROP CONSTRAINT IF EXISTS facility_onboarding_submissions_status_check;

ALTER TABLE public.facility_onboarding_submissions 
  ADD CONSTRAINT facility_onboarding_submissions_status_check 
  CHECK (status IN ('pending', 'processed', 'rejected', 'failed'));

-- =========================================================================
-- B) (source, response_id) に UNIQUE INDEX を追加
-- 同じソースから同じ response_id が来た場合の重複を防止
-- =========================================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_facility_onboarding_source_response_id 
  ON public.facility_onboarding_submissions(source, response_id);

-- =========================================================================
-- C) process_one_facility_onboarding_submission(uuid) DB関数
-- 指定された submission を処理し、stores テーブルに施設を登録
-- =========================================================================
CREATE OR REPLACE FUNCTION public.process_one_facility_onboarding_submission(p_submission_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_submission RECORD;
  v_facility_id UUID;
  v_existing_store RECORD;
BEGIN
  -- 1) submission を取得
  SELECT * INTO v_submission
  FROM public.facility_onboarding_submissions
  WHERE id = p_submission_id;
  
  IF v_submission IS NULL THEN
    RAISE EXCEPTION 'Submission not found: %', p_submission_id;
  END IF;
  
  -- 2) 既に処理済みの場合はスキップ
  IF v_submission.status = 'processed' THEN
    RETURN v_submission.processed_facility_id;
  END IF;
  
  -- 3) 同じメールアドレスの既存ストアがあるか確認
  SELECT id INTO v_existing_store
  FROM public.stores
  WHERE email = v_submission.contact_email
  LIMIT 1;
  
  IF v_existing_store.id IS NOT NULL THEN
    -- 既存ストアを更新
    v_facility_id := v_existing_store.id;
    
    UPDATE public.stores
    SET
      name = v_submission.facility_name,
      price_min_yen = v_submission.price_min_yen,
      price_max_yen = v_submission.price_max_yen,
      category = v_submission.category,
      address = v_submission.address,
      hours_mode = v_submission.hours_mode,
      hours_common = v_submission.hours_common,
      hours_weekly = v_submission.hours_weekly,
      photo_urls = v_submission.photo_urls,
      updated_at = NOW()
    WHERE id = v_facility_id;
    
  ELSE
    -- 新規ストアを作成
    INSERT INTO public.stores (
      name,
      email,
      price_min_yen,
      price_max_yen,
      category,
      address,
      hours_mode,
      hours_common,
      hours_weekly,
      photo_urls,
      created_at,
      updated_at
    ) VALUES (
      v_submission.facility_name,
      v_submission.contact_email,
      v_submission.price_min_yen,
      v_submission.price_max_yen,
      v_submission.category,
      v_submission.address,
      v_submission.hours_mode,
      v_submission.hours_common,
      v_submission.hours_weekly,
      v_submission.photo_urls,
      NOW(),
      NOW()
    )
    RETURNING id INTO v_facility_id;
  END IF;
  
  -- 4) submission を processed に更新
  UPDATE public.facility_onboarding_submissions
  SET
    status = 'processed',
    processed_facility_id = v_facility_id,
    processed_at = NOW(),
    error_message = NULL,
    updated_at = NOW()
  WHERE id = p_submission_id;
  
  RETURN v_facility_id;
  
EXCEPTION WHEN OTHERS THEN
  -- 処理失敗時は status を failed に更新
  UPDATE public.facility_onboarding_submissions
  SET
    status = 'failed',
    error_message = SQLERRM,
    updated_at = NOW()
  WHERE id = p_submission_id;
  
  RAISE;
END;
$$;

COMMENT ON FUNCTION public.process_one_facility_onboarding_submission(UUID) IS 
  '単一の施設オンボーディング申込を処理し、stores テーブルに登録する';
