-- Create stores table for multi-tenant fast pass system
CREATE TABLE IF NOT EXISTS public.stores (
  id TEXT NOT NULL PRIMARY KEY,
  name TEXT NOT NULL,
  logo_url TEXT,
  description TEXT,
  current_wait_time INTEGER NOT NULL DEFAULT 30,
  fastpass_price INTEGER NOT NULL DEFAULT 1000,
  peak_extra_price INTEGER NOT NULL DEFAULT 0,
  is_open BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Ensure all columns exist (for existing tables)
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT '';
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS current_wait_time INTEGER NOT NULL DEFAULT 30;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS fastpass_price INTEGER NOT NULL DEFAULT 1000;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS peak_extra_price INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS is_open BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now();
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now();

-- Enable RLS
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;

-- Create policy for public read access (stores info should be publicly viewable)
DROP POLICY IF EXISTS "Stores are publicly readable" ON public.stores;
CREATE POLICY "Stores are publicly readable"
ON public.stores
FOR SELECT
USING (true);

-- Create trigger for automatic timestamp updates
DROP TRIGGER IF EXISTS update_stores_updated_at ON public.stores;
CREATE TRIGGER update_stores_updated_at
BEFORE UPDATE ON public.stores
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert demo stores (skip if id column is UUID type - means different schema)
DO $$
BEGIN
  -- Only insert if id column is TEXT type (our schema)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'stores' 
    AND column_name = 'id'
    AND data_type = 'text'
  ) THEN
    INSERT INTO public.stores (id, name, logo_url, description, current_wait_time, fastpass_price, peak_extra_price, is_open) VALUES
    ('ramen-a', 'ラーメン店A', NULL, '本格豚骨ラーメンの人気店', 45, 500, 200, true),
    ('cafe-shibuya', 'カフェ渋谷', NULL, '渋谷駅前の人気カフェ', 25, 300, 100, true),
    ('clinic-b', 'クリニックB', NULL, '内科・皮膚科クリニック', 60, 1500, 500, true),
    ('theme-park-c', 'テーマパークC', NULL, 'ファミリー向けテーマパーク', 90, 2000, 800, true),
    ('restaurant-d', 'レストランD', NULL, 'イタリアンレストラン', 35, 800, 300, false)
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;