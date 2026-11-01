-- ==============================================================================
-- Migration: 20261028000001_fix_autopay_cancellation_and_paid_period.sql
-- Description: Add separate state tracking for AutoPay mandate revocation,
--              payment status, and cancel_at_period_end to public.subscriptions.
--              Add atomic lease status tracking to razorpay_webhook_events.
--              Upgrade enforce_property_limit trigger to respect paid-through dates
--              with complete parity to TypeScript authority engine.
-- ==============================================================================

-- 1. Add AutoPay & cancellation tracking columns to public.subscriptions
-- Note on lifecycle dates:
--   canceled_at: timestamp when customer or admin requested AutoPay mandate cancellation.
--   cancel_at_period_end: true when recurring billing is revoked but paid access is preserved.
--   ended_at: set ONLY when paid access has completely concluded (e.g. period expired or full refund).
--             Mandate cancellation does NOT set ended_at while current_period_end is in the future.
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS autopay_status TEXT DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ;

-- 2. Add atomic lease status tracking columns to public.razorpay_webhook_events
ALTER TABLE public.razorpay_webhook_events
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS error TEXT,
  ADD COLUMN IF NOT EXISTS lease_token TEXT,
  ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ;

-- 3. Performance indexes for fast lookup on period end and autopay status
CREATE INDEX IF NOT EXISTS idx_subscriptions_period_end
  ON public.subscriptions(current_period_end);

CREATE INDEX IF NOT EXISTS idx_subscriptions_autopay_status
  ON public.subscriptions(autopay_status);

CREATE INDEX IF NOT EXISTS idx_rzp_webhook_events_status
  ON public.razorpay_webhook_events(status);

CREATE INDEX IF NOT EXISTS idx_rzp_webhook_events_lease
  ON public.razorpay_webhook_events(lease_token);

-- Safe uniqueness mechanism for Razorpay subscription identity
-- Non-destructive duplicate detection: verifies no duplicate razorpay_subscription_id
-- records exist before creating the unique index. If duplicates are found, raises an
-- informative exception detailing the duplicate IDs so administrators can reconcile them
-- manually without silently deleting or discarding any customer records.
DO $$
DECLARE
  v_dup_count INTEGER;
  v_dup_ids TEXT;
BEGIN
  SELECT count(*), string_agg(razorpay_subscription_id || ' (' || cnt::text || ' rows)', ', ')
  INTO v_dup_count, v_dup_ids
  FROM (
    SELECT razorpay_subscription_id, count(*) as cnt
    FROM public.subscriptions
    WHERE razorpay_subscription_id IS NOT NULL
    GROUP BY razorpay_subscription_id
    HAVING count(*) > 1
  ) dups;

  IF v_dup_count > 0 THEN
    RAISE EXCEPTION 'Cannot create unique index uq_subscriptions_rzp_sub: found % duplicate razorpay_subscription_id group(s) [%]. Manual reconciliation required before applying unique constraint.',
      v_dup_count, v_dup_ids
      USING ERRCODE = 'check_violation';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_subscriptions_rzp_sub
  ON public.subscriptions(razorpay_subscription_id)
  WHERE razorpay_subscription_id IS NOT NULL;

-- 4. Safely reconcile payment_status for existing customers
-- Step 4a: Backfill refunded status ONLY for payments confirmed to be FULLY refunded:
-- 1. Requires authoritative subscription/payment association evidence:
--    If the subscription record has a razorpay_subscription_id, the payment in the refund webhook
--    must explicitly have matching subscription_id evidence. If the association cannot be safely established,
--    the ambiguous record is NOT automatically modified.
-- 2. Prevents marking a newer cycle as refunded/ended:
--    Ensures no newer charge (subscription.charged) exists for this subscription in razorpay_webhook_events,
--    and the subscription has not advanced to a newer payment cycle.
-- 3. Compares cumulative amount_refunded against original payment amount or verifies refund_status = 'full'
--    using safe regex validation (~ '^[0-9]+$') and defensive CASE evaluation before numeric casting.
-- 4. Confirmed full refunds set payment_status = 'refunded' and ended_at.
--    Partial refunds and unconfirmed/incomplete payloads are left unchanged for manual reconciliation.
UPDATE public.subscriptions s
SET payment_status = 'refunded',
    ended_at = COALESCE(s.ended_at, timezone('utc'::text, now()))
WHERE s.razorpay_payment_id IS NOT NULL
  AND s.razorpay_subscription_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.razorpay_webhook_events we
    WHERE we.event_type = 'refund.processed'
      -- Explicit payment ID match
      AND (
        we.payload->'payload'->'payment'->'entity'->>'id' = s.razorpay_payment_id
        OR we.payload->'payload'->'refund'->'entity'->>'payment_id' = s.razorpay_payment_id
      )
      -- Authoritative subscription association evidence:
      -- Webhook payment entity must explicitly match this subscription ID
      AND we.payload->'payload'->'payment'->'entity'->>'subscription_id' = s.razorpay_subscription_id
      -- Reliable full-refund indicators:
      AND (
        -- Reliable indicator 1: payment entity explicitly indicates full refund
        we.payload->'payload'->'payment'->'entity'->>'refund_status' = 'full'
        -- Reliable indicator 2: cumulative amount_refunded equals or exceeds total payment amount
        OR (
          (we.payload->'payload'->'payment'->'entity'->>'amount') ~ '^[0-9]+$'
          AND (we.payload->'payload'->'payment'->'entity'->>'amount_refunded') ~ '^[0-9]+$'
          AND CASE
                WHEN (we.payload->'payload'->'payment'->'entity'->>'amount') ~ '^[0-9]+$'
                 AND (we.payload->'payload'->'payment'->'entity'->>'amount_refunded') ~ '^[0-9]+$'
                THEN (we.payload->'payload'->'payment'->'entity'->>'amount')::numeric > 0
                 AND (we.payload->'payload'->'payment'->'entity'->>'amount_refunded')::numeric >= (we.payload->'payload'->'payment'->'entity'->>'amount')::numeric
                ELSE false
              END
        )
      )
      -- Newer subscription cycle protection:
      -- A full refund of an old payment must NOT mark a newer subscription cycle as refunded or ended.
      -- Ensure there is no newer successful charge event for this subscription.
      AND NOT EXISTS (
        SELECT 1 FROM public.razorpay_webhook_events newer_charge
        WHERE newer_charge.event_type = 'subscription.charged'
          AND (
            newer_charge.payload->'payload'->'subscription'->'entity'->>'id' = s.razorpay_subscription_id
            OR newer_charge.payload->'payload'->'payment'->'entity'->>'subscription_id' = s.razorpay_subscription_id
          )
          AND (
            newer_charge.created_at > we.created_at
            OR (
              newer_charge.payload->'payload'->'payment'->'entity'->>'id' IS NOT NULL
              AND newer_charge.payload->'payload'->'payment'->'entity'->>'id' <> s.razorpay_payment_id
            )
          )
      )
  );

-- Step 4b: Mark paid status for unrefunded subscriptions with valid payment IDs:
-- Must be currently active with future period, or cancelled with remaining paid period.
-- Historical ended rows and confirmed full refunds are strictly excluded.
-- Uses COALESCE to ensure NULL payment_status values are safely processed without exclusion.
-- Partial refunds preserve paid access.
UPDATE public.subscriptions s
SET payment_status = 'paid'
WHERE s.razorpay_payment_id IS NOT NULL
  AND (s.payment_status IS NULL OR s.payment_status = 'pending')
  AND COALESCE(s.payment_status, '') <> 'refunded'
  AND NOT EXISTS (
    SELECT 1 FROM public.razorpay_webhook_events we
    WHERE we.event_type = 'refund.processed'
      AND (
        we.payload->'payload'->'payment'->'entity'->>'id' = s.razorpay_payment_id
        OR we.payload->'payload'->'refund'->'entity'->>'payment_id' = s.razorpay_payment_id
      )
      AND (
        s.razorpay_subscription_id IS NULL
        OR we.payload->'payload'->'payment'->'entity'->>'subscription_id' = s.razorpay_subscription_id
      )
      AND (
        we.payload->'payload'->'payment'->'entity'->>'refund_status' = 'full'
        OR (
          (we.payload->'payload'->'payment'->'entity'->>'amount') ~ '^[0-9]+$'
          AND (we.payload->'payload'->'payment'->'entity'->>'amount_refunded') ~ '^[0-9]+$'
          AND CASE
                WHEN (we.payload->'payload'->'payment'->'entity'->>'amount') ~ '^[0-9]+$'
                 AND (we.payload->'payload'->'payment'->'entity'->>'amount_refunded') ~ '^[0-9]+$'
                THEN (we.payload->'payload'->'payment'->'entity'->>'amount')::numeric > 0
                 AND (we.payload->'payload'->'payment'->'entity'->>'amount_refunded')::numeric >= (we.payload->'payload'->'payment'->'entity'->>'amount')::numeric
                ELSE false
              END
        )
      )
  )
  AND (
    (s.status = 'active' AND (s.current_period_end IS NULL OR s.current_period_end > timezone('utc'::text, now())))
    OR (s.status = 'canceled' AND s.current_period_end > timezone('utc'::text, now()) AND s.ended_at IS NULL)
  );

-- 5. Upgrade authoritative database trigger function enforce_property_limit()
-- Guarantees that a customer who has paid through a future period_end maintains
-- full paid access even if AutoPay / recurring mandate was cancelled or renewal fails.
CREATE OR REPLACE FUNCTION public.enforce_property_limit()
RETURNS trigger AS $$
DECLARE
  v_owner_id UUID;
  v_current_count INTEGER;
  v_max_properties INTEGER := 2;
  v_sub_status TEXT;
  v_sub_plan TEXT;
  v_razorpay_plan_id TEXT;
  v_trial_end TIMESTAMPTZ;
  v_current_period_end TIMESTAMPTZ;
  v_payment_status TEXT;
  v_payment_id TEXT;
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

  -- 1. Atomic Concurrency Barrier (Lock per owner transaction)
  PERFORM pg_advisory_xact_lock(hashtext(v_owner_id::text));

  -- 2. Authoritative Subscription Status & Plan Resolution
  -- Select the single winning record using the exact same derived period end and tie-breakers as TypeScript
  SELECT
    status,
    plan,
    razorpay_plan_id,
    COALESCE(trial_end, created_at + INTERVAL '7 days'),
    COALESCE(
      current_period_end,
      CASE
        WHEN razorpay_payment_id IS NOT NULL AND status = 'active' THEN
          COALESCE(current_period_start, created_at) +
          CASE
            WHEN plan IN ('yearly', 'pro')
                 OR razorpay_plan_id IN ('plan_TpRGUbldZHOv7X', 'plan_TpRGVTZfY46Jki', 'plan_TpRGW532F4cyqm')
                 OR razorpay_plan_id ILIKE '%yearly%'
                 OR razorpay_plan_id ILIKE '%annual%'
            THEN INTERVAL '365 days'
            ELSE INTERVAL '30 days'
          END
        ELSE NULL
      END
    ),
    payment_status,
    razorpay_payment_id
  INTO
    v_sub_status,
    v_sub_plan,
    v_razorpay_plan_id,
    v_trial_end,
    v_current_period_end,
    v_payment_status,
    v_payment_id
  FROM public.subscriptions
  WHERE owner_id = v_owner_id
  ORDER BY
    CASE
      -- Priority 1: Unexpired paid subscription with positive payment proof
      WHEN (
        (payment_status = 'paid' OR (status = 'active' AND razorpay_payment_id IS NOT NULL AND COALESCE(payment_status, '') NOT IN ('pending', 'failed', 'unverified')))
        AND COALESCE(payment_status, '') <> 'refunded'
        AND COALESCE(
          current_period_end,
          CASE
            WHEN razorpay_payment_id IS NOT NULL AND status = 'active' THEN
              COALESCE(current_period_start, created_at) +
              CASE
                WHEN plan IN ('yearly', 'pro')
                     OR razorpay_plan_id IN ('plan_TpRGUbldZHOv7X', 'plan_TpRGVTZfY46Jki', 'plan_TpRGW532F4cyqm')
                     OR razorpay_plan_id ILIKE '%yearly%'
                     OR razorpay_plan_id ILIKE '%annual%'
                THEN INTERVAL '365 days'
                ELSE INTERVAL '30 days'
              END
            ELSE NULL
          END
        ) > timezone('utc'::text, now())
      ) THEN 1

      -- Priority 2: Unexpired 7-day free trial (strictly bounded)
      WHEN (
        status = 'trialing'
        AND COALESCE(trial_end, created_at + INTERVAL '7 days') > timezone('utc'::text, now())
      ) THEN 2

      ELSE 3
    END,
    -- Secondary Tie-Breaker 1: Furthest derived period end (matching primary calculation exactly)
    COALESCE(
      current_period_end,
      CASE
        WHEN razorpay_payment_id IS NOT NULL AND status = 'active' THEN
          COALESCE(current_period_start, created_at) +
          CASE
            WHEN plan IN ('yearly', 'pro')
                 OR razorpay_plan_id IN ('plan_TpRGUbldZHOv7X', 'plan_TpRGVTZfY46Jki', 'plan_TpRGW532F4cyqm')
                 OR razorpay_plan_id ILIKE '%yearly%'
                 OR razorpay_plan_id ILIKE '%annual%'
            THEN INTERVAL '365 days'
            ELSE INTERVAL '30 days'
          END
        ELSE NULL
      END,
      '1970-01-01'::timestamptz
    ) DESC,
    -- Secondary Tie-Breaker 2: Furthest derived trial end
    COALESCE(trial_end, created_at + INTERVAL '7 days', '1970-01-01'::timestamptz) DESC,
    -- Secondary Tie-Breaker 3: Created at DESC (immutable creation order)
    created_at DESC,
    -- Secondary Tie-Breaker 4: String ID comparison for total ordering
    id DESC
  LIMIT 1;

  -- 3. Paid/Trial Access Evaluation
  -- Rule A: Valid paid subscription backed by positive payment proof & unexpired period
  -- Requires payment_status = 'paid' or verified active subscription with valid payment ID.
  -- Mere payment ID with pending, failed, unverified, or refunded status is strictly rejected.
  IF (
    (v_payment_status = 'paid' OR (v_sub_status = 'active' AND v_payment_id IS NOT NULL AND COALESCE(v_payment_status, '') NOT IN ('pending', 'failed', 'unverified')))
    AND COALESCE(v_payment_status, '') <> 'refunded'
    AND v_current_period_end > timezone('utc'::text, now())
  ) THEN
    v_has_paid_access := true;

  -- Rule B: Valid unexpired 7-day free trial (strictly bounded)
  ELSIF (
    v_sub_status = 'trialing'
    AND v_trial_end > timezone('utc'::text, now())
  ) THEN
    v_has_paid_access := true;

  -- Rule C: Brand-new user before subscription row creation (bounded to profile created_at + 7 days)
  ELSIF v_sub_status IS NULL THEN
    SELECT (created_at + INTERVAL '7 days' > timezone('utc'::text, now()))
    INTO v_has_paid_access
    FROM public.profiles
    WHERE id = v_owner_id;

    v_has_paid_access := COALESCE(v_has_paid_access, false);

  ELSE
    v_has_paid_access := false;
  END IF;

  IF NOT v_has_paid_access THEN
    RAISE EXCEPTION 'Your free trial or subscription has expired. Please upgrade your plan to create properties.'
      USING ERRCODE = 'P0001';
  END IF;

  -- 4. Map Winning Plan & Plan ID to Property Limit by tier (independent of billing frequency):
  -- Resolve actual tier from plan string and razorpay_plan_id to ensure legacy 'yearly' or 'monthly'
  -- subscriptions are assigned the correct property limit based on their actual tier, not billing frequency.
  -- Do not assume every yearly subscription is Growth. Preserve existing customer entitlements.
  IF v_sub_plan = 'starter'
     OR v_sub_plan ILIKE 'starter%'
     OR v_razorpay_plan_id = 'plan_TpRGUbldZHOv7X'
     OR v_razorpay_plan_id = 'plan_TpRGUMBC93C99j'
     OR v_razorpay_plan_id ILIKE '%starter%' THEN
    v_max_properties := 2;
  ELSIF v_sub_plan = 'business'
     OR v_sub_plan ILIKE 'business%'
     OR v_razorpay_plan_id = 'plan_TpRGW532F4cyqm'
     OR v_razorpay_plan_id = 'plan_TpRGVuFWE8PB2H'
     OR v_razorpay_plan_id ILIKE '%business%' THEN
    v_max_properties := 9;
  ELSIF v_sub_plan = 'enterprise'
     OR v_sub_plan ILIKE 'enterprise%'
     OR v_razorpay_plan_id ILIKE '%enterprise%' THEN
    v_max_properties := 999;
  ELSIF v_sub_plan = 'growth'
     OR v_sub_plan ILIKE 'growth%'
     OR v_sub_plan = 'pro'
     OR v_sub_plan = 'yearly'
     OR v_razorpay_plan_id = 'plan_TpRGVTZfY46Jki'
     OR v_razorpay_plan_id = 'plan_TpRGUxerOQTJtX'
     OR v_razorpay_plan_id ILIKE '%growth%'
     OR v_razorpay_plan_id ILIKE '%pro%' THEN
    -- Preserves legacy yearly / pro customer entitlements (5 properties) when actual tier is Growth / Pro
    v_max_properties := 5;
  ELSE
    -- Default fallback for trial, legacy monthly without tier ID, or unknown plans: 2 properties
    v_max_properties := 2;
  END IF;

  -- 5. Enforce Limit
  SELECT count(*) INTO v_current_count
  FROM public.properties
  WHERE owner_id = v_owner_id
    AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

  IF v_current_count >= v_max_properties THEN
    RAISE EXCEPTION 'Property limit reached. Your subscription includes up to % properties. Please upgrade your plan to add more properties.', v_max_properties
      USING ERRCODE = 'P0002';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- 6. Re-attach trigger to public.properties
DROP TRIGGER IF EXISTS trg_enforce_property_limit ON public.properties;

CREATE TRIGGER trg_enforce_property_limit
  BEFORE INSERT ON public.properties
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_property_limit();
