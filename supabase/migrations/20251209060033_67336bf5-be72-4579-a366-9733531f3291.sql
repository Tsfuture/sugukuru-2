-- Add missing columns to purchase_history table
ALTER TABLE public.purchase_history 
ADD COLUMN IF NOT EXISTS dynamic_fee integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'jpy';

-- Rename ticket_count to quantity for consistency (if ticket_count exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'purchase_history' 
    AND column_name = 'ticket_count'
  ) THEN
    ALTER TABLE public.purchase_history RENAME COLUMN ticket_count TO quantity;
  END IF;
END $$;

-- Rename total_price to total_amount for consistency (if total_price exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'purchase_history' 
    AND column_name = 'total_price'
  ) THEN
    ALTER TABLE public.purchase_history RENAME COLUMN total_price TO total_amount;
  END IF;
END $$;