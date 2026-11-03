-- ==============================================================================
-- Migration: 20261103000001_fix_subscription_sync_and_lifecycle.sql
-- Description: Comprehensive, idempotent production fix for Razorpay subscription
--              synchronization, lifecycle tracking, and schema compatibility:
--              1. Adds 'created' to subscriptions_status_check constraint safely.
--              2. Broadens subscriptions_plan_check to support canonical & legacy tiers.
--              3. Ensures all lifecycle tracking columns exist on public.subscriptions.
--              4. Ensures all atomic lease & fencing columns exist on public.razorpay_webhook_events
--                 with created_at DEFAULT now() and status DEFAULT 'pending'.
--              5. Reconciles existing webhook event records non-destructively:
--                 - Corrects events marked 'completed' in error (due to production DEFAULT 'completed')
--                   back to 'pending' if no evidence exists that they were applied to subscriptions.
--                 - Preserves 'completed' status for verified, already-processed events (idempotency).
--                 - Marks events with errors as 'failed'.
--                 - Never marks historical events completed merely based on elapsed time.
--              6. Detects equivalent unique constraints on public.subscriptions(owner_id)
--                 using indnkeyatts = 1 to verify owner_id is the sole unique key column.
--                 INCLUDE columns do not cause an otherwise valid unique index to be ignored.
--              7. Creates targeted performance indexes (avoiding duplicates).
--              8. Safe rollback instructions that preserve pre-existing constraints and indexes.
-- ==============================================================================

-- 1. Upgrade subscriptions_status_check to include 'created'
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.subscriptions'::regclass
      AND conname = 'subscriptions_status_check'
  ) THEN
    ALTER TABLE public.subscriptions DROP CONSTRAINT subscriptions_status_check;
  END IF;

  ALTER TABLE public.subscriptions
    ADD CONSTRAINT subscriptions_status_check
    CHECK (status IN ('trialing', 'active', 'past_due', 'canceled', 'expired', 'created'));
END $$;

-- 2. Upgrade subscriptions_plan_check to support canonical (starter, growth, business, enterprise)
--    and legacy/billing-mapped tiers (yearly, monthly, pro, trial)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.subscriptions'::regclass
      AND conname = 'subscriptions_plan_check'
  ) THEN
    ALTER TABLE public.subscriptions DROP CONSTRAINT subscriptions_plan_check;
  END IF;

  ALTER TABLE public.subscriptions
    ADD CONSTRAINT subscriptions_plan_check
    CHECK (plan IN ('trial', 'starter', 'growth', 'business', 'enterprise', 'pro', 'yearly', 'monthly'));
END $$;

-- 3. Ensure all lifecycle tracking columns exist on public.subscriptions
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS autopay_status TEXT DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ;

-- 4. Ensure atomic lease & idempotency tracking columns exist on public.razorpay_webhook_events
-- Note: status defaults to 'pending' (NOT 'completed') so that unprocessed events are never prematurely acknowledged.
-- created_at defaults to now().
ALTER TABLE public.razorpay_webhook_events
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS error TEXT,
  ADD COLUMN IF NOT EXISTS lease_token TEXT,
  ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ;

-- Ensure defaults on existing columns are aligned to safe values
ALTER TABLE public.razorpay_webhook_events
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN status SET DEFAULT 'pending';

-- Backfill created_at from processed_at for existing rows where created_at is null
UPDATE public.razorpay_webhook_events
SET created_at = processed_at
WHERE created_at IS NULL AND processed_at IS NOT NULL;

UPDATE public.razorpay_webhook_events
SET created_at = now()
WHERE created_at IS NULL;

-- 5. Safe, evidence-based reconciliation of public.razorpay_webhook_events.status
-- Invariant: Existing rows may have been incorrectly marked 'completed' due to a manual
-- column addition with DEFAULT 'completed' in production.
-- 1. Rows with recorded errors are marked 'failed'.
-- 2. Rows with verified evidence of successful processing in public.subscriptions remain 'completed'.
-- 3. Subscription lifecycle events marked 'completed' WITHOUT evidence of successful processing
--    must NOT remain incorrectly marked 'completed'. They are safely reset to 'pending'
--    so that Razorpay re-delivery or replay can successfully process them.
-- 4. Legitimate, already-processed events are NEVER reset to pending (preserving idempotency).
-- 5. Historical events are NEVER marked completed merely based on elapsed time.
DO $$
BEGIN
  -- 5a. Rows with recorded error are marked 'failed'
  UPDATE public.razorpay_webhook_events
  SET status = 'failed'
  WHERE error IS NOT NULL AND status <> 'failed';

  -- 5b. Subscription charge / activation events:
  -- Reset from 'completed' to 'pending' ONLY IF there is NO evidence of successful processing
  -- in public.subscriptions (i.e. neither the subscription ID nor payment ID exists with payment_status = 'paid').
  UPDATE public.razorpay_webhook_events we
  SET status = 'pending', lease_token = NULL, lease_expires_at = NULL
  WHERE we.status = 'completed'
    AND we.error IS NULL
    AND we.event_type IN ('subscription.charged', 'subscription.activated')
    AND NOT EXISTS (
      SELECT 1 FROM public.subscriptions s
      WHERE (
        s.razorpay_subscription_id = we.payload->'payload'->'subscription'->'entity'->>'id'
        OR s.razorpay_subscription_id = we.payload->'payload'->'payment'->'entity'->>'subscription_id'
        OR s.razorpay_payment_id = we.payload->'payload'->'payment'->'entity'->>'id'
      )
      AND s.payment_status = 'paid'
    );

  -- 5c. Cancellation events:
  -- Reset from 'completed' to 'pending' ONLY IF the subscription was never marked 'canceled'.
  UPDATE public.razorpay_webhook_events we
  SET status = 'pending', lease_token = NULL, lease_expires_at = NULL
  WHERE we.status = 'completed'
    AND we.error IS NULL
    AND we.event_type IN ('subscription.cancelled', 'mandate.revoked', 'mandate.cancelled')
    AND NOT EXISTS (
      SELECT 1 FROM public.subscriptions s
      WHERE s.razorpay_subscription_id = we.payload->'payload'->'subscription'->'entity'->>'id'
        AND s.status = 'canceled'
    );

  -- 5d. Subscription authenticated events:
  -- Reset from 'completed' to 'pending' ONLY IF the subscription was never marked trialing/active.
  UPDATE public.razorpay_webhook_events we
  SET status = 'pending', lease_token = NULL, lease_expires_at = NULL
  WHERE we.status = 'completed'
    AND we.error IS NULL
    AND we.event_type = 'subscription.authenticated'
    AND NOT EXISTS (
      SELECT 1 FROM public.subscriptions s
      WHERE s.razorpay_subscription_id = we.payload->'payload'->'subscription'->'entity'->>'id'
        AND (s.status IN ('trialing', 'active') OR s.autopay_status = 'active')
    );
END $$;

-- 6. Detect equivalent unique constraints on subscriptions.owner_id regardless of name
-- Uses PostgreSQL indnkeyatts = 1 to verify owner_id is the sole unique key column.
-- INCLUDE columns (indnatts > indnkeyatts) do not cause an otherwise valid unique index to be ignored.
DO $$
DECLARE
  v_existing_uq TEXT;
  v_dup_count INTEGER;
  v_dup_owners TEXT;
BEGIN
  SELECT c.relname INTO v_existing_uq
  FROM pg_index i
  JOIN pg_class c ON c.oid = i.indexrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
  WHERE i.indrelid = 'public.subscriptions'::regclass
    AND i.indisunique = true
    AND i.indnkeyatts = 1
    AND a.attname = 'owner_id'
    AND NOT a.attisdropped
    AND i.indpred IS NULL
  LIMIT 1;

  IF v_existing_uq IS NOT NULL THEN
    RAISE NOTICE 'An equivalent unique constraint/index on subscriptions(owner_id) already exists: "%". Skipping addition.', v_existing_uq;
  ELSE
    -- Non-destructive duplicate check: verify no duplicates exist before adding constraint
    SELECT COUNT(*), string_agg(owner_id::text, ', ')
    INTO v_dup_count, v_dup_owners
    FROM (
      SELECT owner_id
      FROM public.subscriptions
      GROUP BY owner_id
      HAVING COUNT(*) > 1
    ) dups;

    IF v_dup_count > 0 THEN
      RAISE WARNING 'Cannot automatically apply unique constraint uq_subscriptions_owner: % duplicate owner(s) detected: (%). Please reconcile duplicate subscription rows manually before enforcing uniqueness.', v_dup_count, v_dup_owners;
    ELSE
      ALTER TABLE public.subscriptions
        ADD CONSTRAINT uq_subscriptions_owner UNIQUE (owner_id);
      RAISE NOTICE 'Successfully added unique constraint uq_subscriptions_owner on subscriptions(owner_id).';
    END IF;
  END IF;
END $$;

-- 7. Performance Indexes (Targeted; pre-existing indexes from prior migrations are preserved)
-- Pre-existing from prior migrations:
--   idx_subscriptions_owner (20260927000001)
--   idx_subscriptions_status (20260927000001)
--   idx_subscriptions_rzp_sub (20261010000001)
--   idx_subscriptions_period_end (20261028000001)
--   idx_subscriptions_autopay_status (20261028000001)
--   idx_rzp_webhook_events_status (20261028000001)
--   idx_rzp_webhook_events_lease (20261028000001)
--
-- Only add indexes that were NOT in prior migrations:
CREATE INDEX IF NOT EXISTS idx_subscriptions_payment_status
  ON public.subscriptions(payment_status);

CREATE INDEX IF NOT EXISTS idx_rzp_webhook_events_created_at
  ON public.razorpay_webhook_events(created_at);

-- ==============================================================================
-- ROLLBACK SCRIPT (Run only to revert changes introduced solely by this migration):
--
-- IMPORTANT SAFETY RULES:
-- 1. Never drop pre-existing unique constraint `uq_subscriptions_owner` or any
--    equivalent unique constraint created by the baseline migration (20260927000001).
-- 2. Never drop pre-existing indexes (idx_subscriptions_owner, idx_subscriptions_status,
--    idx_subscriptions_rzp_sub, idx_subscriptions_period_end, idx_subscriptions_autopay_status,
--    idx_rzp_webhook_events_status, idx_rzp_webhook_events_lease, idx_rzp_webhook_events_id).
-- 3. Only drop indexes created solely by this migration.
--
-- -- Revert new indexes:
-- DROP INDEX IF EXISTS public.idx_rzp_webhook_events_created_at;
-- DROP INDEX IF EXISTS public.idx_subscriptions_payment_status;
--
-- -- Revert status check constraint safely:
-- DO $$
-- BEGIN
--   IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.subscriptions'::regclass AND conname = 'subscriptions_status_check') THEN
--     -- Check if any row has status = 'created' before restoring narrower constraint
--     IF EXISTS (SELECT 1 FROM public.subscriptions WHERE status = 'created') THEN
--       UPDATE public.subscriptions SET status = 'expired' WHERE status = 'created';
--     END IF;
--     ALTER TABLE public.subscriptions DROP CONSTRAINT subscriptions_status_check;
--     ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_status_check CHECK (status IN ('trialing', 'active', 'past_due', 'canceled', 'expired'));
--   END IF;
-- END $$;
--
-- -- Revert plan check constraint safely:
-- DO $$
-- BEGIN
--   IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.subscriptions'::regclass AND conname = 'subscriptions_plan_check') THEN
--     -- Map extended plans to legacy tiers before restoring narrower constraint
--     UPDATE public.subscriptions SET plan = 'pro' WHERE plan IN ('business', 'enterprise', 'yearly');
--     UPDATE public.subscriptions SET plan = 'growth' WHERE plan = 'monthly';
--     ALTER TABLE public.subscriptions DROP CONSTRAINT subscriptions_plan_check;
--     ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_plan_check CHECK (plan IN ('trial', 'starter', 'growth', 'pro'));
--   END IF;
-- END $$;
-- ==============================================================================
