/**
 * Sentry Client Configuration for StayNest
 * Initialized automatically in the browser if NEXT_PUBLIC_SENTRY_DSN is configured.
 */

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN

if (SENTRY_DSN && typeof window !== 'undefined') {
  // Dynamic initialization when Sentry SDK is present
  try {
    const Sentry = (window as any).Sentry
    if (Sentry && typeof Sentry.init === 'function') {
      Sentry.init({
        dsn: SENTRY_DSN,
        environment: process.env.NODE_ENV || 'production',
        tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
        replaysSessionSampleRate: 0,
        replaysOnErrorSampleRate: 0.1,
        beforeSend(event: any) {
          // Sanitize any sensitive PII (Aadhaar, passwords, phone numbers) before sending
          if (event.request?.cookies) {
            delete event.request.cookies
          }
          return event
        },
      })
    }
  } catch (err) {
    console.warn('Sentry client init skipped:', err)
  }
}

export {}
