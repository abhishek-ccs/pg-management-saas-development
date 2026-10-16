-- ==============================================================================
-- Migration: 20261015000003_secure_tenant_access.sql
-- Description: Add tenant_access_tokens table for Secure Tenant Self-Service Link.
--              Stores cryptographically hashed tokens, expiration, revocation,
--              and audit tracking. Enforces strict RLS.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.tenant_access_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  token_preview TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ DEFAULT NULL,
  last_accessed_at TIMESTAMPTZ DEFAULT NULL,
  access_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_tenant_access_tokens_hash 
  ON public.tenant_access_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_tenant_access_tokens_tenant 
  ON public.tenant_access_tokens(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_access_tokens_owner 
  ON public.tenant_access_tokens(owner_id);
CREATE INDEX IF NOT EXISTS idx_tenant_access_tokens_expires 
  ON public.tenant_access_tokens(expires_at);

ALTER TABLE public.tenant_access_tokens ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'tenant_access_tokens' 
    AND policyname = 'tenant_access_tokens_owner_select'
  ) THEN
    CREATE POLICY "tenant_access_tokens_owner_select" 
      ON public.tenant_access_tokens 
      FOR SELECT USING (owner_id = auth.uid() OR public.is_super_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'tenant_access_tokens' 
    AND policyname = 'tenant_access_tokens_owner_insert'
  ) THEN
    CREATE POLICY "tenant_access_tokens_owner_insert" 
      ON public.tenant_access_tokens 
      FOR INSERT WITH CHECK (owner_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'tenant_access_tokens' 
    AND policyname = 'tenant_access_tokens_owner_update'
  ) THEN
    CREATE POLICY "tenant_access_tokens_owner_update" 
      ON public.tenant_access_tokens 
      FOR UPDATE USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'tenant_access_tokens' 
    AND policyname = 'tenant_access_tokens_owner_delete'
  ) THEN
    CREATE POLICY "tenant_access_tokens_owner_delete" 
      ON public.tenant_access_tokens 
      FOR DELETE USING (owner_id = auth.uid());
  END IF;
END $$;
