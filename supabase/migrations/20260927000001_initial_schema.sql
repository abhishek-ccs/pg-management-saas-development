-- ==============================================================================
-- StayNest PG Management SaaS - Initial Database Schema & Row Level Security (RLS)
-- Version: 1.0.0
-- Migration: 20260927000001_initial_schema.sql
-- ==============================================================================

-- 1. Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------------------------
-- 2. Profiles Table (Extends Supabase auth.users)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'pg_owner' CHECK (role IN ('pg_owner', 'super_admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'pending')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_status ON public.profiles(status);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

-- ------------------------------------------------------------------------------
-- 3. Subscriptions Table (SaaS Billing & 7-day Trial tracking)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'trial' CHECK (plan IN ('trial', 'starter', 'growth', 'pro')),
  status TEXT NOT NULL DEFAULT 'trialing' CHECK (status IN ('trialing', 'active', 'past_due', 'canceled', 'expired')),
  trial_start TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  trial_end TIMESTAMPTZ DEFAULT (timezone('utc'::text, now()) + interval '7 days'),
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT uq_subscriptions_owner UNIQUE (owner_id)
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_owner ON public.subscriptions(owner_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);

-- ------------------------------------------------------------------------------
-- 4. Platform Audit Logs Table (Privileged Super Admin Activity)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON public.platform_audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.platform_audit_logs(created_at DESC);

-- ------------------------------------------------------------------------------
-- 5. Properties Table (PG / Hostel Buildings)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  state TEXT,
  pincode TEXT,
  contact_number TEXT,
  rules TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT uq_properties_owner UNIQUE (owner_id)
);

CREATE INDEX IF NOT EXISTS idx_properties_owner ON public.properties(owner_id);

-- ------------------------------------------------------------------------------
-- 6. Rooms Table
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  room_number TEXT NOT NULL,
  floor INTEGER DEFAULT 0,
  room_type TEXT DEFAULT 'sharing',
  base_rent NUMERIC(10, 2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT uq_property_room UNIQUE (property_id, room_number)
);

CREATE INDEX IF NOT EXISTS idx_rooms_owner ON public.rooms(owner_id);
CREATE INDEX IF NOT EXISTS idx_rooms_property ON public.rooms(property_id);

-- ------------------------------------------------------------------------------
-- 7. Beds Table (Occupancy Management)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.beds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  bed_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'occupied', 'maintenance')),
  monthly_rate NUMERIC(10, 2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT uq_room_bed UNIQUE (room_id, bed_number)
);

CREATE INDEX IF NOT EXISTS idx_beds_owner ON public.beds(owner_id);
CREATE INDEX IF NOT EXISTS idx_beds_room ON public.beds(room_id);
CREATE INDEX IF NOT EXISTS idx_beds_status ON public.beds(status);

-- ------------------------------------------------------------------------------
-- 8. Tenants Table (Residents)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  room_id UUID REFERENCES public.rooms(id) ON DELETE SET NULL,
  bed_id UUID REFERENCES public.beds(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  emergency_contact TEXT,
  id_proof_type TEXT,
  id_proof_number TEXT,
  monthly_rent NUMERIC(10, 2) NOT NULL DEFAULT 0,
  security_deposit NUMERIC(10, 2) DEFAULT 0,
  joining_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Paid', 'Pending', 'Overdue', 'Vacated')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_tenants_owner ON public.tenants(owner_id);
CREATE INDEX IF NOT EXISTS idx_tenants_property ON public.tenants(property_id);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON public.tenants(status);

-- ------------------------------------------------------------------------------
-- 9. Payments Table (Rent & Deposit Ledger)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  amount NUMERIC(10, 2) NOT NULL,
  payment_method TEXT DEFAULT 'upi' CHECK (payment_method IN ('upi', 'cash', 'bank_transfer', 'card', 'other')),
  payment_type TEXT DEFAULT 'rent' CHECK (payment_type IN ('rent', 'deposit', 'electricity', 'maintenance', 'other')),
  transaction_reference TEXT,
  notes TEXT,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_payments_owner ON public.payments(owner_id);
CREATE INDEX IF NOT EXISTS idx_payments_tenant ON public.payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payments_paid_at ON public.payments(paid_at DESC);

-- ------------------------------------------------------------------------------
-- 10. Complaints Table
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.complaints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  tenant TEXT,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'Medium' CHECK (priority IN ('High', 'Medium', 'Low')),
  status TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'In progress', 'Resolved')),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_complaints_owner ON public.complaints(owner_id);
CREATE INDEX IF NOT EXISTS idx_complaints_status ON public.complaints(status);

-- ------------------------------------------------------------------------------
-- 11. Expenses Table
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'maintenance' CHECK (category IN ('maintenance', 'electricity', 'water', 'groceries', 'wifi', 'salary', 'cleaning', 'tax', 'other')),
  amount NUMERIC(10, 2) NOT NULL,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  receipt_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_expenses_owner ON public.expenses(owner_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON public.expenses(expense_date DESC);

-- ------------------------------------------------------------------------------
-- 12. Electricity Readings Table
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.electricity_readings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  room_id UUID REFERENCES public.rooms(id) ON DELETE SET NULL,
  meter_number TEXT,
  previous_reading NUMERIC(10, 2) NOT NULL DEFAULT 0,
  current_reading NUMERIC(10, 2) NOT NULL DEFAULT 0,
  rate_per_unit NUMERIC(10, 2) NOT NULL DEFAULT 10,
  total_units NUMERIC(10, 2) GENERATED ALWAYS AS (current_reading - previous_reading) STORED,
  total_amount NUMERIC(10, 2) GENERATED ALWAYS AS ((current_reading - previous_reading) * rate_per_unit) STORED,
  reading_date DATE NOT NULL DEFAULT CURRENT_DATE,
  is_settled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_electricity_owner ON public.electricity_readings(owner_id);
CREATE INDEX IF NOT EXISTS idx_electricity_room ON public.electricity_readings(room_id);

-- ==============================================================================
-- 13. SECURITY DEFINER HELPER FUNCTION (Prevents Infinite Recursion in RLS)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'super_admin'
      AND status = 'active'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ==============================================================================
-- 14. ROW LEVEL SECURITY (RLS) POLICIES
-- Strict Tenant Isolation: Every PG owner can only access their own data.
-- ==============================================================================

-- A. Profiles RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_own_or_admin" ON public.profiles
  FOR SELECT USING (auth.uid() = id OR public.is_super_admin());

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id OR public.is_super_admin())
  WITH CHECK (
    (auth.uid() = id AND role = (SELECT role FROM public.profiles WHERE id = auth.uid()))
    OR public.is_super_admin()
  );

CREATE POLICY "profiles_insert_own_or_admin" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id OR public.is_super_admin());

-- B. Subscriptions RLS
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subscriptions_select_own_or_admin" ON public.subscriptions
  FOR SELECT USING (owner_id = auth.uid() OR public.is_super_admin());

CREATE POLICY "subscriptions_admin_manage" ON public.subscriptions
  FOR ALL USING (public.is_super_admin());

-- C. Platform Audit Logs RLS (Super Admin Only)
ALTER TABLE public.platform_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_logs_select_admin_only" ON public.platform_audit_logs
  FOR SELECT USING (public.is_super_admin());

CREATE POLICY "audit_logs_insert_authenticated" ON public.platform_audit_logs
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- D. Properties RLS
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "properties_owner_select" ON public.properties
  FOR SELECT USING (owner_id = auth.uid() OR public.is_super_admin());

CREATE POLICY "properties_owner_insert" ON public.properties
  FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY "properties_owner_update" ON public.properties
  FOR UPDATE USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE POLICY "properties_owner_delete" ON public.properties
  FOR DELETE USING (owner_id = auth.uid());

-- E. Rooms RLS
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rooms_owner_select" ON public.rooms
  FOR SELECT USING (owner_id = auth.uid() OR public.is_super_admin());

CREATE POLICY "rooms_owner_insert" ON public.rooms
  FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY "rooms_owner_update" ON public.rooms
  FOR UPDATE USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE POLICY "rooms_owner_delete" ON public.rooms
  FOR DELETE USING (owner_id = auth.uid());

-- F. Beds RLS
ALTER TABLE public.beds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "beds_owner_select" ON public.beds
  FOR SELECT USING (owner_id = auth.uid() OR public.is_super_admin());

CREATE POLICY "beds_owner_insert" ON public.beds
  FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY "beds_owner_update" ON public.beds
  FOR UPDATE USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE POLICY "beds_owner_delete" ON public.beds
  FOR DELETE USING (owner_id = auth.uid());

-- G. Tenants RLS
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenants_owner_select" ON public.tenants
  FOR SELECT USING (owner_id = auth.uid() OR public.is_super_admin());

CREATE POLICY "tenants_owner_insert" ON public.tenants
  FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY "tenants_owner_update" ON public.tenants
  FOR UPDATE USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE POLICY "tenants_owner_delete" ON public.tenants
  FOR DELETE USING (owner_id = auth.uid());

-- H. Payments RLS
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payments_owner_select" ON public.payments
  FOR SELECT USING (owner_id = auth.uid() OR public.is_super_admin());

CREATE POLICY "payments_owner_insert" ON public.payments
  FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY "payments_owner_update" ON public.payments
  FOR UPDATE USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE POLICY "payments_owner_delete" ON public.payments
  FOR DELETE USING (owner_id = auth.uid());

-- I. Complaints RLS
ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "complaints_owner_select" ON public.complaints
  FOR SELECT USING (owner_id = auth.uid() OR public.is_super_admin());

CREATE POLICY "complaints_owner_insert" ON public.complaints
  FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY "complaints_owner_update" ON public.complaints
  FOR UPDATE USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE POLICY "complaints_owner_delete" ON public.complaints
  FOR DELETE USING (owner_id = auth.uid());

-- J. Expenses RLS
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "expenses_owner_select" ON public.expenses
  FOR SELECT USING (owner_id = auth.uid() OR public.is_super_admin());

CREATE POLICY "expenses_owner_insert" ON public.expenses
  FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY "expenses_owner_update" ON public.expenses
  FOR UPDATE USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE POLICY "expenses_owner_delete" ON public.expenses
  FOR DELETE USING (owner_id = auth.uid());

-- K. Electricity Readings RLS
ALTER TABLE public.electricity_readings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "electricity_owner_select" ON public.electricity_readings
  FOR SELECT USING (owner_id = auth.uid() OR public.is_super_admin());

CREATE POLICY "electricity_owner_insert" ON public.electricity_readings
  FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY "electricity_owner_update" ON public.electricity_readings
  FOR UPDATE USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE POLICY "electricity_owner_delete" ON public.electricity_readings
  FOR DELETE USING (owner_id = auth.uid());

-- ==============================================================================
-- 15. AUTOMATIC TRIGGERS
-- ==============================================================================

-- A. Auto-create Profile & 7-day Trial Subscription on User Signup
-- A. Auto-create Profile & 7-day Trial Subscription on User Signup
-- SECURITY MANDATE: Public signups can NEVER create a Super Admin.
-- All public signups are strictly initialized as 'pg_owner'.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  user_full_name text;
BEGIN
  user_full_name := coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1));

  INSERT INTO public.profiles (id, email, full_name, role, status)
  VALUES (
    new.id,
    new.email,
    user_full_name,
    'pg_owner', -- ALWAYS 'pg_owner'. Super Admin MUST be bootstrapped via server CLI.
    'active'
  )
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      full_name = coalesce(EXCLUDED.full_name, public.profiles.full_name),
      -- Never overwrite an existing super_admin role during updates
      role = public.profiles.role;

  -- Create 7-day trial subscription for new PG owners
  INSERT INTO public.subscriptions (owner_id, plan, status, trial_start, trial_end)
  VALUES (
    new.id,
    'trial',
    'trialing',
    timezone('utc'::text, now()),
    timezone('utc'::text, now()) + interval '7 days'
  )
  ON CONFLICT (owner_id) DO NOTHING;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach trigger to Supabase auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Prevent non-admin users from escalating their own role in public.profiles
CREATE OR REPLACE FUNCTION public.protect_profile_role()
RETURNS trigger AS $$
BEGIN
  IF new.role <> old.role THEN
    IF NOT (public.is_super_admin() OR auth.role() = 'service_role') THEN
      RAISE EXCEPTION 'Privilege escalation rejected: only Super Admins can alter account roles.';
    END IF;
  END IF;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_protect_profile_role ON public.profiles;
CREATE TRIGGER trg_protect_profile_role
  BEFORE UPDATE OF role ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_role();

-- B. Auto-update updated_at timestamp trigger
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger AS $$
BEGIN
  new.updated_at = timezone('utc'::text, now());
  RETURN new;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_subscriptions_updated_at ON public.subscriptions;
CREATE TRIGGER trg_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_properties_updated_at ON public.properties;
CREATE TRIGGER trg_properties_updated_at
  BEFORE UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_rooms_updated_at ON public.rooms;
CREATE TRIGGER trg_rooms_updated_at
  BEFORE UPDATE ON public.rooms
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_beds_updated_at ON public.beds;
CREATE TRIGGER trg_beds_updated_at
  BEFORE UPDATE ON public.beds
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_tenants_updated_at ON public.tenants;
CREATE TRIGGER trg_tenants_updated_at
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_complaints_updated_at ON public.complaints;
CREATE TRIGGER trg_complaints_updated_at
  BEFORE UPDATE ON public.complaints
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ------------------------------------------------------------------------------
-- 16. Backfill existing auth.users into profiles and subscriptions
-- Ensures accounts created prior to schema execution are fully initialized
-- ------------------------------------------------------------------------------
INSERT INTO public.profiles (id, email, full_name, role, status)
SELECT 
  id,
  email,
  coalesce(raw_user_meta_data->>'full_name', split_part(email, '@', 1)),
  CASE 
    WHEN email IN ('sharmavn258@gmail.com', 'admin@staynest.in') THEN 'super_admin'
    ELSE 'pg_owner'
  END,
  'active'
FROM auth.users
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email;

INSERT INTO public.subscriptions (owner_id, plan, status, trial_start, trial_end)
SELECT 
  id,
  'trial',
  'trialing',
  timezone('utc'::text, now()),
  timezone('utc'::text, now()) + interval '7 days'
FROM auth.users
ON CONFLICT (owner_id) DO NOTHING;
