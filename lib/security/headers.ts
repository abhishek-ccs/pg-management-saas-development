import { NextResponse } from 'next/server'

/**
 * Enterprise Security Headers
 * Injects Strict-Transport-Security, CSP, Permissions-Policy, X-Frame-Options,
 * X-Content-Type-Options, and Referrer-Policy into all Next.js responses.
 */

export function applySecurityHeaders(response: NextResponse, pathname: string = ''): NextResponse {
  // 1. Strict Content Security Policy
  const cspHeader = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://checkout.razorpay.com https://js.stripe.com https://va.vercel-scripts.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https://*.supabase.co https://images.unsplash.com",
    "connect-src 'self' https://*.supabase.co https://api.razorpay.com https://api.stripe.com https://*.sentry.io https://vitals.vercel-insights.com",
    "frame-src 'self' https://api.razorpay.com https://js.stripe.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join('; ')

  response.headers.set('Content-Security-Policy', cspHeader)

  // 2. Strict-Transport-Security (HSTS - 2 years + subdomains + preload)
  response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')

  // 3. Prevent Clickjacking
  response.headers.set('X-Frame-Options', 'DENY')

  // 4. Prevent MIME Sniffing
  response.headers.set('X-Content-Type-Options', 'nosniff')

  // 5. Referrer Policy
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')

  // 6. Restrict Sensitive Hardware APIs
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(self "https://checkout.razorpay.com" "https://js.stripe.com"), browsing-topics=()'
  )

  // 7. Prevent search engine indexing of private authenticated and auth areas
  if (
    pathname.startsWith('/admin') ||
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/signup') ||
    pathname.startsWith('/auth')
  ) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive')
  }

  return response
}
