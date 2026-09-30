-- ==============================================================================
-- Migration: 20260930000003_owner_control_and_audit.sql
-- Description: Adds rent due day, soft-deletes, audit logging, RPCs, and super admin security
-- ==============================================================================

-- 1. Extend profiles with MFA, password change, and language preferences
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferred_language TEXT DEFAULT 'en' CHECK (preferred_language IN ('en', 'hi')),
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS mfa_enrolled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS mfa_secret TEXT;

-- 2. Extend tenants with rent due day and soft-deletion timestamp
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS rent_due_day INT DEFAULT 5 CHECK (rent_due_day BETWEEN 1 AND 31),
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_tenants_deleted_at ON public.tenants(deleted_at);

-- 3. Extend payments with month covered and soft-deletion timestamp
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS month_covered TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_payments_deleted_at ON public.payments(deleted_at);

-- 4. Create public.audit_logs table for enterprise audit trail
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  action TEXT NOT NULL,
  old_values JSONB,
  new_values JSONB,
  reason TEXT,
  performed_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  performed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_owner ON public.audit_logs(owner_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_performed_at ON public.audit_logs(performed_at DESC);

-- Enable RLS on audit_logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners can view own audit logs" ON public.audit_logs;
CREATE POLICY "Owners can view own audit logs"
  ON public.audit_logs FOR SELECT
  USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "Super admins can view all audit logs" ON public.audit_logs;
CREATE POLICY "Super admins can view all audit logs"
  ON public.audit_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin'
    )
  );

DROP POLICY IF EXISTS "System can insert audit logs" ON public.audit_logs;
CREATE POLICY "System can insert audit logs"
  ON public.audit_logs FOR INSERT
  WITH CHECK (owner_id = auth.uid() OR auth.uid() IS NULL);

-- 5. RPC: Atomic soft-delete of a payment record
CREATE OR REPLACE FUNCTION public.soft_delete_payment(
  p_payment_id UUID,
  p_reason TEXT DEFAULT 'Deleted by owner'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_owner_id UUID := auth.uid();
  v_old_payment RECORD;
  v_result JSONB;
BEGIN
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  SELECT * INTO v_old_payment
  FROM public.payments
  WHERE id = p_payment_id AND owner_id = v_owner_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment record not found or access denied.';
  END IF;

  IF v_old_payment.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Payment record is already deleted.';
  END IF;

  -- Soft delete
  UPDATE public.payments
  SET deleted_at = timezone('utc'::text, now())
  WHERE id = p_payment_id AND owner_id = v_owner_id;

  -- Insert audit log
  INSERT INTO public.audit_logs (
    owner_id,
    entity_type,
    entity_id,
    action,
    old_values,
    new_values,
    reason,
    performed_by
  ) VALUES (
    v_owner_id,
    'payment',
    p_payment_id,
    'soft_deleted',
    to_jsonb(v_old_payment),
    jsonb_build_object('deleted_at', timezone('utc'::text, now())),
    p_reason,
    v_owner_id
  );

  v_result := jsonb_build_object(
    'success', true,
    'payment_id', p_payment_id,
    'deleted_at', timezone('utc'::text, now())
  );

  RETURN v_result;
END;
$$;

-- 6. RPC: Atomic restore of a soft-deleted payment record
CREATE OR REPLACE FUNCTION public.restore_payment(
  p_payment_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_owner_id UUID := auth.uid();
  v_old_payment RECORD;
  v_result JSONB;
BEGIN
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  SELECT * INTO v_old_payment
  FROM public.payments
  WHERE id = p_payment_id AND owner_id = v_owner_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment record not found or access denied.';
  END IF;

  -- Restore
  UPDATE public.payments
  SET deleted_at = NULL
  WHERE id = p_payment_id AND owner_id = v_owner_id;

  -- Insert audit log
  INSERT INTO public.audit_logs (
    owner_id,
    entity_type,
    entity_id,
    action,
    old_values,
    new_values,
    reason,
    performed_by
  ) VALUES (
    v_owner_id,
    'payment',
    p_payment_id,
    'restored',
    to_jsonb(v_old_payment),
    jsonb_build_object('deleted_at', null),
    'Restored by owner',
    v_owner_id
  );

  v_result := jsonb_build_object(
    'success', true,
    'payment_id', p_payment_id
  );

  RETURN v_result;
END;
$$;

-- 7. RPC: Atomic soft-delete of a tenant record
CREATE OR REPLACE FUNCTION public.soft_delete_tenant(
  p_tenant_id UUID,
  p_reason TEXT DEFAULT 'Deleted by owner'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_owner_id UUID := auth.uid();
  v_old_tenant RECORD;
  v_result JSONB;
BEGIN
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  SELECT * INTO v_old_tenant
  FROM public.tenants
  WHERE id = p_tenant_id AND owner_id = v_owner_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tenant record not found or access denied.';
  END IF;

  -- Soft delete tenant
  UPDATE public.tenants
  SET deleted_at = timezone('utc'::text, now()),
      status = 'Vacated'
  WHERE id = p_tenant_id AND owner_id = v_owner_id;

  -- Free up bed if occupied
  IF v_old_tenant.bed_id IS NOT NULL THEN
    UPDATE public.beds
    SET status = 'available'
    WHERE id = v_old_tenant.bed_id;
  END IF;

  -- Insert audit log
  INSERT INTO public.audit_logs (
    owner_id,
    entity_type,
    entity_id,
    action,
    old_values,
    new_values,
    reason,
    performed_by
  ) VALUES (
    v_owner_id,
    'tenant',
    p_tenant_id,
    'soft_deleted',
    to_jsonb(v_old_tenant),
    jsonb_build_object('deleted_at', timezone('utc'::text, now()), 'status', 'Vacated'),
    p_reason,
    v_owner_id
  );

  v_result := jsonb_build_object(
    'success', true,
    'tenant_id', p_tenant_id
  );

  RETURN v_result;
END;
$$;

-- 8. RPC: Atomic restore of a soft-deleted tenant
CREATE OR REPLACE FUNCTION public.restore_tenant(
  p_tenant_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_owner_id UUID := auth.uid();
  v_old_tenant RECORD;
  v_result JSONB;
BEGIN
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  SELECT * INTO v_old_tenant
  FROM public.tenants
  WHERE id = p_tenant_id AND owner_id = v_owner_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tenant record not found or access denied.';
  END IF;

  -- Restore tenant
  UPDATE public.tenants
  SET deleted_at = NULL,
      status = 'Pending'
  WHERE id = p_tenant_id AND owner_id = v_owner_id;

  -- Re-occupy bed if still assigned and available
  IF v_old_tenant.bed_id IS NOT NULL THEN
    UPDATE public.beds
    SET status = 'occupied'
    WHERE id = v_old_tenant.bed_id AND status = 'available';
  END IF;

  -- Insert audit log
  INSERT INTO public.audit_logs (
    owner_id,
    entity_type,
    entity_id,
    action,
    old_values,
    new_values,
    reason,
    performed_by
  ) VALUES (
    v_owner_id,
    'tenant',
    p_tenant_id,
    'restored',
    to_jsonb(v_old_tenant),
    jsonb_build_object('deleted_at', null, 'status', 'Pending'),
    'Restored by owner',
    v_owner_id
  );

  v_result := jsonb_build_object(
    'success', true,
    'tenant_id', p_tenant_id
  );

  RETURN v_result;
END;
$$;

-- 9. Protect Platform Super Admins from direct deletion
CREATE OR REPLACE FUNCTION public.protect_super_admin_deletion()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.role = 'super_admin' THEN
    RAISE EXCEPTION 'Super Administrator accounts cannot be deleted directly.';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_super_admin ON public.profiles;
CREATE TRIGGER trg_protect_super_admin
BEFORE DELETE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.protect_super_admin_deletion();
