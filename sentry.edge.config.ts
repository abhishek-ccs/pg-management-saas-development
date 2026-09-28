/**
 * Sentry Edge Configuration for StayNest
 * Captures exceptions in Next.js Edge Middleware and Edge API routes.
 */

const SENTRY_DSN = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN

if (SENTRY_DSN) {
  try {
    const Sentry = (globalThis as any).Sentry
    if (Sentry && typeof Sentry.init === 'function') {
      Sentry.init({
        dsn: SENTRY_DSN,
        environment: process.env.NODE_ENV || 'production',
        tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.05 : 1.0,
      })
    }
  } catch (err) {
    console.warn('Sentry edge init skipped:', err)
  }
}

export {}
