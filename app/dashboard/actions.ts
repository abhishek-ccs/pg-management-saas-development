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
    const roomId = input.roomId && input.roomId !== 'unassigned' ? input.roomId : null
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

    // 2. Room Capacity & Bed Conflict Validation on Server
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
        const maxCapacity = type === 'single' ? 1 : type === 'double' ? 2 : type === 'triple' ? 3 : 4
        if ((activeTenantsCount || 0) >= maxCapacity) {
          return {
            success: false,
            error: `Capacity exceeded: Room ${targetRoom.room_number} (${targetRoom.room_type}) only accommodates ${maxCapacity} resident(s).`,
          }
        }
      }
    }

    // 3. Bed Assignment Conflict Check
    if (bedId) {
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

    // 4. Construct guaranteed baseline payload
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
      console.error('createTenantAction DB Error:', insertError)
      if (insertError.code === 'PGRST303' || insertError.message?.includes('JWT')) {
        return { success: false, error: 'Your session has expired. Please sign in again.' }
      }
      return { success: false, error: insertError.message || 'Could not create tenant record.' }
    }

    // 5. Update assigned bed status to 'occupied'
    if (newTenant.bed_id) {
      await supabase
        .from('beds')
        .update({ status: 'occupied' })
        .eq('id', newTenant.bed_id)
        .eq('owner_id', user.id)
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
      .select('id, bed_id, owner_id')
      .eq('id', tenantId)
      .eq('owner_id', user.id)
      .maybeSingle()

    if (!existingTenant) {
      return { success: false, error: 'Resident record not found or unauthorized.' }
    }

    const updatePayload = {
      full_name: input.name.trim(),
      phone: input.phone.trim(),
      room_id: input.roomId && input.roomId !== 'unassigned' ? input.roomId : null,
      bed_id: input.bedId && input.bedId !== 'unassigned' ? input.bedId : null,
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

    // Mark new bed occupied
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
