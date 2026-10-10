-- ==============================================================================
-- Migration: 20261010000001_razorpay_subscriptions.sql
-- Description: Add Razorpay subscription tracking columns to subscriptions
--              and idempotency logging table for Razorpay webhooks.
-- ==============================================================================

-- 1. Add Razorpay tracking columns to public.subscriptions (non-destructive)
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS razorpay_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS razorpay_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS razorpay_plan_id TEXT,
  ADD COLUMN IF NOT EXISTS razorpay_payment_id TEXT;

CREATE INDEX IF NOT EXISTS idx_subscriptions_rzp_sub 
  ON public.subscriptions(razorpay_subscription_id);

-- 2. Create idempotency table to prevent duplicate processing of webhook retries
CREATE TABLE IF NOT EXISTS public.razorpay_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  payload JSONB,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_rzp_webhook_events_id 
  ON public.razorpay_webhook_events(event_id);

ALTER TABLE public.razorpay_webhook_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'razorpay_webhook_events' 
    AND policyname = 'rzp_webhook_admin_only'
  ) THEN
    CREATE POLICY "rzp_webhook_admin_only" 
      ON public.razorpay_webhook_events 
      FOR ALL USING (public.is_super_admin());
  END IF;
END $$;
