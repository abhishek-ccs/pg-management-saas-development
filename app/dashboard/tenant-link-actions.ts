'use server'

import { createClient } from '@/lib/supabase/server'
import { generateTenantToken, DEFAULT_LINK_EXPIRY_DAYS } from '@/lib/tenant-access'

export interface TenantLinkStatusResult {
  success: boolean
  error?: string
  status?: 'none' | 'active' | 'expired' | 'revoked'
  tokenPreview?: string
  expiresAt?: string
  revokedAt?: string | null
  lastAccessedAt?: string | null
  accessCount?: number
}

export interface GenerateLinkResult {
  success: boolean
  error?: string
  url?: string
  tokenPreview?: string
  expiresAt?: string
}

/**
 * Server Action: Generates a cryptographically secure, high-entropy self-service link for a tenant.
 * Automatically revokes any previous active tokens for this tenant.
 */
export async function generateTenantLinkAction(
  tenantId: string,
  expiryDays: number = DEFAULT_LINK_EXPIRY_DAYS
): Promise<GenerateLinkResult> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()

    if (authErr || !user) {
      return { success: false, error: 'Your session has expired. Please sign in again.' }
    }

    // 1. Verify tenant exists and belongs to the authenticated owner
    const { data: tenant, error: tenantErr } = await supabase
      .from('tenants')
      .select('id, full_name, phone, property_id')
      .eq('id', tenantId)
      .eq('owner_id', user.id)
      .maybeSingle()

    if (tenantErr || !tenant) {
      return { success: false, error: 'Tenant record not found or access denied.' }
    }

    // 2. Revoke any prior active tokens for this resident
    await supabase
      .from('tenant_access_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('tenant_id', tenantId)
      .eq('owner_id', user.id)
      .is('revoked_at', null)

    // 3. Generate high-entropy token pair (raw token + hash)
    const { rawToken, tokenHash, tokenPreview } = generateTenantToken()
    const validDays = Math.min(Math.max(expiryDays, 1), 90)
    const expiresAt = new Date(Date.now() + validDays * 24 * 60 * 60 * 1000).toISOString()

    // 4. Store ONLY the token hash in the database
    const { error: insertErr } = await supabase
      .from('tenant_access_tokens')
      .insert({
        owner_id: user.id,
        tenant_id: tenantId,
        token_hash: tokenHash,
        token_preview: tokenPreview,
        expires_at: expiresAt,
      })

    if (insertErr) {
      return { success: false, error: 'Failed to generate secure access token in database.' }
    }

    // 5. Construct URL (rawToken is only returned here once to the owner)
    const portalUrl = `/portal?token=${encodeURIComponent(rawToken)}`

    return {
      success: true,
      url: portalUrl,
      tokenPreview,
      expiresAt,
    }
  } catch (err: any) {
    return { success: false, error: err?.message || 'An unexpected error occurred while generating link.' }
  }
}

/**
 * Server Action: Revokes all active access links for a tenant immediately.
 */
export async function revokeTenantLinkAction(
  tenantId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()

    if (authErr || !user) {
      return { success: false, error: 'Your session has expired. Please sign in again.' }
    }

    const { error: updateErr } = await supabase
      .from('tenant_access_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('tenant_id', tenantId)
      .eq('owner_id', user.id)
      .is('revoked_at', null)

    if (updateErr) {
      return { success: false, error: 'Failed to revoke tenant access link.' }
    }

    return { success: true }
  } catch (err: any) {
    return { success: false, error: err?.message || 'Unexpected error while revoking link.' }
  }
}

/**
 * Server Action: Queries current link status for a tenant.
 */
export async function getTenantLinkStatusAction(
  tenantId: string
): Promise<TenantLinkStatusResult> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()

    if (authErr || !user) {
      return { success: false, error: 'Your session has expired. Please sign in again.' }
    }

    const { data: record, error } = await supabase
      .from('tenant_access_tokens')
      .select('id, token_preview, expires_at, revoked_at, last_accessed_at, access_count')
      .eq('tenant_id', tenantId)
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error || !record) {
      return { success: true, status: 'none' }
    }

    if (record.revoked_at) {
      return {
        success: true,
        status: 'revoked',
        tokenPreview: record.token_preview,
        expiresAt: record.expires_at,
        revokedAt: record.revoked_at,
        lastAccessedAt: record.last_accessed_at,
        accessCount: record.access_count,
      }
    }

    const isExpired = new Date(record.expires_at).getTime() < Date.now()
    if (isExpired) {
      return {
        success: true,
        status: 'expired',
        tokenPreview: record.token_preview,
        expiresAt: record.expires_at,
        lastAccessedAt: record.last_accessed_at,
        accessCount: record.access_count,
      }
    }

    return {
      success: true,
      status: 'active',
      tokenPreview: record.token_preview,
      expiresAt: record.expires_at,
      lastAccessedAt: record.last_accessed_at,
      accessCount: record.access_count,
    }
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to check link status.' }
  }
}
