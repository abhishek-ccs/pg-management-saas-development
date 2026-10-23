
import { NextRequest, NextResponse } from 'next/server'
import {
  hashToken,
  setTenantSessionCookie,
} from '@/lib/tenant-access'
import { createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const rawToken = request.nextUrl.searchParams.get('token')?.trim()

  if (!rawToken) {
    return NextResponse.redirect(new URL('/portal', request.url))
  }

  const admin = await createAdminClient()
  const tokenHash = hashToken(rawToken)

  const { data: record, error } = await admin
    .from('tenant_access_tokens')
    .select('id, tenant_id, owner_id, expires_at, revoked_at')
    .eq('token_hash', tokenHash)
    .maybeSingle()

  if (
    error ||
    !record ||
    record.revoked_at ||
    new Date(record.expires_at).getTime() <= Date.now()
  ) {
    return NextResponse.redirect(
      new URL('/portal?error=invalid-link', request.url)
    )
  }

  const response = NextResponse.redirect(new URL('/portal', request.url))

  const expiresAt = new Date(record.expires_at).getTime()
  const maxAge = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000))

  // Set cookie on the Route Handler's response.
  const { signTenantSession, TENANT_SESSION_COOKIE } = await import('@/lib/tenant-access')
  const sessionToken = signTenantSession({
    tenantId: record.tenant_id,
    ownerId: record.owner_id,
    tokenId: record.id,
    expiresAt,
  })

  response.cookies.set(TENANT_SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge,
  })

  // Update metrics without blocking portal access.
  try {
    await admin
      .from('tenant_access_tokens')
      .update({
        last_accessed_at: new Date().toISOString(),
      })
      .eq('id', record.id)
  } catch {
    // Metrics are non-critical.
  }

  return response
}
