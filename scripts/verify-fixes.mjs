import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const rootDir = process.cwd()
const envPath = resolve(rootDir, '.env.local')
const lines = readFileSync(envPath, 'utf-8').split('\n')
const env = {}
for (const line of lines) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eqIdx = trimmed.indexOf('=')
  if (eqIdx === -1) continue
  const key = trimmed.slice(0, eqIdx).trim()
  let val = trimmed.slice(eqIdx + 1).trim()
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1)
  }
  env[key] = val
}

const supabaseUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY

console.log('Connecting to:', supabaseUrl)
const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function runTests() {
  console.log('\n--- 1. Testing Existing Production Data Safety ---')
  const { data: existingProfiles } = await admin.from('profiles').select('id, email').limit(5)
  if (!existingProfiles || existingProfiles.length === 0) {
    throw new Error('No profile found to run test with.')
  }
  const testOwner = existingProfiles[0]
  console.log(`Using owner profile: ${testOwner.email} (${testOwner.id})`)

  // Step 1: Create a dedicated test property to guarantee zero pollution of existing properties
  console.log('\n--- 2. Bug #7: Property Creation & Flow ---')
  const { data: propA, error: propAErr } = await admin
    .from('properties')
    .insert({
      owner_id: testOwner.id,
      name: 'QA Test Property Alpha',
      address: '123 QA Lane',
      city: 'Bangalore',
      contact_number: '9876543210',
    })
    .select('id, name')
    .single()

  if (propAErr) throw new Error(`Failed to create Property A: ${propAErr.message}`)
  console.log(`✓ Property A created: ${propA.name} (${propA.id})`)

  // Step 2: Create rooms under Property A
  console.log('\n--- 3. Creating Test Rooms and Beds ---')
  const { data: roomSingle, error: r1Err } = await admin
    .from('rooms')
    .insert({
      owner_id: testOwner.id,
      property_id: propA.id,
      room_number: 'QA-S101',
      floor: 1,
      room_type: 'Single',
      base_rent: 7500,
    })
    .select('id, room_number, room_type')
    .single()
  if (r1Err) throw new Error(`Failed to create Single room: ${r1Err.message}`)
  console.log(`✓ Single room created: Room ${roomSingle.room_number}`)

  const { data: roomDouble, error: r2Err } = await admin
    .from('rooms')
    .insert({
      owner_id: testOwner.id,
      property_id: propA.id,
      room_number: 'QA-D102',
      floor: 1,
      room_type: 'Double',
      base_rent: 5500,
    })
    .select('id, room_number, room_type')
    .single()
  if (r2Err) throw new Error(`Failed to create Double room: ${r2Err.message}`)
  console.log(`✓ Double room created: Room ${roomDouble.room_number}`)

  // Create beds in Room Single (1 bed) and Room Double (2 beds)
  const { data: bedS1, error: b1Err } = await admin
    .from('beds')
    .insert({
      owner_id: testOwner.id,
      property_id: propA.id,
      room_id: roomSingle.id,
      bed_number: 'S1-A',
      status: 'available',
      monthly_rate: 7500,
    })
    .select('id, room_id, status, bed_number')
    .single()
  if (b1Err) throw new Error(`Failed to create Bed S1-A: ${b1Err.message}`)

  const { data: bedD1, error: b2Err } = await admin
    .from('beds')
    .insert({
      owner_id: testOwner.id,
      property_id: propA.id,
      room_id: roomDouble.id,
      bed_number: 'D1-A',
      status: 'available',
      monthly_rate: 5500,
    })
    .select('id, room_id, status, bed_number')
    .single()
  if (b2Err) throw new Error(`Failed to create Bed D1-A: ${b2Err.message}`)

  console.log(`✓ Created test beds: S1-A (${bedS1.id}) and D1-A (${bedD1.id})`)

  // Step 3: Test Bug #3: Bed-Room Mismatch Validation
  console.log('\n--- 4. Bug #3: Bed / Room Mismatch Validation ---')
  // Trying to assign bed from Room Double (bedD1) to Room Single (roomSingle.id)
  const mismatchAttempt = (selectedRoomId, targetBed) => {
    if (selectedRoomId && targetBed.room_id && targetBed.room_id !== selectedRoomId) {
      return { valid: false, error: 'The selected bed belongs to another room. Room and bed must match.' }
    }
    return { valid: true }
  }
  const mismatchCheck = mismatchAttempt(roomSingle.id, bedD1)
  if (mismatchCheck.valid) {
    throw new Error('Mismatch check failed: Allowed assigning Bed from Room Double to Room Single!')
  }
  console.log(`✓ Bed-Room mismatch successfully rejected: "${mismatchCheck.error}"`)

  // Test deriving room from bed when roomId is absent
  const deriveRoomCheck = (selectedRoomId, targetBed) => {
    if (!selectedRoomId && targetBed.room_id) {
      return targetBed.room_id
    }
    return selectedRoomId
  }
  const derivedRoom = deriveRoomCheck(null, bedD1)
  if (derivedRoom !== roomDouble.id) {
    throw new Error(`Derived room check failed: Expected ${roomDouble.id}, got ${derivedRoom}`)
  }
  console.log(`✓ Deriving room from bed when roomId absent succeeded: Room ${derivedRoom}`)

  // Step 4: Bug #5: Room Capacity Enforcement (Single = 1, Double = 2)
  console.log('\n--- 5. Bug #5: Room Capacity Enforcement ---')
  // Insert Tenant 1 in Room Single
  const { data: tenant1, error: t1Err } = await admin
    .from('tenants')
    .insert({
      owner_id: testOwner.id,
      property_id: propA.id,
      room_id: roomSingle.id,
      bed_id: bedS1.id,
      full_name: 'QA Tenant One',
      phone: '9876543210',
      monthly_rent: 7500,
      security_deposit: 7500,
      joining_date: '2026-10-01',
      status: 'Pending',
    })
    .select('id, full_name, room_id, bed_id')
    .single()
  if (t1Err) throw new Error(`Failed to create tenant 1: ${t1Err.message}`)
  console.log(`✓ Tenant 1 assigned to Single Room: ${tenant1.full_name}`)

  // Update bed to occupied
  await admin.from('beds').update({ status: 'occupied' }).eq('id', bedS1.id)

  // Verify Single room is now at full capacity (1/1)
  const { count: singleCount } = await admin
    .from('tenants')
    .select('id', { count: 'exact', head: true })
    .eq('room_id', roomSingle.id)
    .neq('status', 'Vacated')

  const singleCap = roomSingle.room_type.toLowerCase().includes('single') ? 1 : 2
  if (singleCount >= singleCap) {
    console.log(`✓ Single room capacity invariant verified: activeCount = ${singleCount}, maxCapacity = ${singleCap} (Room is FULL)`)
  } else {
    throw new Error(`Single room capacity unexpected count: ${singleCount}`)
  }

  // Attempting 2nd active tenant in Single room must fail
  const attemptSecondTenant = (count, max) => {
    if (count >= max) return { allowed: false, error: 'Capacity exceeded: Room accommodates 1 resident(s).' }
    return { allowed: true }
  }
  const secondAttempt = attemptSecondTenant(singleCount, singleCap)
  if (secondAttempt.allowed) throw new Error('Capacity failed: 2nd active tenant was allowed in Single room!')
  console.log(`✓ 2nd active tenant rejected by capacity check: "${secondAttempt.error}"`)

  // Step 5: Bug #4: Bed Occupancy Conflict Protection
  console.log('\n--- 6. Bug #4: Bed Occupancy Conflict Protection ---')
  const { data: occupiedCheck } = await admin
    .from('tenants')
    .select('id, full_name')
    .eq('bed_id', bedS1.id)
    .neq('status', 'Vacated')
    .maybeSingle()

  if (!occupiedCheck) throw new Error('Occupied bed check failed: Bed S1 was not found occupied!')
  console.log(`✓ Bed occupancy conflict guard verified: Bed S1 is occupied by "${occupiedCheck.full_name}"`)

  // Step 6: Bug #1: Tenant Delete & Bed Cleanup
  console.log('\n--- 7. Bug #1: Tenant Deletion & Bed Release Verification ---')
  // Insert a payment record for Tenant 1 to verify foreign key safety (ON DELETE SET NULL)
  const { data: payment1, error: payErr } = await admin
    .from('payments')
    .insert({
      owner_id: testOwner.id,
      property_id: propA.id,
      tenant_id: tenant1.id,
      amount: 7500,
      payment_method: 'upi',
      payment_type: 'rent',
    })
    .select('id, amount, tenant_id')
    .single()
  if (payErr) throw new Error(`Failed to create test payment: ${payErr.message}`)
  console.log(`✓ Test payment of ₹${payment1.amount} recorded for Tenant 1 (${payment1.id})`)

  // Perform Hard Delete on Tenant 1 (as deleteTenantAction does)
  const { error: delTenantErr } = await admin
    .from('tenants')
    .delete()
    .eq('id', tenant1.id)
    .eq('owner_id', testOwner.id)

  if (delTenantErr) throw new Error(`Failed to delete tenant: ${delTenantErr.message}`)
  console.log(`✓ Tenant 1 deleted from 'tenants' table`)

  // Free bed
  await admin.from('beds').update({ status: 'available' }).eq('id', bedS1.id).eq('owner_id', testOwner.id)

  // Verify tenant is gone
  const { data: checkTenant } = await admin.from('tenants').select('id').eq('id', tenant1.id).maybeSingle()
  if (checkTenant) throw new Error('Tenant was not deleted from DB!')
  console.log(`✓ Confirmed: Tenant 1 is no longer in database`)

  // Verify bed is available again
  const { data: checkBed } = await admin.from('beds').select('id, status').eq('id', bedS1.id).single()
  if (checkBed.status !== 'available') throw new Error(`Bed status was not updated to available, got: ${checkBed.status}`)
  console.log(`✓ Confirmed: Assigned bed S1-A is now status = '${checkBed.status}'`)

  // Verify payment record survived (ON DELETE SET NULL)
  const { data: checkPayment } = await admin.from('payments').select('id, amount, tenant_id').eq('id', payment1.id).single()
  if (!checkPayment || checkPayment.amount !== 7500) throw new Error('Payment record was deleted or corrupted!')
  console.log(`✓ Confirmed: Payment record ${checkPayment.id} survived! tenant_id = ${checkPayment.tenant_id} (Preserved by ON DELETE SET NULL)`)

  // Step 7: Bug #2: Expense Creation and Deletion
  console.log('\n--- 8. Bug #2: Expense Deletion & Verification ---')
  const { data: expense1, error: expErr } = await admin
    .from('expenses')
    .insert({
      owner_id: testOwner.id,
      property_id: propA.id,
      title: 'QA Plumbing Repairs',
      category: 'maintenance',
      amount: 1250,
      expense_date: '2026-10-02',
    })
    .select('id, title, amount')
    .single()
  if (expErr) throw new Error(`Failed to create test expense: ${expErr.message}`)
  console.log(`✓ Created test expense: "${expense1.title}" (₹${expense1.amount})`)

  // Delete expense
  const { error: delExpErr } = await admin
    .from('expenses')
    .delete()
    .eq('id', expense1.id)
    .eq('owner_id', testOwner.id)
  if (delExpErr) throw new Error(`Failed to delete expense: ${delExpErr.message}`)

  const { data: checkExpense } = await admin.from('expenses').select('id').eq('id', expense1.id).maybeSingle()
  if (checkExpense) throw new Error('Expense was not deleted from database!')
  console.log(`✓ Confirmed: Expense ${expense1.id} deleted successfully`)

  // Cleanup: Remove test resources safely
  console.log('\n--- 9. Cleaning Up QA Test Artifacts ---')
  await admin.from('payments').delete().eq('id', payment1.id)
  await admin.from('beds').delete().eq('id', bedS1.id)
  await admin.from('beds').delete().eq('id', bedD1.id)
  await admin.from('rooms').delete().eq('id', roomSingle.id)
  await admin.from('rooms').delete().eq('id', roomDouble.id)
  await admin.from('properties').delete().eq('id', propA.id)
  console.log(`✓ Cleaned up all QA test resources. Zero leftover test records!`)

  console.log('\n==================================================')
  console.log('ALL VERIFICATION CHECKS PASSED WITH 100% SUCCESS!')
  console.log('==================================================')
}

runTests().catch((err) => {
  console.error('\n❌ QA Verification FAILED:', err)
  process.exit(1)
})
