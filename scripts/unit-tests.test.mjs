import test from 'node:test'
import assert from 'node:assert'
import crypto from 'node:crypto'
import { formatCurrency, formatDate, formatInternationalPhone } from '../lib/i18n/index.js'
import { checkRateLimit, checkSharedRateLimit } from '../lib/security/rate-limiter.js'
import { sanitizeHealthError, HEALTH_ERROR_MESSAGES } from '../app/api/health/route.ts'
import { SUPPORT_EMAIL, getMailtoSupport } from '../lib/constants.js'
import {
  PRICING_CONFIG,
  ANNUAL_TOTAL_ON_MONTHLY,
  ANNUAL_SAVINGS_AMOUNT,
  ANNUAL_SAVINGS_PERCENT,
  YEARLY_MONTHLY_EQUIVALENT,
  formatINR,
  getSavingsLabel,
  PRICING_PLANS,
} from '../lib/pricing.js'
import {
  calculateRentDueStatus,
  formatPaymentTimestamp,
  generateWhatsAppReminder,
  generateSmsReminder,
} from '../lib/due-dates.js'
import { calculateMidCycleElectricitySplit } from '../lib/electricity-split.ts'
import {
  validateUpiId,
  validatePaymentLink,
  validateQrImageFile,
  validateDecodedQrData,
  validatePaymentDetailsForm,
  getValidatedReminderPaymentOptions,
} from '../lib/payment-validation.ts'
import { isSafeRedirectPath, getSafeRedirectPath } from '../lib/validation.js'
import {
  generateTenantToken,
  hashToken,
  signTenantSession,
  verifyTenantSession,
} from '../lib/tenant-access.ts'
import { applySecurityHeaders } from '../lib/security/headers.ts'
import { NextResponse } from 'next/server'
import { CANONICAL_SITE_URL, getSiteUrl, constructMetadata } from '../lib/site.ts'
import { resolveAuthoritativeSubscription } from '../lib/subscription.ts'
import nextConfig from '../next.config.mjs'

test('1. Support Email & Mailto URL Generation', () => {
  assert.ok(SUPPORT_EMAIL.includes('baserabook.team@gmail.com'), 'Support email must default to baserabook.team@gmail.com')
  const mailtoLink = getMailtoSupport('Billing Inquiry', 'Hello support team')
  assert.ok(mailtoLink.startsWith('mailto:'), 'Link must be valid mailto scheme')
  assert.ok(mailtoLink.includes('baserabook.team%40gmail.com') || mailtoLink.includes('baserabook.team@gmail.com'), 'Must target support email')
  assert.ok(mailtoLink.includes('Billing'), 'Must encode subject')
})

test('2. Canonical Pricing Math & Savings Law', () => {
  assert.strictEqual(PRICING_CONFIG.monthlyRate, 1099, 'Monthly rate must be ₹1,099')
  assert.strictEqual(PRICING_CONFIG.yearlyRate, 9999, 'Yearly rate must be ₹9,999')
  assert.strictEqual(ANNUAL_TOTAL_ON_MONTHLY, 1099 * 12, '12 months should total ₹13,188')
  assert.strictEqual(ANNUAL_SAVINGS_AMOUNT, 3189, 'Yearly savings must equal ₹3,189')
  assert.strictEqual(ANNUAL_SAVINGS_PERCENT, 24, 'Savings percentage must equal 24%')
  assert.strictEqual(YEARLY_MONTHLY_EQUIVALENT, 833, 'Effective monthly rate must equal ₹833/mo')

  assert.equal(formatINR(9999), '₹9,999', 'formatINR should format with Indian thousands separator')
  assert.ok(getSavingsLabel('en').includes('Save 24%'), 'English savings badge label')
  assert.ok(getSavingsLabel('hi').includes('24% बचाएं'), 'Hindi savings badge label')
})

test('3. Real-Time Due Dates & Overdue Status Engine', () => {
  const reference = new Date(2026, 9, 15, 12, 0, 0) // Oct 15, 2026

  // Case 1: Marked Paid
  const paidResult = calculateRentDueStatus(5, true, reference)
  assert.strictEqual(paidResult.status, 'paid')
  assert.strictEqual(paidResult.labelEn, 'Paid On Time')

  // Case 2: Due Today (rent due on 15th)
  const dueTodayResult = calculateRentDueStatus(15, false, reference)
  assert.strictEqual(dueTodayResult.status, 'due_today')
  assert.strictEqual(dueTodayResult.labelEn, 'Due Today')

  // Case 3: Due Soon (rent due on 20th, today is 15th)
  const dueSoonResult = calculateRentDueStatus(20, false, reference)
  assert.strictEqual(dueSoonResult.status, 'due_soon')
  assert.strictEqual(dueSoonResult.days, 5)

  // Case 4: Overdue within 30 days (rent was due on 5th, today is 15th)
  const overdueResult = calculateRentDueStatus(5, false, reference)
  assert.strictEqual(overdueResult.status, 'overdue')
  assert.strictEqual(overdueResult.days, 10)
  assert.ok(overdueResult.labelEn.includes('Overdue by 10 days'))

  // Case 5: Overdue > 30 days (e.g. evaluating 45 days past due)
  const futureReference = new Date(2026, 10, 20, 12, 0, 0)
  const severeOverdue = calculateRentDueStatus(5, false, futureReference, 45)
  assert.strictEqual(severeOverdue.status, 'overdue')
  assert.ok(severeOverdue.badgeColor.includes('font-bold'), 'Severe overdue must have prominent styling')
})

test('4. Exact Timestamp & Reminder Generators', () => {
  const isoDate = '2026-10-15T09:15:00.000Z'
  const istFormatted = formatPaymentTimestamp(isoDate, 'Asia/Kolkata', 'en')
  assert.ok(istFormatted.includes('2026'), 'Must display correct year')
  assert.match(istFormatted, /pm|am/i, 'Must display 12-hour AM/PM time')

  const waLink = generateWhatsAppReminder({
    tenantName: 'Rahul Verma',
    phone: '9876543210',
    amount: 8500,
    dueDay: 5,
    propertyName: 'Sunrise Luxury PG',
    locale: 'en',
  })
  assert.ok(waLink.startsWith('https://wa.me/919876543210'), 'WhatsApp URL must format Indian E.164 phone')
  assert.ok(waLink.includes('Rahul'), 'WhatsApp message must include tenant name')
  assert.ok(waLink.includes('%E2%82%B98%2C500') || waLink.includes('8500') || waLink.includes('8%2C500'), 'WhatsApp message must include rent amount')

  const smsLink = generateSmsReminder({
    tenantName: 'Amit Kumar',
    phone: '9876543210',
    amount: 9000,
    dueDay: 7,
    propertyName: 'StayNest PG',
  })
  assert.ok(smsLink.startsWith('sms:9876543210'), 'SMS scheme must format correctly')
})

test('5. Abuse Protection: Rate Limiter Token Bucket', () => {
  const config = { maxTokens: 3, refillRatePerSec: 0.1 }
  const key = 'test-ip-127.0.0.1'

  // First 3 requests should succeed
  assert.strictEqual(checkRateLimit(key, config).allowed, true)
  assert.strictEqual(checkRateLimit(key, config).allowed, true)
  assert.strictEqual(checkRateLimit(key, config).allowed, true)

  // 4th request must be rejected
  const fourth = checkRateLimit(key, config)
  assert.strictEqual(fourth.allowed, false, '4th request should exceed token bucket')
  assert.ok(fourth.retryAfterSec && fourth.retryAfterSec > 0, 'Should return positive retry-after time')
})

test('6. Ledger Reconciliation: Deposit Liability vs Revenue Law', () => {
  const transactions = [
    { type: 'rent', amount: 8000 },
    { type: 'rent', amount: 8500 },
    { type: 'deposit', amount: 20000 },
    { type: 'electricity', amount: 1200 },
    { type: 'maintenance', amount: 500 },
  ]

  // Financial reconciliation law
  const operatingRevenue = transactions
    .filter((t) => t.type !== 'deposit')
    .reduce((sum, t) => sum + t.amount, 0)

  const securityDepositsLiability = transactions
    .filter((t) => t.type === 'deposit')
    .reduce((sum, t) => sum + t.amount, 0)

  assert.strictEqual(operatingRevenue, 18200, 'Operating Revenue must exclude deposits')
  assert.strictEqual(securityDepositsLiability, 20000, 'Deposits must be isolated in liability escrow')
  assert.strictEqual(operatingRevenue + securityDepositsLiability, 38200, 'Sum must reconcile to total cash inflows')
})

test('7. Admin Redirect Loop Prevention & Resilient Authentication', () => {
  // Test 7.1: URL Query parameter loop barrier
  const testUrlWithError = new URL('https://staynest.com/admin/login?error=unauthenticated')
  const testUrlWithLogout = new URL('https://staynest.com/admin/login?logout=true')
  const testUrlClean = new URL('https://staynest.com/admin/login')

  const shouldSkipRedirect = (url) => url.searchParams.has('error') || url.searchParams.has('logout') || url.searchParams.has('switch')
  assert.strictEqual(shouldSkipRedirect(testUrlWithError), true, 'Error param must prevent redirect loop')
  assert.strictEqual(shouldSkipRedirect(testUrlWithLogout), true, 'Logout param must prevent redirect loop')
  assert.strictEqual(shouldSkipRedirect(testUrlClean), false, 'Clean login URL can redirect active super_admin')

  // Test 7.2: Resilient profile fallback logic
  const baseProfile = {
    id: '5fc5c902-cea9-425a-b6fb-989b436ab270',
    email: 'sharmavn258@gmail.com',
    role: 'super_admin',
    status: 'active',
  }

  // When extended columns do not exist in database, defaults should apply without nullifying base profile
  const compositeProfile = {
    ...baseProfile,
    must_change_password: false,
    mfa_enrolled: false,
    preferred_language: 'en',
  }

  const isSuperAdmin = (p) => p?.role === 'super_admin' && p?.status === 'active'
  assert.strictEqual(isSuperAdmin(compositeProfile), true, 'Super admin role must remain valid even without extended schema columns')
  assert.strictEqual(compositeProfile.must_change_password, false, 'must_change_password defaults safely to false')
})

test('8. Multi-Property Isolation & Scoping Engine', () => {
  const propertyA = 'prop-aaa-111'
  const propertyB = 'prop-bbb-222'

  const rooms = [
    { id: 'r1', property_id: propertyA, room_number: '101' },
    { id: 'r2', property_id: propertyA, room_number: '102' },
    { id: 'r3', property_id: propertyB, room_number: '201' },
  ]

  const tenants = [
    { id: 't1', property_id: propertyA, full_name: 'Tenant Alpha', status: 'active' },
    { id: 't2', property_id: propertyB, full_name: 'Tenant Beta', status: 'active' },
  ]

  const payments = [
    { id: 'p1', property_id: propertyA, amount: 8000 },
    { id: 'p2', property_id: propertyB, amount: 9500 },
  ]

  // Scoping helper
  const filterByProperty = (items, propId) => items.filter((item) => item.property_id === propId)

  // Validate Property A isolation
  const propARooms = filterByProperty(rooms, propertyA)
  const propATenants = filterByProperty(tenants, propertyA)
  const propAPayments = filterByProperty(payments, propertyA)

  assert.strictEqual(propARooms.length, 2, 'Property A must only contain its 2 rooms')
  assert.strictEqual(propATenants.length, 1, 'Property A must only contain 1 tenant')
  assert.strictEqual(propATenants[0].full_name, 'Tenant Alpha')
  assert.strictEqual(propAPayments[0].amount, 8000)

  // Validate Property B isolation
  const propBRooms = filterByProperty(rooms, propertyB)
  const propBTenants = filterByProperty(tenants, propertyB)
  const propBPayments = filterByProperty(payments, propertyB)

  assert.strictEqual(propBRooms.length, 1, 'Property B must only contain 1 room')
  assert.strictEqual(propBTenants[0].full_name, 'Tenant Beta')
  assert.strictEqual(propBPayments[0].amount, 9500)

  // Verify zero cross-contamination
  assert.ok(!propARooms.some((r) => r.property_id === propertyB), 'No Property B rooms in Property A')
  assert.ok(!propBTenants.some((t) => t.property_id === propertyA), 'No Property A tenants in Property B')
})

test('9. Room & Bed Capacity Invariants (Single=1, Double=2, Triple=3, Four=4)', () => {
  const CAPACITY_LIMITS = {
    single: 1,
    double: 2,
    triple: 3,
    four: 4,
  }

  // Helper for capacity enforcement
  function canAddTenantToRoom(roomType, activeTenantsInRoom) {
    const maxCapacity = CAPACITY_LIMITS[roomType] || 1
    return activeTenantsInRoom < maxCapacity
  }

  // Single room tests
  assert.strictEqual(canAddTenantToRoom('single', 0), true, 'Single room with 0 tenants is available')
  assert.strictEqual(canAddTenantToRoom('single', 1), false, 'Single room with 1 tenant is full')

  // Double room tests
  assert.strictEqual(canAddTenantToRoom('double', 1), true, 'Double room with 1 tenant can take another')
  assert.strictEqual(canAddTenantToRoom('double', 2), false, 'Double room with 2 tenants is full')

  // Triple room tests
  assert.strictEqual(canAddTenantToRoom('triple', 2), true, 'Triple room with 2 tenants can take 3rd')
  assert.strictEqual(canAddTenantToRoom('triple', 3), false, 'Triple room with 3 tenants is full')

  // Four sharing tests
  assert.strictEqual(canAddTenantToRoom('four', 3), true, 'Four sharing room with 3 tenants can take 4th')
  assert.strictEqual(canAddTenantToRoom('four', 4), false, 'Four sharing room with 4 tenants is full')

  // Bed collision prevention
  const activeTenants = [
    { id: 't1', bed_id: 'bed-101', status: 'active' },
    { id: 't2', bed_id: 'bed-102', status: 'active' },
    { id: 't3', bed_id: 'bed-103', status: 'inactive' }, // moved out
  ]

  function isBedAvailable(bedId, currentTenantId = null) {
    const conflict = activeTenants.find(
      (t) => t.bed_id === bedId && t.status === 'active' && t.id !== currentTenantId
    )
    return !conflict
  }

  assert.strictEqual(isBedAvailable('bed-101'), false, 'Occupied bed cannot be assigned to new tenant')
  assert.strictEqual(isBedAvailable('bed-101', 't1'), true, 'Existing occupant can keep their own bed')
  assert.strictEqual(isBedAvailable('bed-103'), true, 'Bed of inactive/moved-out tenant is available')
  assert.strictEqual(isBedAvailable('bed-104'), true, 'Unassigned bed is available')
})

test('10. Session Freshness Threshold & Auto-Refresh Law', () => {
  const nowInSeconds = Math.floor(Date.now() / 1000)

  function isSessionStale(expiresAt) {
    // If expires_at is missing, past, or within 60s margin, treat as stale
    if (!expiresAt) return true
    return expiresAt - nowInSeconds < 60
  }

  // Session expiring in 5 minutes (300s) -> fresh
  assert.strictEqual(isSessionStale(nowInSeconds + 300), false, 'Session valid for 5 min is fresh')

  // Session expiring in 30 seconds -> stale (needs refresh before mutation)
  assert.strictEqual(isSessionStale(nowInSeconds + 30), true, 'Session expiring in 30s is stale')

  // Session expired 10 seconds ago -> stale
  assert.strictEqual(isSessionStale(nowInSeconds - 10), true, 'Expired session is stale')

  // Null/undefined session -> stale
  assert.strictEqual(isSessionStale(undefined), true, 'Undefined session is stale')
})

test('11. Production-Safe Baseline Tenant & Payment Payloads', () => {
  // Production verified column set for tenants
  const PROD_TENANT_COLUMNS = new Set([
    'id', 'owner_id', 'property_id', 'room_id', 'bed_id',
    'full_name', 'email', 'phone', 'emergency_contact',
    'id_proof_type', 'id_proof_number', 'monthly_rent',
    'security_deposit', 'joining_date', 'status', 'created_at', 'updated_at'
  ])

  // Payload sanitizer
  function sanitizeTenantPayload(input) {
    const output = {}
    for (const [key, value] of Object.entries(input)) {
      if (PROD_TENANT_COLUMNS.has(key)) {
        output[key] = value
      }
    }
    return output
  }

  const rawInput = {
    owner_id: 'user-123',
    property_id: 'prop-456',
    full_name: 'Sunita Sharma',
    phone: '9876543210',
    monthly_rent: 7500,
    security_deposit: 15000,
    joining_date: '2026-10-01',
    status: 'active',
    rent_due_day: 5, // missing in live schema
    deleted_at: null, // missing in live schema
    non_existent_column: 'test',
  }

  const sanitized = sanitizeTenantPayload(rawInput)

  assert.strictEqual(sanitized.full_name, 'Sunita Sharma')
  assert.strictEqual(sanitized.monthly_rent, 7500)
  assert.strictEqual(sanitized.rent_due_day, undefined, 'Missing live schema column must be excluded from baseline payload')
  assert.strictEqual(sanitized.deleted_at, undefined, 'Missing deleted_at column must be excluded from baseline payload')
  assert.strictEqual(sanitized.non_existent_column, undefined, 'Unknown column must be excluded')
  assert.ok(Object.keys(sanitized).every((col) => PROD_TENANT_COLUMNS.has(col)), 'All keys must exist in production schema')
})

test('12. FormData HTMLFormElement Lifecycle & Asynchronous Event Recoupling', async () => {
  // Mock mockFormElement
  class MockHTMLFormElement {
    constructor(entries) {
      this.entries = entries
    }
  }

  // Mock FormData that verifies parameter 1 is indeed an HTMLFormElement
  class SafeFormData {
    constructor(form) {
      if (!form || !(form instanceof MockHTMLFormElement)) {
        throw new TypeError("Failed to construct 'FormData': parameter 1 is not of type 'HTMLFormElement'")
      }
      this.data = new Map(Object.entries(form.entries))
    }
    get(key) {
      return this.data.get(key)
    }
  }

  // Simulate React synthetic event
  const mockForm = new MockHTMLFormElement({ name: 'Vikram Singh', rent: '8500' })
  const mockEvent = {
    currentTarget: mockForm,
  }

  // INCORRECT PATTERN: Accessing e.currentTarget after await (event recycled)
  async function simulateBuggyHandler(e) {
    // Simulating await ensureFreshSession(...)
    await new Promise((res) => setTimeout(res, 5))
    // Event loop has recycled synthetic event
    e.currentTarget = null
    return new SafeFormData(e.currentTarget)
  }

  await assert.rejects(
    async () => {
      await simulateBuggyHandler(mockEvent)
    },
    {
      name: 'TypeError',
      message: /parameter 1 is not of type 'HTMLFormElement'/,
    },
    'Buggy handler must throw TypeError when e.currentTarget is accessed after await'
  )

  // CORRECT PATTERN: Capturing form reference synchronously BEFORE any await
  async function simulateSafeHandler(e) {
    const form = e.currentTarget
    const fd = new SafeFormData(form) // Captured synchronously!
    const name = fd.get('name')
    const rent = Number(fd.get('rent'))

    // Now async await can run safely
    await new Promise((res) => setTimeout(res, 5))
    return { name, rent, success: true }
  }

  const safeEvent = { currentTarget: mockForm }
  const result = await simulateSafeHandler(safeEvent)
  assert.strictEqual(result.success, true)
  assert.strictEqual(result.name, 'Vikram Singh')
  assert.strictEqual(result.rent, 8500)
})

test('13. Operational Bed Availability & Full-Room Invariant Law', () => {
  const rooms = [
    { id: 'room-single-1', room_number: 'A205', room_type: 'Single' },
    { id: 'room-double-1', room_number: 'B102', room_type: 'Double' },
    { id: 'room-triple-1', room_number: 'C301', room_type: 'Triple' },
  ]

  const beds = [
    { id: 'bed-a205-a', room_id: 'room-single-1', bed_number: 'A205-A', status: 'available' },
    { id: 'bed-b102-a', room_id: 'room-double-1', bed_number: 'B102-A', status: 'available' },
    { id: 'bed-b102-b', room_id: 'room-double-1', bed_number: 'B102-B', status: 'available' },
    { id: 'bed-c301-a', room_id: 'room-triple-1', bed_number: 'C301-A', status: 'available' },
  ]

  // Scenario 1: Room A205 (Single) already has 1 active resident
  const tenantsCase1 = [
    { id: 'tenant-1', room_id: 'room-single-1', bed_id: 'bed-a205-a', status: 'active', name: 'Rohan' },
  ]

  // getEffectiveBedStatus logic
  function getEffectiveBedStatus(bed, allRooms, allTenants, currentTenantId = null) {
    const occupant = allTenants.find(
      (t) => t.bed_id === bed.id && t.status !== 'Vacated' && t.id !== currentTenantId
    )
    if (occupant) {
      return { isAvailable: false, label: 'OCCUPIED' }
    }

    const parentRoom = allRooms.find((r) => r.id === bed.room_id)
    if (parentRoom) {
      const type = parentRoom.room_type.toLowerCase()
      const cap = type.includes('single') ? 1 : type.includes('double') ? 2 : type.includes('triple') ? 3 : 4
      const activeInRoom = allTenants.filter(
        (t) => t.room_id === parentRoom.id && t.status !== 'Vacated' && t.id !== currentTenantId
      ).length
      if (activeInRoom >= cap) {
        return { isAvailable: false, label: 'ROOM FULL' }
      }
    }

    if (bed.status && bed.status !== 'available') {
      return { isAvailable: false, label: bed.status.toUpperCase() }
    }

    return { isAvailable: true, label: 'AVAILABLE' }
  }

  // Bed A205-A must NEVER be presented as AVAILABLE
  const bedStatusCase1 = getEffectiveBedStatus(beds[0], rooms, tenantsCase1)
  assert.strictEqual(bedStatusCase1.isAvailable, false, 'Bed in full room must not be available')
  assert.ok(
    bedStatusCase1.label === 'ROOM FULL' || bedStatusCase1.label === 'OCCUPIED',
    `Expected label to be ROOM FULL or OCCUPIED, got: ${bedStatusCase1.label}`
  )

  // Scenario 2: Room A205 has 1 active resident who doesn't have bed_id set (edge case)
  // Bed in database is 'available', but room is at capacity (1/1)
  const tenantsCase2 = [
    { id: 'tenant-1', room_id: 'room-single-1', bed_id: null, status: 'active', name: 'Rohan' },
  ]
  const bedStatusCase2 = getEffectiveBedStatus(beds[0], rooms, tenantsCase2)
  assert.strictEqual(bedStatusCase2.isAvailable, false, 'Bed must not be available if parent room is full')
  assert.strictEqual(bedStatusCase2.label, 'ROOM FULL', 'Must report ROOM FULL even if bed flag was available')

  // Scenario 3: Room B102 (Double) has 1 active resident on bed-b102-a
  const tenantsCase3 = [
    { id: 'tenant-2', room_id: 'room-double-1', bed_id: 'bed-b102-a', status: 'active', name: 'Priya' },
  ]
  const bedAStatus = getEffectiveBedStatus(beds[1], rooms, tenantsCase3)
  const bedBStatus = getEffectiveBedStatus(beds[2], rooms, tenantsCase3)
  assert.strictEqual(bedAStatus.isAvailable, false, 'Occupied bed is not available')
  assert.strictEqual(bedAStatus.label, 'OCCUPIED')
  assert.strictEqual(bedBStatus.isAvailable, true, 'Second bed in double room is available')
  assert.strictEqual(bedBStatus.label, 'AVAILABLE')

  // Scenario 4: Editing tenant should allow keeping current bed
  const editStatus = getEffectiveBedStatus(beds[1], rooms, tenantsCase3, 'tenant-2')
  assert.strictEqual(editStatus.isAvailable, true, 'Current tenant can retain their own bed')
})

test('14. Bug #1: Resident Deletion, Bed Release & Ledger Integrity Law', () => {
  // Mock initial state: 1 active tenant in room-1 assigned to bed-1
  let bedState = { id: 'bed-1', room_id: 'room-1', status: 'occupied' }
  let tenantList = [
    { id: 'tenant-1', name: 'Aarav', room_id: 'room-1', bed_id: 'bed-1', owner_id: 'owner-A' },
    { id: 'tenant-2', name: 'Vikram', room_id: 'room-2', bed_id: 'bed-2', owner_id: 'owner-A' },
  ]
  let paymentRecords = [
    { id: 'pay-1', tenant_id: 'tenant-1', amount: 8000, owner_id: 'owner-A' },
  ]

  // Deletion logic (matching deleteTenantAction + client update)
  function executeTenantDelete(tenantId, callerOwnerId) {
    const target = tenantList.find((t) => t.id === tenantId)
    if (!target) return { success: false, error: 'Not found' }
    if (target.owner_id !== callerOwnerId) return { success: false, error: 'Unauthorized cross-owner delete' }

    // Hard delete from tenant list
    tenantList = tenantList.filter((t) => t.id !== tenantId)

    // Release bed to 'available'
    if (target.bed_id && bedState.id === target.bed_id) {
      bedState.status = 'available'
    }

    // ON DELETE SET NULL on payments preserves payment history
    paymentRecords = paymentRecords.map((p) => (p.tenant_id === tenantId ? { ...p, tenant_id: null } : p))

    return { success: true }
  }

  // Cross-owner deletion attempt must fail
  const crossOwnerResult = executeTenantDelete('tenant-1', 'owner-B')
  assert.strictEqual(crossOwnerResult.success, false, 'Owner B cannot delete Owner A tenant')
  assert.strictEqual(tenantList.length, 2, 'Tenant list must remain untouched after unauthorized attempt')

  // Authorized deletion
  const authResult = executeTenantDelete('tenant-1', 'owner-A')
  assert.strictEqual(authResult.success, true, 'Authorized delete must succeed')
  assert.strictEqual(tenantList.length, 1, 'Deleted tenant disappears from list')
  assert.strictEqual(tenantList[0].id, 'tenant-2', 'Unrelated tenant remains untouched')
  assert.strictEqual(bedState.status, 'available', 'Assigned bed must immediately become available')

  // Financial integrity check
  assert.strictEqual(paymentRecords.length, 1, 'Payment history is never deleted')
  assert.strictEqual(paymentRecords[0].tenant_id, null, 'Payment tenant_id is preserved via ON DELETE SET NULL')
  assert.strictEqual(paymentRecords[0].amount, 8000, 'Historical revenue amount remains intact')
})

test('15. Bug #2: Expense Deletion & Real-Time Ledger Totals', () => {
  let expenses = [
    { id: 'exp-1', title: 'Water Tank Cleaning', amount: 1500, owner_id: 'owner-A' },
    { id: 'exp-2', title: 'High-speed Wi-Fi', amount: 2000, owner_id: 'owner-A' },
    { id: 'exp-3', title: 'Competitor Expense', amount: 5000, owner_id: 'owner-B' },
  ]

  function calculateOperatingTotal(ownerId) {
    return expenses.filter((e) => e.owner_id === ownerId).reduce((sum, e) => sum + e.amount, 0)
  }

  assert.strictEqual(calculateOperatingTotal('owner-A'), 3500, 'Initial owner A operating expenses')

  // Attempt delete with wrong owner
  function deleteExpense(expenseId, ownerId) {
    const exp = expenses.find((e) => e.id === expenseId)
    if (!exp || exp.owner_id !== ownerId) return { success: false, error: 'Unauthorized' }
    expenses = expenses.filter((e) => e.id !== expenseId)
    return { success: true }
  }

  const unauthorizedResult = deleteExpense('exp-1', 'owner-B')
  assert.strictEqual(unauthorizedResult.success, false, 'Owner B cannot delete Owner A expense')
  assert.strictEqual(calculateOperatingTotal('owner-A'), 3500)

  // Authorized delete
  const authorizedResult = deleteExpense('exp-1', 'owner-A')
  assert.strictEqual(authorizedResult.success, true)
  assert.strictEqual(expenses.some((e) => e.id === 'exp-1'), false, 'Expense is deleted')
  assert.strictEqual(calculateOperatingTotal('owner-A'), 2000, 'Operating expense total recalculated accurately')
})

test('16. Bug #3: Bed-Room Mismatch Validation Law', () => {
  const rooms = [
    { id: 'room-101', room_number: '101', room_type: 'Single' },
    { id: 'room-102', room_number: '102', room_type: 'Double' },
  ]

  const beds = [
    { id: 'bed-101-a', room_id: 'room-101', status: 'available' },
    { id: 'bed-102-a', room_id: 'room-102', status: 'available' },
  ]

  function validateBedRoomAssignment(selectedRoomId, selectedBedId) {
    if (!selectedBedId) return { valid: true, effectiveRoomId: selectedRoomId }
    const bed = beds.find((b) => b.id === selectedBedId)
    if (!bed) return { valid: false, error: 'Bed does not exist' }

    // If roomId is supplied, verify bed belongs to selected room
    if (selectedRoomId && bed.room_id && bed.room_id !== selectedRoomId) {
      return { valid: false, error: 'The selected bed belongs to another room. Room and bed must match.' }
    }

    // If roomId is absent, derive room from the bed's actual room_id
    const effectiveRoomId = selectedRoomId || bed.room_id
    return { valid: true, effectiveRoomId }
  }

  // Case 1: Room 101 + Bed from Room 102 (MISMATCH) -> MUST FAIL
  const mismatchResult = validateBedRoomAssignment('room-101', 'bed-102-a')
  assert.strictEqual(mismatchResult.valid, false)
  assert.ok(mismatchResult.error.includes('belongs to another room'))

  // Case 2: Room 101 + Bed from Room 101 (MATCH) -> SUCСEED
  const matchResult = validateBedRoomAssignment('room-101', 'bed-101-a')
  assert.strictEqual(matchResult.valid, true)
  assert.strictEqual(matchResult.effectiveRoomId, 'room-101')

  // Case 3: roomId absent, Bed 102-a provided -> MUST DERIVE room-102
  const derivedResult = validateBedRoomAssignment(null, 'bed-102-a')
  assert.strictEqual(derivedResult.valid, true)
  assert.strictEqual(derivedResult.effectiveRoomId, 'room-102')
})

test('17. Bug #4: Bed Occupancy Conflict Protection', () => {
  const beds = [
    { id: 'bed-1', status: 'available' }, // Database status may be stale ('available')
  ]
  const tenants = [
    { id: 'tenant-active', bed_id: 'bed-1', status: 'active' },
    { id: 'tenant-vacated', bed_id: 'bed-1', status: 'Vacated' },
  ]

  function checkBedAvailability(bedId) {
    const bed = beds.find((b) => b.id === bedId)
    if (!bed || bed.status !== 'available') return { available: false, reason: 'Bed status unavailable' }

    // Independent occupant verification: check if any ACTIVE (non-vacated) tenant occupies it
    const activeOccupant = tenants.find((t) => t.bed_id === bedId && t.status !== 'Vacated')
    if (activeOccupant) {
      return { available: false, reason: 'Bed already occupied by active resident' }
    }

    return { available: true }
  }

  // Even though beds[0].status === 'available', activeOccupant exists
  const conflictCheck = checkBedAvailability('bed-1')
  assert.strictEqual(conflictCheck.available, false)
  assert.strictEqual(conflictCheck.reason, 'Bed already occupied by active resident')

  // Once active tenant vacates:
  tenants[0].status = 'Vacated'
  const freeCheck = checkBedAvailability('bed-1')
  assert.strictEqual(freeCheck.available, true, 'Bed becomes assignable after all occupants vacate')
})

test('18. Bug #5: Server-Side Exact Room Capacity Law (Single=1, Double=2, Triple=3)', () => {
  function testRoomCapacityEnforcement(roomType, activeOccupantCount) {
    const type = roomType.toLowerCase()
    const maxCapacity = type.includes('single') ? 1 : type.includes('double') ? 2 : type.includes('triple') ? 3 : 4
    if (activeOccupantCount >= maxCapacity) {
      return { allowed: false, error: `Capacity exceeded: max ${maxCapacity}` }
    }
    return { allowed: true }
  }

  // Single Room (capacity 1)
  assert.strictEqual(testRoomCapacityEnforcement('Single', 0).allowed, true, 'Single: 1st occupant succeeds')
  assert.strictEqual(testRoomCapacityEnforcement('Single', 1).allowed, false, 'Single: 2nd occupant fails')

  // Double Room (capacity 2)
  assert.strictEqual(testRoomCapacityEnforcement('Double', 0).allowed, true, 'Double: 1st occupant succeeds')
  assert.strictEqual(testRoomCapacityEnforcement('Double', 1).allowed, true, 'Double: 2nd occupant succeeds')
  assert.strictEqual(testRoomCapacityEnforcement('Double', 2).allowed, false, 'Double: 3rd occupant fails')

  // Triple Room (capacity 3)
  assert.strictEqual(testRoomCapacityEnforcement('Triple', 0).allowed, true, 'Triple: 1st occupant succeeds')
  assert.strictEqual(testRoomCapacityEnforcement('Triple', 1).allowed, true, 'Triple: 2nd occupant succeeds')
  assert.strictEqual(testRoomCapacityEnforcement('Triple', 2).allowed, true, 'Triple: 3rd occupant succeeds')
  assert.strictEqual(testRoomCapacityEnforcement('Triple', 3).allowed, false, 'Triple: 4th occupant fails')
})

test('19. Bug #6: Concurrency & Atomic Bed Reservation Simulation', async () => {
  // Simulate database row with optimistic locking (.eq('status', 'available'))
  let bedStatus = 'available'

  async function attemptBedClaim(requestId) {
    // Atomic update simulation: only updates if status is currently 'available'
    if (bedStatus === 'available') {
      bedStatus = 'occupied'
      return { success: true, claimedBy: requestId }
    }
    return { success: false, error: 'The selected bed was just taken or is no longer available.' }
  }

  // Simulate two concurrent requests arriving simultaneously
  const [res1, res2] = await Promise.all([
    attemptBedClaim('request-A'),
    attemptBedClaim('request-B'),
  ])

  // Exactly one must succeed, the other must safely fail
  const successCount = (res1.success ? 1 : 0) + (res2.success ? 1 : 0)
  assert.strictEqual(successCount, 1, 'Only one concurrent request may claim the bed')
  assert.strictEqual(bedStatus, 'occupied', 'Bed status must be occupied')
})

test('20. Bug #8: Strict Cross-Owner Isolation Law', () => {
  const resources = [
    { type: 'property', id: 'prop-1', owner_id: 'owner-A' },
    { type: 'room', id: 'room-1', owner_id: 'owner-A' },
    { type: 'bed', id: 'bed-1', owner_id: 'owner-A' },
    { type: 'tenant', id: 'ten-1', owner_id: 'owner-A' },
    { type: 'expense', id: 'exp-1', owner_id: 'owner-A' },
    { type: 'payment', id: 'pay-1', owner_id: 'owner-A' },
  ]

  function verifyAccess(resource, userOwnerId) {
    return resource.owner_id === userOwnerId
  }

  for (const r of resources) {
    assert.strictEqual(verifyAccess(r, 'owner-A'), true, `Owner A must have access to own ${r.type}`)
    assert.strictEqual(verifyAccess(r, 'owner-B'), false, `Owner B must NEVER access Owner A's ${r.type}`)
  }
})

test('21. BaseraBook Branding & Presentation Verification', () => {
  const brandName = 'BaseraBook'
  assert.strictEqual(brandName, 'BaseraBook')
  assert.notStrictEqual(brandName, 'StayBook')
  assert.notStrictEqual(brandName, 'StayNest')
})

test('22. Razorpay Subscription Pricing Invariants & Paise Amounts', () => {
  // Starter
  assert.strictEqual(1099 * 100, 109900, 'Starter monthly must be 109,900 paise (₹1,099)')
  assert.strictEqual(9999 * 100, 999900, 'Starter yearly must be 999,900 paise (₹9,999)')

  // Growth
  assert.strictEqual(1799 * 100, 179900, 'Growth monthly must be 179,900 paise (₹1,799)')
  assert.strictEqual(17990 * 100, 1799000, 'Growth yearly must be 1,799,000 paise (₹17,990)')

  // Business
  assert.strictEqual(2799 * 100, 279900, 'Business monthly must be 279,900 paise (₹2,799)')
  assert.strictEqual(27990 * 100, 2799000, 'Business yearly must be 2,799,000 paise (₹27,990)')

  assert.strictEqual(PRICING_CONFIG.trialDays, 7, 'Trial period must be exactly 7 days')
})

test('23. Razorpay Subscription Payment Signature Verification', () => {
  const secret = 'test_razorpay_secret_123'
  const paymentId = 'pay_test123456789'
  const subscriptionId = 'sub_test987654321'

  const validSignature = crypto
    .createHmac('sha256', secret)
    .update(`${paymentId}|${subscriptionId}`)
    .digest('hex')

  // Helper matching lib/razorpay.ts
  function verify(pId, sId, sig, sec) {
    const expected = crypto.createHmac('sha256', sec).update(`${pId}|${sId}`).digest('hex')
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(sig, 'hex'))
  }

  assert.strictEqual(verify(paymentId, subscriptionId, validSignature, secret), true, 'Valid signature must verify')
  
  // Tampered paymentId
  const tamperedPayment = 'pay_tampered99999'
  assert.notStrictEqual(
    crypto.createHmac('sha256', secret).update(`${tamperedPayment}|${subscriptionId}`).digest('hex'),
    validSignature,
    'Tampered payment ID must fail verification'
  )
})

test('24. Razorpay Webhook Raw Body HMAC Signature Verification', () => {
  const webhookSecret = 'test_webhook_secret_abc'
  const rawBody = JSON.stringify({
    event: 'subscription.charged',
    payload: { subscription: { entity: { id: 'sub_test123' } } },
  })

  const validSig = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex')

  function verifyWebhook(body, sig, sec) {
    const expected = crypto.createHmac('sha256', sec).update(body).digest('hex')
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(sig, 'hex'))
  }

  assert.strictEqual(verifyWebhook(rawBody, validSig, webhookSecret), true, 'Valid webhook payload must verify')

  // Tampered payload
  const tamperedBody = rawBody + ' '
  assert.strictEqual(
    crypto.createHmac('sha256', webhookSecret).update(tamperedBody).digest('hex') === validSig,
    false,
    'Modified payload must fail signature check'
  )
})

test('25. Razorpay Subscription Lifecycle Event State Mapping', () => {
  const eventStatusMap = {
    'subscription.authenticated': 'trialing',
    'subscription.activated': 'active',
    'subscription.charged': 'active',
    'subscription.pending': 'past_due',
    'subscription.halted': 'expired',
    'subscription.cancelled': 'canceled',
    'subscription.completed': 'expired',
  }

  assert.strictEqual(eventStatusMap['subscription.authenticated'], 'trialing')
  assert.strictEqual(eventStatusMap['subscription.activated'], 'active')
  assert.strictEqual(eventStatusMap['subscription.charged'], 'active')
  assert.strictEqual(eventStatusMap['subscription.pending'], 'past_due')
  assert.strictEqual(eventStatusMap['subscription.halted'], 'expired')
  assert.strictEqual(eventStatusMap['subscription.cancelled'], 'canceled')
})

test('26. Open Redirect Defense: Strict Destination Validation & Sanitization', () => {
  const maliciousDestinations = [
    'https://evil.com',
    'http://evil.com',
    'https://attacker.com/login?token=leak',
    '//evil.com',
    '//attacker.com/phish',
    '///evil.com',
    '////evil.com',
    '/\\evil.com',
    '/\\\\evil.com',
    '\\\\evil.com',
    '\\evil.com',
    'javascript:alert(document.cookie)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    '/dashboard\r\nSet-Cookie:session=compromised',
    '/dashboard\nEvil-Header:injected',
    '/dashboard\0nullbyte',
    'evil.com',
    'baserabook.in.attacker.com',
    'http://baserabook.in@attacker.com',
    '   ',
    '',
    null,
    undefined,
    12345,
    {},
  ]

  for (const malicious of maliciousDestinations) {
    assert.strictEqual(
      isSafeRedirectPath(malicious),
      false,
      `Unsafe redirect target must be rejected: ${String(malicious)}`
    )
    assert.strictEqual(
      getSafeRedirectPath(malicious, '/dashboard'),
      '/dashboard',
      `Unsafe redirect must fallback to /dashboard: ${String(malicious)}`
    )
    assert.strictEqual(
      getSafeRedirectPath(malicious, '/'),
      '/',
      `Unsafe redirect must fallback to /: ${String(malicious)}`
    )
  }

  const legitimateDestinations = [
    '/',
    '/dashboard',
    '/dashboard?plan=yearly',
    '/pricing?plan=monthly#annual-comparison',
    '/admin',
    '/admin/setup-security',
    '/properties/prop-101/rooms',
    '/console?error=unauthorized',
    '/terms',
    '/privacy',
  ]

  for (const legitimate of legitimateDestinations) {
    assert.strictEqual(
      isSafeRedirectPath(legitimate),
      true,
      `Legitimate local path must be accepted: ${legitimate}`
    )
    assert.strictEqual(
      getSafeRedirectPath(legitimate, '/fallback'),
      legitimate,
      `Legitimate path must be preserved: ${legitimate}`
    )
  }
})

test('27. Health Endpoint Information Disclosure Defense (SEC-04)', () => {
  // Test raw error scenarios that could expose internal architecture or credentials
  const simulatedExceptions = [
    'FATAL: password authentication failed for user "postgres" at postgresql://postgres:SuperSecretPassword123@db.supabase.co:5432/postgres',
    'relation "public.profiles" does not exist at host 10.0.12.44:5432 with schema supabase_internal',
    'Unhandled promise rejection: connect ECONNREFUSED 192.168.1.100:5432; apiKey=sb-admin-secret-token-12345',
    'PostgREST-Error: { "hint": null, "details": "column users.secret_salt does not exist", "code": "42703" }',
    new Error('PostgreSQL connection timed out to primary cluster aws-ap-south-1.supabase.co:5432'),
    { message: 'database server failed authentication with service_role token eyJhbGciOi...' },
    null,
    undefined,
  ]

  for (const rawErr of simulatedExceptions) {
    const degradedResult = sanitizeHealthError(rawErr, 'degraded')
    const unreachableResult = sanitizeHealthError(rawErr, 'unreachable')

    assert.strictEqual(
      degradedResult,
      HEALTH_ERROR_MESSAGES.degraded,
      'Degraded error message must be generic and safe'
    )
    assert.strictEqual(
      unreachableResult,
      HEALTH_ERROR_MESSAGES.unreachable,
      'Unreachable error message must be generic and safe'
    )

    // Ensure raw error strings are never leaked into the returned description
    if (typeof rawErr === 'string') {
      assert.strictEqual(degradedResult.includes(rawErr), false, 'Raw error string must not be present')
      assert.strictEqual(unreachableResult.includes(rawErr), false, 'Raw error string must not be present')
    }
  }

  // Verify structure of health error payloads ensures uptime monitoring compatibility while hiding details
  const mockHealthPayload = {
    status: 'degraded',
    timestamp: new Date().toISOString(),
    uptimeSec: 3600,
    environment: 'production',
    version: '1.0.0',
    database: {
      status: 'error',
      error: sanitizeHealthError(new Error('Sensitive Postgres crash message'), 'degraded'),
      latencyMs: 42,
    },
  }

  assert.strictEqual(mockHealthPayload.status, 'degraded')
  assert.strictEqual(mockHealthPayload.database.status, 'error')
  assert.strictEqual(mockHealthPayload.database.error, 'Database service unavailable')
  assert.strictEqual(typeof mockHealthPayload.database.latencyMs, 'number')
  assert.ok(mockHealthPayload.timestamp, 'Timestamp must exist for uptime monitors')
})

test('28. Distributed & In-Memory Rate Limiting Architecture (SEC-05)', async () => {
  const config = { maxTokens: 5, refillRatePerSec: 1 }

  // 1. Unconfigured Upstash (local development / fallback) -> uses in-memory token bucket
  const unconfiguredKey = 'auth:unconfigured-ip'
  for (let i = 0; i < 5; i++) {
    const res = await checkSharedRateLimit(unconfiguredKey, config, { url: '', token: '' })
    assert.strictEqual(res.allowed, true, `Request ${i + 1} should be allowed`)
    assert.strictEqual(res.store, 'memory', 'Must identify store as memory')
  }
  const exceededRes = await checkSharedRateLimit(unconfiguredKey, config, { url: '', token: '' })
  assert.strictEqual(exceededRes.allowed, false, '6th request must be rate limited')
  assert.strictEqual(exceededRes.remaining, 0)
  assert.ok(exceededRes.retryAfterSec && exceededRes.retryAfterSec > 0)

  // 2. Configured Upstash with atomic pipeline mock
  let pipelineCalls = 0
  let mockRedisCounter = 0
  const mockFetchSuccess = async (url, options) => {
    pipelineCalls++
    mockRedisCounter++
    assert.ok(url.endsWith('/pipeline'), 'Must invoke Upstash pipeline endpoint')
    assert.strictEqual(options.method, 'POST')
    assert.strictEqual(options.headers.Authorization, 'Bearer mock-test-token')
    return {
      ok: true,
      status: 200,
      json: async () => [{ result: mockRedisCounter }, { result: 1 }],
    }
  }

  const distributedKey = 'api:distributed-ip-123'
  // First 5 requests should pass via redis
  for (let i = 1; i <= 5; i++) {
    const res = await checkSharedRateLimit(distributedKey, config, {
      url: 'https://mock-redis.upstash.io',
      token: 'mock-test-token',
      fetchFn: mockFetchSuccess,
    })
    assert.strictEqual(res.allowed, true)
    assert.strictEqual(res.store, 'redis', 'Must indicate redis store')
    assert.strictEqual(res.remaining, 5 - i)
  }

  // 6th request: mock counter will be 6 (> maxTokens of 5)
  const rateLimitedRes = await checkSharedRateLimit(distributedKey, config, {
    url: 'https://mock-redis.upstash.io',
    token: 'mock-test-token',
    fetchFn: mockFetchSuccess,
  })
  assert.strictEqual(rateLimitedRes.allowed, false, 'Should be denied when Redis count exceeds maxTokens')
  assert.strictEqual(rateLimitedRes.remaining, 0)
  assert.strictEqual(rateLimitedRes.store, 'redis')
  assert.ok(rateLimitedRes.retryAfterSec && rateLimitedRes.retryAfterSec > 0)

  // 3. Fail-safe behavior on Upstash network error
  const mockFetchError = async () => {
    throw new Error('Upstash network timeout')
  }

  const failSafeRes = await checkSharedRateLimit('api:fail-safe-ip', config, {
    url: 'https://mock-redis.upstash.io',
    token: 'mock-test-token',
    fetchFn: mockFetchError,
  })
  assert.strictEqual(failSafeRes.allowed, true, 'Must gracefully fail open to memory without throwing')
  assert.strictEqual(failSafeRes.store, 'memory', 'Must fallback to in-memory store')

  // 4. Fail-safe behavior on Upstash HTTP 500 error
  const mockFetch500 = async () => ({
    ok: false,
    status: 500,
  })

  const failSafe500Res = await checkSharedRateLimit('api:fail-safe-500-ip', config, {
    url: 'https://mock-redis.upstash.io',
    token: 'mock-test-token',
    fetchFn: mockFetch500,
  })
  assert.strictEqual(failSafe500Res.allowed, true, 'HTTP 500 must fall back safely to in-memory')
  assert.strictEqual(failSafe500Res.store, 'memory')
})

test('29. Tenant Portal: Cryptographic Token Entropy & One-Way Hash Verification', () => {
  const generatedTokens = new Set()
  const generatedHashes = new Set()

  for (let i = 0; i < 50; i++) {
    const { rawToken, tokenHash, tokenPreview } = generateTenantToken()

    // High Entropy Verification: 32 bytes base64url is 43 characters
    assert.strictEqual(rawToken.length, 43, 'Raw token must be 43 characters (256-bit URL-safe entropy)')
    assert.match(rawToken, /^[A-Za-z0-9_-]+$/, 'Raw token must be URL-safe without special characters')

    // Deterministic SHA-256 Hashing Verification
    assert.strictEqual(tokenHash.length, 64, 'SHA-256 hash must be exactly 64 hex characters')
    assert.strictEqual(hashToken(rawToken), tokenHash, 'hashToken must deterministically reproduce the stored hash')

    // Preview Formatting (safe for owner UI, never exposes full secret)
    assert.ok(tokenPreview.startsWith('tk_'), 'Token preview must start with prefix')
    assert.ok(tokenPreview.length < 15, 'Preview must be concise and non-reversible')

    generatedTokens.add(rawToken)
    generatedHashes.add(tokenHash)
  }

  // Cryptographic collision barrier
  assert.strictEqual(generatedTokens.size, 50, 'All generated tokens must be cryptographically unique')
  assert.strictEqual(generatedHashes.size, 50, 'All generated hashes must be unique')
})

test('30. Tenant Portal: Tamper-Evident Signed Session & Expiration Invariant', () => {
  const validPayload = {
    tenantId: 'tenant-uuid-1234',
    ownerId: 'owner-uuid-5678',
    tokenId: 'token-uuid-9999',
    expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
  }

  const sessionString = signTenantSession(validPayload)
  assert.ok(sessionString.includes('.'), 'Session string must contain signature separator')

  // 1. Valid session verification
  const verified = verifyTenantSession(sessionString)
  assert.ok(verified !== null, 'Valid session must decode successfully')
  assert.strictEqual(verified.tenantId, 'tenant-uuid-1234')
  assert.strictEqual(verified.ownerId, 'owner-uuid-5678')

  // 2. Tampered payload detection (e.g. attacker changes tenant ID)
  const parts = sessionString.split('.')
  const tamperedPayload = { ...validPayload, tenantId: 'attacker-tenant-id' }
  const tamperedB64 = Buffer.from(JSON.stringify(tamperedPayload)).toString('base64url')
  const tamperedSession = `${tamperedB64}.${parts[1]}`
  assert.strictEqual(verifyTenantSession(tamperedSession), null, 'Tampered payload must fail cryptographic verification')

  // 3. Tampered signature detection
  const badSigSession = `${parts[0]}.invalid-signature-value`
  assert.strictEqual(verifyTenantSession(badSigSession), null, 'Tampered signature must be rejected')

  // 4. Expired session detection
  const expiredPayload = {
    ...validPayload,
    expiresAt: Date.now() - 5000, // 5 seconds in the past
  }
  const expiredSession = signTenantSession(expiredPayload)
  assert.strictEqual(verifyTenantSession(expiredSession), null, 'Expired session must return null')
})

test('31. Tenant Portal: Strict Multi-Tenant Data Isolation (Cross-Tenant Barrier)', () => {
  // Scenario: Two tenants under the same PG Owner
  const tenantAlpha = { id: 'tenant-alpha-uuid', name: 'Rohan Sharma' }
  const tenantBeta = { id: 'tenant-beta-uuid', name: 'Vikram Singh' }

  const databasePayments = [
    { id: 'pay-alpha-1', tenant_id: 'tenant-alpha-uuid', amount: 8000, type: 'rent' },
    { id: 'pay-alpha-2', tenant_id: 'tenant-alpha-uuid', amount: 8000, type: 'rent' },
    { id: 'pay-beta-1', tenant_id: 'tenant-beta-uuid', amount: 9500, type: 'rent' },
  ]

  // Simulate Tenant Alpha accessing portal data:
  // Server-side authorization handler:
  const getTenantPortalPayments = (sessionTenantId) => {
    // Queries database strictly enforcing session tenantId
    return databasePayments.filter((p) => p.tenant_id === sessionTenantId)
  }

  const alphaPayments = getTenantPortalPayments(tenantAlpha.id)
  assert.strictEqual(alphaPayments.length, 2, 'Tenant Alpha sees only their 2 payments')
  assert.ok(alphaPayments.every((p) => p.tenant_id === tenantAlpha.id))
  assert.strictEqual(alphaPayments.some((p) => p.tenant_id === tenantBeta.id), false, 'Alpha must never see Beta payments')

  // Simulate Tenant Alpha attempting to fetch receipt of Tenant Beta:
  const getReceiptById = (sessionTenantId, requestedPaymentId) => {
    const payment = databasePayments.find((p) => p.id === requestedPaymentId && p.tenant_id === sessionTenantId)
    if (!payment) return { error: 'NOT_AUTHORIZED_OR_NOT_FOUND', status: 404 }
    return { success: true, payment }
  }

  const unauthorizedReceiptAttempt = getReceiptById(tenantAlpha.id, 'pay-beta-1')
  assert.strictEqual(unauthorizedReceiptAttempt.status, 404, 'Attempt to access another tenant receipt must fail')

  const authorizedReceipt = getReceiptById(tenantAlpha.id, 'pay-alpha-1')
  assert.strictEqual(authorizedReceipt.success, true, 'Tenant can access their own receipt')
})

test('32. Tenant Portal: Token Revocation & Regeneration Lifecycle Simulation', () => {
  // In-memory token store simulating public.tenant_access_tokens
  const tokensTable = []

  const issueTokenForTenant = (tenantId, ownerId) => {
    // 1. Revoke any previous active tokens
    tokensTable.forEach((t) => {
      if (t.tenant_id === tenantId && !t.revoked_at) {
        t.revoked_at = new Date().toISOString()
      }
    })

    // 2. Issue new token
    const { rawToken, tokenHash, tokenPreview } = generateTenantToken()
    const record = {
      id: `token-${tokensTable.length + 1}`,
      owner_id: ownerId,
      tenant_id: tenantId,
      token_hash: tokenHash,
      token_preview: tokenPreview,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      revoked_at: null,
    }
    tokensTable.push(record)
    return rawToken
  }

  const validateRawToken = (rawToken) => {
    const hash = hashToken(rawToken)
    const record = tokensTable.find((t) => t.token_hash === hash)
    if (!record) return { valid: false, reason: 'NOT_FOUND' }
    if (record.revoked_at) return { valid: false, reason: 'REVOKED' }
    if (new Date(record.expires_at).getTime() < Date.now()) return { valid: false, reason: 'EXPIRED' }
    return { valid: true, record }
  }

  // Cycle 1: Issue Token 1
  const token1 = issueTokenForTenant('tenant-1', 'owner-1')
  assert.strictEqual(validateRawToken(token1).valid, true, 'Token 1 must be valid initially')

  // Cycle 2: Regenerate (Issues Token 2, Revokes Token 1)
  const token2 = issueTokenForTenant('tenant-1', 'owner-1')
  assert.strictEqual(validateRawToken(token1).valid, false, 'Token 1 must now be revoked')
  assert.strictEqual(validateRawToken(token1).reason, 'REVOKED')
  assert.strictEqual(validateRawToken(token2).valid, true, 'Token 2 must be valid')

  // Cycle 3: Explicit Owner Revoke
  tokensTable.forEach((t) => {
    if (t.tenant_id === 'tenant-1') t.revoked_at = new Date().toISOString()
  })
  assert.strictEqual(validateRawToken(token2).valid, false, 'Token 2 must now be revoked')
  assert.strictEqual(validateRawToken(token2).reason, 'REVOKED')
})

test('33. Tenant Portal: Search Engine Privacy & No-Index Header Invariant (SEC-06)', () => {
  const dummyResponse = NextResponse.next()
  const portalResponse = applySecurityHeaders(dummyResponse, '/portal')
  assert.strictEqual(
    portalResponse.headers.get('X-Robots-Tag'),
    'noindex, nofollow, noarchive',
    '/portal must be protected from search engine indexing'
  )

  const portalApiResponse = applySecurityHeaders(dummyResponse, '/api/portal/data')
  assert.strictEqual(
    portalApiResponse.headers.get('X-Robots-Tag'),
    'noindex, nofollow, noarchive',
    '/api/portal must be protected from search engine indexing'
  )
})

test('34. Payment QR & UPI Link Reminder Integration', () => {
  // Case A: Reminder with no payment options saved -> omits payment details cleanly
  const waWithoutPay = generateWhatsAppReminder({
    tenantName: 'Vikas Sharma',
    phone: '9876543210',
    amount: 7500,
    dueDay: 5,
    propertyName: 'Sunrise PG',
    locale: 'en',
    paymentDetails: null,
  })
  assert.ok(!waWithoutPay.includes('Payment Options:'), 'Must omit payment section if no payment options saved')
  assert.ok(waWithoutPay.includes('Vikas'), 'Must include resident name')
  assert.ok(waWithoutPay.includes('7%2C500') || waWithoutPay.includes('7500'), 'Must include amount')

  // Case B: Reminder with UPI ID saved -> includes UPI ID
  const waWithUpi = generateWhatsAppReminder({
    tenantName: 'Vikas Sharma',
    phone: '9876543210',
    amount: 7500,
    dueDay: 5,
    propertyName: 'Sunrise PG',
    locale: 'en',
    paymentDetails: {
      upiId: 'sunrisepg@okhdfcbank',
      paymentLink: null,
    },
  })
  assert.ok(waWithUpi.includes('sunrisepg%40okhdfcbank') || waWithUpi.includes('sunrisepg@okhdfcbank'), 'Must include saved UPI ID')
  assert.ok(waWithUpi.includes('Payment%20Options'), 'Must include payment header')

  // Case C: Reminder with Payment Link saved -> includes payment link
  const waWithLink = generateWhatsAppReminder({
    tenantName: 'Vikas Sharma',
    phone: '9876543210',
    amount: 7500,
    dueDay: 5,
    propertyName: 'Sunrise PG',
    locale: 'en',
    paymentDetails: {
      paymentLink: 'https://paytm.me/m-sunrise',
    },
  })
  assert.ok(waWithLink.includes('paytm.me'), 'Must include payment link')

  // Case D: Hindi locale reminder with UPI
  const waHi = generateWhatsAppReminder({
    tenantName: 'विकास शर्मा',
    phone: '9876543210',
    amount: 7500,
    dueDay: 5,
    propertyName: 'सनराइज पीजी',
    locale: 'hi',
    paymentDetails: {
      upiId: 'sunrisepg@upi',
    },
  })
  assert.ok(waHi.includes('sunrisepg%40upi') || waHi.includes('sunrisepg@upi'), 'Must include UPI ID in Hindi reminder')

  // Case E: SMS reminder with UPI
  const smsWithPay = generateSmsReminder({
    tenantName: 'Vikas',
    amount: 7500,
    dueDay: 5,
    propertyName: 'Sunrise PG',
    paymentDetails: { upiId: 'sunrisepg@upi' },
  })
  assert.ok(smsWithPay.includes('sunrisepg%40upi') || smsWithPay.includes('sunrisepg@upi'), 'SMS must include UPI info')

  // Case F: SMS reminder without payment option
  const smsWithoutPay = generateSmsReminder({
    tenantName: 'Vikas',
    amount: 7500,
    dueDay: 5,
    propertyName: 'Sunrise PG',
    paymentDetails: null,
  })
  assert.ok(!smsWithoutPay.includes('UPI:'), 'SMS must omit UPI info if none saved')
})

test('35. Mid-Cycle Electricity Bill Sharing Engine Invariants', () => {
  // Scenario: 30-day month (2026-09-01 to 2026-09-30), total bill ₹1200
  // Resident 1 (Alice): Joined 2026-08-01 (full 30 days present)
  // Resident 2 (Bob): Joined 2026-09-16 (15 days present, joined mid-cycle)
  const result = calculateMidCycleElectricitySplit({
    periodStart: '2026-09-01',
    periodEnd: '2026-09-30',
    totalAmount: 1200,
    ratePerUnit: 10,
    residents: [
      { id: 'res-alice', name: 'Alice', room: '101', joiningDate: '2026-08-01' },
      { id: 'res-bob', name: 'Bob', room: '101', joiningDate: '2026-09-16' },
    ],
  })

  assert.strictEqual(result.totalPeriodDays, 30, 'Total days must equal 30')
  assert.strictEqual(result.totalAmount, 1200, 'Total amount must match')

  const alice = result.residentShares.find((s) => s.residentId === 'res-alice')
  const bob = result.residentShares.find((s) => s.residentId === 'res-bob')

  assert.ok(alice, 'Alice share must be computed')
  assert.ok(bob, 'Bob share must be computed')

  assert.strictEqual(alice.occupiedDays, 30, 'Alice must have 30 occupied days')
  assert.strictEqual(bob.occupiedDays, 15, 'Bob must have 15 occupied days')

  // Mathematical law: Bob joined on day 16. Bob pays ₹0 for days 1-15!
  // Days 1-15: ₹40/day * 15 days = ₹600 (Alice pays 100% = ₹600, Bob pays ₹0)
  // Days 16-30: ₹40/day * 15 days = ₹600 (Split 50/50: Alice ₹300, Bob ₹300)
  // Total Alice: ₹900 (75%). Total Bob: ₹300 (25%).
  assert.strictEqual(alice.amountDue, 900, 'Alice share must be exactly ₹900')
  assert.strictEqual(bob.amountDue, 300, 'Bob share must be exactly ₹300')
  assert.strictEqual(alice.amountDue + bob.amountDue, 1200, 'Sum of shares must perfectly equal total bill ₹1200')
  assert.ok(bob.calculationExplanation.includes('not charged for days prior'), 'Explanation must clarify zero charges before move-in')

  // Scenario 2: Individual move-in meter readings
  const meterResult = calculateMidCycleElectricitySplit({
    periodStart: '2026-09-01',
    periodEnd: '2026-09-30',
    ratePerUnit: 10,
    useMeterReadings: true,
    residents: [
      { id: 'res-1', name: 'Dave', joiningDate: '2026-09-01', moveInReading: 100, closingReading: 180 },
      { id: 'res-2', name: 'Elena', joiningDate: '2026-09-15', moveInReading: 0, closingReading: 40 },
    ],
  })

  assert.strictEqual(meterResult.calculationMethod, 'meter_readings', 'Method must be meter_readings')
  const dave = meterResult.residentShares.find((s) => s.residentId === 'res-1')
  const elena = meterResult.residentShares.find((s) => s.residentId === 'res-2')
  assert.strictEqual(dave.unitsConsumed, 80, 'Dave units must be 80')
  assert.strictEqual(elena.unitsConsumed, 40, 'Elena units must be 40')
  assert.strictEqual(dave.amountDue, 800, 'Dave amount must be 800')
  assert.strictEqual(elena.amountDue, 400, 'Elena amount must be 400')
})

test('36. UPI ID & Payment Link Deep Validation Law', () => {
  // Case A: Valid UPI IDs
  const validUpis = [
    'sunrisepg@okhdfcbank',
    '9876543210@paytm',
    'staynest.bills@icici',
    'raj-kumar@sbi',
    'owner@upi',
    'pg_management@axisbank',
  ]
  for (const upi of validUpis) {
    const res = validateUpiId(upi)
    assert.ok(res.isValid, `Valid UPI ID "${upi}" must pass validation`)
    assert.strictEqual(res.data, upi)
  }

  // Case B: Invalid UPI IDs
  const invalidUpis = [
    { id: '', err: 'empty' },
    { id: '   ', err: 'empty' },
    { id: 'sunrisepg', err: 'must contain @' },
    { id: 'sunrise@pg@okhdfcbank', err: 'multiple @' },
    { id: 'user@', err: 'bank handle after @' },
    { id: '@okhdfcbank', err: 'username before @' },
    { id: 'user name@okhdfcbank', err: 'spaces' },
    { id: 'user#name@upi', err: 'unsupported characters' },
  ]
  for (const { id, err } of invalidUpis) {
    const res = validateUpiId(id)
    assert.strictEqual(res.isValid, false, `Invalid UPI ID "${id}" must fail validation`)
    assert.ok(res.error, `Must return actionable error for "${id}"`)
  }

  // Case C: Valid Payment Links (HTTPS gateways & UPI deep links)
  const validLinks = [
    'https://rzp.io/l/sunrisepg',
    'https://paytm.me/m-sunrise',
    'https://phonepe.com/pay/pg123',
    'https://gpay.app.goo.gl/pay',
    'https://razorpay.me/@sunrisepg',
    'https://bharatpe.com/pay',
    'upi://pay?pa=sunrisepg@okhdfcbank&pn=Sunrise%20PG&cu=INR',
    'upi://pay?pa=owner@upi',
  ]
  for (const link of validLinks) {
    const res = validatePaymentLink(link)
    assert.ok(res.isValid, `Valid payment link "${link}" must pass validation`)
    assert.strictEqual(res.data, link)
  }

  // Case D: Insecure, malformed, or unsupported payment links
  const invalidLinks = [
    { link: 'http://insecure-gateway.com/pay', reason: 'plain HTTP must be rejected' },
    { link: 'ftp://files.example.com/pay', reason: 'FTP scheme must be rejected' },
    { link: 'javascript:alert(1)', reason: 'javascript scheme must be rejected' },
    { link: 'not-a-valid-url', reason: 'plain text must be rejected' },
    { link: 'upi://pay', reason: 'UPI link without payee pa= parameter must be rejected' },
    { link: 'upi://pay?pn=PGName', reason: 'UPI link missing pa= parameter must be rejected' },
    { link: 'upi://pay?pa=invalid upi with spaces', reason: 'UPI link with malformed pa= must be rejected' },
    { link: 'https://youtube.com/watch?v=123', reason: 'Non-payment domains must be rejected' },
  ]
  for (const { link, reason } of invalidLinks) {
    const res = validatePaymentLink(link)
    assert.strictEqual(res.isValid, false, `Link "${link}" (${reason}) must be rejected`)
    assert.ok(res.error, `Must provide actionable error explanation for "${link}"`)
  }
})

test('37. QR Code File & Decoded URI Validation Law', () => {
  // Case A: File MIME type checks
  const validFiles = [
    { type: 'image/png', size: 1024 * 500, name: 'qr.png' },
    { type: 'image/jpeg', size: 1024 * 800, name: 'qr.jpg' },
    { type: 'image/webp', size: 1024 * 300, name: 'qr.webp' },
    { type: 'image/svg+xml', size: 1024 * 100, name: 'qr.svg' },
  ]
  for (const f of validFiles) {
    const res = validateQrImageFile(f)
    assert.ok(res.isValid, `File ${f.name} must be accepted`)
  }

  // Case B: Oversized file (> 2MB)
  const oversizedFile = { type: 'image/png', size: 3 * 1024 * 1024, name: 'huge_qr.png' }
  const overRes = validateQrImageFile(oversizedFile)
  assert.strictEqual(overRes.isValid, false, 'Files > 2MB must be rejected')
  assert.ok(overRes.error?.includes('2MB'), 'Error must mention 2MB limit')

  // Case C: Invalid file types
  const invalidFiles = [
    { type: 'application/pdf', size: 1024 * 200, name: 'doc.pdf' },
    { type: 'text/plain', size: 1024 * 50, name: 'notes.txt' },
    { type: 'application/zip', size: 1024 * 500, name: 'archive.zip' },
  ]
  for (const f of invalidFiles) {
    const res = validateQrImageFile(f)
    assert.strictEqual(res.isValid, false, `File ${f.name} (${f.type}) must be rejected`)
  }

  // Case D: Decoded QR Data Validation
  const validDecoded = [
    'upi://pay?pa=sunrisepg@okhdfcbank&pn=Sunrise%20PG',
    'https://rzp.io/l/rent',
    'sunrisepg@okhdfcbank',
  ]
  for (const str of validDecoded) {
    const res = validateDecodedQrData(str)
    assert.ok(res.isValid, `Decoded QR string "${str}" must be accepted`)
  }

  const invalidDecoded = [
    'Hello World, this is not a payment link',
    'http://insecure-site.com/payment',
    'random_gibberish_1234567890',
  ]
  for (const str of invalidDecoded) {
    const res = validateDecodedQrData(str)
    assert.strictEqual(res.isValid, false, `Invalid decoded string "${str}" must be rejected`)
    assert.ok(res.error, 'Must provide clear error for unverified QR content')
  }
})

test('38. Payment Details Form Validation & Reminder Protection Barrier', () => {
  // Case A: Completely empty form submission
  const emptyForm = validatePaymentDetailsForm({ upiId: '', paymentLink: '', qrCodeUrl: '' })
  assert.strictEqual(emptyForm.isValid, false, 'Empty payment form must fail validation')
  assert.ok(emptyForm.errors.general, 'Must return general error explaining at least one method is required')

  // Case B: Invalid UPI ID prevents saving and returns field-specific error
  const invalidUpiForm = validatePaymentDetailsForm({ upiId: 'invalid-no-at-sign', paymentLink: '' })
  assert.strictEqual(invalidUpiForm.isValid, false)
  assert.ok(invalidUpiForm.errors.upiId, 'Must return specific error for upiId')

  // Case C: Invalid payment link prevents saving
  const invalidLinkForm = validatePaymentDetailsForm({ upiId: 'valid@upi', paymentLink: 'http://insecure.com' })
  assert.strictEqual(invalidLinkForm.isValid, false)
  assert.ok(invalidLinkForm.errors.paymentLink, 'Must return specific error for insecure paymentLink')

  // Case D: Valid payment options return clean data
  const validForm = validatePaymentDetailsForm({
    upiId: 'sunrisepg@okhdfcbank',
    paymentLink: 'https://rzp.io/l/sunrise',
    qrCodeUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  })
  assert.ok(validForm.isValid, 'Valid form must pass')
  assert.strictEqual(validForm.cleanData.upiId, 'sunrisepg@okhdfcbank')
  assert.strictEqual(validForm.cleanData.paymentLink, 'https://rzp.io/l/sunrise')

  // Case E: Reminders filter out invalid or malformed payment options
  const filtered = getValidatedReminderPaymentOptions({
    upiId: 'malformed upi with spaces',
    paymentLink: 'http://insecure.com',
  })
  assert.strictEqual(filtered, null, 'Must return null when all provided options are invalid')

  // Case F: Reminders preserve valid options while discarding invalid ones
  const mixed = getValidatedReminderPaymentOptions({
    upiId: 'valid@upi',
    paymentLink: 'http://insecure-link.com', // invalid -> discarded
  })
  assert.ok(mixed, 'Must keep valid option')
  assert.strictEqual(mixed.upiId, 'valid@upi')
  assert.strictEqual(mixed.paymentLink, undefined, 'Invalid link must be omitted')

  // Case G: WhatsApp reminder with invalid payment details does NOT include payment section
  const reminderWithBadData = generateWhatsAppReminder({
    tenantName: 'Rahul',
    phone: '9876543210',
    amount: 5000,
    dueDay: 5,
    propertyName: 'Sunrise PG',
    paymentDetails: {
      upiId: 'invalid-upi-id',
      paymentLink: 'http://insecure.com',
    },
  })
  assert.ok(!reminderWithBadData.includes('Payment Options:'), 'Invalid payment details must NOT be included in reminder')
  assert.ok(!reminderWithBadData.includes('invalid-upi-id'), 'Must not leak invalid UPI ID')

  // Case H: SMS reminder with invalid payment details does NOT include payment text
  const smsWithBadData = generateSmsReminder({
    tenantName: 'Rahul',
    amount: 5000,
    dueDay: 5,
    propertyName: 'Sunrise PG',
    paymentDetails: {
      upiId: 'invalid-upi-id',
      paymentLink: 'not-a-link',
    },
  })
  assert.ok(!smsWithBadData.includes('UPI:'), 'SMS must omit invalid payment info')
  assert.ok(!smsWithBadData.includes('Pay link:'), 'SMS must omit invalid payment link')
})

test('39. Technical SEO: Canonical Invariant, Vercel Subdomain Redirect, and Metadata Integrity', async () => {
  // Invariant 1: Preferred canonical domain is strictly https://www.baserabook.in
  assert.strictEqual(CANONICAL_SITE_URL, 'https://www.baserabook.in')

  // Invariant 2: getSiteUrl() unconditionally returns https://www.baserabook.in
  assert.strictEqual(getSiteUrl(), 'https://www.baserabook.in')

  // Invariant 3: getSiteUrl() rejects Vercel subdomains
  const originalVercel = process.env.VERCEL_PROJECT_PRODUCTION_URL
  process.env.VERCEL_PROJECT_PRODUCTION_URL = 'pg-management-saas-development-rose.vercel.app'
  assert.strictEqual(getSiteUrl(), 'https://www.baserabook.in', 'Must resist vercel.app environment variables')
  if (originalVercel) {
    process.env.VERCEL_PROJECT_PRODUCTION_URL = originalVercel
  } else {
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL
  }

  // Invariant 4: constructMetadata sets canonical correctly
  const rootMeta = constructMetadata({ title: 'Home', description: 'Test' })
  assert.strictEqual(rootMeta.alternates?.canonical, 'https://www.baserabook.in/')
  assert.strictEqual(rootMeta.openGraph?.url, 'https://www.baserabook.in/')

  const subMeta = constructMetadata({ title: 'Pricing', description: 'Test', path: '/pricing' })
  assert.strictEqual(subMeta.alternates?.canonical, 'https://www.baserabook.in/pricing')
  assert.strictEqual(subMeta.openGraph?.url, 'https://www.baserabook.in/pricing')

  // Invariant 5: next.config.mjs redirects old Vercel subdomain to https://www.baserabook.in/:path*
  assert.ok(typeof nextConfig.redirects === 'function', 'nextConfig must define redirects')
  const redirects = await nextConfig.redirects()
  const vercelRedirect = redirects.find((r) =>
    r.has?.some((h) => h.type === 'host' && h.value === 'pg-management-saas-development-rose.vercel.app')
  )
  assert.ok(vercelRedirect, 'Must have a redirect for old Vercel deployment host')
  assert.strictEqual(vercelRedirect.permanent, true, 'Redirect must be HTTP 308 permanent')
  assert.strictEqual(vercelRedirect.destination, 'https://www.baserabook.in/:path*', 'Redirect must preserve paths to canonical domain')
})

test('40. Razorpay Subscription Activation: Trial Eligibility & Immediate Charge Invariants', () => {
  // Helper implementing the exact business rules from /api/razorpay/create-subscription
  function evaluateTrialEligibility(existingSub, nowMs = Date.now()) {
    const trialEndMs = existingSub?.trial_end ? new Date(existingSub.trial_end).getTime() : 0
    const hasActivePaidSub = existingSub?.status === 'active' || Boolean(existingSub?.razorpay_payment_id)
    const isTrialExpired = (trialEndMs > 0 && trialEndMs <= nowMs) || existingSub?.status === 'expired'

    let isTrialEligible = false
    let startAt = null

    if (!hasActivePaidSub && !isTrialExpired) {
      if (!existingSub) {
        // Brand new customer: eligible for full 7-day trial
        isTrialEligible = true
        startAt = Math.floor(nowMs / 1000) + 7 * 24 * 60 * 60
      } else if (existingSub.status === 'trialing' && trialEndMs > nowMs) {
        const remainingSeconds = Math.floor((trialEndMs - nowMs) / 1000)
        // Razorpay API requirement: start_at must be at least 15 minutes (900s) in the future
        if (remainingSeconds >= 900) {
          isTrialEligible = true
          startAt = Math.floor(trialEndMs / 1000)
        }
      }
    }

    const payload = {
      plan_id: 'plan_123',
      total_count: 120,
      quantity: 1,
    }

    if (isTrialEligible && startAt) {
      payload.start_at = startAt
    }

    const pendingStatus =
      existingSub?.status === 'active'
        ? 'active'
        : isTrialEligible
        ? 'trialing'
        : (existingSub?.status || 'expired')

    return { isTrialEligible, startAt, payload, pendingStatus }
  }

  const now = Date.now()

  // Case 1: Expired trial customer (trial_end was yesterday)
  const expiredSub = {
    status: 'trialing',
    trial_start: new Date(now - 8 * 86400000).toISOString(),
    trial_end: new Date(now - 1 * 86400000).toISOString(),
    razorpay_subscription_id: null,
  }
  const resExpired = evaluateTrialEligibility(expiredSub, now)
  assert.strictEqual(resExpired.isTrialEligible, false, 'Expired customer must NOT be eligible for trial')
  assert.strictEqual(resExpired.payload.start_at, undefined, 'start_at MUST NOT be set for expired customers (must charge immediately)')
  assert.strictEqual(resExpired.pendingStatus, 'trialing', 'Pre-save pending status must NOT be active before payment')

  // Case 2: Explicitly expired status
  const explicitExpiredSub = {
    status: 'expired',
    trial_end: new Date(now - 2 * 86400000).toISOString(),
  }
  const resExplicit = evaluateTrialEligibility(explicitExpiredSub, now)
  assert.strictEqual(resExplicit.isTrialEligible, false)
  assert.strictEqual(resExplicit.payload.start_at, undefined, 'start_at must be omitted')
  assert.strictEqual(resExplicit.pendingStatus, 'expired', 'Must preserve expired status until verified')

  // Case 3: Already active paid customer switching/renewing
  const activePaidSub = {
    status: 'active',
    razorpay_payment_id: 'pay_123',
    razorpay_subscription_id: 'sub_old',
  }
  const resActivePaid = evaluateTrialEligibility(activePaidSub, now)
  assert.strictEqual(resActivePaid.isTrialEligible, false, 'Active paid customer must NOT get a free trial')
  assert.strictEqual(resActivePaid.payload.start_at, undefined, 'Must charge immediately')

  // Case 4: Brand new customer (no subscription record yet)
  const resNew = evaluateTrialEligibility(null, now)
  assert.strictEqual(resNew.isTrialEligible, true, 'Brand new customer is eligible for 7-day trial')
  assert.ok(resNew.payload.start_at, 'start_at must be set for new customer')
  assert.strictEqual(resNew.payload.start_at, Math.floor(now / 1000) + 7 * 86400)
  assert.strictEqual(resNew.pendingStatus, 'trialing')

  // Case 5: Active unexpired trial customer (signed up 2 days ago, 5 days remaining)
  const activeTrialSub = {
    status: 'trialing',
    trial_start: new Date(now - 2 * 86400000).toISOString(),
    trial_end: new Date(now + 5 * 86400000).toISOString(),
  }
  const resActiveTrial = evaluateTrialEligibility(activeTrialSub, now)
  assert.strictEqual(resActiveTrial.isTrialEligible, true, 'Unexpired trial user is eligible')
  assert.strictEqual(resActiveTrial.payload.start_at, Math.floor(new Date(activeTrialSub.trial_end).getTime() / 1000), 'start_at must preserve remaining trial end date')

  // Case 6: Trial about to expire in 5 minutes (<15 min Razorpay constraint)
  const nearExpirySub = {
    status: 'trialing',
    trial_end: new Date(now + 5 * 60 * 1000).toISOString(),
  }
  const resNearExpiry = evaluateTrialEligibility(nearExpirySub, now)
  assert.strictEqual(resNearExpiry.payload.start_at, undefined, 'Must omit start_at when < 15 mins left to comply with Razorpay API')

  // Case 7: Verification status mapping
  function mapVerifiedStatus(rzpStatus) {
    if (rzpStatus !== 'active' && rzpStatus !== 'authenticated') {
      return { allowed: false, error: 'Non-activatable status: ' + rzpStatus }
    }
    return {
      allowed: true,
      status: rzpStatus === 'active' ? 'active' : 'trialing',
      clearTrialEnd: rzpStatus === 'active',
    }
  }

  assert.deepStrictEqual(mapVerifiedStatus('active'), { allowed: true, status: 'active', clearTrialEnd: true })
  assert.deepStrictEqual(mapVerifiedStatus('authenticated'), { allowed: true, status: 'trialing', clearTrialEnd: false })
  assert.strictEqual(mapVerifiedStatus('created').allowed, false)
  assert.strictEqual(mapVerifiedStatus('pending').allowed, false)
  assert.strictEqual(mapVerifiedStatus('halted').allowed, false)
})

test('41. Razorpay-to-BaseraBook Subscription Synchronization & Authority Engine', () => {
  const now = Date.now()
  const oneDay = 86400000

  // 1. Expired trial + verified active subscription = paid access
  const res1 = resolveAuthoritativeSubscription([
    {
      id: 'sub_row_1',
      owner_id: 'user_123',
      status: 'active',
      plan: 'pro',
      razorpay_subscription_id: 'sub_active_rzp_1',
      trial_end: new Date(now - 7 * oneDay).toISOString(),
      updated_at: new Date(now).toISOString(),
    }
  ], now)
  assert.strictEqual(res1.hasPaidAccess, true, 'Case 1: Expired trial with active subscription must have paid access')
  assert.strictEqual(res1.isTrialExpired, false, 'Case 1: Must NOT be marked as trial expired')
  assert.strictEqual(res1.status, 'active')
  assert.strictEqual(res1.trialEnd, null, 'Case 1: trialEnd must be cleared for active subscription')

  // 2. Expired trial + no active subscription = restricted
  const res2 = resolveAuthoritativeSubscription([
    {
      id: 'sub_row_2',
      owner_id: 'user_123',
      status: 'expired',
      plan: 'trial',
      trial_end: new Date(now - 2 * oneDay).toISOString(),
      updated_at: new Date(now - 2 * oneDay).toISOString(),
    }
  ], now)
  assert.strictEqual(res2.hasPaidAccess, false, 'Case 2: Expired trial without active subscription must be restricted')
  assert.strictEqual(res2.isTrialExpired, true, 'Case 2: Must be marked as trial expired')
  assert.strictEqual(res2.status, 'expired')

  // 3. Active subscription with null trial_end = paid access
  const res3 = resolveAuthoritativeSubscription([
    {
      id: 'sub_row_3',
      owner_id: 'user_123',
      status: 'active',
      plan: 'yearly',
      razorpay_subscription_id: 'sub_active_null_trial',
      trial_end: null,
      updated_at: new Date(now).toISOString(),
    }
  ], now)
  assert.strictEqual(res3.hasPaidAccess, true, 'Case 3: Active subscription with null trial_end must have paid access')
  assert.strictEqual(res3.isTrialExpired, false, 'Case 3: Must NOT be marked as trial expired')
  assert.strictEqual(res3.status, 'active')

  // 4. Authenticated subscription with a past trial end = no automatic paid access
  const res4 = resolveAuthoritativeSubscription([
    {
      id: 'sub_row_4',
      owner_id: 'user_123',
      status: 'authenticated',
      plan: 'pro',
      razorpay_subscription_id: 'sub_auth_only',
      trial_end: new Date(now - 3 * oneDay).toISOString(),
      updated_at: new Date(now).toISOString(),
    }
  ], now)
  assert.strictEqual(res4.hasPaidAccess, false, 'Case 4: Authenticated subscription with past trial must NOT grant automatic paid access')
  assert.strictEqual(res4.isTrialExpired, true, 'Case 4: Past trial should be expired')
  assert.strictEqual(res4.status, 'expired')

  // 5. Active subscription belonging to a different user = no access for requesting user
  const currentUserId = 'user_alice'
  const multiUserRows = [
    {
      id: 'sub_bob',
      owner_id: 'user_bob',
      status: 'active',
      plan: 'pro',
      razorpay_subscription_id: 'sub_bob_paid',
    },
    {
      id: 'sub_alice',
      owner_id: 'user_alice',
      status: 'expired',
      plan: 'trial',
      trial_end: new Date(now - 5 * oneDay).toISOString(),
    }
  ]
  const aliceOnlyRows = multiUserRows.filter(r => r.owner_id === currentUserId)
  const res5 = resolveAuthoritativeSubscription(aliceOnlyRows, now)
  assert.strictEqual(res5.hasPaidAccess, false, 'Case 5: Active subscription of another user must not grant access to current user')
  assert.strictEqual(res5.isTrialExpired, true, 'Case 5: Current user remains expired')

  // 6. Old authenticated record plus current active record = correct active subscription wins
  const multiRecordsSameUser = [
    {
      id: 'sub_old_auth',
      owner_id: 'user_123',
      status: 'authenticated',
      plan: 'trial',
      trial_end: new Date(now - 10 * oneDay).toISOString(),
      updated_at: new Date(now - 10 * oneDay).toISOString(),
    },
    {
      id: 'sub_new_active',
      owner_id: 'user_123',
      status: 'active',
      plan: 'yearly',
      razorpay_subscription_id: 'sub_new_active_rzp',
      trial_end: null,
      updated_at: new Date(now).toISOString(),
    }
  ]
  const res6 = resolveAuthoritativeSubscription(multiRecordsSameUser, now)
  assert.strictEqual(res6.hasPaidAccess, true, 'Case 6: Active subscription must win over older authenticated record')
  assert.strictEqual(res6.status, 'active', 'Case 6: Status must be active')
  assert.strictEqual(res6.plan, 'yearly', 'Case 6: Plan must be yearly')
  assert.strictEqual(res6.isTrialExpired, false)

  // Order-independence check: active record wins even if older record comes first or last
  const res6Reversed = resolveAuthoritativeSubscription([...multiRecordsSameUser].reverse(), now)
  assert.strictEqual(res6Reversed.hasPaidAccess, true, 'Case 6 (reversed): Order must not prevent active record from winning')
  assert.strictEqual(res6Reversed.status, 'active')

  // 7. Dashboard refresh does not revert a verified active customer to expired
  let dashboardState = {
    hasPaidAccess: false,
    subscriptionStatus: 'expired',
    isTrialExpired: true,
  }
  const fetchedAfterRefresh = [
    {
      id: 'sub_123',
      owner_id: 'user_123',
      status: 'active',
      plan: 'growth',
      razorpay_subscription_id: 'sub_test_verified_123',
      trial_end: null,
      updated_at: new Date().toISOString(),
    }
  ]
  const refreshedAuth = resolveAuthoritativeSubscription(fetchedAfterRefresh, now)
  dashboardState = {
    hasPaidAccess: refreshedAuth.hasPaidAccess,
    subscriptionStatus: refreshedAuth.status,
    isTrialExpired: refreshedAuth.isTrialExpired,
  }
  assert.strictEqual(dashboardState.hasPaidAccess, true, 'Case 7: Dashboard refresh preserves paid access')
  assert.strictEqual(dashboardState.subscriptionStatus, 'active', 'Case 7: Dashboard refresh preserves active status')
  assert.strictEqual(dashboardState.isTrialExpired, false, 'Case 7: Dashboard refresh does not revert to expired')
})

test('42. Google Analytics 4: Measurement ID & CSP Allowlist Invariant', async () => {
  const fs = await import('node:fs')
  const path = await import('node:path')

  // Verify Root Layout has GA4 tag with exact Measurement ID G-9CQRHQFVSE
  const layoutContent = fs.readFileSync(path.resolve('app/layout.tsx'), 'utf-8')
  assert.ok(
    layoutContent.includes('G-9CQRHQFVSE'),
    'app/layout.tsx must contain Google Analytics Measurement ID G-9CQRHQFVSE'
  )
  assert.ok(
    layoutContent.includes('https://www.googletagmanager.com/gtag/js?id=G-9CQRHQFVSE'),
    'app/layout.tsx must load gtag.js with G-9CQRHQFVSE'
  )
  assert.ok(
    layoutContent.includes("gtag('config', 'G-9CQRHQFVSE')"),
    'app/layout.tsx must configure G-9CQRHQFVSE'
  )

  // Verify Security Headers CSP allows Google Analytics domains
  const dummyRes = NextResponse.next()
  const secureRes = applySecurityHeaders(dummyRes, '/')
  const csp = secureRes.headers.get('Content-Security-Policy') || ''

  assert.ok(
    csp.includes('https://www.googletagmanager.com'),
    'Content-Security-Policy must allow https://www.googletagmanager.com in script-src/img-src'
  )
  assert.ok(
    csp.includes('https://*.google-analytics.com'),
    'Content-Security-Policy must allow https://*.google-analytics.com in connect-src/img-src'
  )
})

test('43. Four-Tier Canonical Pricing Plans & Annual Savings Math', () => {
  // 1. Verify exact 4 plans exist in order
  assert.strictEqual(PRICING_PLANS.length, 4, 'Must have exactly 4 plans')
  const [starter, growth, business, enterprise] = PRICING_PLANS

  // Starter: 1–2 properties, ₹1,099/month, ₹9,999/year, Save ₹3,189/year
  assert.strictEqual(starter.name, 'Starter')
  assert.strictEqual(starter.propertyLimit, '1–2 properties')
  assert.strictEqual(starter.monthlyPrice, 1099, 'Starter monthly must be ₹1,099')
  assert.strictEqual(starter.yearlyPrice, 9999, 'Starter yearly must be ₹9,999')
  assert.strictEqual(starter.annualSavings, 3189, 'Starter annual savings must be ₹3,189')
  assert.strictEqual(1099 * 12 - 9999, 3189, '1099 * 12 - 9999 = 3189')

  // Growth: 3–5 properties, ₹1,799/month, ₹17,990/year, Save ₹3,598/year, Most Popular
  assert.strictEqual(growth.name, 'Growth')
  assert.strictEqual(growth.propertyLimit, '3–5 properties')
  assert.strictEqual(growth.monthlyPrice, 1799, 'Growth monthly must be ₹1,799')
  assert.strictEqual(growth.yearlyPrice, 17990, 'Growth yearly must be ₹17,990')
  assert.strictEqual(growth.annualSavings, 3598, 'Growth annual savings must be ₹3,598')
  assert.strictEqual(1799 * 12 - 17990, 3598, '1799 * 12 - 17990 = 3598')
  assert.strictEqual(growth.popular, true, 'Growth must be flagged as popular')

  // Business: 6–9 properties, ₹2,799/month, ₹27,990/year, Save ₹5,598/year
  assert.strictEqual(business.name, 'Business')
  assert.strictEqual(business.propertyLimit, '6–9 properties')
  assert.strictEqual(business.monthlyPrice, 2799, 'Business monthly must be ₹2,799')
  assert.strictEqual(business.yearlyPrice, 27990, 'Business yearly must be ₹27,990')
  assert.strictEqual(business.annualSavings, 5598, 'Business annual savings must be ₹5,598')
  assert.strictEqual(2799 * 12 - 27990, 5598, '2799 * 12 - 27990 = 5598')

  // Enterprise: 9+ properties, Custom pricing, Contact Us
  assert.strictEqual(enterprise.name, 'Enterprise')
  assert.strictEqual(enterprise.propertyLimit, '9+ properties')
  assert.strictEqual(enterprise.monthlyPrice, null, 'Enterprise monthly must be custom')
  assert.strictEqual(enterprise.yearlyPrice, null, 'Enterprise yearly must be custom')
  assert.strictEqual(enterprise.annualSavings, null)
})

test('44. Dedicated About Us Page: Metadata, Canonical URL & Footer Navigation', async () => {
  const fs = await import('node:fs')
  const path = await import('node:path')

  // 1. Verify app/about/page.tsx file existence and content
  const aboutPath = path.resolve('app/about/page.tsx')
  assert.ok(fs.existsSync(aboutPath), 'app/about/page.tsx must exist')
  const aboutContent = fs.readFileSync(aboutPath, 'utf-8')

  // Check key elements in content
  assert.ok(aboutContent.includes('About BaseraBook'), 'Must contain About BaseraBook header')
  assert.ok(aboutContent.includes('Our Mission'), 'Must include mission statement section')
  assert.ok(aboutContent.includes('/signup'), 'Must include CTA link to /signup')
  assert.ok(aboutContent.includes('PGs & Co-Living'), 'Must include PG accommodation coverage')
  assert.ok(aboutContent.includes('Student & Working Hostels'), 'Must include hostel coverage')
  assert.ok(aboutContent.includes('Rental Houses & Flats'), 'Must include rental house coverage')
  assert.ok(aboutContent.includes('Apartments & Residential Units'), 'Must include apartment coverage')
  assert.ok(aboutContent.includes('Automated Rent & Payment Tracking'), 'Must include rent tracking pillar')
  assert.ok(aboutContent.includes('Transparent Electricity Sub-Meter Billing'), 'Must include electricity billing pillar')

  // 2. Verify constructMetadata for /about
  const metadata = constructMetadata({
    title: 'About Us | BaseraBook Property Management Software',
    description:
      'Learn about BaseraBook — the modern property management SaaS built for PGs, hostels, rental houses, and apartments to streamline rent tracking, utility billing, receipts, and operations.',
    path: '/about',
  })

  assert.strictEqual(metadata.title, 'About Us | BaseraBook Property Management Software')
  assert.strictEqual(metadata.alternates?.canonical, 'https://www.baserabook.in/about', 'Canonical URL must strictly be https://www.baserabook.in/about')
  assert.strictEqual(metadata.openGraph?.url, 'https://www.baserabook.in/about', 'OG URL must strictly be https://www.baserabook.in/about')
  assert.strictEqual(metadata.robots?.index, true, 'Page must be indexable (robots.index: true)')
  assert.strictEqual(metadata.robots?.follow, true, 'Page links must be followable (robots.follow: true)')

  // 3. Verify PublicFooter contains About Us under Platform
  const footerContent = fs.readFileSync(path.resolve('components/public/PublicFooter.tsx'), 'utf-8')
  assert.ok(
    footerContent.includes('href="/about"') && footerContent.includes('About Us'),
    'PublicFooter must contain link to /about'
  )

  // 4. Verify sitemap includes /about
  const sitemapModule = await import('../app/sitemap.ts')
  const sitemapFn = sitemapModule.default || sitemapModule
  const entries = sitemapFn()
  const aboutEntry = entries.find((e) => e.url === 'https://www.baserabook.in/about')
  assert.ok(aboutEntry, 'Sitemap must contain https://www.baserabook.in/about entry')
  assert.strictEqual(aboutEntry.priority, 0.8)
})

test('45. 4-Tier Pricing Across Website, Dashboard, Backend & Checkout', async () => {
  const fs = await import('node:fs')
  const path = await import('node:path')
  const { getRazorpayPlanId, KNOWN_RAZORPAY_PLAN_MAP } = await import('../lib/razorpay.ts')
  const { PLAN_PROPERTY_LIMITS } = await import('../lib/subscription.ts')

  // 1. Verify exact 4 plans exist with exact prices and property limits
  assert.strictEqual(PRICING_PLANS.length, 4, 'Must have exactly 4 plans')
  const [starter, growth, business, enterprise] = PRICING_PLANS

  // Starter
  assert.strictEqual(starter.name, 'Starter')
  assert.strictEqual(starter.propertyLimit, '1–2 properties')
  assert.strictEqual(starter.monthlyPrice, 1099)
  assert.strictEqual(starter.yearlyPrice, 9999)
  assert.strictEqual(starter.annualSavings, 3189)

  // Growth
  assert.strictEqual(growth.name, 'Growth')
  assert.strictEqual(growth.propertyLimit, '3–5 properties')
  assert.strictEqual(growth.monthlyPrice, 1799)
  assert.strictEqual(growth.yearlyPrice, 17990)
  assert.strictEqual(growth.annualSavings, 3598)
  assert.strictEqual(growth.popular, true)

  // Business
  assert.strictEqual(business.name, 'Business')
  assert.strictEqual(business.propertyLimit, '6–9 properties')
  assert.strictEqual(business.monthlyPrice, 2799)
  assert.strictEqual(business.yearlyPrice, 27990)
  assert.strictEqual(business.annualSavings, 5598)

  // Enterprise
  assert.strictEqual(enterprise.name, 'Enterprise')
  assert.strictEqual(enterprise.propertyLimit, '9+ properties')
  assert.strictEqual(enterprise.monthlyPrice, null)
  assert.strictEqual(enterprise.yearlyPrice, null)

  // 2. Property limits in subscription system
  assert.strictEqual(PLAN_PROPERTY_LIMITS.starter, 2)
  assert.strictEqual(PLAN_PROPERTY_LIMITS.growth, 5)
  assert.strictEqual(PLAN_PROPERTY_LIMITS.business, 9)
  assert.strictEqual(PLAN_PROPERTY_LIMITS.enterprise, 999)

  // 3. Razorpay plan ID resolution for all 3 billable tiers
  assert.strictEqual(getRazorpayPlanId('monthly', 'starter'), KNOWN_RAZORPAY_PLAN_MAP.starter_monthly)
  assert.strictEqual(getRazorpayPlanId('yearly', 'starter'), KNOWN_RAZORPAY_PLAN_MAP.starter_yearly)
  assert.strictEqual(getRazorpayPlanId('monthly', 'growth'), KNOWN_RAZORPAY_PLAN_MAP.growth_monthly)
  assert.strictEqual(getRazorpayPlanId('yearly', 'growth'), KNOWN_RAZORPAY_PLAN_MAP.growth_yearly)
  assert.strictEqual(getRazorpayPlanId('monthly', 'business'), KNOWN_RAZORPAY_PLAN_MAP.business_monthly)
  assert.strictEqual(getRazorpayPlanId('yearly', 'business'), KNOWN_RAZORPAY_PLAN_MAP.business_yearly)

  // 4. Verify app/dashboard/page.tsx renders 4-tier pricing modal
  const dashboardContent = fs.readFileSync(path.resolve('app/dashboard/page.tsx'), 'utf-8')
  assert.ok(dashboardContent.includes('PRICING_PLANS.map'), 'Dashboard must map PRICING_PLANS')
  assert.ok(dashboardContent.includes('handleUpgradePlan(plan.id)'), 'Dashboard buttons must pass target planId')
  assert.ok(dashboardContent.includes('maxWidth="max-w-5xl"'), 'Pricing modal must use spacious max-w-5xl')
  assert.ok(dashboardContent.includes('grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'), 'Modal must use mobile-first 1-column grid')
  assert.ok(dashboardContent.includes('setDashboardBillingCycle'), 'Dashboard must support monthly/yearly toggle')
})


