-- ==============================================================================
-- Migration: 20261017000001_owner_payment_options_and_midcycle_bills.sql
-- Description: 
--   1. Add UPI ID, payment link, and UPI QR code URL to profiles and properties.
--   2. Add billing period and split calculation columns to electricity_readings.
--   3. Create tenant_electricity_shares table for transparent mid-cycle bill splits
--      with strict Row Level Security (RLS).
-- ==============================================================================

-- 1. Owner & Property Payment Details
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS upi_id TEXT,
  ADD COLUMN IF NOT EXISTS payment_link TEXT,
  ADD COLUMN IF NOT EXISTS upi_qr_url TEXT;

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS upi_id TEXT,
  ADD COLUMN IF NOT EXISTS payment_link TEXT,
  ADD COLUMN IF NOT EXISTS upi_qr_url TEXT;

-- 2. Electricity Readings Extension (Supports billing period & mid-cycle splits)
ALTER TABLE public.electricity_readings
  ADD COLUMN IF NOT EXISTS period_start DATE,
  ADD COLUMN IF NOT EXISTS period_end DATE,
  ADD COLUMN IF NOT EXISTS calculation_type TEXT DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS split_breakdown JSONB DEFAULT '[]'::jsonb;

-- 3. Tenant Electricity Shares Table
CREATE TABLE IF NOT EXISTS public.tenant_electricity_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reading_id UUID REFERENCES public.electricity_readings(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  room_id UUID REFERENCES public.rooms(id) ON DELETE SET NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  occupied_days INT NOT NULL DEFAULT 0,
  total_period_days INT NOT NULL DEFAULT 0,
  share_percentage NUMERIC(5, 2) NOT NULL DEFAULT 0,
  units_consumed NUMERIC(10, 2) DEFAULT NULL,
  amount_due NUMERIC(10, 2) NOT NULL DEFAULT 0,
  calculation_method TEXT NOT NULL DEFAULT 'proportional_daily_occupancy',
  calculation_explanation TEXT,
  is_paid BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_tenant_electricity_shares_tenant 
  ON public.tenant_electricity_shares(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_electricity_shares_owner 
  ON public.tenant_electricity_shares(owner_id);
CREATE INDEX IF NOT EXISTS idx_tenant_electricity_shares_reading 
  ON public.tenant_electricity_shares(reading_id);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.tenant_electricity_shares ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'tenant_electricity_shares' 
    AND policyname = 'tenant_electricity_shares_owner_select'
  ) THEN
    CREATE POLICY "tenant_electricity_shares_owner_select" 
      ON public.tenant_electricity_shares 
      FOR SELECT USING (owner_id = auth.uid() OR public.is_super_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'tenant_electricity_shares' 
    AND policyname = 'tenant_electricity_shares_owner_insert'
  ) THEN
    CREATE POLICY "tenant_electricity_shares_owner_insert" 
      ON public.tenant_electricity_shares 
      FOR INSERT WITH CHECK (owner_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'tenant_electricity_shares' 
    AND policyname = 'tenant_electricity_shares_owner_update'
  ) THEN
    CREATE POLICY "tenant_electricity_shares_owner_update" 
      ON public.tenant_electricity_shares 
      FOR UPDATE USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'tenant_electricity_shares' 
    AND policyname = 'tenant_electricity_shares_owner_delete'
  ) THEN
    CREATE POLICY "tenant_electricity_shares_owner_delete" 
      ON public.tenant_electricity_shares 
      FOR DELETE USING (owner_id = auth.uid());
  END IF;
END $$;
