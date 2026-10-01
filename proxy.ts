import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'
import { applySecurityHeaders } from '@/lib/security/headers'
import { checkRateLimit, ROUTE_LIMITS } from '@/lib/security/rate-limiter'

/**
 * Next.js 16 Proxy Convention (replaces deprecated middleware.ts convention)
 * Handles rate limiting, session refresh, security headers, and route protection.
 */
export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
             request.headers.get('x-real-ip') || 
             '127.0.0.1'

  // 1. Abuse Protection & Rate Limiting
  let limitCategory: 'auth' | 'api' | null = null
  if (pathname.startsWith('/login') || pathname.startsWith('/signup') || pathname.startsWith('/auth')) {
    limitCategory = 'auth'
  } else if (pathname.startsWith('/api') && !pathname.startsWith('/api/health')) {
    limitCategory = 'api'
  }

  if (limitCategory) {
    const rateCheck = checkRateLimit(`${limitCategory}:${ip}`, ROUTE_LIMITS[limitCategory])
    if (!rateCheck.allowed) {
      const rateLimitResponse = NextResponse.json(
        {
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests. Please slow down and try again shortly.',
            retryAfterSec: rateCheck.retryAfterSec,
          },
        },
        { status: 429 }
      )
      rateLimitResponse.headers.set('Retry-After', String(rateCheck.retryAfterSec || 60))
      rateLimitResponse.headers.set('X-RateLimit-Limit', String(ROUTE_LIMITS[limitCategory].maxTokens))
      rateLimitResponse.headers.set('X-RateLimit-Remaining', '0')
      return applySecurityHeaders(rateLimitResponse, pathname)
    }
  }

  // 2. Supabase Auth Session Refresh & Route Guards
  const sessionResponse = await updateSession(request)

  // 3. Inject Strict Enterprise Security Headers (CSP, HSTS, X-Frame-Options, etc.)
  return applySecurityHeaders(sessionResponse, pathname)
}

// Backwards-compatible middleware export
export const middleware = proxy
export default proxy

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
