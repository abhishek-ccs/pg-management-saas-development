-- ==============================================================================
-- Migration: 20261021000001_fix_multi_property_constraint.sql
-- Description: Drop 1-property unique constraint (uq_properties_owner) to allow
--              multi-property support within authoritative subscription limits.
-- ==============================================================================

-- 1. Drop the legacy unique constraint on properties(owner_id)
-- This fixes the error: duplicate key value violates unique constraint "uq_properties_owner"
ALTER TABLE public.properties
  DROP CONSTRAINT IF EXISTS uq_properties_owner;

-- 2. Ensure non-unique performance index on owner_id exists
CREATE INDEX IF NOT EXISTS idx_properties_owner
  ON public.properties(owner_id);

-- 3. Upgrade property limit trigger function to resolve plan limits dynamically
CREATE OR REPLACE FUNCTION public.enforce_property_limit()
RETURNS trigger AS $$
DECLARE
  v_owner_id UUID;
  v_sub_status TEXT;
  v_sub_plan TEXT;
  v_trial_end TIMESTAMPTZ;
  v_has_paid_access BOOLEAN := false;
  v_max_properties INT := 2;
  v_current_count INT;
BEGIN
  v_owner_id := NEW.owner_id;
  IF v_owner_id IS NULL THEN
    v_owner_id := auth.uid();
    NEW.owner_id := v_owner_id;
  END IF;

  -- Platform super admins can manage properties without limit
  IF public.is_super_admin() THEN
    RETURN NEW;
  END IF;

  -- 1. Atomic Concurrency Barrier:
  -- Acquire an advisory transaction lock hashed specifically to this owner.
  -- Serializes concurrent property creation attempts for this specific owner.
  PERFORM pg_advisory_xact_lock(hashtext(v_owner_id::text));

  -- 2. Authoritative Subscription Status & Plan Resolution
  SELECT status, plan, trial_end INTO v_sub_status, v_sub_plan, v_trial_end
  FROM public.subscriptions
  WHERE owner_id = v_owner_id
  ORDER BY 
    CASE 
      WHEN status = 'active' THEN 1 
      WHEN status = 'trialing' THEN 2 
      ELSE 3 
    END, 
    updated_at DESC
  LIMIT 1;

  -- Determine paid/trial access
  IF v_sub_status = 'active' THEN
    v_has_paid_access := true;
  ELSIF v_sub_status = 'trialing' AND (v_trial_end IS NULL OR v_trial_end > timezone('utc'::text, now())) THEN
    v_has_paid_access := true;
  ELSIF v_sub_status IS NULL THEN
    -- Newly registered user before subscription record creation (grace trial)
    v_has_paid_access := true;
  ELSE
    v_has_paid_access := false;
  END IF;

  -- Block creation if subscription/trial has expired
  IF NOT v_has_paid_access THEN
    RAISE EXCEPTION 'Your free trial or subscription has expired. Please upgrade your plan to create properties.'
      USING ERRCODE = 'P0001';
  END IF;

  -- 3. Resolve Dynamic Property Limit based on Plan
  -- Canonical plan limits: trial=2, monthly=2, starter=2, yearly=5, growth=5, pro=5, business=9, enterprise=999
  IF v_sub_plan = 'yearly' OR v_sub_plan = 'growth' OR v_sub_plan = 'pro' THEN
    v_max_properties := 5;
  ELSIF v_sub_plan = 'business' THEN
    v_max_properties := 9;
  ELSIF v_sub_plan = 'enterprise' THEN
    v_max_properties := 999;
  ELSE
    v_max_properties := 2;
  END IF;

  -- 4. Count Existing Active Properties for this Owner
  SELECT count(*) INTO v_current_count
  FROM public.properties
  WHERE owner_id = v_owner_id
    AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

  -- 5. Enforce Limit
  IF v_current_count >= v_max_properties THEN
    RAISE EXCEPTION 'Property limit reached. Your subscription includes up to % properties. Please upgrade your plan to add more properties.', v_max_properties
      USING ERRCODE = 'P0002';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Re-attach Trigger to public.properties
DROP TRIGGER IF EXISTS trg_enforce_property_limit ON public.properties;

CREATE TRIGGER trg_enforce_property_limit
  BEFORE INSERT ON public.properties
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_property_limit();
