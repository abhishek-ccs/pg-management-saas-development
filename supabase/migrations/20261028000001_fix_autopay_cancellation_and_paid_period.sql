-- ==============================================================================
-- Migration: 20261028000001_fix_autopay_cancellation_and_paid_period.sql
-- Description: Add separate state tracking for AutoPay mandate revocation,
--              payment status, and cancel_at_period_end to public.subscriptions.
--              Upgrade enforce_property_limit trigger to respect paid-through dates.
-- ==============================================================================

-- 1. Add AutoPay & cancellation tracking columns to public.subscriptions
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS autopay_status TEXT DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ;

-- 2. Indexes for fast lookup on period end and autopay status
CREATE INDEX IF NOT EXISTS idx_subscriptions_period_end 
  ON public.subscriptions(current_period_end);

CREATE INDEX IF NOT EXISTS idx_subscriptions_autopay_status 
  ON public.subscriptions(autopay_status);

-- 3. Backfill existing subscriptions:
-- If customer has a future paid-through date and paid count / payment ID,
-- ensure their access is active with cancel_at_period_end flag set.
UPDATE public.subscriptions
SET 
  cancel_at_period_end = true,
  autopay_status = 'revoked',
  payment_status = 'paid',
  status = 'active',
  updated_at = timezone('utc'::text, now())
WHERE status = 'canceled'
  AND current_period_end IS NOT NULL
  AND current_period_end > timezone('utc'::text, now())
  AND razorpay_payment_id IS NOT NULL;

-- 4. Upgrade authoritative database trigger function enforce_property_limit()
-- Guarantees that a customer who has paid through a future period_end maintains
-- full paid access even if AutoPay / recurring mandate was cancelled.
CREATE OR REPLACE FUNCTION public.enforce_property_limit()
RETURNS trigger AS $$
DECLARE
  v_owner_id UUID;
  v_current_count INTEGER;
  v_max_properties INTEGER := 2;
  v_sub_status TEXT;
  v_sub_plan TEXT;
  v_trial_end TIMESTAMPTZ;
  v_current_period_end TIMESTAMPTZ;
  v_payment_status TEXT;
  v_has_paid_access BOOLEAN := false;
BEGIN
  -- Determine the owner ID
  IF auth.uid() IS NULL THEN
    v_owner_id := NEW.owner_id;
  ELSE
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
  -- Prioritize subscriptions that currently grant paid access:
  -- 1) Any unexpired paid-through period (current_period_end > now and not refunded)
  -- 2) Active subscription
  -- 3) Active trial
  SELECT status, plan, trial_end, current_period_end, payment_status 
  INTO v_sub_status, v_sub_plan, v_trial_end, v_current_period_end, v_payment_status
  FROM public.subscriptions
  WHERE owner_id = v_owner_id
  ORDER BY 
    CASE 
      WHEN (current_period_end IS NOT NULL AND current_period_end > timezone('utc'::text, now()) AND COALESCE(payment_status, '') <> 'refunded') THEN 1
      WHEN status = 'active' THEN 2 
      WHEN status = 'trialing' THEN 3 
      ELSE 4 
    END, 
    updated_at DESC
  LIMIT 1;

  -- Determine paid/trial access:
  -- Rule A: Valid paid-through date in the future (even if AutoPay was cancelled)
  IF v_current_period_end IS NOT NULL AND v_current_period_end > timezone('utc'::text, now()) AND COALESCE(v_payment_status, '') <> 'refunded' THEN
    v_has_paid_access := true;
  -- Rule B: Active status where period_end is not set or in future
  ELSIF v_sub_status = 'active' AND (v_current_period_end IS NULL OR v_current_period_end > timezone('utc'::text, now())) AND COALESCE(v_payment_status, '') <> 'refunded' THEN
    v_has_paid_access := true;
  -- Rule C: Valid unexpired 7-day free trial
  ELSIF v_sub_status = 'trialing' AND (v_trial_end IS NULL OR v_trial_end > timezone('utc'::text, now())) THEN
    v_has_paid_access := true;
  -- Rule D: Brand-new user before subscription record creation
  ELSIF v_sub_status IS NULL THEN
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

-- Attach trigger to public.properties
DROP TRIGGER IF EXISTS trg_enforce_property_limit ON public.properties;

CREATE TRIGGER trg_enforce_property_limit
  BEFORE INSERT ON public.properties
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_property_limit();

