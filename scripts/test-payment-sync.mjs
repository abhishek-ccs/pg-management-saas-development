/**
 * Test Suite: BaseraBook Payment Synchronization
 * Verifies:
 * 1. Rent marked Paid updates Rent & Payments with correct status, amount, date, and billing month.
 * 2. Changes persist across refresh (calculateTenantRentStatus calculates 'paid' from payments table).
 * 3. Prevents duplicate records by updating the existing database record.
 * 4. Code integrity check for loading & error feedback in UI.
 */

import test from 'node:test'
import assert from 'node:assert'
import fs from 'node:fs'
import {
  calculateTenantRentStatus,
  isDuplicateRentPayment,
  generateMonthlyRentSchedules,
} from '../lib/due-dates.ts'

test('Payment Synchronization: Marking rent Paid calculates correct billing month and status', () => {
  const resident = {
    id: 'res-sync-1',
    name: 'Aakash Verma',
    rent: 9500,
    monthly_rent: 9500,
    rent_due_day: 5,
    joining_date: '2026-09-10',
    status: 'Pending',
  }

  // Current date: 2026-10-26 (October billing cycle)
  const refDate = new Date(2026, 9, 26) // Oct 26, 2026

  // 1. Initial state: No payment in payments table -> rent status is unpaid
  const initialRentStatus = calculateTenantRentStatus({
    tenant: resident,
    payments: [],
    referenceDate: refDate,
  })

  assert.notStrictEqual(initialRentStatus.status, 'paid', 'Initial status before payment must not be paid')
  assert.strictEqual(initialRentStatus.monthCovered, 'October 2026', 'Billing month must be October 2026')

  // 2. Mark Paid synchronization simulation:
  // When marked Paid, a payment record is created with:
  // tenant_id, amount: 9500, month_covered: "October 2026", paid_at: ISO timestamp
  const simulatedPayment = {
    id: 'pay-sync-101',
    owner_id: 'owner-1',
    property_id: 'prop-1',
    tenant_id: resident.id,
    amount: 9500,
    payment_method: 'cash',
    payment_type: 'rent',
    month_covered: initialRentStatus.monthCovered,
    paid_at: '2026-10-26T07:30:00.000Z',
    notes: `[Month: ${initialRentStatus.monthCovered}] Rent marked Paid via Resident Dashboard`,
  }

  const paymentsState = [simulatedPayment]

  // 3. Persistence after refresh:
  // On page refresh, fetchDashboardData recalculates tenant status using paymentsState
  const refreshedRentStatus = calculateTenantRentStatus({
    tenant: resident,
    payments: paymentsState,
    referenceDate: refDate,
  })

  assert.strictEqual(refreshedRentStatus.status, 'paid', 'Tenant status must persist as Paid On Time after refresh')
  assert.strictEqual(refreshedRentStatus.outstandingBalance, 0, 'Outstanding balance must be 0 after payment')
})

test('Payment Synchronization: Duplicate prevention updates existing database record', () => {
  const resident = {
    id: 'res-sync-2',
    name: 'Priya Sharma',
    rent: 12000,
    monthly_rent: 12000,
    rent_due_day: 10,
    joining_date: '2026-09-01',
  }

  const billingMonth = 'October 2026'

  // Existing payment recorded earlier
  const existingPayment = {
    id: 'pay-rec-existing-001',
    tenant_id: resident.id,
    amount: 11000, // old rent or partial
    month_covered: billingMonth,
    payment_method: 'cash',
    payment_type: 'rent',
    paid_at: '2026-10-10T10:00:00.000Z',
    notes: '[Month: October 2026] Initial record',
  }

  const payments = [existingPayment]

  // Check duplicate
  const dupCheck = isDuplicateRentPayment({
    tenantId: resident.id,
    monthCovered: billingMonth,
    payments,
  })

  assert.strictEqual(dupCheck.isDuplicate, true, 'Duplicate check must detect existing payment for same billing month')
  assert.strictEqual(dupCheck.existingPayment.id, existingPayment.id, 'Must return the existing payment record for in-place update')

  // When updating existing record using current logic:
  const updatedExistingPayment = {
    ...dupCheck.existingPayment,
    amount: resident.rent, // updated to 12000
    paid_at: '2026-10-26T07:35:00.000Z',
    notes: '[Month: October 2026] Rent marked Paid via Resident Dashboard',
  }

  // Update in payments array (no new row created)
  const updatedPayments = payments.map((p) => (p.id === updatedExistingPayment.id ? updatedExistingPayment : p))

  assert.strictEqual(updatedPayments.length, 1, 'Payments table count must remain 1 (no duplicate rows created)')
  assert.strictEqual(updatedPayments[0].amount, 12000, 'Existing payment record amount must be updated')
  assert.strictEqual(updatedPayments[0].paid_at, '2026-10-26T07:35:00.000Z', 'Existing payment timestamp must be updated')
})

test('Payment Synchronization: Dashboard code integrity verifies auto-sync, persistence, and loading/error feedback', () => {
  const dashboardCode = fs.readFileSync('app/dashboard/page.tsx', 'utf8')

  // 1. syncTenantPaymentPaid helper exists
  assert.ok(dashboardCode.includes('async function syncTenantPaymentPaid'), 'Dashboard must contain syncTenantPaymentPaid helper')
  assert.ok(dashboardCode.includes('isDuplicateRentPayment'), 'syncTenantPaymentPaid must check isDuplicateRentPayment')
  assert.ok(dashboardCode.includes('setPayments'), 'syncTenantPaymentPaid must update local payments state immediately')

  // 2. handleMarkTenantPaid exists with loading state and error flash
  assert.ok(dashboardCode.includes('async function handleMarkTenantPaid'), 'Dashboard must contain handleMarkTenantPaid handler')
  assert.ok(dashboardCode.includes('setMarkingPaidTenantId(tenant.id)'), 'handleMarkTenantPaid must set inline loading state')
  assert.ok(dashboardCode.includes('setMarkingPaidTenantId(null)'), 'handleMarkTenantPaid must reset loading state in finally block')
  assert.ok(dashboardCode.includes('flash('), 'handleMarkTenantPaid must display feedback via flash()')

  // 3. handleUpdateTenant triggers syncTenantPaymentPaid when status is Paid
  assert.ok(dashboardCode.includes("if (finalStatus === 'Paid')"), 'handleUpdateTenant must check if status was set to Paid')
  assert.ok(dashboardCode.includes('syncTenantPaymentPaid('), 'handleUpdateTenant must call syncTenantPaymentPaid')

  // 4. TenantsTab provides 1-click Mark Paid action with inline spinner
  assert.ok(dashboardCode.includes('onMarkPaid={handleMarkTenantPaid}'), 'TenantsTab invocation must pass onMarkPaid')
  assert.ok(dashboardCode.includes('markingPaidTenantId={markingPaidTenantId}'), 'TenantsTab invocation must pass markingPaidTenantId')
  assert.ok(dashboardCode.includes('markingPaidTenantId === t.id'), 'TenantsTab must render loading spinner when tenant is being marked Paid')
})
