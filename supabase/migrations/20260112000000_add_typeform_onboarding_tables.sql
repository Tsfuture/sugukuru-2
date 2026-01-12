-- =========================================================================
-- Typeform オンボーディング用テーブル・カラム追加
-- =========================================================================
-- 🔴 手動実行: このSQLをSupabase SQL Editorで実行してください

-- =========================================================================
-- A) facility_onboarding_submissions テーブル作成
-- Typeformからの申込データを一時保存し、オンボード処理の進捗を管理
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.facility_onboarding_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Typeform識別子
  form_id TEXT NOT NULL,
  response_id TEXT NOT NULL UNIQUE, -- 二重登録防止
  submitted_at TIMESTAMPTZ NOT NULL,
  
  -- 施設基本情報
  facility_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  
  -- 価格設定
  price_min_yen INTEGER,
  price_max_yen INTEGER,
  
  -- カテゴリ・住所
  category TEXT, -- 'restaurant', 'beauty', 'clinic', 'other'
  address TEXT,
  
  -- 営業時間（通し販売OK時間帯）
  -- hours_mode: 'common' (全曜日共通) or 'weekly' (曜日別)
  hours_mode TEXT CHECK (hours_mode IN ('common', 'weekly')),
  -- hours_common: 共通時間帯（hours_mode='common'の場合）
  -- 形式: { "start": "HH:MM", "end": "HH:MM" }
  hours_common JSONB,
  -- hours_weekly: 曜日別時間帯（hours_mode='weekly'の場合）
  -- 形式: { "mon": {"start": "HH:MM", "end": "HH:MM"}, "tue": {...}, ..., "holiday": {...} }
  hours_weekly JSONB,
  
  -- 写真URL（最大5つ）
  photo_urls JSONB DEFAULT '[]'::jsonb,
  
  -- Typeform生payload（デバッグ用）
  raw_payload JSONB NOT NULL,
  
  -- 処理ステータス
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'rejected')),
  
  -- 処理後の参照
  processed_facility_id UUID,
  processed_at TIMESTAMPTZ,
  rejected_reason TEXT,
  
  -- タイムスタンプ
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_facility_onboarding_status 
  ON public.facility_onboarding_submissions(status);
CREATE INDEX IF NOT EXISTS idx_facility_onboarding_created 
  ON public.facility_onboarding_submissions(created_at DESC);

-- RLS（必要に応じて有効化）
ALTER TABLE public.facility_onboarding_submissions ENABLE ROW LEVEL SECURITY;

-- サービスロール用ポリシー（Edge Functionからのアクセス許可）
CREATE POLICY "Service role can manage onboarding submissions"
  ON public.facility_onboarding_submissions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =========================================================================
-- B) stores テーブルに追加カラム
-- 価格レンジ、カテゴリ、住所、営業時間、写真URLを保存
-- =========================================================================
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS price_min_yen INTEGER;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS price_max_yen INTEGER;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS hours_mode TEXT CHECK (hours_mode IS NULL OR hours_mode IN ('common', 'weekly'));
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS hours_common JSONB;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS hours_weekly JSONB;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS photo_urls JSONB DEFAULT '[]'::jsonb;

-- コメント追加
COMMENT ON TABLE public.facility_onboarding_submissions IS 'Typeformからの施設オンボーディング申込データ';
COMMENT ON COLUMN public.facility_onboarding_submissions.hours_mode IS '営業時間モード: common=全曜日共通, weekly=曜日別';
COMMENT ON COLUMN public.facility_onboarding_submissions.hours_common IS '共通営業時間 {"start": "HH:MM", "end": "HH:MM"}';
COMMENT ON COLUMN public.facility_onboarding_submissions.hours_weekly IS '曜日別営業時間 {"mon": {...}, "tue": {...}, ...}';
COMMENT ON COLUMN public.facility_onboarding_submissions.photo_urls IS '写真URL配列（最大5つ）';

COMMENT ON COLUMN public.stores.price_min_yen IS '最低価格（円）';
COMMENT ON COLUMN public.stores.price_max_yen IS '最高価格（円）';
COMMENT ON COLUMN public.stores.category IS 'カテゴリ: restaurant, beauty, clinic, other';
COMMENT ON COLUMN public.stores.address IS '住所';
COMMENT ON COLUMN public.stores.hours_mode IS '営業時間モード: common=全曜日共通, weekly=曜日別';
COMMENT ON COLUMN public.stores.hours_common IS '共通営業時間';
COMMENT ON COLUMN public.stores.hours_weekly IS '曜日別営業時間';
COMMENT ON COLUMN public.stores.photo_urls IS '写真URL配列';

-- =========================================================================
-- C) facilities テーブルにも同様のカラム追加（存在する場合）
-- =========================================================================
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'facilities') THEN
    ALTER TABLE public.facilities ADD COLUMN IF NOT EXISTS price_min_yen INTEGER;
    ALTER TABLE public.facilities ADD COLUMN IF NOT EXISTS price_max_yen INTEGER;
    ALTER TABLE public.facilities ADD COLUMN IF NOT EXISTS category TEXT;
    ALTER TABLE public.facilities ADD COLUMN IF NOT EXISTS address TEXT;
    ALTER TABLE public.facilities ADD COLUMN IF NOT EXISTS hours_mode TEXT;
    ALTER TABLE public.facilities ADD COLUMN IF NOT EXISTS hours_common JSONB;
    ALTER TABLE public.facilities ADD COLUMN IF NOT EXISTS hours_weekly JSONB;
    ALTER TABLE public.facilities ADD COLUMN IF NOT EXISTS photo_urls JSONB DEFAULT '[]'::jsonb;
  END IF;
END $$;
