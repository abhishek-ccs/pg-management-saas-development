import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const startTime = Date.now()

  try {
    const admin = await createAdminClient()
    const { error } = await admin.from('profiles').select('id').limit(1)

    const latencyMs = Date.now() - startTime

    if (error) {
      return NextResponse.json(
        {
          status: 'degraded',
          timestamp: new Date().toISOString(),
          uptimeSec: Math.floor(process.uptime()),
          environment: process.env.NODE_ENV || 'production',
          version: '1.0.0',
          database: {
            status: 'error',
            error: error.message,
            latencyMs,
          },
        },
        { status: 503 }
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
    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        uptimeSec: Math.floor(process.uptime()),
        environment: process.env.NODE_ENV || 'production',
        version: '1.0.0',
        database: {
          status: 'unreachable',
          error: err?.message || 'Connection failure',
          latencyMs: Date.now() - startTime,
        },
      },
      { status: 503 }
    )
  }
}
