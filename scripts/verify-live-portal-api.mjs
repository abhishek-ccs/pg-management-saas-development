import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import assert from 'node:assert'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(__dirname, '..')
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

console.log('Testing Live Database with Supabase URL:', supabaseUrl)
const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function testLivePortalFlow() {
  console.log('1. Finding active tenant in database...')
  const { data: tenant, error: tErr } = await admin
    .from('tenants')
    .select('*')
    .is('deleted_at', null)
    .limit(1)
    .single()

  assert.ok(!tErr && tenant, 'Must find at least one active tenant in database')
  console.log(`✔ Found resident: ${tenant.full_name} (${tenant.id}), Owner: ${tenant.owner_id}`)

  // 2. Test live query of complaints for this tenant
  console.log('2. Querying complaints for tenant...')
  const { data: complaints, error: cErr } = await admin
    .from('complaints')
    .select('id, title, status, priority, created_at, resolved_at')
    .eq('owner_id', tenant.owner_id)
    .eq('tenant_id', tenant.id)

  assert.ok(!cErr, 'Complaints query must execute without error')
  console.log(`✔ Found ${complaints?.length || 0} complaints linked to resident`)

  // 3. Test lodging a live test maintenance ticket
  console.log('3. Inserting a test maintenance ticket...')
  const testTitle = `Test Water Heater Check ${Date.now()}`
  const { data: createdComp, error: insertErr } = await admin
    .from('complaints')
    .insert({
      owner_id: tenant.owner_id,
      tenant_id: tenant.id,
      property_id: tenant.property_id,
      tenant: tenant.full_name,
      title: testTitle,
      description: 'Checking water temperature sensor',
      priority: 'Low',
      status: 'Open',
    })
    .select('*')
    .single()

  assert.ok(!insertErr && createdComp, 'Ticket insertion must succeed')
  assert.strictEqual(createdComp.title, testTitle)
  assert.strictEqual(createdComp.status, 'Open')
  console.log(`✔ Ticket inserted: ${createdComp.id} (${createdComp.title})`)

  // 4. Test resolving the ticket
  console.log('4. Resolving the maintenance ticket...')
  const nowIso = new Date().toISOString()
  const { data: updatedComp, error: updateErr } = await admin
    .from('complaints')
    .update({ status: 'Resolved', resolved_at: nowIso, updated_at: nowIso })
    .eq('id', createdComp.id)
    .select('*')
    .single()

  assert.ok(!updateErr && updatedComp, 'Ticket update must succeed')
  assert.strictEqual(updatedComp.status, 'Resolved')
  assert.ok(updatedComp.resolved_at, 'resolved_at must be set')
  console.log(`✔ Ticket resolved and confirmed in database at: ${updatedComp.resolved_at}`)

  // 5. Clean up the test complaint
  console.log('5. Cleaning up test ticket...')
  const { error: delErr } = await admin.from('complaints').delete().eq('id', createdComp.id)
  assert.ok(!delErr, 'Cleanup must succeed')
  console.log('✔ Test ticket cleaned up cleanly.')

  // 6. Test resident contact persistence in database
  console.log('6. Testing resident contact field persistence...')
  const originalEmergency = tenant.emergency_contact
  const testContact = `Guardian Contact ${Date.now()}`
  const { data: contactUpdate, error: cuErr } = await admin
    .from('tenants')
    .update({ emergency_contact: testContact, updated_at: new Date().toISOString() })
    .eq('id', tenant.id)
    .select('id, emergency_contact')
    .single()

  assert.ok(!cuErr && contactUpdate, 'Emergency contact update must succeed')
  assert.strictEqual(contactUpdate.emergency_contact, testContact)

  // Re-fetch to ensure persistence
  const { data: reFetched } = await admin.from('tenants').select('emergency_contact').eq('id', tenant.id).single()
  assert.strictEqual(reFetched.emergency_contact, testContact, 'Re-fetched contact must match updated value')
  console.log('✔ Resident contact update persisted and confirmed on re-query.')

  // Restore original contact
  await admin.from('tenants').update({ emergency_contact: originalEmergency }).eq('id', tenant.id)
  console.log('✔ Restored original contact cleanly.')

  console.log('\n============================================================')
  console.log('🎉 LIVE DATABASE FLOW FULLY VERIFIED! NO ISSUES ENCOUNTERED.')
  console.log('============================================================')
}

testLivePortalFlow().catch((e) => {
  console.error('Test failed:', e)
  process.exit(1)
})
