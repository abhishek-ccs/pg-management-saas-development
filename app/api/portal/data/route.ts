import { NextRequest, NextResponse } from 'next/server'
import { getTenantSession } from '@/lib/tenant-access'
import { createAdminClient } from '@/lib/supabase/server'
import { getValidatedReminderPaymentOptions } from '@/lib/payment-validation'
import { calculateTenantRentStatus } from '@/lib/due-dates'
import { isValidEmail, isValidPhone } from '@/lib/validation'

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

    // 1. Fetch tenant with complete profile and contact information
    const { data: tenant, error: tenantErr } = await admin
      .from('tenants')
      .select('id, full_name, phone, email, emergency_contact, id_proof_type, id_proof_number, monthly_rent, security_deposit, joining_date, rent_due_day, status, room_id, bed_id, property_id, deleted_at')
      .eq('id', session.tenantId)
      .eq('owner_id', session.ownerId)
      .maybeSingle()

    if (tenantErr || !tenant || tenant.deleted_at) {
      return NextResponse.json(
        { success: false, error: 'Tenant record not found or no longer active.' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } }
      )
    }

    // 2. Fetch Property including rules, notices, and address
    let property: any = null
    if (tenant.property_id) {
      const { data: prop } = await admin
        .from('properties')
        .select('id, name, address, city, state, pincode, contact_number, rules, upi_id, payment_link, upi_qr_url')
        .eq('id', tenant.property_id)
        .maybeSingle()
      property = prop
    }

    // Parse property rules/notices safely
    let rulesList: string[] = []
    if (property?.rules) {
      if (Array.isArray(property.rules)) {
        rulesList = property.rules.filter((r: any) => typeof r === 'string' && r.trim().length > 0)
      } else if (typeof property.rules === 'string') {
        try {
          const parsed = JSON.parse(property.rules)
          if (Array.isArray(parsed)) {
            rulesList = parsed.filter((r: any) => typeof r === 'string' && r.trim().length > 0)
          } else {
            rulesList = property.rules.split('\n').map((r: string) => r.trim()).filter((r: string) => r.length > 0)
          }
        } catch {
          rulesList = property.rules.split('\n').map((r: string) => r.trim()).filter((r: string) => r.length > 0)
        }
      }
    }

    // 3. Fetch Room & Bed with floor, type, and capacity details
    let roomNumber = 'Unassigned'
    let roomFloor: number | null = null
    let roomType = 'Standard'
    let bedNumber = 'Unassigned'

    if (tenant.room_id) {
      const { data: r } = await admin
        .from('rooms')
        .select('id, room_number, floor, room_type')
        .eq('id', tenant.room_id)
        .maybeSingle()
      if (r) {
        roomNumber = r.room_number || 'Unassigned'
        roomFloor = r.floor !== null && r.floor !== undefined ? Number(r.floor) : null
        roomType = r.room_type || 'Standard'
      }
    }

    if (tenant.bed_id) {
      const { data: b } = await admin
        .from('beds')
        .select('id, bed_number')
        .eq('id', tenant.bed_id)
        .maybeSingle()
      if (b) bedNumber = b.bed_number || 'Unassigned'
    }

    // 4. Fetch Payments Ledger strictly for this tenant
    const { data: payments } = await admin
      .from('payments')
      .select('id, amount, payment_method, payment_type, month_covered, notes, paid_at')
      .eq('tenant_id', session.tenantId)
      .eq('owner_id', session.ownerId)
      .is('deleted_at', null)
      .order('paid_at', { ascending: false })

    // 5. Fetch Complaints strictly belonging to this resident
    let residentComplaints: any[] = []
    const { data: comps } = await admin
      .from('complaints')
      .select('id, title, description, priority, status, resolved_at, created_at, updated_at')
      .eq('owner_id', session.ownerId)
      .eq('tenant_id', session.tenantId)
      .order('created_at', { ascending: false })

    residentComplaints = comps || []

    // Fallback: Check for legacy complaints logged by name with null tenant_id
    if (residentComplaints.length === 0 && tenant.full_name) {
      const { data: legacyComps } = await admin
        .from('complaints')
        .select('id, title, description, priority, status, resolved_at, created_at, updated_at')
        .eq('owner_id', session.ownerId)
        .is('tenant_id', null)
        .eq('tenant', tenant.full_name)
        .order('created_at', { ascending: false })
      if (legacyComps && legacyComps.length > 0) {
        residentComplaints = legacyComps
      }
    }

    // 6. Fetch Electricity readings for the resident's room
    let electricityReadings: any[] = []
    if (tenant.room_id) {
      const { data: readings } = await admin
        .from('electricity_readings')
        .select('id, previous_reading, current_reading, rate_per_unit, total_units, total_amount, reading_date, period_start, period_end, calculation_type')
        .eq('room_id', tenant.room_id)
        .order('reading_date', { ascending: false })
        .limit(6)
      electricityReadings = readings || []
    }

    // 7. Fetch Deposit Settlement if completed
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

    // 8. Fetch Owner Profile Payment Options
    let rawPaymentOptions = {
      upiId: property?.upi_id || null,
      paymentLink: property?.payment_link || null,
      qrCodeUrl: property?.upi_qr_url || null,
    }
    try {
      const { data: profile } = await admin
        .from('profiles')
        .select('upi_id, payment_link, upi_qr_url')
        .eq('id', session.ownerId)
        .maybeSingle()
      if (profile) {
        rawPaymentOptions = {
          upiId: rawPaymentOptions.upiId || profile.upi_id || null,
          paymentLink: rawPaymentOptions.paymentLink || profile.payment_link || null,
          qrCodeUrl: rawPaymentOptions.qrCodeUrl || profile.upi_qr_url || null,
        }
      }
    } catch {
      // Profile query fallback
    }

    const paymentOptions = getValidatedReminderPaymentOptions(rawPaymentOptions) || {
      upiId: null,
      paymentLink: null,
      qrCodeUrl: null,
    }

    // 9. Fetch Mid-Cycle Electricity Shares for this resident
    let electricityShares: any[] = []
    try {
      const { data: shares } = await admin
        .from('tenant_electricity_shares')
        .select('id, reading_id, period_start, period_end, occupied_days, total_period_days, share_percentage, units_consumed, amount_due, calculation_method, calculation_explanation, is_paid, created_at')
        .eq('tenant_id', session.tenantId)
        .eq('owner_id', session.ownerId)
        .order('period_end', { ascending: false })
      electricityShares = shares || []
    } catch {
      // Table query fallback
    }

    // 10. Calculate real-time rent status using the single source of truth
    const rentStatusResult = calculateTenantRentStatus({
      tenant: {
        id: tenant.id,
        joining_date: tenant.joining_date,
        rent_due_day: tenant.rent_due_day,
        monthly_rent: tenant.monthly_rent,
        status: tenant.status,
      },
      payments: payments || [],
      referenceDate: new Date(),
      locale: 'en',
    })

    const dueDay = Math.min(Math.max(Number(tenant.rent_due_day) || 5, 1), 31)

    // Preserve backwards-compatible legacy status mapping
    let legacyStatus: 'Paid' | 'Pending' | 'Overdue' | 'Vacated' = 'Pending'
    if (tenant.status === 'Vacated' || rentStatusResult.status === 'vacated') {
      legacyStatus = 'Vacated'
    } else if (rentStatusResult.status === 'paid') {
      legacyStatus = 'Paid'
    } else if (rentStatusResult.status === 'overdue') {
      legacyStatus = 'Overdue'
    } else {
      legacyStatus = 'Pending'
    }

    // Synthesize chronological resident activity history
    const timelineEvents: Array<{
      id: string
      date: string
      type: 'move_in' | 'payment' | 'complaint' | 'electricity'
      title: string
      description: string
    }> = []

    if (tenant.joining_date) {
      timelineEvents.push({
        id: `event-join-${tenant.id}`,
        date: tenant.joining_date,
        type: 'move_in',
        title: 'Moved in to Residence',
        description: `Occupancy commenced for Room ${roomNumber}, Bed ${bedNumber}.`,
      })
    }

    for (const p of payments || []) {
      timelineEvents.push({
        id: `event-pay-${p.id}`,
        date: p.paid_at,
        type: 'payment',
        title: `Payment Confirmed: ₹${Number(p.amount || 0).toLocaleString('en-IN')}`,
        description: `Paid via ${String(p.payment_method || 'UPI').toUpperCase()} for ${p.payment_type || 'rent'}${p.month_covered ? ` (${p.month_covered})` : ''}.`,
      })
    }

    for (const c of residentComplaints) {
      timelineEvents.push({
        id: `event-comp-${c.id}`,
        date: c.created_at,
        type: 'complaint',
        title: `Maintenance Ticket: ${c.title}`,
        description: `Status: ${c.status} · Priority: ${c.priority}${c.resolved_at ? ` · Resolved on ${new Date(c.resolved_at).toLocaleDateString('en-IN')}` : ''}`,
      })
    }

    // Sort timeline descending by date
    timelineEvents.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    const payload = {
      tenant: {
        id: tenant.id,
        name: tenant.full_name,
        phone: tenant.phone || '',
        email: tenant.email || '',
        emergencyContact: tenant.emergency_contact || '',
        idProofType: tenant.id_proof_type || null,
        idProofNumber: tenant.id_proof_number || null,
        monthlyRent: Number(tenant.monthly_rent || 0),
        securityDeposit: Number(tenant.security_deposit || 0),
        joiningDate: tenant.joining_date,
        rentDueDay: dueDay,
        firstDueDate: rentStatusResult.firstDueDate || null,
        firstDueDateFormatted: rentStatusResult.firstDueDateFormatted || null,
        status: legacyStatus,
        dueStatus: rentStatusResult.status,
        dueInfo: {
          status: rentStatusResult.status,
          days: rentStatusResult.days,
          labelEn: rentStatusResult.labelEn,
          labelHi: rentStatusResult.labelHi,
          badgeColor: rentStatusResult.badgeColor,
        },
        nextDueDate: rentStatusResult.nextDueDate || null,
        nextDueDateFormatted: rentStatusResult.nextDueDateFormatted || null,
        nextDueDates: rentStatusResult.nextDueDates || [],
        monthCovered: rentStatusResult.monthCovered || null,
        outstandingBalance: rentStatusResult.outstandingBalance,
        overdueBalance: rentStatusResult.overdueBalance,
        schedules: rentStatusResult.schedules || [],
      },
      property: {
        name: property?.name || 'BaseraBook Managed Residence',
        address: property?.address || '',
        city: property?.city || '',
        state: property?.state || '',
        pincode: property?.pincode || '',
        contactNumber: property?.contact_number || '',
        rules: rulesList,
      },
      room: {
        number: roomNumber,
        floor: roomFloor,
        type: roomType,
      },
      roomNumber,
      bedNumber,
      paymentOptions,
      complaints: residentComplaints.map((c) => ({
        id: c.id,
        title: c.title,
        description: c.description || '',
        priority: c.priority || 'Medium',
        status: c.status || 'Open',
        resolvedAt: c.resolved_at || null,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
      })),
      timeline: timelineEvents,
      electricityShares: (electricityShares || []).map((s) => ({
        id: s.id,
        periodStart: s.period_start,
        periodEnd: s.period_end,
        occupiedDays: Number(s.occupied_days || 0),
        totalPeriodDays: Number(s.total_period_days || 0),
        sharePercentage: Number(s.share_percentage || 0),
        unitsConsumed: s.unitsConsumed !== null && s.unitsConsumed !== undefined ? Number(s.units_consumed) : null,
        amountDue: Number(s.amount_due || 0),
        calculationMethod: s.calculation_method || 'proportional_daily_occupancy',
        calculationExplanation: s.calculation_explanation || '',
        isPaid: !!s.is_paid,
      })),
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
          periodStart: el.period_start,
          periodEnd: el.period_end,
          calculationType: el.calculation_type,
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

/**
 * PATCH: Secure resident self-service profile contact update
 * Permits updating contact fields ONLY (phone, email, emergency_contact).
 * Strictly forbids modifying financial, occupancy, or status attributes.
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await getTenantSession()

    if (!session || !session.tenantId || !session.ownerId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Session has expired or is invalid.' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } }
      )
    }

    const body = await request.json()

    // Security barrier: reject unauthorized modifications to sensitive/financial fields
    const forbiddenFields = [
      'id', 'monthly_rent', 'monthlyRent', 'rent',
      'security_deposit', 'securityDeposit', 'deposit',
      'room_id', 'bed_id', 'property_id', 'status',
      'joining_date', 'joiningDate', 'rent_due_day', 'rentDueDay',
      'owner_id', 'ownerId', 'deleted_at',
    ]

    for (const field of forbiddenFields) {
      if (body[field] !== undefined) {
        return NextResponse.json(
          { success: false, error: `Security violation: You are not authorized to modify the "${field}" attribute.` },
          { status: 403, headers: { 'Cache-Control': 'no-store' } }
        )
      }
    }

    const { phone, email, emergencyContact } = body

    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    }

    // Phone validation
    if (phone !== undefined) {
      const cleanPhone = String(phone).trim()
      if (cleanPhone && !isValidPhone(cleanPhone)) {
        return NextResponse.json(
          { success: false, error: 'Please enter a valid 10-15 digit contact phone number.' },
          { status: 400, headers: { 'Cache-Control': 'no-store' } }
        )
      }
      updatePayload.phone = cleanPhone
    }

    // Email validation
    if (email !== undefined) {
      const cleanEmail = String(email).trim()
      if (cleanEmail && !isValidEmail(cleanEmail)) {
        return NextResponse.json(
          { success: false, error: 'Please enter a valid email address.' },
          { status: 400, headers: { 'Cache-Control': 'no-store' } }
        )
      }
      updatePayload.email = cleanEmail || null
    }

    // Emergency Contact validation
    if (emergencyContact !== undefined) {
      const cleanContact = String(emergencyContact).trim()
      if (cleanContact.length > 100) {
        return NextResponse.json(
          { success: false, error: 'Emergency contact information cannot exceed 100 characters.' },
          { status: 400, headers: { 'Cache-Control': 'no-store' } }
        )
      }
      updatePayload.emergency_contact = cleanContact || null
    }

    const admin = await createAdminClient()

    const { data: updated, error: updateErr } = await admin
      .from('tenants')
      .update(updatePayload)
      .eq('id', session.tenantId)
      .eq('owner_id', session.ownerId)
      .select('id, full_name, phone, email, emergency_contact')
      .maybeSingle()

    if (updateErr) {
      return NextResponse.json(
        { success: false, error: updateErr.message || 'Database error while saving contact details.' },
        { status: 500, headers: { 'Cache-Control': 'no-store' } }
      )
    }

    if (!updated) {
      return NextResponse.json(
        { success: false, error: 'Resident record not found or update unauthorized.' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Contact information updated and confirmed in database.',
      tenant: {
        id: updated.id,
        name: updated.full_name,
        phone: updated.phone,
        email: updated.email,
        emergencyContact: updated.emergency_contact,
      },
    })
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Server error while updating contact details.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    )
  }
}
