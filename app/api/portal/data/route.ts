import { NextResponse } from 'next/server'
import { getTenantSession } from '@/lib/tenant-access'
import { createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await getTenantSession()

    if (!session || !session.tenantId || !session.ownerId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Session has expired or is invalid.' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } }
      )
    }

    const admin = await createAdminClient()

    // 1. Fetch tenant with property, room, and bed details
    const { data: tenant, error: tenantErr } = await admin
      .from('tenants')
      .select('id, full_name, phone, monthly_rent, security_deposit, joining_date, rent_due_day, status, room_id, bed_id, property_id, deleted_at')
      .eq('id', session.tenantId)
      .eq('owner_id', session.ownerId)
      .maybeSingle()

    if (tenantErr || !tenant || tenant.deleted_at) {
      return NextResponse.json(
        { success: false, error: 'Tenant record not found or no longer active.' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } }
      )
    }

    // 2. Fetch Property
    let property: any = null
    if (tenant.property_id) {
      const { data: prop } = await admin
        .from('properties')
        .select('id, name, address, city, state, contact_number, rules')
        .eq('id', tenant.property_id)
        .maybeSingle()
      property = prop
    }

    // 3. Fetch Room & Bed
    let roomNumber = 'Unassigned'
    let bedNumber = 'Unassigned'

    if (tenant.room_id) {
      const { data: r } = await admin
        .from('rooms')
        .select('id, room_number, floor')
        .eq('id', tenant.room_id)
        .maybeSingle()
      if (r) roomNumber = r.room_number
    }

    if (tenant.bed_id) {
      const { data: b } = await admin
        .from('beds')
        .select('id, bed_number')
        .eq('id', tenant.bed_id)
        .maybeSingle()
      if (b) bedNumber = b.bed_number
    }

    // 4. Fetch Payments Ledger strictly for this tenant
    const { data: payments } = await admin
      .from('payments')
      .select('id, amount, payment_method, payment_type, month_covered, notes, paid_at')
      .eq('tenant_id', session.tenantId)
      .eq('owner_id', session.ownerId)
      .is('deleted_at', null)
      .order('paid_at', { ascending: false })

    // 5. Fetch Electricity readings for the resident's room
    let electricityReadings: any[] = []
    if (tenant.room_id) {
      const { data: readings } = await admin
        .from('electricity_readings')
        .select('id, previous_reading, current_reading, rate_per_unit, total_units, total_amount, reading_date')
        .eq('room_id', tenant.room_id)
        .order('reading_date', { ascending: false })
        .limit(6)
      electricityReadings = readings || []
    }

    // 6. Fetch Deposit Settlement if completed
    let settlement: any = null
    try {
      const { data: setl } = await admin
        .from('deposit_settlements')
        .select('*')
        .eq('tenant_id', session.tenantId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (setl) {
        const { data: deductions } = await admin
          .from('deposit_deductions')
          .select('*')
          .eq('settlement_id', setl.id)
          .order('created_at', { ascending: true })
        settlement = { ...setl, deductions: deductions || [] }
      }
    } catch {
      // Table may not have records yet
    }

    // 7. Calculate real-time rent status
    const now = new Date()
    const currentMonth = now.getMonth()
    const currentYear = now.getFullYear()
    const currentDate = now.getDate()

    const hasPaidRentThisMonth = (payments || []).some((p) => {
      if (p.payment_type !== 'rent') return false
      const d = new Date(p.paid_at)
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear
    })

    const dueDay = Math.min(Math.max(Number(tenant.rent_due_day) || 5, 1), 31)
    let rentStatus: 'Paid' | 'Pending' | 'Overdue' | 'Vacated' = tenant.status || 'Pending'

    if (tenant.status === 'Vacated') {
      rentStatus = 'Vacated'
    } else if (hasPaidRentThisMonth) {
      rentStatus = 'Paid'
    } else if (currentDate > dueDay) {
      rentStatus = 'Overdue'
    } else {
      rentStatus = 'Pending'
    }

    const payload = {
      tenant: {
        id: tenant.id,
        name: tenant.full_name,
        phone: tenant.phone,
        monthlyRent: Number(tenant.monthly_rent || 0),
        securityDeposit: Number(tenant.security_deposit || 0),
        joiningDate: tenant.joining_date,
        rentDueDay: dueDay,
        status: rentStatus,
      },
      property: {
        name: property?.name || 'BaseraBook Managed Residence',
        address: property?.address || '',
        city: property?.city || '',
        contactNumber: property?.contact_number || '',
      },
      roomNumber,
      bedNumber,
      payments: (payments || []).map((p) => ({
        id: p.id,
        receiptNumber: `REC-${p.id.slice(0, 8).toUpperCase()}`,
        amount: Number(p.amount || 0),
        paymentMethod: p.payment_method || 'upi',
        paymentType: p.payment_type || 'rent',
        monthCovered: p.month_covered || '',
        notes: p.notes || '',
        paidAt: p.paid_at,
      })),
      electricity: electricityReadings.map((el) => {
        const units = Math.max(0, Number(el.current_reading) - Number(el.previous_reading))
        const total = units * Number(el.rate_per_unit || 10)
        return {
          id: el.id,
          previousReading: Number(el.previous_reading),
          currentReading: Number(el.current_reading),
          ratePerUnit: Number(el.rate_per_unit),
          units,
          totalAmount: total,
          readingDate: el.reading_date,
        }
      }),
      settlement,
    }

    return NextResponse.json({ success: true, data: payload }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Server error while loading portal.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    )
  }
}
