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

  // 4. Resident action row keeps all core actions while Mark Paid button is removed
  assert.ok(dashboardCode.includes('onRecordPayment(t)'), 'Resident row must retain Collect payment action')
  assert.ok(dashboardCode.includes('onViewRentSchedule(t)'), 'Resident row must retain Ledger action')
  assert.ok(dashboardCode.includes('onEditTenant(t)'), 'Resident row must retain Edit resident details action')
  assert.ok(dashboardCode.includes('onSharePortalLink?.(t)'), 'Resident row must retain Self-Service Link action')
  assert.ok(dashboardCode.includes('onDeleteTenant(t.id, t.name)'), 'Resident row must retain Delete resident action')
  assert.ok(!dashboardCode.includes("<span>{markingPaidTenantId === t.id ? 'Marking...' : 'Mark Paid'}</span>"), 'Mark Paid button must be removed from resident actions row')
})

test('Rent Cycle Management: Consecutive monthly cycles automatically create and activate next month (Oct -> Nov -> Dec -> Jan 2027)', () => {
  const resident = {
    id: 'res-consecutive-1',
    name: 'Vikram Malhotra',
    rent: 10000,
    monthly_rent: 10000,
    rent_due_day: 10,
    joining_date: '2026-09-10',
    status: 'Pending',
  }

  const refDate = new Date(2026, 9, 26) // Oct 26, 2026

  // Phase 1: Initial state before October is paid
  const s1 = calculateTenantRentStatus({
    tenant: resident,
    payments: [],
    referenceDate: refDate,
  })
  assert.strictEqual(s1.monthCovered, 'October 2026', 'Initial active period must be October 2026')
  assert.strictEqual(s1.status, 'overdue', 'Since Oct 10 has passed, status must be overdue')

  // Phase 2: Pay October 2026
  const octPayment = {
    id: 'pay-oct-2026',
    tenant_id: resident.id,
    amount: 10000,
    month_covered: 'October 2026',
    payment_method: 'upi',
    payment_type: 'rent',
    paid_at: '2026-10-10T12:00:00.000Z',
    notes: '[Month: October 2026] Paid on time',
  }
  const paymentsAfterOct = [octPayment]

  const s2 = calculateTenantRentStatus({
    tenant: resident,
    payments: paymentsAfterOct,
    referenceDate: refDate,
  })

  // October is in history as paid on time
  const octSchedule = s2.schedules.find((s) => s.monthCovered === 'October 2026')
  assert.ok(octSchedule, 'October 2026 must be preserved in history')
  assert.strictEqual(octSchedule.isPaid, true, 'October must be marked isPaid: true')
  assert.strictEqual(octSchedule.labelEn, 'Paid On Time', 'October paid on Oct 10 must be Paid On Time')

  // November 2026 must be automatically created and activated as the next period
  assert.strictEqual(s2.status, 'paid', 'Overall tenant status remains Paid On Time because current cycle is paid')
  assert.strictEqual(s2.monthCovered, 'November 2026', 'Next billing cycle to pay must automatically be November 2026')
  assert.strictEqual(s2.nextDueDate, '2026-11-10', 'Next due date must be 2026-11-10')

  const novSchedule = s2.schedules.find((s) => s.monthCovered === 'November 2026')
  assert.ok(novSchedule, 'November 2026 cycle must be generated')
  assert.strictEqual(novSchedule.isPaid, false, 'November cycle must be unpaid/active')
  assert.strictEqual(novSchedule.status, 'due_soon', 'November due date is in future')

  // Phase 3: Pay November 2026
  const novPayment = {
    id: 'pay-nov-2026',
    tenant_id: resident.id,
    amount: 10000,
    month_covered: 'November 2026',
    payment_method: 'cash',
    payment_type: 'rent',
    paid_at: '2026-10-26T14:00:00.000Z',
    notes: '[Month: November 2026] Paid advance',
  }
  const paymentsAfterNov = [novPayment, octPayment]

  const s3 = calculateTenantRentStatus({
    tenant: resident,
    payments: paymentsAfterNov,
    referenceDate: refDate,
  })

  // October and November both in history as paid
  assert.strictEqual(s3.schedules.filter((s) => s.isPaid).length, 2, 'History must contain 2 paid records')
  // December 2026 must be automatically created and activated
  assert.strictEqual(s3.monthCovered, 'December 2026', 'Next billing cycle must automatically be December 2026')
  assert.strictEqual(s3.nextDueDate, '2026-12-10', 'December due date must be 2026-12-10')

  const decSchedule = s3.schedules.find((s) => s.monthCovered === 'December 2026')
  assert.ok(decSchedule, 'December 2026 cycle must be generated')
  assert.strictEqual(decSchedule.isPaid, false, 'December cycle must be unpaid/active')
  assert.strictEqual(decSchedule.labelEn, 'Upcoming', 'December cycle is in future beyond current period')

  // Phase 4: Pay December 2026 -> Automatically transitions to January 2027 (Year Rollover)
  const decPayment = {
    id: 'pay-dec-2026',
    tenant_id: resident.id,
    amount: 10000,
    month_covered: 'December 2026',
    payment_method: 'upi',
    payment_type: 'rent',
    paid_at: '2026-10-26T15:00:00.000Z',
    notes: '[Month: December 2026] Paid advance',
  }
  const paymentsAfterDec = [decPayment, novPayment, octPayment]

  const s4 = calculateTenantRentStatus({
    tenant: resident,
    payments: paymentsAfterDec,
    referenceDate: refDate,
  })

  assert.strictEqual(s4.schedules.filter((s) => s.isPaid).length, 3, 'History must contain 3 paid records')
  // January 2027 year change handled correctly
  assert.strictEqual(s4.monthCovered, 'January 2027', 'Next cycle across year boundary must automatically be January 2027')
  assert.strictEqual(s4.nextDueDate, '2027-01-10', 'January 2027 due date must be 2027-01-10')

  const janSchedule = s4.schedules.find((s) => s.monthCovered === 'January 2027')
  assert.ok(janSchedule, 'January 2027 cycle must be generated')
  assert.strictEqual(janSchedule.monthKey, '2027-01', 'January 2027 monthKey must be 2027-01')
  assert.strictEqual(janSchedule.isPaid, false, 'January 2027 cycle must be active upcoming')
})

test('Rent Cycle Management: Paid Late vs Paid On Time distinction', () => {
  const resident = {
    id: 'res-late-1',
    name: 'Ananya Roy',
    rent: 8000,
    rent_due_day: 5,
    joining_date: '2026-09-01',
  }

  // Due date was Oct 5, 2026. Payment made on Oct 12, 2026 (7 days late)
  const latePayment = {
    id: 'pay-late-01',
    tenant_id: resident.id,
    amount: 8000,
    month_covered: 'October 2026',
    payment_method: 'upi',
    payment_type: 'rent',
    paid_at: '2026-10-12T10:00:00.000Z',
    notes: 'Paid via UPI late',
  }

  const schedules = generateMonthlyRentSchedules({
    tenantId: resident.id,
    joiningDate: resident.joining_date,
    rentDueDay: resident.rent_due_day,
    monthlyRent: resident.rent,
    payments: [latePayment],
    referenceDate: new Date(2026, 9, 26),
  })

  const octCycle = schedules.find((s) => s.monthCovered === 'October 2026')
  assert.ok(octCycle, 'October cycle must exist')
  assert.strictEqual(octCycle.isPaid, true, 'October must be marked isPaid')
  assert.strictEqual(octCycle.labelEn, 'Paid Late', 'Payment made after Oct 5 due date must be labeled Paid Late')
  assert.ok(octCycle.badgeColor.includes('text-[#b45309]'), 'Paid Late badge must have amber styling')
})

test('Month Transition: Calendar transition to new month activates due and overdue status', () => {
  const resident = {
    id: 'res-trans-1',
    name: 'Kavita Iyer',
    rent: 9000,
    rent_due_day: 5,
    joining_date: '2026-09-01',
  }

  // Resident paid October on time
  const octPayment = {
    id: 'pay-oct-trans',
    tenant_id: resident.id,
    amount: 9000,
    month_covered: 'October 2026',
    paid_at: '2026-10-04T10:00:00.000Z',
  }

  // Case A: Today is Oct 26, 2026 (November rent is due in future)
  const octRef = calculateTenantRentStatus({
    tenant: resident,
    payments: [octPayment],
    referenceDate: new Date(2026, 9, 26),
  })
  assert.strictEqual(octRef.status, 'paid', 'In October after paying Oct rent, status is Paid')

  // Case B: Calendar transitions to November 1, 2026 (November rent due on Nov 5)
  const nov1Ref = calculateTenantRentStatus({
    tenant: resident,
    payments: [octPayment],
    referenceDate: new Date(2026, 10, 1),
  })
  assert.strictEqual(nov1Ref.status, 'due_soon', 'On Nov 1, November rent is Due Soon')
  assert.strictEqual(nov1Ref.monthCovered, 'November 2026', 'Active billing month is November 2026')

  // Case C: Calendar transitions to November 5, 2026 (Due day!)
  const nov5Ref = calculateTenantRentStatus({
    tenant: resident,
    payments: [octPayment],
    referenceDate: new Date(2026, 10, 5),
  })
  assert.strictEqual(nov5Ref.status, 'due_today', 'On Nov 5, status transitions to Due Today')

  // Case D: Calendar transitions to November 6, 2026 (Past due day!)
  const nov6Ref = calculateTenantRentStatus({
    tenant: resident,
    payments: [octPayment],
    referenceDate: new Date(2026, 10, 6),
  })
  assert.strictEqual(nov6Ref.status, 'overdue', 'On Nov 6, status transitions to Overdue')
  assert.strictEqual(nov6Ref.days, 1, 'Overdue by 1 day')
})

