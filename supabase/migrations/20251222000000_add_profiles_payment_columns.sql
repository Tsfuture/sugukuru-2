-- Migration: Ensure all payment-related columns exist on profiles table
-- This ensures the schema matches what setup-card Edge Function expects

-- Add all required columns with ADD COLUMN IF NOT EXISTS
-- Note: PostgreSQL 9.6+ supports IF NOT EXISTS for ADD COLUMN

-- stripe_customer_id - Stripe customer ID
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'profiles' 
    AND column_name = 'stripe_customer_id'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN stripe_customer_id TEXT;
  END IF;
END $$;

-- default_payment_method_id - Stripe PaymentMethod ID (pm_xxx)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'profiles' 
    AND column_name = 'default_payment_method_id'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN default_payment_method_id TEXT;
  END IF;
END $$;

-- card_brand - Card brand (visa, mastercard, etc.)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'profiles' 
    AND column_name = 'card_brand'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN card_brand TEXT;
  END IF;
END $$;

-- card_last4 - Last 4 digits of the card
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'profiles' 
    AND column_name = 'card_last4'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN card_last4 TEXT;
  END IF;
END $$;

-- card_exp_month - Card expiration month
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'profiles' 
    AND column_name = 'card_exp_month'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN card_exp_month INTEGER;
  END IF;
END $$;

-- card_exp_year - Card expiration year
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'profiles' 
    AND column_name = 'card_exp_year'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN card_exp_year INTEGER;
  END IF;
END $$;

-- has_payment_method - Boolean flag for quick check
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'profiles' 
    AND column_name = 'has_payment_method'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN has_payment_method BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

-- Add updated_at column if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'profiles' 
    AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now();
  END IF;
END $$;

-- Comment for documentation
COMMENT ON COLUMN public.profiles.stripe_customer_id IS 'Stripe Customer ID (cus_xxx)';
COMMENT ON COLUMN public.profiles.default_payment_method_id IS 'Stripe PaymentMethod ID (pm_xxx)';
COMMENT ON COLUMN public.profiles.card_brand IS 'Card brand (visa, mastercard, amex, etc.)';
COMMENT ON COLUMN public.profiles.card_last4 IS 'Last 4 digits of the card';
COMMENT ON COLUMN public.profiles.card_exp_month IS 'Card expiration month (1-12)';
COMMENT ON COLUMN public.profiles.card_exp_year IS 'Card expiration year (e.g., 2025)';
COMMENT ON COLUMN public.profiles.has_payment_method IS 'Whether user has a valid payment method attached';
