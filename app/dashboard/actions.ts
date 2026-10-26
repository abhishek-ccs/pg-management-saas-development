'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isValidPhone } from '@/lib/validation'
import { getOwnerEntitlements, type CustomerEntitlement } from '@/lib/subscription'

export interface CreateTenantInput {
  name: string
  phone: string
  roomId: string | null
  bedId: string | null
  propertyId: string | null
  rent: number
  deposit: number
  joiningDate?: string
  dueDay?: number | string
  firstDueDate?: string
}

export interface TenantActionResult {
  success: boolean
  error?: string
  tenant?: any
}

/**
 * Server Action: Create Resident (Tenant)
 * Guaranteed session freshness, server-side room capacity check, bed conflict check, and owner isolation.
 */
export async function createTenantAction(input: CreateTenantInput): Promise<TenantActionResult> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()

    if (authErr || !user) {
      return { success: false, error: 'Your session has expired. Please sign in again.' }
    }

    const name = input.name?.trim()
    const phone = input.phone?.trim()
    const rent = Number(input.rent || 0)
    const deposit = Number(input.deposit || 0)
    const joiningDate = input.joiningDate || new Date().toISOString().slice(0, 10)
    let roomId = input.roomId && input.roomId !== 'unassigned' ? input.roomId : null
    const bedId = input.bedId && input.bedId !== 'unassigned' ? input.bedId : null
    let propertyId = input.propertyId && input.propertyId !== 'unassigned' ? input.propertyId : null

    if (!name || rent <= 0) {
      return { success: false, error: 'Please provide a valid tenant name and monthly rent.' }
    }

    if (!phone || !isValidPhone(phone)) {
      return { success: false, error: 'Please enter a valid 10-15 digit tenant contact phone number.' }
    }

    // Authoritative Server-side Subscription & Trial Expiry Enforcement
    const entitlement = await getOwnerEntitlements(supabase, user.id)
    if (!entitlement.hasPaidAccess) {
      return {
        success: false,
        error: 'Your 7-day free trial has expired. Please upgrade to a paid subscription to add residents.',
      }
    }

    // Auto-resolve propertyId if missing or unassigned
    if (!propertyId && roomId) {
      const { data: roomObj } = await supabase
        .from('rooms')
        .select('property_id')
        .eq('id', roomId)
        .eq('owner_id', user.id)
        .maybeSingle()
      if (roomObj?.property_id) {
        propertyId = roomObj.property_id
      }
    }
    if (!propertyId) {
      const { data: defaultProp } = await supabase
        .from('properties')
        .select('id')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      if (defaultProp?.id) {
        propertyId = defaultProp.id
      }
    }

    // 1. Verify property ownership if provided
    if (propertyId) {
      const { data: prop } = await supabase
        .from('properties')
        .select('id')
        .eq('id', propertyId)
        .eq('owner_id', user.id)
        .maybeSingle()
      if (!prop) {
        return { success: false, error: 'Invalid property assignment.' }
      }
    }

    // 2. Bed Validation & Bed-Room Mismatch Protection (Bug #3 & Bug #4)
    if (bedId) {
      const { data: bedRecord } = await supabase
        .from('beds')
        .select('id, room_id, status')
        .eq('id', bedId)
        .eq('owner_id', user.id)
        .maybeSingle()

      if (!bedRecord) {
        return { success: false, error: 'The selected bed does not exist or does not belong to your account.' }
      }

      // Check if bed belongs to selected room when roomId is supplied (Bug #3)
      if (roomId && bedRecord.room_id && bedRecord.room_id !== roomId) {
        return { success: false, error: 'The selected bed belongs to another room. Room and bed must match.' }
      }

      // If roomId is absent, derive room from the bed's actual room_id
      if (!roomId && bedRecord.room_id) {
        roomId = bedRecord.room_id
      }

      // Verify bed status is available
      if (bedRecord.status !== 'available') {
        return { success: false, error: 'The selected bed is not available for assignment.' }
      }

      // Check if another active resident occupies this bed (Bug #4)
      const { data: occupiedBed } = await supabase
        .from('tenants')
        .select('id, full_name')
        .eq('bed_id', bedId)
        .eq('owner_id', user.id)
        .neq('status', 'Vacated')
        .maybeSingle()

      if (occupiedBed) {
        return { success: false, error: 'The selected bed is already occupied by another active resident.' }
      }
    }

    // 3. Server-side Room Capacity Check (Bug #5: Single=1, Double=2, Triple=3, Four=4)
    if (roomId) {
      const { data: targetRoom } = await supabase
        .from('rooms')
        .select('id, room_number, room_type')
        .eq('id', roomId)
        .eq('owner_id', user.id)
        .maybeSingle()

      if (targetRoom) {
        const { count: activeTenantsCount } = await supabase
          .from('tenants')
          .select('id', { count: 'exact', head: true })
          .eq('room_id', roomId)
          .eq('owner_id', user.id)
          .neq('status', 'Vacated')

        const type = (targetRoom.room_type || '').toLowerCase()
        const maxCapacity = type.includes('single')
          ? 1
          : type.includes('double')
          ? 2
          : type.includes('triple')
          ? 3
          : type.includes('four')
          ? 4
          : 2

        if ((activeTenantsCount || 0) >= maxCapacity) {
          return {
            success: false,
            error: `Capacity exceeded: Room ${targetRoom.room_number} (${targetRoom.room_type}) only accommodates ${maxCapacity} resident(s).`,
          }
        }
      }
    }

    // 4. Concurrency Guard: Atomically claim the bed before inserting tenant (Bug #6)
    if (bedId) {
      const { data: claimedBed, error: claimErr } = await supabase
        .from('beds')
        .update({ status: 'occupied' })
        .eq('id', bedId)
        .eq('owner_id', user.id)
        .eq('status', 'available')
        .select('id')
        .maybeSingle()

      if (claimErr || !claimedBed) {
        return {
          success: false,
          error: 'The selected bed was just taken or is no longer available. Please select another bed.',
        }
      }
    }

    // If tenant joins on the 10th, the rent due day defaults to 10 and next rent is due on the 10th of following month
    const joiningParsed = new Date(joiningDate)
    const joiningDay = !isNaN(joiningParsed.getTime()) ? joiningParsed.getDate() : 5
    let rawDue = input.firstDueDate || input.dueDay
    let dueDayNum = 5
    if (typeof rawDue === 'string' && rawDue.includes('-')) {
      const parts = rawDue.split('-')
      dueDayNum = Number(parts[2]) || joiningDay || 5
    } else {
      dueDayNum = Number(rawDue || joiningDay || 5)
    }
    const safeDueDay = Math.min(Math.max(dueDayNum, 1), 31)
    const currentDate = new Date().getDate()
    const initialStatus = currentDate > safeDueDay ? 'Overdue' : 'Pending'

    // 5. Construct guaranteed baseline payload
    const tenantPayload: Record<string, any> = {
      owner_id: user.id,
      property_id: propertyId,
      room_id: roomId,
      bed_id: bedId,
      full_name: name,
      phone,
      monthly_rent: rent,
      security_deposit: deposit,
      joining_date: joiningDate,
      rent_due_day: safeDueDay,
      status: initialStatus,
    }

    // Attempt insert with guaranteed columns
    const { data: newTenant, error: insertError } = await supabase
      .from('tenants')
      .insert(tenantPayload)
      .select('id, full_name, phone, monthly_rent, security_deposit, joining_date, status, room_id, bed_id, property_id, rent_due_day')
      .single()

    if (insertError) {
      // Revert bed reservation if insertion failed
      if (bedId) {
        await supabase
          .from('beds')
          .update({ status: 'available' })
          .eq('id', bedId)
          .eq('owner_id', user.id)
      }
      console.error('createTenantAction DB Error:', insertError)
      if (insertError.code === 'PGRST303' || insertError.message?.includes('JWT')) {
        return { success: false, error: 'Your session has expired. Please sign in again.' }
      }
      return { success: false, error: insertError.message || 'Could not create tenant record.' }
    }

    return { success: true, tenant: newTenant }
  } catch (err: any) {
    console.error('createTenantAction exception:', err)
    return { success: false, error: err?.message || 'Unexpected server error while registering resident.' }
  }
}

/**
 * Server Action: Update Resident (Tenant)
 */
export async function updateTenantAction(
  tenantId: string,
  input: {
    name: string
    phone: string
    roomId: string | null
    bedId: string | null
    propertyId?: string | null
    rent: number
    deposit: number
    joiningDate?: string
    dueDay?: number | string
    firstDueDate?: string
    status: string
  }
): Promise<TenantActionResult> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()

    if (authErr || !user) {
      return { success: false, error: 'Your session has expired. Please sign in again.' }
    }

    // Authoritative Server-side Subscription & Trial Expiry Enforcement
    const entitlement = await getOwnerEntitlements(supabase, user.id)
    if (!entitlement.hasPaidAccess) {
      return {
        success: false,
        error: 'Your 7-day free trial has expired. Please upgrade to a paid subscription to modify resident records.',
      }
    }

    const { data: existingTenant } = await supabase
      .from('tenants')
      .select('id, bed_id, room_id, owner_id')
      .eq('id', tenantId)
      .eq('owner_id', user.id)
      .maybeSingle()

    if (!existingTenant) {
      return { success: false, error: 'Resident record not found or unauthorized.' }
    }

    let targetRoomId = input.roomId && input.roomId !== 'unassigned' ? input.roomId : null
    const targetBedId = input.bedId && input.bedId !== 'unassigned' ? input.bedId : null

    // Bed and Room validation if bed changed
    if (targetBedId && targetBedId !== existingTenant.bed_id) {
      const { data: bedRecord } = await supabase
        .from('beds')
        .select('id, room_id, status')
        .eq('id', targetBedId)
        .eq('owner_id', user.id)
        .maybeSingle()

      if (!bedRecord) {
        return { success: false, error: 'The selected bed does not exist or does not belong to your account.' }
      }

      if (targetRoomId && bedRecord.room_id && bedRecord.room_id !== targetRoomId) {
        return { success: false, error: 'The selected bed belongs to another room. Room and bed must match.' }
      }

      if (!targetRoomId && bedRecord.room_id) {
        targetRoomId = bedRecord.room_id
      }

      if (bedRecord.status !== 'available') {
        return { success: false, error: 'The selected bed is not available for assignment.' }
      }

      const { data: occupiedBed } = await supabase
        .from('tenants')
        .select('id, full_name')
        .eq('bed_id', targetBedId)
        .eq('owner_id', user.id)
        .neq('status', 'Vacated')
        .neq('id', tenantId)
        .maybeSingle()

      if (occupiedBed) {
        return { success: false, error: 'The selected bed is already occupied by another active resident.' }
      }
    }

    // Room Capacity check if moving to another room
    if (targetRoomId && targetRoomId !== existingTenant.room_id && input.status !== 'Vacated') {
      const { data: targetRoom } = await supabase
        .from('rooms')
        .select('id, room_number, room_type')
        .eq('id', targetRoomId)
        .eq('owner_id', user.id)
        .maybeSingle()

      if (targetRoom) {
        const { count: activeTenantsCount } = await supabase
          .from('tenants')
          .select('id', { count: 'exact', head: true })
          .eq('room_id', targetRoomId)
          .eq('owner_id', user.id)
          .neq('status', 'Vacated')
          .neq('id', tenantId)

        const type = (targetRoom.room_type || '').toLowerCase()
        const maxCapacity = type.includes('single') ? 1 : type.includes('double') ? 2 : type.includes('triple') ? 3 : type.includes('four') ? 4 : 2
        if ((activeTenantsCount || 0) >= maxCapacity) {
          return {
            success: false,
            error: `Capacity exceeded: Room ${targetRoom.room_number} (${targetRoom.room_type}) only accommodates ${maxCapacity} resident(s).`,
          }
        }
      }
    }

    let safeDueDay: number | undefined = undefined
    if (input.firstDueDate || input.dueDay !== undefined) {
      const rawDue = input.firstDueDate || input.dueDay
      let dueDayNum = 5
      if (typeof rawDue === 'string' && rawDue.includes('-')) {
        const parts = rawDue.split('-')
        dueDayNum = Number(parts[2]) || 5
      } else {
        dueDayNum = Number(rawDue) || 5
      }
      safeDueDay = Math.min(Math.max(dueDayNum, 1), 31)
    }

    let targetPropertyId = input.propertyId && input.propertyId !== 'unassigned' ? input.propertyId : null
    if (!targetPropertyId && targetRoomId) {
      const { data: roomObj } = await supabase
        .from('rooms')
        .select('property_id')
        .eq('id', targetRoomId)
        .eq('owner_id', user.id)
        .maybeSingle()
      if (roomObj?.property_id) {
        targetPropertyId = roomObj.property_id
      }
    }
    if (!targetPropertyId) {
      const { data: defaultProp } = await supabase
        .from('properties')
        .select('id')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      if (defaultProp?.id) {
        targetPropertyId = defaultProp.id
      }
    }

    const updatePayload: Record<string, any> = {
      full_name: input.name.trim(),
      phone: input.phone.trim(),
      room_id: targetRoomId,
      bed_id: targetBedId,
      monthly_rent: Number(input.rent || 0),
      security_deposit: Number(input.deposit || 0),
      joining_date: input.joiningDate,
      status: input.status,
      updated_at: new Date().toISOString(),
    }

    if (targetPropertyId) {
      updatePayload.property_id = targetPropertyId
    }

    if (safeDueDay !== undefined) {
      updatePayload.rent_due_day = safeDueDay
    }

    const { data: updatedTenant, error: updateError } = await supabase
      .from('tenants')
      .update(updatePayload)
      .eq('id', tenantId)
      .eq('owner_id', user.id)
      .select('id, full_name, phone, monthly_rent, security_deposit, joining_date, status, room_id, bed_id, property_id, rent_due_day')
      .single()

    if (updateError) {
      return { success: false, error: updateError.message || 'Could not update resident record.' }
    }

    // Free previously occupied bed if bed assignment changed or vacated
    if (existingTenant.bed_id && existingTenant.bed_id !== updatedTenant.bed_id) {
      await supabase
        .from('beds')
        .update({ status: 'available' })
        .eq('id', existingTenant.bed_id)
        .eq('owner_id', user.id)
    }

    // Mark new bed occupied or available
    if (updatedTenant.bed_id && updatedTenant.status !== 'Vacated') {
      await supabase
        .from('beds')
        .update({ status: 'occupied' })
        .eq('id', updatedTenant.bed_id)
        .eq('owner_id', user.id)
    } else if (updatedTenant.bed_id && updatedTenant.status === 'Vacated') {
      await supabase
        .from('beds')
        .update({ status: 'available' })
        .eq('id', updatedTenant.bed_id)
        .eq('owner_id', user.id)
    }

    return { success: true, tenant: updatedTenant }
  } catch (err: any) {
    return { success: false, error: err?.message || 'Unexpected server error.' }
  }
}

export type TrashEntityType = 'property' | 'room' | 'bed' | 'tenant' | 'expense' | 'complaint' | 'payment' | 'electricity'

export interface TrashRecord {
  id: string
  target_id: string
  entity_type: TrashEntityType
  entity_name: string
  details: string
  deleted_at: string
  deleted_by: string
  snapshot: any
}

export interface MoveToTrashInput {
  entityType: TrashEntityType
  entityId: string
  entityName?: string
  details?: string
}

export interface TrashActionResult {
  success: boolean
  error?: string
  message?: string
}

/**
 * Server Action: Move Record to Trash (Soft Delete)
 * Snapshots the record, stores it in platform_audit_logs with status 'in_trash',
 * releases bed occupancy if tenant, removes from active table, and strictly enforces owner isolation.
 */
export async function moveToTrashAction(input: MoveToTrashInput): Promise<TrashActionResult> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return { success: false, error: 'Your session has expired. Please sign in again.' }
    }

    const { entityType, entityId } = input
    if (!entityType || !entityId) {
      return { success: false, error: 'Missing entity type or ID.' }
    }

    const admin = await createAdminClient()
    let snapshot: any = null
    let entityName = input.entityName || ''
    let details = input.details || ''

    if (entityType === 'tenant') {
      const { data: tenant, error: fetchErr } = await supabase
        .from('tenants')
        .select('*')
        .eq('id', entityId)
        .eq('owner_id', user.id)
        .maybeSingle()

      if (fetchErr || !tenant) {
        return { success: false, error: 'Resident record not found or unauthorized.' }
      }
      snapshot = tenant
      entityName = entityName || tenant.full_name
      details = details || `Room ${tenant.room_id ? 'Assigned' : 'Unassigned'} · Rent: ₹${tenant.monthly_rent}`

      // Release bed to available if assigned
      if (tenant.bed_id) {
        await supabase
          .from('beds')
          .update({ status: 'available' })
          .eq('id', tenant.bed_id)
          .eq('owner_id', user.id)
      }

      const { error: delErr } = await supabase
        .from('tenants')
        .delete()
        .eq('id', entityId)
        .eq('owner_id', user.id)

      if (delErr) {
        return { success: false, error: delErr.message || 'Could not move resident to trash.' }
      }
    } else if (entityType === 'property') {
      const { data: property, error: fetchErr } = await supabase
        .from('properties')
        .select('*')
        .eq('id', entityId)
        .eq('owner_id', user.id)
        .maybeSingle()

      if (fetchErr || !property) {
        return { success: false, error: 'Property record not found or unauthorized.' }
      }

      const { data: propRooms } = await supabase.from('rooms').select('*').eq('property_id', entityId).eq('owner_id', user.id)
      const { data: propBeds } = await supabase.from('beds').select('*').eq('property_id', entityId).eq('owner_id', user.id)

      snapshot = {
        property,
        rooms: propRooms || [],
        beds: propBeds || []
      }
      entityName = entityName || property.name
      details = details || `${property.city || 'Property'} · ${(propRooms || []).length} room(s)`

      const { error: delErr } = await supabase
        .from('properties')
        .delete()
        .eq('id', entityId)
        .eq('owner_id', user.id)

      if (delErr) {
        return { success: false, error: delErr.message || 'Could not move property to trash.' }
      }
    } else if (entityType === 'room') {
      const { data: room, error: fetchErr } = await supabase
        .from('rooms')
        .select('*')
        .eq('id', entityId)
        .eq('owner_id', user.id)
        .maybeSingle()

      if (fetchErr || !room) {
        return { success: false, error: 'Room not found or unauthorized.' }
      }

      const { data: roomBeds } = await supabase.from('beds').select('*').eq('room_id', entityId).eq('owner_id', user.id)
      snapshot = { room, beds: roomBeds || [] }
      entityName = entityName || `Room ${room.room_number}`
      details = details || `${room.room_type} · Floor ${room.floor}`

      const { error: delErr } = await supabase
        .from('rooms')
        .delete()
        .eq('id', entityId)
        .eq('owner_id', user.id)

      if (delErr) {
        return { success: false, error: delErr.message || 'Could not move room to trash.' }
      }
    } else if (entityType === 'bed') {
      const { data: bed, error: fetchErr } = await supabase
        .from('beds')
        .select('*')
        .eq('id', entityId)
        .eq('owner_id', user.id)
        .maybeSingle()

      if (fetchErr || !bed) {
        return { success: false, error: 'Bed not found or unauthorized.' }
      }

      snapshot = bed
      entityName = entityName || `Bed ${bed.bed_number}`
      details = details || `Status: ${bed.status} · ₹${bed.monthly_rate}/mo`

      const { error: delErr } = await supabase
        .from('beds')
        .delete()
        .eq('id', entityId)
        .eq('owner_id', user.id)

      if (delErr) {
        return { success: false, error: delErr.message || 'Could not move bed to trash.' }
      }
    } else if (entityType === 'expense') {
      const { data: expense, error: fetchErr } = await supabase
        .from('expenses')
        .select('*')
        .eq('id', entityId)
        .eq('owner_id', user.id)
        .maybeSingle()

      if (fetchErr || !expense) {
        return { success: false, error: 'Expense not found or unauthorized.' }
      }

      snapshot = expense
      entityName = entityName || expense.title
      details = details || `${expense.category} · ₹${expense.amount}`

      const { error: delErr } = await supabase
        .from('expenses')
        .delete()
        .eq('id', entityId)
        .eq('owner_id', user.id)

      if (delErr) {
        return { success: false, error: delErr.message || 'Could not move expense to trash.' }
      }
    } else if (entityType === 'complaint') {
      const { data: complaint, error: fetchErr } = await supabase
        .from('complaints')
        .select('*')
        .eq('id', entityId)
        .eq('owner_id', user.id)
        .maybeSingle()

      if (fetchErr || !complaint) {
        return { success: false, error: 'Complaint not found or unauthorized.' }
      }

      snapshot = complaint
      entityName = entityName || complaint.title
      details = details || `${complaint.category || 'Maintenance'} · ${complaint.priority || 'Medium'} priority`

      const { error: delErr } = await supabase
        .from('complaints')
        .delete()
        .eq('id', entityId)
        .eq('owner_id', user.id)

      if (delErr) {
        return { success: false, error: delErr.message || 'Could not move complaint to trash.' }
      }
    } else if (entityType === 'electricity') {
      const { data: reading, error: fetchErr } = await supabase
        .from('electricity_readings')
        .select('*')
        .eq('id', entityId)
        .eq('owner_id', user.id)
        .maybeSingle()

      if (fetchErr || !reading) {
        return { success: false, error: 'Meter reading not found or unauthorized.' }
      }

      snapshot = reading
      entityName = entityName || `Meter Reading on ${reading.reading_date || 'Date'}`
      const units = Math.max(0, Number(reading.current_reading || 0) - Number(reading.previous_reading || 0))
      details = details || `${units} units @ ₹${reading.rate_per_unit || 10}/unit`

      const { error: delErr } = await supabase
        .from('electricity_readings')
        .delete()
        .eq('id', entityId)
        .eq('owner_id', user.id)

      if (delErr) {
        return { success: false, error: delErr.message || 'Could not move meter reading to trash.' }
      }
    } else if (entityType === 'payment') {
      // Reversal approach for financial compliance: do not silently delete accounting history
      const { data: payment, error: fetchErr } = await supabase
        .from('payments')
        .select('*')
        .eq('id', entityId)
        .eq('owner_id', user.id)
        .maybeSingle()

      if (fetchErr || !payment) {
        return { success: false, error: 'Payment not found or unauthorized.' }
      }

      snapshot = payment
      entityName = entityName || `Payment REC-${payment.id.slice(0, 8).toUpperCase()}`
      details = details || `₹${payment.amount} via ${payment.payment_method || 'UPI'} (Reversed)`

      const reversedNote = `[REVERSED on ${new Date().toISOString()}] ${payment.notes || ''}`.trim()
      const { error: updateErr } = await supabase
        .from('payments')
        .update({
          notes: reversedNote,
          deleted_at: new Date().toISOString(),
        })
        .eq('id', entityId)
        .eq('owner_id', user.id)

      if (updateErr) {
        console.error('Failed to reverse payment in database:', updateErr)
        return { success: false, error: `Could not reverse payment: ${updateErr.message}` }
      }
    }

    // Save snapshot into platform_audit_logs with status: 'in_trash'
    const { error: auditErr } = await admin.from('platform_audit_logs').insert({
      actor_id: user.id,
      action: `soft_delete_${entityType}`,
      target_type: entityType,
      target_id: String(entityId),
      metadata: {
        status: 'in_trash',
        entity_type: entityType,
        entity_name: entityName,
        details,
        deleted_at: new Date().toISOString(),
        deleted_by: user.email || 'PG Owner',
        snapshot,
      },
    })

    if (auditErr) {
      console.error('moveToTrashAction audit error:', auditErr)
    }

    const typeLabels: Record<string, string> = {
      property: 'Property',
      room: 'Room',
      bed: 'Bed',
      tenant: 'Resident',
      expense: 'Expense',
      electricity: 'Meter reading',
      complaint: 'Complaint',
      payment: 'Payment record',
    }

    return {
      success: true,
      message: `${typeLabels[entityType] || 'Record'} moved to Deleted Records.`,
    }
  } catch (err: any) {
    console.error('moveToTrashAction exception:', err)
    return { success: false, error: err?.message || 'Failed to move record to trash.' }
  }
}

/**
 * Server Action: Fetch Owner Trash Records
 * Strict owner isolation: only returns records where actor_id === user.id.
 */
export async function getTrashRecordsAction(): Promise<{ success: boolean; records: TrashRecord[]; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return { success: false, records: [], error: 'Your session has expired. Please sign in again.' }
    }

    const admin = await createAdminClient()
    const { data: logs, error } = await admin
      .from('platform_audit_logs')
      .select('id, actor_id, action, target_type, target_id, metadata, created_at')
      .eq('actor_id', user.id)
      .like('action', 'soft_delete_%')
      .order('created_at', { ascending: false })

    if (error) {
      return { success: false, records: [], error: error.message }
    }

    const records: TrashRecord[] = (logs || [])
      .filter((log: any) => log.metadata?.status === 'in_trash')
      .map((log: any) => ({
        id: log.id,
        target_id: log.target_id,
        entity_type: log.metadata?.entity_type || log.target_type,
        entity_name: log.metadata?.entity_name || `${log.target_type} #${log.target_id?.slice(0, 8) || ''}`,
        details: log.metadata?.details || '',
        deleted_at: log.metadata?.deleted_at || log.created_at,
        deleted_by: log.metadata?.deleted_by || user.email || 'PG Owner',
        snapshot: log.metadata?.snapshot || {},
      }))

    return { success: true, records }
  } catch (err: any) {
    return { success: false, records: [], error: err?.message || 'Failed to fetch trash records.' }
  }
}

/**
 * Server Action: Restore Record from Trash
 * Validates ownership, re-inserts row into active table, updates status in audit log.
 */
export async function restoreTrashRecordAction(trashId: string): Promise<TrashActionResult> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return { success: false, error: 'Your session has expired. Please sign in again.' }
    }

    const admin = await createAdminClient()
    const { data: logEntry, error: fetchErr } = await admin
      .from('platform_audit_logs')
      .select('*')
      .eq('id', trashId)
      .eq('actor_id', user.id)
      .maybeSingle()

    if (fetchErr || !logEntry) {
      return { success: false, error: 'Deleted record not found in Trash or unauthorized.' }
    }

    const meta = logEntry.metadata || {}
    if (meta.status !== 'in_trash') {
      return { success: false, error: 'This record has already been restored or permanently deleted.' }
    }

    const entityType = meta.entity_type || logEntry.target_type
    const snapshot = meta.snapshot
    if (!snapshot) {
      return { success: false, error: 'Snapshot data missing for this record.' }
    }

    if (entityType === 'tenant') {
      let targetBedId = snapshot.bed_id || null
      if (targetBedId) {
        const { data: bed } = await supabase
          .from('beds')
          .select('id, status')
          .eq('id', targetBedId)
          .eq('owner_id', user.id)
          .maybeSingle()

        if (bed && bed.status === 'available') {
          await supabase.from('beds').update({ status: 'occupied' }).eq('id', targetBedId).eq('owner_id', user.id)
        } else {
          targetBedId = null
        }
      }

      const tenantPayload = {
        ...snapshot,
        owner_id: user.id,
        bed_id: targetBedId,
        updated_at: new Date().toISOString(),
      }

      const { error: insertErr } = await supabase.from('tenants').upsert(tenantPayload, { onConflict: 'id' })
      if (insertErr) {
        return { success: false, error: `Could not restore resident: ${insertErr.message}` }
      }
    } else if (entityType === 'property') {
      const entitlement = await getOwnerEntitlements(supabase, user.id)
      if (!entitlement.canCreateProperty) {
        return {
          success: false,
          error: `Cannot restore property: your subscription includes up to ${entitlement.maxProperties} properties (${entitlement.activePropertyCount}/${entitlement.maxProperties} currently active). Please upgrade your plan to restore this property.`,
        }
      }

      const propData = snapshot.property || snapshot
      const { error: insertErr } = await supabase.from('properties').upsert({
        ...propData,
        owner_id: user.id,
      }, { onConflict: 'id' })

      if (insertErr) {
        return { success: false, error: `Could not restore property: ${insertErr.message}` }
      }

      if (Array.isArray(snapshot.rooms) && snapshot.rooms.length > 0) {
        const roomsPayload = snapshot.rooms.map((r: any) => ({ ...r, owner_id: user.id }))
        await supabase.from('rooms').upsert(roomsPayload, { onConflict: 'id' })
      }
      if (Array.isArray(snapshot.beds) && snapshot.beds.length > 0) {
        const bedsPayload = snapshot.beds.map((b: any) => ({ ...b, owner_id: user.id }))
        await supabase.from('beds').upsert(bedsPayload, { onConflict: 'id' })
      }
    } else if (entityType === 'room') {
      const roomData = snapshot.room || snapshot
      const { error: insertErr } = await supabase.from('rooms').upsert({
        ...roomData,
        owner_id: user.id,
      }, { onConflict: 'id' })

      if (insertErr) {
        return { success: false, error: `Could not restore room: ${insertErr.message}` }
      }

      if (Array.isArray(snapshot.beds) && snapshot.beds.length > 0) {
        const bedsPayload = snapshot.beds.map((b: any) => ({ ...b, owner_id: user.id }))
        await supabase.from('beds').upsert(bedsPayload, { onConflict: 'id' })
      }
    } else if (entityType === 'bed') {
      const { error: insertErr } = await supabase.from('beds').upsert({
        ...snapshot,
        owner_id: user.id,
      }, { onConflict: 'id' })

      if (insertErr) {
        return { success: false, error: `Could not restore bed: ${insertErr.message}` }
      }
    } else if (entityType === 'expense') {
      const { error: insertErr } = await supabase.from('expenses').upsert({
        ...snapshot,
        owner_id: user.id,
      }, { onConflict: 'id' })

      if (insertErr) {
        return { success: false, error: `Could not restore expense: ${insertErr.message}` }
      }
    } else if (entityType === 'complaint') {
      const { error: insertErr } = await supabase.from('complaints').upsert({
        ...snapshot,
        owner_id: user.id,
      }, { onConflict: 'id' })

      if (insertErr) {
        return { success: false, error: `Could not restore complaint: ${insertErr.message}` }
      }
    } else if (entityType === 'electricity') {
      const { error: insertErr } = await supabase.from('electricity_readings').upsert({
        ...snapshot,
        owner_id: user.id,
      }, { onConflict: 'id' })

      if (insertErr) {
        return { success: false, error: `Could not restore meter reading: ${insertErr.message}` }
      }
    } else if (entityType === 'payment') {
      const cleanNotes = (snapshot.notes || '').replace(/\[REVERSED[^\]]*\]/g, '').trim()
      const { error: restoreErr } = await supabase
        .from('payments')
        .update({
          notes: cleanNotes,
          deleted_at: null,
        })
        .eq('id', snapshot.id)
        .eq('owner_id', user.id)

      if (restoreErr) {
        return { success: false, error: `Could not restore payment: ${restoreErr.message}` }
      }
    }

    await admin.from('platform_audit_logs').update({
      metadata: {
        ...meta,
        status: 'restored',
        restored_at: new Date().toISOString(),
      },
    }).eq('id', trashId).eq('actor_id', user.id)

    await admin.from('platform_audit_logs').insert({
      actor_id: user.id,
      action: `restore_${entityType}`,
      target_type: entityType,
      target_id: String(logEntry.target_id),
      metadata: {
        restored_at: new Date().toISOString(),
        entity_name: meta.entity_name,
      },
    })

    const typeLabels: Record<string, string> = {
      property: 'Property',
      room: 'Room',
      bed: 'Bed',
      tenant: 'Tenant',
      expense: 'Expense',
      electricity: 'Meter reading',
      complaint: 'Complaint',
      payment: 'Payment',
    }

    return {
      success: true,
      message: `${typeLabels[entityType] || 'Record'} restored successfully.`,
    }
  } catch (err: any) {
    console.error('restoreTrashRecordAction exception:', err)
    return { success: false, error: err?.message || 'Failed to restore record.' }
  }
}

/**
 * Server Action: Permanently Delete Record from Trash
 * Validates ownership, marks the audit log as 'purged' with confirmation safeguard.
 */
export async function permanentlyDeleteTrashAction(trashId: string): Promise<TrashActionResult> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return { success: false, error: 'Your session has expired. Please sign in again.' }
    }

    const admin = await createAdminClient()
    const { data: logEntry, error: fetchErr } = await admin
      .from('platform_audit_logs')
      .select('*')
      .eq('id', trashId)
      .eq('actor_id', user.id)
      .maybeSingle()

    if (fetchErr || !logEntry) {
      return { success: false, error: 'Trash record not found or unauthorized.' }
    }

    await admin
      .from('platform_audit_logs')
      .update({
        metadata: {
          ...(logEntry.metadata || {}),
          status: 'purged',
          purged_at: new Date().toISOString(),
        },
      })
      .eq('id', trashId)
      .eq('actor_id', user.id)

    return {
      success: true,
      message: 'Record permanently deleted.',
    }
  } catch (err: any) {
    console.error('permanentlyDeleteTrashAction exception:', err)
    return { success: false, error: err?.message || 'Failed to permanently delete record.' }
  }
}

/**
 * Legacy delete actions rerouted to soft-delete (moveToTrashAction) to prevent accidental permanent deletion
 */
export async function deleteTenantAction(tenantId: string): Promise<{ success: boolean; error?: string }> {
  const res = await moveToTrashAction({ entityType: 'tenant', entityId: tenantId })
  return { success: res.success, error: res.error }
}

export async function deleteExpenseAction(expenseId: string): Promise<{ success: boolean; error?: string }> {
  const res = await moveToTrashAction({ entityType: 'expense', entityId: expenseId })
  return { success: res.success, error: res.error }
}

export async function deletePaymentAction(paymentId: string): Promise<{ success: boolean; error?: string }> {
  const res = await moveToTrashAction({ entityType: 'payment', entityId: paymentId })
  return { success: res.success, error: res.error }
}

export interface CreatePropertyInput {
  name: string
  address?: string
  contact?: string
  city?: string
  rules?: string
  upiId?: string
  paymentLink?: string
  qrCodeUrl?: string
}

export interface PropertyActionResult {
  success: boolean
  error?: string
  property?: any
  entitlement?: CustomerEntitlement
  code?: string
}

/**
 * Server Action: Create Property
 * Enforces authenticated owner isolation, authoritative subscription entitlement check,
 * and maximum property limit (default 2 properties per subscription).
 */
export async function createPropertyAction(input: CreatePropertyInput): Promise<PropertyActionResult> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()

    if (authErr || !user) {
      return { success: false, error: 'Your session has expired. Please sign in again.' }
    }

    const name = input.name?.trim()
    if (!name) {
      return { success: false, error: 'Please provide a valid property name.' }
    }

    // Server-side Authoritative Entitlement Verification
    const entitlement = await getOwnerEntitlements(supabase, user.id)
    if (!entitlement.canCreateProperty) {
      return {
        success: false,
        error: entitlement.reason || `Your plan allows up to ${entitlement.maxProperties} properties. Upgrade your plan to add more properties.`,
        code: 'PROPERTY_LIMIT_REACHED',
        entitlement,
      }
    }

    const insertPayload: Record<string, any> = {
      owner_id: user.id,
      name,
      address: input.address?.trim() || null,
      contact_number: input.contact?.trim() || null,
      city: input.city?.trim() || null,
      rules: input.rules || null,
      upi_id: input.upiId?.trim() || null,
      payment_link: input.paymentLink?.trim() || null,
      upi_qr_url: input.qrCodeUrl?.trim() || null,
      updated_at: new Date().toISOString(),
    }

    const { data: newProp, error: insertErr } = await supabase
      .from('properties')
      .insert(insertPayload)
      .select('id,name,address,contact_number,city,rules,upi_id,payment_link,upi_qr_url')
      .single()

    if (insertErr) {
      if (insertErr.code === 'P0002' || insertErr.message?.includes('Property limit reached')) {
        return {
          success: false,
          error: `Property limit reached. Your subscription includes up to ${entitlement.maxProperties} properties. Please upgrade your plan to add more properties.`,
          code: 'PROPERTY_LIMIT_REACHED',
        }
      }
      if (insertErr.message?.includes('uq_properties_owner') || insertErr.code === '23505') {
        return {
          success: false,
          error: 'Legacy database constraint "uq_properties_owner" detected. Please run migration 20261021000001_fix_multi_property_constraint.sql in Supabase to allow multiple properties.',
          code: 'LEGACY_CONSTRAINT_ERROR',
        }
      }
      return { success: false, error: `Could not save property: ${insertErr.message}` }
    }

    return {
      success: true,
      property: newProp,
      entitlement: {
        ...entitlement,
        activePropertyCount: entitlement.activePropertyCount + 1,
        remainingPropertySlots: Math.max(0, entitlement.remainingPropertySlots - 1),
        canCreateProperty: entitlement.activePropertyCount + 1 < entitlement.maxProperties,
      },
    }
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to create property.' }
  }
}

/**
 * Server Action: Update Property
 * Updates an existing property record with strict owner isolation.
 */
export async function updatePropertyAction(
  propertyId: string,
  input: CreatePropertyInput
): Promise<PropertyActionResult> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()

    if (authErr || !user) {
      return { success: false, error: 'Your session has expired. Please sign in again.' }
    }

    const name = input.name?.trim()
    if (!name) {
      return { success: false, error: 'Please provide a valid property name.' }
    }

    const updatePayload: Record<string, any> = {
      name,
      address: input.address?.trim() || null,
      contact_number: input.contact?.trim() || null,
      city: input.city?.trim() || null,
      rules: input.rules || null,
      updated_at: new Date().toISOString(),
    }

    if (input.upiId !== undefined) updatePayload.upi_id = input.upiId?.trim() || null
    if (input.paymentLink !== undefined) updatePayload.payment_link = input.paymentLink?.trim() || null
    if (input.qrCodeUrl !== undefined) updatePayload.upi_qr_url = input.qrCodeUrl?.trim() || null

    const { data: updatedProp, error: updateErr } = await supabase
      .from('properties')
      .update(updatePayload)
      .eq('id', propertyId)
      .eq('owner_id', user.id)
      .select('id,name,address,contact_number,city,rules,upi_id,payment_link,upi_qr_url')
      .single()

    if (updateErr) {
      return { success: false, error: `Could not update property: ${updateErr.message}` }
    }

    return { success: true, property: updatedProp }
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to update property.' }
  }
}

