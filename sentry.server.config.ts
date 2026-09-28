/**
 * Sentry Server Configuration for StayNest
 * Captures server-side errors in Next.js Server Components and API Routes.
 */

const SENTRY_DSN = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN

if (SENTRY_DSN && typeof window === 'undefined') {
  try {
    const Sentry = (global as any).Sentry
    if (Sentry && typeof Sentry.init === 'function') {
      Sentry.init({
        dsn: SENTRY_DSN,
        environment: process.env.NODE_ENV || 'production',
        tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
      })
    }
  } catch (err) {
    console.warn('Sentry server init skipped:', err)
  }
}

export {}
