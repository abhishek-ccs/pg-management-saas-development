import { NextRequest, NextResponse } from 'next/server'
import { getTenantSession } from '@/lib/tenant-access'
import { createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getTenantSession()

    if (!session || !session.tenantId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Please access via your secure portal link.' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } }
      )
    }

    const { id: paymentId } = await params
    if (!paymentId) {
      return NextResponse.json({ success: false, error: 'Missing payment ID.' }, { status: 400 })
    }

    const admin = await createAdminClient()

    // Query payment strictly verifying tenant_id = session.tenantId
    const { data: payment, error } = await admin
      .from('payments')
      .select('id, amount, payment_method, payment_type, month_covered, notes, paid_at, tenant_id, property_id')
      .eq('id', paymentId)
      .eq('tenant_id', session.tenantId)
      .is('deleted_at', null)
      .maybeSingle()

    if (error || !payment) {
      return NextResponse.json(
        { success: false, error: 'Receipt not found or you are not authorized to view it.' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } }
      )
    }

    // Fetch tenant name & property for official receipt presentation
    const { data: tenant } = await admin
      .from('tenants')
      .select('full_name, phone, room_id, bed_id')
      .eq('id', session.tenantId)
      .maybeSingle()

    let roomNumber = 'General'
    if (tenant?.room_id) {
      const { data: r } = await admin.from('rooms').select('room_number').eq('id', tenant.room_id).maybeSingle()
      if (r) roomNumber = r.room_number
    }

    let propertyName = 'BaseraBook Managed Property'
    if (payment.property_id) {
      const { data: prop } = await admin.from('properties').select('name').eq('id', payment.property_id).maybeSingle()
      if (prop?.name) propertyName = prop.name
    }

    const receipt = {
      receiptNumber: `REC-${payment.id.slice(0, 8).toUpperCase()}`,
      paymentId: payment.id,
      residentName: tenant?.full_name || 'Resident',
      roomNumber,
      propertyName,
      amount: Number(payment.amount),
      paymentMethod: payment.payment_method?.toUpperCase() || 'UPI',
      paymentType: payment.payment_type?.toUpperCase() || 'RENT',
      monthCovered: payment.month_covered || null,
      notes: payment.notes || null,
      paidAt: payment.paid_at,
    }

    return NextResponse.json(
      { success: true, receipt },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'X-Content-Type-Options': 'nosniff',
        },
      }
    )
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Error loading receipt.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    )
  }
}
