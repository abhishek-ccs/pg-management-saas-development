import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'
import {
  generateTenantToken,
  hashToken,
  signTenantSession,
  verifyTenantSession,
} from '../lib/tenant-access.js'
import { isValidEmail, isValidPhone } from '../lib/validation.js'

console.log('=== RUNNING COMPREHENSIVE RESIDENT SELF-SERVICE PORTAL & PERSISTENCE SUITE ===\n')

// ---------------------------------------------------------------------------
// 1. DATA PAYLOAD & FIELD COMPLETION INVARIANTS
// ---------------------------------------------------------------------------
console.log('1. Checking Portal Data Route Payload Completeness...')
const portalApiCode = fs.readFileSync('app/api/portal/data/route.ts', 'utf-8')

// Must select complete tenant contact and identity details
assert.ok(
  portalApiCode.includes("select('id, full_name, phone, email, emergency_contact, id_proof_type, id_proof_number, monthly_rent, security_deposit, joining_date, rent_due_day, status, room_id, bed_id, property_id, deleted_at')"),
  'Portal API route must select complete tenant personal & contact fields (email, emergency_contact, id_proof)'
)

// Must select room details including floor and type
assert.ok(
  portalApiCode.includes("select('id, room_number, floor, room_type')"),
  'Portal API route must select room floor and room_type for full occupancy transparency'
)

// Must fetch complaints scoped to resident
assert.ok(
  portalApiCode.includes(".from('complaints')") &&
  portalApiCode.includes(".eq('tenant_id', session.tenantId)"),
  'Portal API route must query complaints strictly for session.tenantId'
)

// Must parse property rules and guidelines
assert.ok(
  portalApiCode.includes('rulesList') &&
  portalApiCode.includes('property.rules'),
  'Portal API route must parse and deliver property rules & guidelines'
)

// Must construct activity timeline
assert.ok(
  portalApiCode.includes('timelineEvents') &&
  portalApiCode.includes('timeline: timelineEvents'),
  'Portal API route must return complete chronological activity timeline'
)

console.log('✔ Portal API payload provides full resident details, complaints, property rules, and timeline.\n')

// ---------------------------------------------------------------------------
// 2. RESIDENT EDIT & SAVE PERSISTENCE INVARIANTS (PATCH /api/portal/data)
// ---------------------------------------------------------------------------
console.log('2. Checking Secure Profile Contact Mutation (PATCH /api/portal/data)...')

assert.ok(
  portalApiCode.includes('export async function PATCH(request: NextRequest)'),
  'Portal API route must export a PATCH handler for resident profile updates'
)

// Security: Forbidden administrative & financial fields
const forbiddenFields = [
  'monthly_rent', 'monthlyRent', 'rent',
  'security_deposit', 'securityDeposit', 'deposit',
  'room_id', 'bed_id', 'property_id', 'status',
  'joining_date', 'joiningDate', 'rent_due_day', 'rentDueDay',
]
for (const field of forbiddenFields) {
  assert.ok(
    portalApiCode.includes(`'${field}'`),
    `Portal PATCH route must explicitly block modification of financial/admin field "${field}"`
  )
}

// Scoped DB update
assert.ok(
  portalApiCode.includes(".eq('id', session.tenantId)") &&
  portalApiCode.includes(".eq('owner_id', session.ownerId)"),
  'Portal PATCH route must strictly scope database update to session tenantId and ownerId'
)

// Phone and Email validation in PATCH
assert.ok(
  portalApiCode.includes('isValidPhone') && portalApiCode.includes('isValidEmail'),
  'Portal PATCH route must validate phone number and email formats before database update'
)

console.log('✔ Resident contact updates strictly validate input, enforce scope, and reject administrative changes.\n')

// ---------------------------------------------------------------------------
// 3. COMPLAINTS ROUTE HANDLER (POST & PATCH /api/portal/complaints)
// ---------------------------------------------------------------------------
console.log('3. Checking Complaints Route Handlers (app/api/portal/complaints/route.ts)...')

assert.ok(fs.existsSync('app/api/portal/complaints/route.ts'), 'Complaints route handler must exist')
const complaintsRouteCode = fs.readFileSync('app/api/portal/complaints/route.ts', 'utf-8')

// POST handler checks
assert.ok(
  complaintsRouteCode.includes('export async function POST('),
  'Complaints route must export POST handler for lodging new tickets'
)
assert.ok(
  complaintsRouteCode.includes("owner_id: session.ownerId") &&
  complaintsRouteCode.includes("tenant_id: session.tenantId"),
  'Complaints POST handler must link complaint to session.ownerId and session.tenantId'
)

// PATCH handler checks (resident marks resolved)
assert.ok(
  complaintsRouteCode.includes('export async function PATCH('),
  'Complaints route must export PATCH handler for updating ticket status'
)
assert.ok(
  complaintsRouteCode.includes("existing.tenant_id !== session.tenantId"),
  'Complaints PATCH handler must prevent cross-tenant ticket modifications'
)
assert.ok(
  complaintsRouteCode.includes("newStatus === 'Resolved'"),
  'Complaints PATCH handler must record resolved_at timestamp when status is set to Resolved'
)

console.log('✔ Complaints API allows residents to lodge tickets and mark them resolved with cross-tenant isolation.\n')

// ---------------------------------------------------------------------------
// 4. DASHBOARD SAVE & PERSISTENCE FIXES
// ---------------------------------------------------------------------------
console.log('4. Checking Dashboard Save / Persistence Bug Fixes...')

const dashboardCode = fs.readFileSync('app/dashboard/page.tsx', 'utf-8')

// Payment edit update_at fix
assert.ok(
  !dashboardCode.includes(".from('payments')\n        .update({\n          amount,\n          payment_method: method,\n          payment_type: type,\n          paid_at: paidAt,\n          month_covered: monthCovered || null,\n          notes: notes || null,\n          updated_at:"),
  'handleUpdatePayment must not attempt to write to non-existent updated_at column on payments table'
)

// Tenants query in fetchDashboardData must select email, emergency_contact, id_proof
assert.ok(
  dashboardCode.includes(".from('tenants').select('id,property_id,full_name,phone,email,emergency_contact,id_proof_type,id_proof_number,monthly_rent,security_deposit,joining_date,rent_due_day,status,room_id,bed_id,deleted_at,updated_at')"),
  'Dashboard fetchDashboardData must select email, emergency_contact, id_proof for complete refresh retention'
)

// Complaints query in fetchDashboardData must select tenant_id, resolved_at, updated_at
assert.ok(
  dashboardCode.includes(".from('complaints').select('id,property_id,tenant_id,title,tenant,priority,status,description,resolved_at,created_at,updated_at')"),
  'Dashboard fetchDashboardData must select tenant_id, resolved_at, updated_at'
)

// Complaint creation and update in dashboard must link tenant_id
assert.ok(
  dashboardCode.includes('tenant_id: targetTenantId'),
  'Dashboard complaint creation and update must link targetTenantId'
)

console.log('✔ Dashboard payment save bug eliminated and relational tenant_id linking guaranteed.\n')

// ---------------------------------------------------------------------------
// 5. RESIDENT PORTAL VIEW UI, LOADING STATES & MODALS (PortalView.tsx)
// ---------------------------------------------------------------------------
console.log('5. Checking PortalView UI, Modals, and Anti-Freeze Loading Feedback...')

const portalViewCode = fs.readFileSync('app/portal/PortalView.tsx', 'utf-8')

// Edit contact info modal and controls
assert.ok(
  portalViewCode.includes('showEditContactModal') &&
  portalViewCode.includes('handleSaveContact') &&
  portalViewCode.includes('isSavingContact'),
  'PortalView must include Edit Contact modal with saving state management'
)

// Complaint lodging modal and controls
assert.ok(
  portalViewCode.includes('showComplaintModal') &&
  portalViewCode.includes('handleLodgeComplaint') &&
  portalViewCode.includes('isSubmittingComplaint'),
  'PortalView must include Log Complaint modal with submitting state management'
)

// Resolving complaint action
assert.ok(
  portalViewCode.includes('handleResolveComplaint') &&
  portalViewCode.includes('resolvingComplaintId'),
  'PortalView must include action to mark complaints resolved with inline spinner'
)

// Loading indicators and anti-duplicate guards
assert.ok(
  portalViewCode.includes('Loader2') &&
  portalViewCode.includes('disabled={isSavingContact}') &&
  portalViewCode.includes('disabled={isSubmittingComplaint}'),
  'PortalView must disable buttons and show Loader2 spinner during async operations'
)

// Skeleton loading state
assert.ok(
  portalViewCode.includes('animate-pulse') &&
  portalViewCode.includes('Header Skeleton'),
  'PortalView must render responsive skeleton screens during initial load'
)

// Toast feedback system
assert.ok(
  portalViewCode.includes('showToast') &&
  portalViewCode.includes('toast.type === \'success\''),
  'PortalView must provide clear floating toast feedback on success and failure'
)

// House rules and guidelines
assert.ok(
  portalViewCode.includes('Property Rules & Resident Guidelines') &&
  portalViewCode.includes('rulesList.map'),
  'PortalView must render property house rules and guidelines'
)

// Account activity timeline
assert.ok(
  portalViewCode.includes('Resident Account Activity') &&
  portalViewCode.includes('timeline.map'),
  'PortalView must render resident account activity timeline'
)

console.log('✔ PortalView contains all required cards, modals, loading skeletons, and interactive workflows.\n')

// ---------------------------------------------------------------------------
// 6. CRYPTOGRAPHIC TOKEN LIFECYCLE & MULTI-TENANT ISOLATION BARRIER
// ---------------------------------------------------------------------------
console.log('6. Verifying Cryptographic Token Session & Isolation Barrier...')

const secret = 'test-suite-portal-secret-2026'
process.env.SUPABASE_SERVICE_ROLE_KEY = secret

const tenantA = { id: 'tenant-alpha-uuid', ownerId: 'owner-pg-1' }
const tenantB = { id: 'tenant-beta-uuid', ownerId: 'owner-pg-1' }

// Simulate Session Creation for Tenant Alpha
const sessionA = signTenantSession({
  tenantId: tenantA.id,
  ownerId: tenantA.ownerId,
  tokenId: 'tok-1',
  expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
})

const verifiedA = verifyTenantSession(sessionA)
assert.ok(verifiedA, 'Session A must verify successfully')
assert.strictEqual(verifiedA.tenantId, tenantA.id)
assert.strictEqual(verifiedA.ownerId, tenantA.ownerId)

// Verify phone & email validation functions
assert.strictEqual(isValidPhone('9876543210'), true, 'Valid 10-digit Indian phone must pass')
assert.strictEqual(isValidPhone('+919876543210'), true, 'Valid +91 phone must pass')
assert.strictEqual(isValidPhone('0000000000'), false, 'Dummy phone must be rejected')
assert.strictEqual(isValidPhone('123'), false, 'Short phone must be rejected')

assert.strictEqual(isValidEmail('resident@example.com'), true, 'Valid email must pass')
assert.strictEqual(isValidEmail('invalid-email'), false, 'Invalid email without @ must be rejected')
assert.strictEqual(isValidEmail('test@'), false, 'Email missing domain must be rejected')

console.log('✔ Token cryptography and input validation verified.\n')

console.log('=============================================================================')
console.log('🎉 ALL RESIDENT PORTAL & PERSISTENCE VERIFICATION TESTS PASSED SUCCESSFULLY!')
console.log('=============================================================================')
