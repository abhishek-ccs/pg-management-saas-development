-- ==============================================================================
-- Migration: 20261018000001_enforce_property_limit.sql
-- Description: Production-ready subscription-based property limit enforcement
--
-- Features:
-- 1. Centralized max 2 properties allowance per active/trial subscription.
-- 2. Concurrency-safe advisory transaction lock per owner (no cross-tenant blocking).
-- 3. Non-destructive: Existing customers with >2 properties retain all data,
--    rooms, beds, tenants, and ledger records, but cannot create additional properties.
-- 4. Expired trial / unauthorized customers cannot create properties.
-- 5. Safe idempotent execution.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.enforce_property_limit()
RETURNS trigger AS $$
DECLARE
  v_owner_id UUID;
  v_sub_status TEXT;
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
  -- This serializes concurrent property creation attempts for this specific owner
  -- while completely isolating other owners from any blocking.
  PERFORM pg_advisory_xact_lock(hashtext(v_owner_id::text));

  -- 2. Authoritative Subscription Status Resolution
  SELECT status, trial_end INTO v_sub_status, v_trial_end
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
    -- Newly registered user before subscription record creation
    v_has_paid_access := true;
  ELSE
    v_has_paid_access := false;
  END IF;

  -- Block creation if subscription/trial has expired
  IF NOT v_has_paid_access THEN
    RAISE EXCEPTION 'Your free trial or subscription has expired. Please upgrade your plan to create properties.'
      USING ERRCODE = 'P0001';
  END IF;

  -- 3. Count Existing Active Properties for this Owner
  -- Note: Does not count soft-deleted/trashed properties because those are archived in platform_audit_logs
  SELECT count(*) INTO v_current_count
  FROM public.properties
  WHERE owner_id = v_owner_id
    AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

  -- 4. Enforce Limit
  -- If customer already has 2 or more properties, block new creation
  IF v_current_count >= v_max_properties THEN
    RAISE EXCEPTION 'Property limit reached. Your subscription includes up to % properties. Please upgrade your plan to add more properties.', v_max_properties
      USING ERRCODE = 'P0002';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach Trigger to public.properties
DROP TRIGGER IF EXISTS trg_enforce_property_limit ON public.properties;

CREATE TRIGGER trg_enforce_property_limit
  BEFORE INSERT ON public.properties
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_property_limit();
