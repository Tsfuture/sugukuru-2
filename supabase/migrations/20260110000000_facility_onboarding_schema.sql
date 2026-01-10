-- ============================================================================
-- 店舗オンボード全自動化スキーマ
-- - facilities テーブル拡張
-- - facility_photos（店舗写真）
-- - facility_open_intervals（営業時間枠、休憩対応）
-- - onboarding_requests（Tallyフォーム申請受け皿）
-- - RPC関数: is_facility_open_at / get_facility_status
-- ============================================================================

-- ============================================================================
-- A) facilities テーブルに列追加
-- ============================================================================
ALTER TABLE public.facilities ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.facilities ADD COLUMN IF NOT EXISTS min_price_yen INTEGER NULL;
ALTER TABLE public.facilities ADD COLUMN IF NOT EXISTS max_price_yen INTEGER NULL;
ALTER TABLE public.facilities ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Asia/Tokyo';
ALTER TABLE public.facilities ADD COLUMN IF NOT EXISTS category TEXT NULL;

COMMENT ON COLUMN public.facilities.is_published IS 'true=トップページに表示';
COMMENT ON COLUMN public.facilities.min_price_yen IS '最低価格（円）';
COMMENT ON COLUMN public.facilities.max_price_yen IS '最高価格（円）';
COMMENT ON COLUMN public.facilities.timezone IS 'タイムゾーン（IANA形式）';
COMMENT ON COLUMN public.facilities.category IS 'カテゴリ（restaurant/beauty/clinic/other）';

-- ============================================================================
-- B) facility_photos（店舗写真）
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.facility_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  alt TEXT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_facility_photos_facility_id ON public.facility_photos(facility_id);
CREATE INDEX IF NOT EXISTS idx_facility_photos_sort_order ON public.facility_photos(facility_id, sort_order);

COMMENT ON TABLE public.facility_photos IS '店舗写真';
COMMENT ON COLUMN public.facility_photos.sort_order IS '表示順（0が代表写真）';

-- ============================================================================
-- C) facility_open_intervals（営業時間枠、休憩あり対応）
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.facility_open_intervals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Tokyo',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_end_after_start CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_facility_open_intervals_facility_dow 
  ON public.facility_open_intervals(facility_id, day_of_week);

COMMENT ON TABLE public.facility_open_intervals IS '営業時間枠（曜日×複数枠で休憩対応）';
COMMENT ON COLUMN public.facility_open_intervals.day_of_week IS '曜日（0=日,1=月,...,6=土）';
COMMENT ON COLUMN public.facility_open_intervals.start_time IS '開始時刻（HH:MM:SS）';
COMMENT ON COLUMN public.facility_open_intervals.end_time IS '終了時刻（HH:MM:SS）';

-- ============================================================================
-- D) onboarding_requests（Tallyフォーム申請受け皿）
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.onboarding_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  min_price_yen INTEGER NULL,
  max_price_yen INTEGER NULL,
  open_intervals JSONB NULL,
  photo_urls JSONB NULL,
  category TEXT NULL,
  categories JSONB NULL,
  address TEXT NULL,
  notes TEXT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'archived')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_requests_status ON public.onboarding_requests(status);
CREATE INDEX IF NOT EXISTS idx_onboarding_requests_created_at ON public.onboarding_requests(created_at DESC);

COMMENT ON TABLE public.onboarding_requests IS 'Tallyフォームからのオンボード申請';
COMMENT ON COLUMN public.onboarding_requests.open_intervals IS '営業時間 [{"dow":1,"start":"09:00","end":"16:00"},...]';
COMMENT ON COLUMN public.onboarding_requests.photo_urls IS '写真URL配列 ["https://.../img1.jpg",...]';
COMMENT ON COLUMN public.onboarding_requests.status IS 'ステータス（pending/approved/rejected/archived）';

-- 更新日時自動更新トリガー
CREATE OR REPLACE FUNCTION update_onboarding_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_onboarding_requests_updated_at ON public.onboarding_requests;
CREATE TRIGGER trg_onboarding_requests_updated_at
  BEFORE UPDATE ON public.onboarding_requests
  FOR EACH ROW EXECUTE FUNCTION update_onboarding_requests_updated_at();

-- ============================================================================
-- E) RPC関数: is_facility_open_at
-- 指定時刻に施設が営業中かどうかを判定
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_facility_open_at(
  p_facility_id UUID,
  p_at TIMESTAMPTZ DEFAULT NOW()
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tz TEXT;
  v_local_time TIME;
  v_dow SMALLINT;
  v_is_open BOOLEAN := FALSE;
BEGIN
  -- 施設のタイムゾーンを取得（デフォルト: Asia/Tokyo）
  SELECT COALESCE(timezone, 'Asia/Tokyo')
  INTO v_tz
  FROM public.facilities
  WHERE id = p_facility_id;

  IF v_tz IS NULL THEN
    -- 施設が存在しない場合は FALSE
    RETURN FALSE;
  END IF;

  -- 指定時刻をローカルタイムに変換
  v_local_time := (p_at AT TIME ZONE v_tz)::TIME;
  v_dow := EXTRACT(DOW FROM (p_at AT TIME ZONE v_tz))::SMALLINT;

  -- 営業時間枠をチェック
  SELECT EXISTS(
    SELECT 1
    FROM public.facility_open_intervals
    WHERE facility_id = p_facility_id
      AND day_of_week = v_dow
      AND v_local_time >= start_time
      AND v_local_time < end_time
  ) INTO v_is_open;

  RETURN v_is_open;
END;
$$;

COMMENT ON FUNCTION public.is_facility_open_at IS '施設が指定時刻に営業中かどうかを判定';

-- ============================================================================
-- E) RPC関数: get_facility_status
-- 施設のステータスを返す（営業時間外なら SOLD_OUT として扱う）
-- 在庫は無制限のため、在庫由来の SOLD_OUT は使用しない
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_facility_status(
  p_facility_id UUID,
  p_at TIMESTAMPTZ DEFAULT NOW()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tz TEXT;
  v_is_open BOOLEAN;
  v_next_open_at TIMESTAMPTZ := NULL;
  v_local_ts TIMESTAMP;
  v_local_time TIME;
  v_dow SMALLINT;
  v_today_date DATE;
  v_next_interval RECORD;
  v_check_date DATE;
  v_i INTEGER;
BEGIN
  -- 施設のタイムゾーンを取得
  SELECT COALESCE(timezone, 'Asia/Tokyo')
  INTO v_tz
  FROM public.facilities
  WHERE id = p_facility_id;

  IF v_tz IS NULL THEN
    RETURN jsonb_build_object(
      'code', 'NOT_FOUND',
      'is_open', FALSE,
      'next_open_at', NULL
    );
  END IF;

  -- 現在時刻をローカルに変換
  v_local_ts := p_at AT TIME ZONE v_tz;
  v_local_time := v_local_ts::TIME;
  v_dow := EXTRACT(DOW FROM v_local_ts)::SMALLINT;
  v_today_date := v_local_ts::DATE;

  -- 営業中かどうかを判定
  v_is_open := public.is_facility_open_at(p_facility_id, p_at);

  -- 営業中なら OK を返す
  IF v_is_open THEN
    RETURN jsonb_build_object(
      'code', 'OK',
      'is_open', TRUE,
      'next_open_at', NULL
    );
  END IF;

  -- 営業時間外の場合、次の営業開始時刻を計算
  -- 1) 今日の残りの時間枠をチェック
  SELECT start_time INTO v_next_interval
  FROM public.facility_open_intervals
  WHERE facility_id = p_facility_id
    AND day_of_week = v_dow
    AND start_time > v_local_time
  ORDER BY start_time
  LIMIT 1;

  IF FOUND THEN
    v_next_open_at := (v_today_date + v_next_interval.start_time) AT TIME ZONE v_tz;
    RETURN jsonb_build_object(
      'code', 'SOLD_OUT',
      'is_open', FALSE,
      'next_open_at', v_next_open_at
    );
  END IF;

  -- 2) 翌日以降7日間をチェック
  FOR v_i IN 1..7 LOOP
    v_check_date := v_today_date + v_i;
    v_dow := EXTRACT(DOW FROM v_check_date)::SMALLINT;

    SELECT start_time INTO v_next_interval
    FROM public.facility_open_intervals
    WHERE facility_id = p_facility_id
      AND day_of_week = v_dow
    ORDER BY start_time
    LIMIT 1;

    IF FOUND THEN
      v_next_open_at := (v_check_date + v_next_interval.start_time) AT TIME ZONE v_tz;
      EXIT;
    END IF;
  END LOOP;

  -- 営業時間外 = SOLD_OUT として返す（在庫由来ではなく営業時間由来）
  RETURN jsonb_build_object(
    'code', 'SOLD_OUT',
    'is_open', FALSE,
    'next_open_at', v_next_open_at
  );
END;
$$;

COMMENT ON FUNCTION public.get_facility_status IS '施設ステータスを返す（営業時間外=SOLD_OUT）';

-- ============================================================================
-- stores テーブルにも営業時間関連の参照を追加（既存UIとの互換性）
-- stores.facility_id で facilities と紐付け可能に
-- ============================================================================
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS facility_id UUID REFERENCES public.facilities(id);

COMMENT ON COLUMN public.stores.facility_id IS 'facilities テーブルへの参照（営業時間管理用）';

-- ============================================================================
-- RLS ポリシー（必要に応じて）
-- ============================================================================
-- facility_photos: 全員読み取り可
ALTER TABLE public.facility_photos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "facility_photos_public_read" ON public.facility_photos;
CREATE POLICY "facility_photos_public_read" ON public.facility_photos
  FOR SELECT TO anon, authenticated USING (true);

-- facility_open_intervals: 全員読み取り可
ALTER TABLE public.facility_open_intervals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "facility_open_intervals_public_read" ON public.facility_open_intervals;
CREATE POLICY "facility_open_intervals_public_read" ON public.facility_open_intervals
  FOR SELECT TO anon, authenticated USING (true);

-- onboarding_requests: 管理者のみ（RLSは無効のまま、Edge Functionのservice_roleで操作）
-- ALTER TABLE public.onboarding_requests ENABLE ROW LEVEL SECURITY;
