-- ==============================================================================
-- Migration: 20261001000001_safe_production_fixes.sql
-- Description: Non-destructive multi-property support and tenant schema resilience
--              1. Drop 1-property-per-owner restriction (uq_properties_owner)
--              2. Add rent_due_day and deleted_at columns with safe defaults
--              3. Strictly preserves all existing production data and foreign keys
-- ==============================================================================

-- 1. Support Multiple Properties per Owner
-- Relax the unique constraint so owners can manage multiple PG properties.
-- Foreign keys on rooms, beds, tenants, etc. reference properties(id), so this is 100% safe.
ALTER TABLE public.properties
  DROP CONSTRAINT IF EXISTS uq_properties_owner;

CREATE INDEX IF NOT EXISTS idx_properties_owner
  ON public.properties(owner_id);

-- 2. Add additive columns to tenants table with safe backwards-compatible defaults
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS rent_due_day INTEGER DEFAULT 5;

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 3. Add additive columns to payments table
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS month_covered TEXT;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 4. Verify RLS remains enabled on all tables
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.electricity_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;
