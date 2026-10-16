import crypto from 'node:crypto'
import { cookies } from 'next/headers'

export const TENANT_SESSION_COOKIE = 'sb_tenant_session'
export const DEFAULT_LINK_EXPIRY_DAYS = 30

export interface TenantTokenPair {
  rawToken: string
  tokenHash: string
  tokenPreview: string
}

export interface TenantSessionPayload {
  tenantId: string
  ownerId: string
  tokenId: string
  expiresAt: number
}

function getServerSecret(): string {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || 
                 process.env.SUPABASE_JWT_SECRET || 
                 process.env.NEXTAUTH_SECRET ||
                 'staynest-secure-tenant-portal-secret-key-2026'
  return secret
}

/**
 * Generates a cryptographically secure, high-entropy 256-bit token (URL-safe base64url).
 * Computes its SHA-256 hash for database storage and a safe preview for the owner UI.
 */
export function generateTenantToken(): TenantTokenPair {
  // 32 bytes = 256 bits of high entropy
  const rawToken = crypto.randomBytes(32).toString('base64url')
  const tokenHash = hashToken(rawToken)
  const tokenPreview = `tk_${rawToken.slice(0, 4)}...${rawToken.slice(-4)}`
  return { rawToken, tokenHash, tokenPreview }
}

/**
 * Computes SHA-256 hash of a raw token in hex.
 */
export function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken.trim()).digest('hex')
}

/**
 * Signs a tenant session payload into a tamper-evident session token.
 */
export function signTenantSession(payload: TenantSessionPayload): string {
  const jsonStr = JSON.stringify(payload)
  const dataB64 = Buffer.from(jsonStr).toString('base64url')
  const hmac = crypto.createHmac('sha256', getServerSecret()).update(dataB64).digest('base64url')
  return `${dataB64}.${hmac}`
}

/**
 * Verifies a signed tenant session token with timing-safe comparison.
 * Returns null if signature is invalid or session has expired.
 */
export function verifyTenantSession(sessionToken: string): TenantSessionPayload | null {
  if (!sessionToken || typeof sessionToken !== 'string') return null
  const parts = sessionToken.split('.')
  if (parts.length !== 2) return null

  const [dataB64, providedHmac] = parts
  const expectedHmac = crypto.createHmac('sha256', getServerSecret()).update(dataB64).digest('base64url')

  const providedBuf = Buffer.from(providedHmac)
  const expectedBuf = Buffer.from(expectedHmac)

  if (providedBuf.length !== expectedBuf.length) return null
  if (!crypto.timingSafeEqual(providedBuf, expectedBuf)) return null

  try {
    const jsonStr = Buffer.from(dataB64, 'base64url').toString('utf-8')
    const payload = JSON.parse(jsonStr) as TenantSessionPayload

    if (!payload.tenantId || !payload.ownerId || !payload.expiresAt) {
      return null
    }

    if (Date.now() > payload.expiresAt) {
      return null // Expired
    }

    return payload
  } catch {
    return null
  }
}

/**
 * Sets the secure, HTTP-only SameSite=Strict tenant session cookie on the response.
 */
export async function setTenantSessionCookie(payload: TenantSessionPayload) {
  const token = signTenantSession(payload)
  const cookieStore = await cookies()
  const maxAgeSec = Math.max(0, Math.floor((payload.expiresAt - Date.now()) / 1000))

  cookieStore.set(TENANT_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: maxAgeSec,
  })
}

/**
 * Retrieves and validates the current tenant session from HTTP cookies.
 */
export async function getTenantSession(): Promise<TenantSessionPayload | null> {
  const cookieStore = await cookies()
  const cookieVal = cookieStore.get(TENANT_SESSION_COOKIE)?.value
  if (!cookieVal) return null
  return verifyTenantSession(cookieVal)
}

/**
 * Clears the tenant session cookie.
 */
export async function clearTenantSessionCookie() {
  const cookieStore = await cookies()
  cookieStore.delete(TENANT_SESSION_COOKIE)
}
