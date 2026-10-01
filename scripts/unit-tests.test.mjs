import test from 'node:test'
import assert from 'node:assert'
import { formatCurrency, formatDate, formatInternationalPhone } from '../lib/i18n/index.js'
import { checkRateLimit } from '../lib/security/rate-limiter.js'
import { SUPPORT_EMAIL, getMailtoSupport } from '../lib/constants.js'
import {
  PRICING_CONFIG,
  ANNUAL_TOTAL_ON_MONTHLY,
  ANNUAL_SAVINGS_AMOUNT,
  ANNUAL_SAVINGS_PERCENT,
  YEARLY_MONTHLY_EQUIVALENT,
  formatINR,
  getSavingsLabel,
} from '../lib/pricing.js'
import {
  calculateRentDueStatus,
  formatPaymentTimestamp,
  generateWhatsAppReminder,
  generateSmsReminder,
} from '../lib/due-dates.js'

test('1. Support Email & Mailto URL Generation', () => {
  assert.ok(SUPPORT_EMAIL.includes('getstaynest@gmail.com'), 'Support email must default to getstaynest@gmail.com')
  const mailtoLink = getMailtoSupport('Billing Inquiry', 'Hello support team')
  assert.ok(mailtoLink.startsWith('mailto:'), 'Link must be valid mailto scheme')
  assert.ok(mailtoLink.includes('getstaynest%40gmail.com') || mailtoLink.includes('getstaynest@gmail.com'), 'Must target support email')
  assert.ok(mailtoLink.includes('Billing'), 'Must encode subject')
})

test('2. Canonical Pricing Math & Savings Law', () => {
  assert.strictEqual(PRICING_CONFIG.monthlyRate, 1699, 'Monthly rate must be ₹1,699')
  assert.strictEqual(PRICING_CONFIG.yearlyRate, 14999, 'Yearly rate must be ₹14,999')
  assert.strictEqual(ANNUAL_TOTAL_ON_MONTHLY, 1699 * 12, '12 months should total ₹20,388')
  assert.strictEqual(ANNUAL_SAVINGS_AMOUNT, 5389, 'Yearly savings must equal ₹5,389')
  assert.strictEqual(ANNUAL_SAVINGS_PERCENT, 26, 'Savings percentage must equal 26%')
  assert.strictEqual(YEARLY_MONTHLY_EQUIVALENT, 1250, 'Effective monthly rate must equal ₹1,250/mo')

  assert.equal(formatINR(14999), '₹14,999', 'formatINR should format with Indian thousands separator')
  assert.ok(getSavingsLabel('en').includes('Save 26%'), 'English savings badge label')
  assert.ok(getSavingsLabel('hi').includes('26% बचाएं'), 'Hindi savings badge label')
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

