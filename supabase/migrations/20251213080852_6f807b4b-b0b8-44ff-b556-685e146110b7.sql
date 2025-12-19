-- Add card detail columns to profiles table for display purposes only
-- (actual card data is stored securely in Stripe, not here)
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS default_payment_method_id text,
ADD COLUMN IF NOT EXISTS card_brand text,
ADD COLUMN IF NOT EXISTS card_last4 text,
ADD COLUMN IF NOT EXISTS card_exp_month integer,
ADD COLUMN IF NOT EXISTS card_exp_year integer,
ADD COLUMN IF NOT EXISTS name text;