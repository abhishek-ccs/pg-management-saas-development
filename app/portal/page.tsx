import { redirect } from 'next/navigation'
import {
  hashToken,
  setTenantSessionCookie,
  getTenantSession,
  clearTenantSessionCookie,
} from '@/lib/tenant-access'
import { createAdminClient } from '@/lib/supabase/server'
import PortalView from './PortalView'
import { AlertTriangle, Building2, ShieldAlert } from 'lucide-react'

export const dynamic = 'force-dynamic'

interface PortalPageProps {
  searchParams: Promise<{ token?: string }>
}

export default async function TenantPortalPage({ searchParams }: PortalPageProps) {
  const params = await searchParams
  const rawToken = params?.token?.trim()

  // 1. Token Exchange: If token is provided in URL, validate and convert to secure HttpOnly session
  if (rawToken) {
    const tokenHash = hashToken(rawToken)
    const admin = await createAdminClient()

    const { data: record, error } = await admin
      .from('tenant_access_tokens')
      .select('id, tenant_id, owner_id, expires_at, revoked_at')
      .eq('token_hash', tokenHash)
      .maybeSingle()

    // Validation checks
    const nowMs = Date.now()
    const isExpired = record ? new Date(record.expires_at).getTime() < nowMs : false
    const isRevoked = record ? !!record.revoked_at : false

    if (error || !record || isExpired || isRevoked) {
      return (
        <div className="min-h-screen bg-[#faf7f2] flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl border border-[#ebe4da] bg-white p-8 text-center shadow-sm">
            <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#fff5f5] text-[#b95c3c]">
              <AlertTriangle className="size-6" />
            </div>
            <h2 className="mt-4 text-lg font-bold text-[#2c221e]">Access Link Expired or Invalid</h2>
            <p className="mt-2 text-xs leading-relaxed text-[#676b7d]">
              {isRevoked
                ? 'This access link was revoked by property management. Please ask your property owner for an updated link.'
                : isExpired
                ? 'This access link has expired. Please contact your property manager to receive a new link.'
                : 'This link is not recognized. Please check the URL or request an active link from your property manager.'}
            </p>
            <div className="mt-6 border-t border-[#f0ebe3] pt-4 text-[11px] text-[#85899a]">
              BaseraBook Secure Resident Access Architecture
            </div>
          </div>
        </div>
      )
    }

    // Record access metrics
    await admin
      .from('tenant_access_tokens')
      .update({
        last_accessed_at: new Date().toISOString(),
        access_count: (record as any).access_count ? (record as any).access_count + 1 : 1,
      })
      .eq('id', record.id)

    // Set secure HttpOnly session cookie
    await setTenantSessionCookie({
      tenantId: record.tenant_id,
      ownerId: record.owner_id,
      tokenId: record.id,
      expiresAt: new Date(record.expires_at).getTime(),
    })

    // Immediately redirect to clean /portal URL (stripping token from address bar and history)
    redirect('/portal')
  }

  // 2. Cookie Verification: Check existing session cookie
  const session = await getTenantSession()

  if (!session) {
    return (
      <div className="min-h-screen bg-[#faf7f2] flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md rounded-3xl border border-[#ebe4da] bg-white p-8 text-center shadow-sm">
          <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#faf7f2] border border-[#e8dfd4] text-[#8b5a2b]">
            <Building2 className="size-6" />
          </div>
          <h2 className="mt-4 text-lg font-bold text-[#2c221e]">Resident Self-Service Portal</h2>
          <p className="mt-2 text-xs leading-relaxed text-[#676b7d]">
            To access your rent bills, payment receipts, and electricity calculations, please open the private link provided by your property manager.
          </p>
          <div className="mt-6 border-t border-[#f0ebe3] pt-4 text-[11px] text-[#85899a]">
            Protected by BaseraBook cryptographic link authorization
          </div>
        </div>
      </div>
    )
  }

  // 3. Server Action to Logout
  async function handleLogout() {
    'use server'
    await clearTenantSessionCookie()
    redirect('/portal')
  }

  return <PortalView onLogout={handleLogout} />
}
