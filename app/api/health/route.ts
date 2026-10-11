import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export const HEALTH_ERROR_MESSAGES = {
  degraded: 'Database service unavailable',
  unreachable: 'Service temporarily unavailable',
} as const

export function sanitizeHealthError(
  _error: unknown,
  category: keyof typeof HEALTH_ERROR_MESSAGES = 'unreachable'
): string {
  // Never expose raw exception strings, database hostnames, table structures, or credentials to client
  return HEALTH_ERROR_MESSAGES[category]
}

function sanitizeLogMessage(message: unknown): string {
  if (typeof message !== 'string') return 'Unknown internal exception'
  // Redact any database connection credentials, passwords, or secret tokens from server logs
  return message
    .replace(/:\/\/([^:]+):([^@]+)@/g, '://$1:***@')
    .replace(/(password|secret|key|token|bearer)=([^\s&]+)/gi, '$1=***')
}

export async function GET() {
  const startTime = Date.now()

  try {
    const admin = await createAdminClient()
    const { error } = await admin.from('profiles').select('id').limit(1)

    const latencyMs = Date.now() - startTime

    if (error) {
      console.error('[Health Check] Database query failed:', sanitizeLogMessage(error.message))

      return NextResponse.json(
        {
          status: 'degraded',
          timestamp: new Date().toISOString(),
          uptimeSec: Math.floor(process.uptime()),
          environment: process.env.NODE_ENV || 'production',
          version: '1.0.0',
          database: {
            status: 'error',
            error: sanitizeHealthError(error, 'degraded'),
            latencyMs,
          },
        },
        {
          status: 503,
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate',
          },
        }
      )
    }

    return NextResponse.json(
      {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptimeSec: Math.floor(process.uptime()),
        environment: process.env.NODE_ENV || 'production',
        version: '1.0.0',
        database: {
          status: 'connected',
          latencyMs,
        },
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      }
    )
  } catch (err: any) {
    console.error('[Health Check] Probe exception:', sanitizeLogMessage(err?.message))

    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        uptimeSec: Math.floor(process.uptime()),
        environment: process.env.NODE_ENV || 'production',
        version: '1.0.0',
        database: {
          status: 'unreachable',
          error: sanitizeHealthError(err, 'unreachable'),
          latencyMs: Date.now() - startTime,
        },
      },
      {
        status: 503,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      }
    )
  }
}

