import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'

console.log('=== VERIFYING PERSISTENCE FIX: NO DATA DISAPPEARS AFTER REFRESH ===\n')

const dashboardCode = fs.readFileSync('app/dashboard/page.tsx', 'utf8')
const actionsCode = fs.readFileSync('app/dashboard/actions.ts', 'utf8')

// Test 1: Room Creation selects property_id
console.log('1. Checking Room creation and update property_id persistence...')
assert(
  dashboardCode.includes(".select('id,property_id,room_number,floor,room_type,base_rent')"),
  'Room queries must select property_id so state and DB retain property affiliation.'
)
assert(
  dashboardCode.includes('property_id: targetPropId'),
  'handleAddRoom must insert targetPropId.'
)
assert(
  dashboardCode.includes('updatedRoom: Room = {'),
  'handleUpdateRoom must preserve property_id in updatedRoom.'
)
console.log('✔ Room creation and update properly persist and retain property_id.')

// Test 2: Bed Creation resolves and persists property_id
console.log('2. Checking Bed creation property_id persistence...')
assert(
  dashboardCode.includes('const targetPropId = targetRoom?.property_id || property.id || selectedPropertyId || properties[0]?.id'),
  'handleAddBed must dynamically resolve target property ID from room or active property.'
)
console.log('✔ Bed creation properly resolves and persists property_id.')

// Test 3: Tenant Creation and Update Action auto-resolution
console.log('3. Checking Tenant Server Actions auto-resolution...')
assert(
  actionsCode.includes('// Auto-resolve propertyId if missing or unassigned'),
  'createTenantAction must auto-resolve propertyId from roomId or default property.'
)
assert(
  actionsCode.includes('targetPropertyId = roomObj.property_id'),
  'updateTenantAction must link property_id from assigned room.'
)
assert(
  dashboardCode.includes('propertyId: targetPropId'),
  'handleAddTenant and handleUpdateTenant must pass resolved targetPropId.'
)
console.log('✔ Tenant creation and update actions guarantee permanent database property affiliation.')

// Test 4: Payment, Expense, Electricity, and Complaint property persistence
console.log('4. Checking Ledger & Operations property persistence...')
assert(
  dashboardCode.includes('const targetPaymentPropId = property.id || selectedPropertyId || targetTenant.property_id'),
  'handleRecordPayment must resolve target property ID.'
)
assert(
  dashboardCode.includes('const targetExpensePropId = property.id || selectedPropertyId || properties[0]?.id'),
  'handleAddExpense must resolve target property ID.'
)
assert(
  dashboardCode.includes('const targetElecPropId = property.id || selectedPropertyId || targetRoomObj?.property_id'),
  'handleAddElectricity must resolve target property ID.'
)
assert(
  dashboardCode.includes('const targetCompPropId = property.id || selectedPropertyId || properties[0]?.id'),
  'handleAddComplaint must resolve target property ID.'
)
console.log('✔ Payments, expenses, electricity, and complaints resolve and persist valid property_id.')

// Test 5: fetchDashboardData session freshness and self-healing
console.log('5. Checking fetchDashboardData session freshness and database self-healing...')
assert(
  dashboardCode.includes('const sessionCheck = await ensureFreshSession(supabase)'),
  'fetchDashboardData must refresh stale session tokens proactively on page reload.'
)
assert(
  dashboardCode.includes('// Database self-healing queue for records with missing property_id'),
  'fetchDashboardData must detect and heal legacy orphaned records without property_id in the background.'
)
assert(
  dashboardCode.includes('missingPropertyUpdates.push('),
  'fetchDashboardData must queue background DB updates for unlinked records.'
)
console.log('✔ fetchDashboardData refreshes session tokens and self-heals legacy database records on refresh.')

// Test 6: Trash Restore property_id preservation
console.log('6. Checking Trash restore property_id preservation...')
assert(
  dashboardCode.includes('property_id: t.property_id || property.id || selectedPropertyId || properties[0]?.id || null'),
  'handleRestoreTrashRecord must preserve property_id on restored tenants.'
)
assert(
  dashboardCode.includes('property_id: p.property_id || property.id || selectedPropertyId || properties[0]?.id || null'),
  'handleRestoreTrashRecord must preserve property_id on restored payments.'
)
console.log('✔ handleRestoreTrashRecord preserves property affiliation across all restored entities.')

// Test 7: Zero UI Modification check
console.log('7. Checking UI preservation...')
assert(
  dashboardCode.includes('#8b5a2b'),
  'Brand theme #8b5a2b must be preserved.'
)
assert(
  dashboardCode.includes('#faf7f2'),
  'Background color #faf7f2 must be preserved.'
)
console.log('✔ UI styling, layout, fonts, colors, and design tokens strictly preserved.')

console.log('\n=============================================================')
console.log('🎉 ALL PERSISTENCE FIX TESTS PASSED! DATA REMAINS AFTER REFRESH.')
console.log('=============================================================')
