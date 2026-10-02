'use server'

import { createClient } from '@/lib/supabase/server'
import { isValidPhone } from '@/lib/validation'

export interface CreateTenantInput {
  name: string
  phone: string
  roomId: string | null
  bedId: string | null
  propertyId: string | null
  rent: number
  deposit: number
  joiningDate: string
  dueDay?: number
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
    const propertyId = input.propertyId && input.propertyId !== 'unassigned' ? input.propertyId : null

    if (!name || rent <= 0) {
      return { success: false, error: 'Please provide a valid tenant name and monthly rent.' }
    }

    if (!phone || !isValidPhone(phone)) {
      return { success: false, error: 'Please enter a valid 10-15 digit tenant contact phone number.' }
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
      status: 'Pending',
    }

    // Attempt insert with guaranteed columns
    const { data: newTenant, error: insertError } = await supabase
      .from('tenants')
      .insert(tenantPayload)
      .select('id, full_name, phone, monthly_rent, security_deposit, joining_date, status, room_id, bed_id, property_id')
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
    rent: number
    deposit: number
    joiningDate: string
    status: string
  }
): Promise<TenantActionResult> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()

    if (authErr || !user) {
      return { success: false, error: 'Your session has expired. Please sign in again.' }
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

    const updatePayload = {
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

    const { data: updatedTenant, error: updateError } = await supabase
      .from('tenants')
      .update(updatePayload)
      .eq('id', tenantId)
      .eq('owner_id', user.id)
      .select('id, full_name, phone, monthly_rent, security_deposit, joining_date, status, room_id, bed_id')
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

/**
 * Server Action: Delete Resident (Tenant)
 * Performs strict owner-isolated hard delete.
 * Automatically releases assigned bed to 'available'.
 * Payment records are preserved by database ON DELETE SET NULL on payments.tenant_id.
 */
export async function deleteTenantAction(tenantId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()

    if (authErr || !user) {
      return { success: false, error: 'Your session has expired. Please sign in again.' }
    }

    if (!tenantId) {
      return { success: false, error: 'Resident ID is required.' }
    }

    // 1. Fetch tenant to verify ownership and get assigned bed_id
    const { data: tenant, error: fetchErr } = await supabase
      .from('tenants')
      .select('id, bed_id, owner_id')
      .eq('id', tenantId)
      .eq('owner_id', user.id)
      .maybeSingle()

    if (fetchErr || !tenant) {
      return { success: false, error: 'Resident record not found or unauthorized.' }
    }

    // 2. Perform hard delete with owner isolation
    const { error: deleteErr } = await supabase
      .from('tenants')
      .delete()
      .eq('id', tenantId)
      .eq('owner_id', user.id)

    if (deleteErr) {
      console.error('deleteTenantAction DB Error:', deleteErr)
      return { success: false, error: deleteErr.message || 'Could not delete resident record.' }
    }

    // 3. Free bed if tenant was assigned
    if (tenant.bed_id) {
      await supabase
        .from('beds')
        .update({ status: 'available' })
        .eq('id', tenant.bed_id)
        .eq('owner_id', user.id)
    }

    return { success: true }
  } catch (err: any) {
    console.error('deleteTenantAction exception:', err)
    return { success: false, error: err?.message || 'Unexpected server error while deleting resident.' }
  }
}

/**
 * Server Action: Delete Expense
 * Strictly owner-isolated hard delete.
 */
export async function deleteExpenseAction(expenseId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()

    if (authErr || !user) {
      return { success: false, error: 'Your session has expired. Please sign in again.' }
    }

    if (!expenseId) {
      return { success: false, error: 'Expense ID is required.' }
    }

    const { error: deleteErr } = await supabase
      .from('expenses')
      .delete()
      .eq('id', expenseId)
      .eq('owner_id', user.id)

    if (deleteErr) {
      console.error('deleteExpenseAction DB Error:', deleteErr)
      return { success: false, error: deleteErr.message || 'Could not delete expense entry.' }
    }

    return { success: true }
  } catch (err: any) {
    console.error('deleteExpenseAction exception:', err)
    return { success: false, error: err?.message || 'Unexpected server error while deleting expense.' }
  }
}

/**
 * Server Action: Delete Payment Record
 * Strictly owner-isolated hard delete.
 */
export async function deletePaymentAction(paymentId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()

    if (authErr || !user) {
      return { success: false, error: 'Your session has expired. Please sign in again.' }
    }

    if (!paymentId) {
      return { success: false, error: 'Payment ID is required.' }
    }

    const { error: deleteErr } = await supabase
      .from('payments')
      .delete()
      .eq('id', paymentId)
      .eq('owner_id', user.id)

    if (deleteErr) {
      console.error('deletePaymentAction DB Error:', deleteErr)
      return { success: false, error: deleteErr.message || 'Could not delete payment record.' }
    }

    return { success: true }
  } catch (err: any) {
    console.error('deletePaymentAction exception:', err)
    return { success: false, error: err?.message || 'Unexpected server error while deleting payment.' }
  }
}
