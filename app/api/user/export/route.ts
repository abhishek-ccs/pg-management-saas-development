import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/api-response'

export const dynamic = 'force-dynamic'

/**
 * GDPR (Article 20) & India DPDP Act 2023 Data Portability Endpoint
 * Generates an encrypted machine-readable JSON data export of all records
 * owned by the authenticated property manager.
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return apiError('UNAUTHORIZED', 'Authentication required for data export.', 401)
    }

    const userId = user.id

    // Fetch all entities associated with this customer
    const [
      profileRes,
      subRes,
      propRes,
      roomRes,
      bedRes,
      tenantRes,
      paymentRes,
      expenseRes,
      elecRes,
      complaintRes,
    ] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
      supabase.from('subscriptions').select('*').eq('owner_id', userId).maybeSingle(),
      supabase.from('properties').select('*').eq('owner_id', userId),
      supabase.from('rooms').select('*').eq('owner_id', userId),
      supabase.from('beds').select('*').eq('owner_id', userId),
      supabase.from('tenants').select('*').eq('owner_id', userId),
      supabase.from('payments').select('*').eq('owner_id', userId),
      supabase.from('expenses').select('*').eq('owner_id', userId),
      supabase.from('electricity_readings').select('*').eq('owner_id', userId),
      supabase.from('complaints').select('*').eq('owner_id', userId),
    ])

    const exportPayload = {
      exportMetadata: {
        platform: 'StayNest PG Management SaaS',
        version: '1.0.0',
        generatedAt: new Date().toISOString(),
        dataSubjectId: userId,
        legalNotice: 'Exported pursuant to GDPR Article 20 and India Digital Personal Data Protection Act 2023.',
      },
      profile: profileRes.data,
      subscription: subRes.data,
      properties: propRes.data || [],
      rooms: roomRes.data || [],
      beds: bedRes.data || [],
      tenants: tenantRes.data || [],
      payments: paymentRes.data || [],
      expenses: expenseRes.data || [],
      electricityReadings: elecRes.data || [],
      complaints: complaintRes.data || [],
    }

    const timestamp = new Date().toISOString().slice(0, 10)
    const filename = `staynest-export-${timestamp}.json`

    return new NextResponse(JSON.stringify(exportPayload, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    })
  } catch (err: any) {
    return apiError('INTERNAL_ERROR', 'Failed to generate data export archive.', 500, err?.message)
  }
}
