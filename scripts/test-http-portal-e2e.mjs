import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

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

async function runE2eHttpTest() {
  console.log('=== RUNNING REAL HTTP END-TO-END PORTAL FLOW ON LOCALHOST:3000 ===\n')

  const baseUrl = 'http://localhost:3000'
  const token = 'WnHRtiRpWIjc5CF30f2UWgf_5NL8TFuLO97iRSRuOeA'

  // Step 1: Exchange token via route handler
  console.log('1. Exchanging access token through /api/portal?token=...')
  const exchangeRes = await fetch(`${baseUrl}/api/portal?token=${encodeURIComponent(token)}`, {
    redirect: 'manual',
  })

  const setCookieHeader = exchangeRes.headers.get('set-cookie')
  assert.ok(setCookieHeader, 'Must receive Set-Cookie header upon token exchange')
  assert.ok(setCookieHeader.includes('sb_tenant_session='), 'Cookie must be sb_tenant_session')

  const sessionCookie = setCookieHeader.split(';')[0]
  console.log('✔ Token exchanged successfully. Session cookie obtained.\n')

  // Step 2: Fetch portal data with session cookie
  console.log('2. Fetching portal data from GET /api/portal/data...')
  const dataRes = await fetch(`${baseUrl}/api/portal/data`, {
    headers: {
      Cookie: sessionCookie,
    },
  })

  assert.strictEqual(dataRes.status, 200, 'GET /api/portal/data must return 200')
  const dataJson = await dataRes.json()
  assert.strictEqual(dataJson.success, true, 'Response must be success: true')
  assert.ok(dataJson.data, 'Must return data object')
  assert.strictEqual(dataJson.data.tenant.name, 'Nitin', 'Must return Nitin resident profile')
  assert.ok(Array.isArray(dataJson.data.complaints), 'Must return complaints array')
  assert.ok(Array.isArray(dataJson.data.timeline), 'Must return timeline array')
  assert.ok(Array.isArray(dataJson.data.property.rules), 'Must return rules array')
  console.log(`✔ Portal data successfully returned for resident "${dataJson.data.tenant.name}".`)
  console.log(`  Room: ${dataJson.data.roomNumber}, Floor: ${dataJson.data.room?.floor ?? 'N/A'}, Type: ${dataJson.data.room?.type}`)
  console.log(`  Outstanding Rent: ₹${dataJson.data.tenant.outstandingBalance}, Status: ${dataJson.data.tenant.status}\n`)

  // Step 3: Test editing contact information via PATCH /api/portal/data
  console.log('3. Testing resident contact update via PATCH /api/portal/data...')
  const testPhone = '9876543210'
  const testEmail = 'nitin.verified@example.com'
  const testEmergency = 'Ramesh Sharma - 9811223344'

  const updateRes = await fetch(`${baseUrl}/api/portal/data`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Cookie: sessionCookie,
    },
    body: JSON.stringify({
      phone: testPhone,
      email: testEmail,
      emergencyContact: testEmergency,
    }),
  })

  assert.strictEqual(updateRes.status, 200, 'PATCH /api/portal/data must return 200')
  const updateJson = await updateRes.json()
  assert.strictEqual(updateJson.success, true)
  assert.strictEqual(updateJson.tenant.phone, testPhone)
  assert.strictEqual(updateJson.tenant.email, testEmail)
  assert.strictEqual(updateJson.tenant.emergencyContact, testEmergency)
  console.log('✔ Contact information updated and confirmed in database.\n')

  // Step 4: Re-fetch portal data to verify database persistence across refresh
  console.log('4. Re-fetching portal data to verify database persistence on refresh...')
  const refreshRes = await fetch(`${baseUrl}/api/portal/data`, {
    headers: {
      Cookie: sessionCookie,
    },
  })
  const refreshJson = await refreshRes.json()
  assert.strictEqual(refreshJson.data.tenant.phone, testPhone, 'Phone must persist after refresh')
  assert.strictEqual(refreshJson.data.tenant.email, testEmail, 'Email must persist after refresh')
  assert.strictEqual(refreshJson.data.tenant.emergencyContact, testEmergency, 'Emergency contact must persist after refresh')
  console.log('✔ Verified! All updated values retained permanently after refresh.\n')

  // Step 5: Test lodging a maintenance complaint via POST /api/portal/complaints
  console.log('5. Lodging a new maintenance ticket via POST /api/portal/complaints...')
  const complaintRes = await fetch(`${baseUrl}/api/portal/complaints`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: sessionCookie,
    },
    body: JSON.stringify({
      title: 'Water filter maintenance required',
      priority: 'Medium',
      description: 'Filter cartridge needs replacement in pantry.',
    }),
  })

  assert.strictEqual(complaintRes.status, 200, 'POST /api/portal/complaints must return 200')
  const complaintJson = await complaintRes.json()
  assert.strictEqual(complaintJson.success, true)
  assert.ok(complaintJson.complaint.id, 'Must return created complaint ID')
  assert.strictEqual(complaintJson.complaint.status, 'Open')
  const createdComplaintId = complaintJson.complaint.id
  console.log(`✔ Complaint ticket logged: "${complaintJson.complaint.title}" (Status: ${complaintJson.complaint.status})\n`)

  // Step 6: Test marking complaint as resolved via PATCH /api/portal/complaints
  console.log('6. Updating ticket to Resolved via PATCH /api/portal/complaints...')
  const resolveRes = await fetch(`${baseUrl}/api/portal/complaints`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Cookie: sessionCookie,
    },
    body: JSON.stringify({
      id: createdComplaintId,
      status: 'Resolved',
    }),
  })

  assert.strictEqual(resolveRes.status, 200, 'PATCH /api/portal/complaints must return 200')
  const resolveJson = await resolveRes.json()
  assert.strictEqual(resolveJson.success, true)
  assert.strictEqual(resolveJson.complaint.status, 'Resolved')
  assert.ok(resolveJson.complaint.resolvedAt, 'Must set resolvedAt timestamp')
  console.log(`✔ Complaint marked Resolved at: ${resolveJson.complaint.resolvedAt}\n`)

  // Step 7: Security check - attempt to modify rent via resident endpoint
  console.log('7. Testing Security Barrier: Attempting unauthorized modification of rent...')
  const exploitRes = await fetch(`${baseUrl}/api/portal/data`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Cookie: sessionCookie,
    },
    body: JSON.stringify({
      monthly_rent: 1,
    }),
  })

  assert.strictEqual(exploitRes.status, 403, 'Attempt to modify rent must return 403 Forbidden')
  const exploitJson = await exploitRes.json()
  assert.strictEqual(exploitJson.success, false)
  console.log(`✔ Security barrier confirmed: ${exploitJson.error}\n`)

  // Step 8: Clean up test complaint from database
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  await admin.from('complaints').delete().eq('id', createdComplaintId)
  console.log('✔ Cleaned up test complaint.')

  console.log('\n========================================================================')
  console.log('🎉 100% REAL HTTP END-TO-END FLOW VERIFIED OVER NETWORK! ALL TESTS PASSED')
  console.log('========================================================================')
}

runE2eHttpTest().catch((err) => {
  console.error('E2E Test Failed:', err)
  process.exit(1)
})
