-- Add dynamic pricing columns to stores table
-- If dynamic_enabled = false, fastpass_price is used as fallback

ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS dynamic_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS avg_spend_yen INTEGER NOT NULL DEFAULT 3000;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS turnover_per_hour INTEGER NOT NULL DEFAULT 10;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS target_fastpass_per_hour INTEGER NOT NULL DEFAULT 5;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS min_price INTEGER NOT NULL DEFAULT 500;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS max_price INTEGER NOT NULL DEFAULT 3000;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS k_util NUMERIC(5,3) NOT NULL DEFAULT 0.3;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS k_step NUMERIC(5,3) NOT NULL DEFAULT 0.1;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS k_wait NUMERIC(5,3) NOT NULL DEFAULT 0.02;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS k_env NUMERIC(5,3) NOT NULL DEFAULT 0.05;

-- Add comment for documentation
COMMENT ON COLUMN public.stores.dynamic_enabled IS 'Enable dynamic pricing calculation';
COMMENT ON COLUMN public.stores.avg_spend_yen IS 'Average customer spend in yen (for base price calculation)';
COMMENT ON COLUMN public.stores.turnover_per_hour IS 'Expected customer turnover per hour';
COMMENT ON COLUMN public.stores.target_fastpass_per_hour IS 'Target number of fastpass sales per hour';
COMMENT ON COLUMN public.stores.min_price IS 'Minimum price floor for dynamic pricing';
COMMENT ON COLUMN public.stores.max_price IS 'Maximum price ceiling for dynamic pricing';
COMMENT ON COLUMN public.stores.k_util IS 'Coefficient for utilization factor';
COMMENT ON COLUMN public.stores.k_step IS 'Coefficient for time-slot purchase count factor';
COMMENT ON COLUMN public.stores.k_wait IS 'Coefficient for wait time factor';
COMMENT ON COLUMN public.stores.k_env IS 'Coefficient for environment/congestion factor';
