-- Add missing columns to purchase_history table
ALTER TABLE public.purchase_history 
ADD COLUMN IF NOT EXISTS dynamic_fee integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'jpy';

-- Rename ticket_count to quantity for consistency
ALTER TABLE public.purchase_history 
RENAME COLUMN ticket_count TO quantity;

-- Rename total_price to total_amount for consistency  
ALTER TABLE public.purchase_history 
RENAME COLUMN total_price TO total_amount;