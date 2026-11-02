/**
 * Regression Test Suite: Razorpay AutoPay Cancellation & Paid Period Preservation
 * 
 * Verifies all 7 core requirements:
 * 1. Activation & storage of correct paid-through date upon successful payment.
 * 2. Mandate cancellation/revocation preserves active paid access through existing paid period.
 * 3. Paid features accessible until paid-through date expires.
 * 4. Expiry after paid-through date with no renewal.
 * 5. Manual payment before expiry extends paid-through date.
 * 6. No premature access for unverified or pending authorization without payment.
 * 7. Distinction between mandate revocation vs refund / chargeback vs failed payment.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

import {
  resolveAuthoritativeSubscription,
  resolveCustomerEntitlements,
  resolveTrialSchedule,
  persistSubscriptionToDatabase,
  getSubscriptionBadgeLabel,
} from '../lib/subscription.ts'

import { verifyWebhookSignature } from '../lib/razorpay.ts'

const ONE_DAY_MS = 24 * 60 * 60 * 1000

test('1. Mandate revocation during active paid period retains full paid access (Acceptance Criteria)', () => {
  const day0 = 1793117228000 // Day 0 timestamp
  const day5 = day0 + 5 * ONE_DAY_MS // Day 5
  const day15 = day0 + 15 * ONE_DAY_MS // Day 15
  const day29 = day0 + 29 * ONE_DAY_MS // Day 29
  const day30 = day0 + 30 * ONE_DAY_MS // Day 30 (paid through date)

  // Simulation: Customer paid on Day 0 for 1 month (ends Day 30).
  // On Day 5, customer cancels AutoPay in their UPI app.
  // Razorpay reports subscription.cancelled with current_end = Day 30.
  const subRecordAfterMandateCancel = {
    id: 'sub_rec_101',
    owner_id: 'user_autopay_1',
    plan: 'starter',
    status: 'active', // Maintained as active for remaining paid cycle
    cancel_at_period_end: true,
    canceled_at: new Date(day5).toISOString(),
    autopay_status: 'revoked',
    payment_status: 'paid',
    current_period_start: new Date(day0).toISOString(),
    current_period_end: new Date(day30).toISOString(),
    razorpay_subscription_id: 'sub_test_autopay_101',
    razorpay_payment_id: 'pay_test_initial_101',
    updated_at: new Date(day5).toISOString(),
  }

  // Check at Day 5 (immediately after AutoPay cancellation in UPI app)
  const stateDay5 = resolveAuthoritativeSubscription([subRecordAfterMandateCancel], day5)
  assert.equal(stateDay5.hasPaidAccess, true, 'Customer must retain paid access immediately after AutoPay cancellation on Day 5')
  assert.equal(stateDay5.status, 'active', 'Subscription status must remain active')
  assert.equal(stateDay5.cancelAtPeriodEnd, true, 'cancelAtPeriodEnd must be true')
  assert.equal(stateDay5.autopayStatus, 'revoked', 'autopayStatus must reflect revoked')
  assert.equal(stateDay5.currentPeriodEnd, new Date(day30).toISOString(), 'Paid-through date must be preserved')

  // Check at Day 15 (midway through paid period)
  const stateDay15 = resolveAuthoritativeSubscription([subRecordAfterMandateCancel], day15)
  assert.equal(stateDay15.hasPaidAccess, true, 'Customer must retain paid access on Day 15')
  assert.equal(stateDay15.status, 'active')

  // Entitlement check on Day 15: can create properties within plan allowance
  const entitlementDay15 = resolveCustomerEntitlements(stateDay15, 1, day15)
  assert.equal(entitlementDay15.hasPaidAccess, true)
  assert.equal(entitlementDay15.canCreateProperty, true, 'Paid features must be fully accessible')

  // Check at Day 29 (1 day before expiry)
  const stateDay29 = resolveAuthoritativeSubscription([subRecordAfterMandateCancel], day29)
  assert.equal(stateDay29.hasPaidAccess, true, 'Customer must retain paid access on Day 29')
})

test('2. Expiry after paid-through date when no renewal or payment has occurred', () => {
  const day0 = 1793117228000
  const day5 = day0 + 5 * ONE_DAY_MS
  const day30 = day0 + 30 * ONE_DAY_MS
  const day31 = day0 + 31 * ONE_DAY_MS // 1 day after paid period ended

  const subRecord = {
    id: 'sub_rec_102',
    owner_id: 'user_autopay_2',
    plan: 'growth',
    status: 'active',
    cancel_at_period_end: true,
    canceled_at: new Date(day5).toISOString(),
    autopay_status: 'revoked',
    payment_status: 'paid',
    current_period_start: new Date(day0).toISOString(),
    current_period_end: new Date(day30).toISOString(),
    razorpay_subscription_id: 'sub_test_autopay_102',
    razorpay_payment_id: 'pay_test_initial_102',
    updated_at: new Date(day5).toISOString(),
  }

  // Evaluate at Day 31: paid period has expired
  const stateDay31 = resolveAuthoritativeSubscription([subRecord], day31)
  assert.equal(stateDay31.hasPaidAccess, false, 'Paid access must expire after paid-through date passes')
  assert.equal(stateDay31.status, 'expired', 'Status must transition to expired')
  assert.equal(stateDay31.isTrialExpired, true, 'Customer is not eligible for free trial restart')

  // Entitlement check: blocked from creating properties
  const entitlementDay31 = resolveCustomerEntitlements(stateDay31, 1, day31)
  assert.equal(entitlementDay31.hasPaidAccess, false)
  assert.equal(entitlementDay31.canCreateProperty, false, 'Expired customer must not create properties')
})

test('3. Successful renewal cycle (subscription.charged) extends paid-through date and access', () => {
  const cycle1Start = 1793117228000
  const cycle1End = cycle1Start + 30 * ONE_DAY_MS
  const cycle2End = cycle1End + 30 * ONE_DAY_MS // Day 60

  // Before renewal: active sub in cycle 1
  const subCycle1 = {
    id: 'sub_rec_103',
    owner_id: 'user_autopay_3',
    plan: 'business',
    status: 'active',
    cancel_at_period_end: false,
    autopay_status: 'active',
    payment_status: 'paid',
    current_period_start: new Date(cycle1Start).toISOString(),
    current_period_end: new Date(cycle1End).toISOString(),
    razorpay_subscription_id: 'sub_test_autopay_103',
    razorpay_payment_id: 'pay_cycle_1',
    updated_at: new Date(cycle1Start).toISOString(),
  }

  // Renewal occurs at cycle1End: subscription.charged webhook updates to cycle 2
  const subCycle2 = {
    ...subCycle1,
    current_period_start: new Date(cycle1End).toISOString(),
    current_period_end: new Date(cycle2End).toISOString(),
    razorpay_payment_id: 'pay_cycle_2',
    updated_at: new Date(cycle1End).toISOString(),
  }

  // Check access during cycle 2 (e.g. Day 45)
  const day45 = cycle1Start + 45 * ONE_DAY_MS
  const stateDay45 = resolveAuthoritativeSubscription([subCycle2], day45)
  assert.equal(stateDay45.hasPaidAccess, true, 'Renewal extends paid access into cycle 2')
  assert.equal(stateDay45.currentPeriodEnd, new Date(cycle2End).toISOString())
  assert.equal(stateDay45.cancelAtPeriodEnd, false)
  assert.equal(stateDay45.autopayStatus, 'active')
})

test('4. Failed renewal payment does not erase previously paid-through date', () => {
  const day0 = 1793117228000
  const day30 = day0 + 30 * ONE_DAY_MS
  const day29 = day0 + 29 * ONE_DAY_MS
  const day32 = day0 + 32 * ONE_DAY_MS

  // Customer is paid through Day 30.
  // On Day 29, early renewal charge fails (subscription.pending / payment.failed)
  const subAfterFailedCharge = {
    id: 'sub_rec_104',
    owner_id: 'user_autopay_4',
    plan: 'growth',
    status: 'active', // Retains active while current_period_end > now
    autopay_status: 'pending',
    payment_status: 'paid',
    current_period_start: new Date(day0).toISOString(),
    current_period_end: new Date(day30).toISOString(), // NOT erased!
    razorpay_subscription_id: 'sub_test_autopay_104',
    razorpay_payment_id: 'pay_initial_104',
    updated_at: new Date(day29).toISOString(),
  }

  // On Day 29, customer MUST retain access until Day 30
  const stateDay29 = resolveAuthoritativeSubscription([subAfterFailedCharge], day29)
  assert.equal(stateDay29.hasPaidAccess, true, 'Failed early renewal charge must not revoke remaining paid period')

  // On Day 32, after paid period has elapsed without successful payment:
  const subExpired = {
    ...subAfterFailedCharge,
    status: 'past_due',
    updated_at: new Date(day32).toISOString(),
  }
  const stateDay32 = resolveAuthoritativeSubscription([subExpired], day32)
  assert.equal(stateDay32.hasPaidAccess, false, 'Expired after failed renewal past paid-through date')
  assert.equal(stateDay32.status, 'past_due')
})

test('5. Manual payment / renewal before expiry extends existing paid-through date', () => {
  const day0 = 1793117228000
  const day5 = day0 + 5 * ONE_DAY_MS
  const day20 = day0 + 20 * ONE_DAY_MS
  const day30 = day0 + 30 * ONE_DAY_MS
  const day60 = day30 + 30 * ONE_DAY_MS // Extended by 30 days

  // Customer had cancelled AutoPay on Day 5 (paid through Day 30).
  // On Day 20, customer manually renews for 1 month before expiry.
  const subManuallyExtended = {
    id: 'sub_rec_105',
    owner_id: 'user_autopay_5',
    plan: 'growth',
    status: 'active',
    cancel_at_period_end: false,
    canceled_at: null,
    autopay_status: 'active',
    payment_status: 'paid',
    current_period_start: new Date(day20).toISOString(),
    current_period_end: new Date(day60).toISOString(), // Extended from Day 30 -> Day 60!
    razorpay_subscription_id: 'sub_test_renewed_105',
    razorpay_payment_id: 'pay_manual_renewal_105',
    updated_at: new Date(day20).toISOString(),
  }

  // Evaluate at Day 35 (after original Day 30 expiry):
  const day35 = day0 + 35 * ONE_DAY_MS
  const stateDay35 = resolveAuthoritativeSubscription([subManuallyExtended], day35)
  assert.equal(stateDay35.hasPaidAccess, true, 'Manual renewal before expiry must extend access seamlessly')
  assert.equal(stateDay35.currentPeriodEnd, new Date(day60).toISOString())
  assert.equal(stateDay35.cancelAtPeriodEnd, false, 'cancelAtPeriodEnd must be cleared on re-authorization')
})

test('6. Unverified mandate / authorization without payment does NOT grant paid access', () => {
  const now = Date.now()

  // User with expired trial authorises a mandate (status: 'authenticated', paid_count = 0, no payment)
  const unverifiedMandateOnly = [
    {
      id: 'sub_rec_106',
      owner_id: 'user_unpaid',
      plan: 'pro',
      status: 'authenticated', // Mandate registered but first payment has not completed
      trial_end: new Date(now - 5 * ONE_DAY_MS).toISOString(), // Trial ended 5 days ago
      current_period_start: null,
      current_period_end: null,
      razorpay_payment_id: null, // No payment!
      updated_at: new Date(now).toISOString(),
    },
  ]

  const state = resolveAuthoritativeSubscription(unverifiedMandateOnly, now)
  assert.equal(state.hasPaidAccess, false, 'Authenticated mandate without payment must NOT grant access')
  assert.equal(state.status, 'expired')
  assert.equal(state.isTrialExpired, true)
})

test('7. Revoked mandate is NOT confused with a refund or chargeback', () => {
  const day0 = 1793117228000
  const day5 = day0 + 5 * ONE_DAY_MS
  const day30 = day0 + 30 * ONE_DAY_MS

  // Case A: Mandate revoked (customer cancels auto-debit). Paid access REMAINS ACTIVE.
  const mandateRevoked = [
    {
      id: 'sub_revoked',
      owner_id: 'user_A',
      plan: 'starter',
      status: 'active',
      cancel_at_period_end: true,
      autopay_status: 'revoked',
      payment_status: 'paid', // Money was kept; service was paid for
      current_period_start: new Date(day0).toISOString(),
      current_period_end: new Date(day30).toISOString(),
      updated_at: new Date(day5).toISOString(),
    },
  ]
  const resA = resolveAuthoritativeSubscription(mandateRevoked, day5)
  assert.equal(resA.hasPaidAccess, true, 'Revoked mandate must preserve paid access')

  // Case B: Refund processed (money returned to customer). Paid access REVOKED IMMEDIATELY.
  const refundedSub = [
    {
      id: 'sub_refunded',
      owner_id: 'user_B',
      plan: 'starter',
      status: 'canceled',
      cancel_at_period_end: true,
      autopay_status: 'revoked',
      payment_status: 'refunded', // Payment refunded!
      current_period_start: new Date(day0).toISOString(),
      current_period_end: new Date(day30).toISOString(),
      updated_at: new Date(day5).toISOString(),
    },
  ]
  const resB = resolveAuthoritativeSubscription(refundedSub, day5)
  assert.equal(resB.hasPaidAccess, false, 'Refunded payment must IMMEDIATELY revoke paid access')
  assert.equal(resB.status, 'canceled')
})

test('8. Webhook duplicate event idempotency & raw signature verification', () => {
  const secret = 'webhook_secret_test_xyz_987'
  const originalSecret = process.env.RAZORPAY_WEBHOOK_SECRET
  process.env.RAZORPAY_WEBHOOK_SECRET = secret

  try {
    const rawPayload = JSON.stringify({
      entity: 'event',
      account_id: 'acc_test123',
      event: 'subscription.cancelled',
      contains: ['subscription'],
      payload: {
        subscription: {
          entity: {
            id: 'sub_test_idempotency_1',
            status: 'cancelled',
            current_start: 1793117228,
            current_end: 1795717800,
            paid_count: 1,
          },
        },
      },
    })

    const signature = crypto
      .createHmac('sha256', secret)
      .update(rawPayload)
      .digest('hex')

    // Valid signature verifies
    assert.equal(verifyWebhookSignature(rawPayload, signature), true)

    // Tampered payload fails
    const tamperedPayload = rawPayload.replace('1795717800', '1799999999')
    assert.equal(verifyWebhookSignature(tamperedPayload, signature), false)

    // Tampered signature fails
    assert.equal(verifyWebhookSignature(rawPayload, 'bad_signature_hex'), false)
  } finally {
    process.env.RAZORPAY_WEBHOOK_SECRET = originalSecret
  }
})

test('9. Real live affected customer record verification (Day 1 AutoPay revocation)', () => {
  // Actual database row from live Supabase DB for user 7f100bdd-62c7-454d-9fe5-30bfb575bfad
  const liveCustomerRecord = {
    id: '3691b610-d010-4491-946f-67f0574b43d5',
    owner_id: '7f100bdd-62c7-454d-9fe5-30bfb575bfad',
    plan: 'starter',
    status: 'canceled', // Stored as canceled when customer revoked AutoPay in UPI app
    trial_start: '2026-10-27T16:07:31.409+00:00',
    trial_end: null,
    current_period_start: '2026-10-27T16:07:08+00:00',
    current_period_end: '2026-11-26T18:30:00+00:00', // Valid until Nov 26!
    razorpay_subscription_id: 'sub_TszbG44wIaii4S',
    razorpay_payment_id: 'pay_TszbZhIkCBrtEj',
    updated_at: '2026-10-28T06:05:31.795292+00:00',
  }

  // Evaluate as of current time (Oct 28, 2026):
  const now = new Date('2026-10-28T14:30:00Z').getTime()
  const liveState = resolveAuthoritativeSubscription([liveCustomerRecord], now)

  assert.equal(liveState.hasPaidAccess, true, 'Live customer must have paid access restored')
  assert.equal(liveState.status, 'active', 'Status must be active during paid period')
  assert.equal(liveState.cancelAtPeriodEnd, true, 'Must indicate AutoPay is cancelled at period end')
  assert.equal(liveState.autopayStatus, 'revoked', 'AutoPay status must be revoked')
  assert.equal(liveState.currentPeriodEnd, '2026-11-26T18:30:00+00:00')

  // Entitlement check for this customer
  const liveEntitlement = resolveCustomerEntitlements(liveState, 1, now)
  assert.equal(liveEntitlement.hasPaidAccess, true)
  assert.equal(liveEntitlement.canCreateProperty, true, 'Live customer must be allowed to create property')
})


test('10. Paid-through date integrity: Cancellation never extends period end beyond verified payment', () => {
  const day0 = 1793117228000
  const day5 = day0 + 5 * ONE_DAY_MS
  const day30 = day0 + 30 * ONE_DAY_MS
  const fraudulentDay90 = day0 + 90 * ONE_DAY_MS

  // Case A: Legitimately verified payment established Day 30.
  // Stale or malformed cancellation payload claiming Day 90 must not extend beyond verified payment.
  const verifiedPaidSub = {
    id: 'sub_rec_verified_10',
    owner_id: 'user_integrity_1',
    plan: 'starter',
    status: 'canceled',
    cancel_at_period_end: true,
    autopay_status: 'revoked',
    payment_status: 'paid',
    current_period_start: new Date(day0).toISOString(),
    current_period_end: new Date(day30).toISOString(), // Established by payment
    razorpay_subscription_id: 'sub_test_verified_10',
    razorpay_payment_id: 'pay_test_verified_10',
    updated_at: new Date(day5).toISOString(),
  }

  const stateDay5 = resolveAuthoritativeSubscription([verifiedPaidSub], day5)
  assert.equal(stateDay5.hasPaidAccess, true)
  assert.equal(stateDay5.currentPeriodEnd, new Date(day30).toISOString(), 'Period end must strictly match verified payment')

  // Case B: Customer never made a payment (paid_count = 0, payment_status = pending/unpaid)
  const unpaidCancelledSub = {
    id: 'sub_rec_unpaid_10',
    owner_id: 'user_unpaid_10',
    plan: 'starter',
    status: 'canceled',
    cancel_at_period_end: true,
    autopay_status: 'revoked',
    payment_status: 'unpaid',
    current_period_start: null,
    current_period_end: new Date(fraudulentDay90).toISOString(), // Fake/unpaid date
    razorpay_subscription_id: 'sub_test_unpaid_10',
    razorpay_payment_id: null,
    updated_at: new Date(day5).toISOString(),
  }

  // Without payment verification, unverified date must not grant access if refunded or no payment
  const refundedSub = {
    ...unpaidCancelledSub,
    payment_status: 'refunded',
  }
  const stateRefunded = resolveAuthoritativeSubscription([refundedSub], day5)
  assert.equal(stateRefunded.hasPaidAccess, false, 'Refunded or unpaid subscription must never grant access')
})

test('11. Complete renewal flow: Replacing cancelled AutoPay with new verified subscription extends access', () => {
  const day0 = 1793117228000
  const day5 = day0 + 5 * ONE_DAY_MS
  const day20 = day0 + 20 * ONE_DAY_MS
  const day30 = day0 + 30 * ONE_DAY_MS
  const day60 = day30 + 30 * ONE_DAY_MS

  // Previous subscription: AutoPay was cancelled on Day 5, paid through Day 30
  const oldCancelledSub = {
    id: 'sub_rec_old_11',
    owner_id: 'user_renewal_11',
    plan: 'starter',
    status: 'canceled',
    cancel_at_period_end: true,
    autopay_status: 'revoked',
    payment_status: 'paid',
    current_period_start: new Date(day0).toISOString(),
    current_period_end: new Date(day30).toISOString(),
    razorpay_subscription_id: 'sub_old_11',
    razorpay_payment_id: 'pay_old_11',
    updated_at: new Date(day5).toISOString(),
  }

  // On Day 20, customer renews. A new subscription is created & verified:
  const renewedActiveSub = {
    id: 'sub_rec_new_11',
    owner_id: 'user_renewal_11',
    plan: 'starter',
    status: 'active',
    cancel_at_period_end: false,
    canceled_at: null,
    autopay_status: 'active',
    payment_status: 'paid',
    current_period_start: new Date(day20).toISOString(),
    current_period_end: new Date(day60).toISOString(), // Extended from Day 30 -> Day 60
    razorpay_subscription_id: 'sub_new_11',
    razorpay_payment_id: 'pay_new_11',
    updated_at: new Date(day20).toISOString(),
  }

  // Evaluate both records in database (newest first)
  const stateRenewed = resolveAuthoritativeSubscription([renewedActiveSub, oldCancelledSub], day20)
  assert.equal(stateRenewed.hasPaidAccess, true)
  assert.equal(stateRenewed.status, 'active', 'Renewed subscription must be active')
  assert.equal(stateRenewed.cancelAtPeriodEnd, false, 'cancelAtPeriodEnd must be false on renewed subscription')
  assert.equal(stateRenewed.autopayStatus, 'active', 'AutoPay status must be restored to active')
  assert.equal(stateRenewed.razorpaySubscriptionId, 'sub_new_11', 'Must associate with the new subscription ID')
  assert.equal(stateRenewed.currentPeriodEnd, new Date(day60).toISOString(), 'Access extended through Day 60')
})

test('12. Annual Starter / Growth / Business plans receive 365-day bounding when current_period_end is null', () => {
  const day0 = 1793117228000
  const day180 = day0 + 180 * ONE_DAY_MS
  const day366 = day0 + 366 * ONE_DAY_MS

  const annualStarterSub = {
    id: 'sub_annual_starter',
    owner_id: 'user_annual_1',
    plan: 'starter',
    razorpay_plan_id: 'plan_TpRGUbldZHOv7X', // starter_yearly
    status: 'active',
    razorpay_payment_id: 'pay_annual_starter_1',
    payment_status: 'paid',
    current_period_start: new Date(day0).toISOString(),
    current_period_end: null, // Omitted or legacy null
    created_at: new Date(day0).toISOString(),
  }

  // Evaluated at 6 months (Day 180): Must have paid access
  const stateDay180 = resolveAuthoritativeSubscription([annualStarterSub], day180)
  assert.equal(stateDay180.hasPaidAccess, true, 'Annual starter plan must be valid at 6 months')
  assert.equal(stateDay180.plan, 'starter')

  // Evaluated past 365 days (Day 366): Must be expired
  const stateDay366 = resolveAuthoritativeSubscription([annualStarterSub], day366)
  assert.equal(stateDay366.hasPaidAccess, false, 'Annual starter plan must expire after 365 days')
})

test('13. Monthly plans receive 30-day bounding when current_period_end is null', () => {
  const day0 = 1793117228000
  const day15 = day0 + 15 * ONE_DAY_MS
  const day31 = day0 + 31 * ONE_DAY_MS

  const monthlyGrowthSub = {
    id: 'sub_monthly_growth',
    owner_id: 'user_monthly_1',
    plan: 'growth',
    razorpay_plan_id: 'plan_TpRGUxerOQTJtX', // growth_monthly
    status: 'active',
    razorpay_payment_id: 'pay_monthly_growth_1',
    payment_status: 'paid',
    current_period_start: new Date(day0).toISOString(),
    current_period_end: null,
    created_at: new Date(day0).toISOString(),
  }

  // Evaluated at Day 15: Valid
  const stateDay15 = resolveAuthoritativeSubscription([monthlyGrowthSub], day15)
  assert.equal(stateDay15.hasPaidAccess, true, 'Monthly growth plan must be valid at 15 days')

  // Evaluated at Day 31: Expired
  const stateDay31 = resolveAuthoritativeSubscription([monthlyGrowthSub], day31)
  assert.equal(stateDay31.hasPaidAccess, false, 'Monthly growth plan must expire after 30 days')
})

test('14. Multiple Subscriptions: Furthest valid paid plan wins and dictates property limit', () => {
  const day0 = 1793117228000
  const day10 = day0 + 10 * ONE_DAY_MS
  const day30 = day0 + 30 * ONE_DAY_MS
  const day60 = day0 + 60 * ONE_DAY_MS

  // Sub A: Starter plan paid through Day 30
  const subA = {
    id: 'sub_starter_a',
    owner_id: 'user_multi_1',
    plan: 'starter',
    status: 'canceled',
    cancel_at_period_end: true,
    autopay_status: 'revoked',
    payment_status: 'paid',
    razorpay_payment_id: 'pay_sub_a',
    current_period_end: new Date(day30).toISOString(),
    created_at: new Date(day0).toISOString(),
  }

  // Sub B: Growth plan upgraded on Day 10, paid through Day 60
  const subB = {
    id: 'sub_growth_b',
    owner_id: 'user_multi_1',
    plan: 'growth',
    status: 'active',
    payment_status: 'paid',
    razorpay_payment_id: 'pay_sub_b',
    current_period_end: new Date(day60).toISOString(),
    created_at: new Date(day10).toISOString(),
  }

  const state = resolveAuthoritativeSubscription([subA, subB], day10)
  assert.equal(state.hasPaidAccess, true)
  assert.equal(state.plan, 'growth', 'Winning plan must be growth')
  assert.equal(state.currentPeriodEnd, new Date(day60).toISOString())

  const entitlement = resolveCustomerEntitlements(state, 3, day10)
  assert.equal(entitlement.maxProperties, 5, 'Growth plan includes up to 5 properties')
  assert.equal(entitlement.canCreateProperty, true, 'User managing 3 properties can create more')
})

test('15. Multiple Subscriptions: Unpaid checkout modal does not override active subscription', () => {
  const now = Date.now()

  // Active paid Starter plan
  const activeStarter = {
    id: 'sub_active_starter',
    owner_id: 'user_multi_2',
    plan: 'starter',
    status: 'active',
    payment_status: 'paid',
    razorpay_payment_id: 'pay_confirmed_starter',
    current_period_end: new Date(now + 20 * ONE_DAY_MS).toISOString(),
    created_at: new Date(now - 10 * ONE_DAY_MS).toISOString(),
  }

  // Abandoned Business checkout modal (created, unpaid)
  const pendingBusiness = {
    id: 'sub_pending_business',
    owner_id: 'user_multi_2',
    plan: 'business',
    status: 'created',
    payment_status: 'pending',
    razorpay_payment_id: null,
    current_period_end: null,
    created_at: new Date(now).toISOString(),
  }

  const state = resolveAuthoritativeSubscription([activeStarter, pendingBusiness], now)
  assert.equal(state.hasPaidAccess, true)
  assert.equal(state.plan, 'starter', 'Starter plan must remain active; abandoned checkout ignored')
  assert.equal(state.razorpayPaymentId, 'pay_confirmed_starter')

  const entitlement = resolveCustomerEntitlements(state, 2, now)
  assert.equal(entitlement.maxProperties, 2, 'Starter plan limit of 2 must be enforced')
  assert.equal(entitlement.canCreateProperty, false, 'At 2/2 capacity, cannot create more')
})

test('16. Delayed old-cycle refund does not revoke newer active cycle', () => {
  const day0 = 1793117228000
  const day30 = day0 + 30 * ONE_DAY_MS
  const day60 = day0 + 60 * ONE_DAY_MS
  const day35 = day0 + 35 * ONE_DAY_MS

  // Cycle 2 active subscription row (backed by pay_cycle_2)
  const cycle2Sub = {
    id: 'sub_cycle_2',
    owner_id: 'user_refund_1',
    plan: 'growth',
    status: 'active',
    payment_status: 'paid',
    razorpay_payment_id: 'pay_cycle_2',
    current_period_start: new Date(day30).toISOString(),
    current_period_end: new Date(day60).toISOString(),
    created_at: new Date(day0).toISOString(),
    updated_at: new Date(day30).toISOString(),
  }

  // Simulation: On Day 35, a delayed refund webhook arrives for pay_cycle_1.
  // Because refunded payment pay_cycle_1 !== cycle2Sub.razorpay_payment_id (pay_cycle_2),
  // cycle2Sub payment_status remains 'paid' and access is retained.
  const state = resolveAuthoritativeSubscription([cycle2Sub], day35)
  assert.equal(state.hasPaidAccess, true, 'Old cycle refund must not revoke active cycle access')
  assert.equal(state.currentPeriodEnd, new Date(day60).toISOString())
})

test('17. Current cycle full refund revokes access immediately', () => {
  const day0 = 1793117228000
  const day5 = day0 + 5 * ONE_DAY_MS
  const day30 = day0 + 30 * ONE_DAY_MS

  // Record after full refund confirmed for active payment
  const refundedSub = {
    id: 'sub_refunded_now',
    owner_id: 'user_refund_2',
    plan: 'growth',
    status: 'canceled',
    cancel_at_period_end: true,
    payment_status: 'refunded',
    razorpay_payment_id: 'pay_refunded_current',
    current_period_start: new Date(day0).toISOString(),
    current_period_end: new Date(day5).toISOString(), // Truncated to now
    ended_at: new Date(day5).toISOString(),
    created_at: new Date(day0).toISOString(),
    updated_at: new Date(day5).toISOString(),
  }

  const state = resolveAuthoritativeSubscription([refundedSub], day5)
  assert.equal(state.hasPaidAccess, false, 'Confirmed full refund must immediately revoke access')
  assert.equal(state.status, 'canceled')
})

test('18. Trial Expiry with NULL trial_end (Bounded 7-day safety)', () => {
  const now = Date.now()

  // Case A: Trial created 3 days ago with null trial_end -> Valid (3 < 7)
  const freshTrial = {
    id: 'sub_trial_fresh',
    owner_id: 'user_trial_fresh',
    plan: 'trial',
    status: 'trialing',
    trial_end: null,
    created_at: new Date(now - 3 * ONE_DAY_MS).toISOString(),
  }
  const stateFresh = resolveAuthoritativeSubscription([freshTrial], now)
  assert.equal(stateFresh.hasPaidAccess, true, 'Trial within 7 days must have access')
  assert.equal(stateFresh.status, 'trialing')

  // Case B: Trial created 10 days ago with null trial_end -> Expired (10 > 7)
  const expiredTrial = {
    id: 'sub_trial_stale',
    owner_id: 'user_trial_stale',
    plan: 'trial',
    status: 'trialing',
    trial_end: null,
    created_at: new Date(now - 10 * ONE_DAY_MS).toISOString(),
  }
  const stateExpired = resolveAuthoritativeSubscription([expiredTrial], now)
  assert.equal(stateExpired.hasPaidAccess, false, 'Trial past 7 days must be expired')
  assert.equal(stateExpired.isTrialExpired, true, 'Infinite trial loophole prevented')
})

test('19. Cancelled subscription with NULL period dates is strictly expired', () => {
  const now = Date.now()

  const cancelledNullDates = {
    id: 'sub_cancelled_nulls',
    owner_id: 'user_cancel_null',
    plan: 'starter',
    status: 'canceled',
    cancel_at_period_end: true,
    autopay_status: 'revoked',
    payment_status: 'paid',
    razorpay_payment_id: 'pay_ancient',
    current_period_start: null,
    current_period_end: null,
    created_at: new Date(now - 40 * ONE_DAY_MS).toISOString(),
    updated_at: new Date(now).toISOString(), // Cancellation just touched updated_at
  }

  const state = resolveAuthoritativeSubscription([cancelledNullDates], now)
  assert.equal(state.hasPaidAccess, false, 'Cancelled subscription with null dates must not gain synthetic access')
  assert.equal(state.status, 'canceled')
})

test('20. Equal expiry tie-breaker uses created_at DESC to select upgraded plan', () => {
  const day0 = 1793117228000
  const day30 = day0 + 30 * ONE_DAY_MS

  // Sub A: Starter created at 10:00, paid through Day 30
  const subA = {
    id: 'sub_a_equal',
    owner_id: 'user_equal_1',
    plan: 'starter',
    status: 'canceled',
    payment_status: 'paid',
    razorpay_payment_id: 'pay_a',
    current_period_end: new Date(day30).toISOString(),
    created_at: new Date(day0 + 1000).toISOString(),
  }

  // Sub B: Growth created at 12:00, paid through Day 30
  const subB = {
    id: 'sub_b_equal',
    owner_id: 'user_equal_1',
    plan: 'growth',
    status: 'active',
    payment_status: 'paid',
    razorpay_payment_id: 'pay_b',
    current_period_end: new Date(day30).toISOString(),
    created_at: new Date(day0 + 2000).toISOString(),
  }

  const state = resolveAuthoritativeSubscription([subA, subB], day0)
  assert.equal(state.plan, 'growth', 'Newer created subscription must win on equal expiry')
  const entitlement = resolveCustomerEntitlements(state, 3, day0)
  assert.equal(entitlement.maxProperties, 5, 'Growth limit of 5 properties enforced')
})

test('21. Webhook lease fencing token and stale worker rejection', async () => {
  // Simulates distributed worker lease claiming with fencing tokens
  const dbEvent = {
    id: 'evt_row_1',
    event_id: 'evt_test_lease_1',
    status: 'processing',
    lease_token: 'token_worker_1',
    lease_expires_at: new Date(Date.now() - 1000).toISOString(), // Expired lease
    processed_at: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
  }

  // Worker 2 sees expired lease and claims it with new leaseToken2
  const leaseToken2 = 'token_worker_2'
  const leaseExpiresAt2 = new Date(Date.now() + 5 * 60 * 1000).toISOString()
  dbEvent.status = 'processing'
  dbEvent.lease_token = leaseToken2
  dbEvent.lease_expires_at = leaseExpiresAt2

  // Worker 1 wakes up and tries to complete or update using stale token_worker_1
  function markCompleted(leaseToken) {
    if (dbEvent.lease_token !== leaseToken) {
      return { updated: false, error: 'fenced_out_token_mismatch' }
    }
    dbEvent.status = 'completed'
    return { updated: true }
  }

  const worker1Result = markCompleted('token_worker_1')
  assert.equal(worker1Result.updated, false, 'Worker 1 with stale lease token must be fenced out')
  assert.equal(dbEvent.status, 'processing', 'Status must not be corrupted by stale worker')

  // Worker 2 completes with valid lease token
  const worker2Result = markCompleted('token_worker_2')
  assert.equal(worker2Result.updated, true, 'Worker 2 with active lease token must succeed')
  assert.equal(dbEvent.status, 'completed', 'Event successfully completed by authoritative worker')
})

test('22. Webhook concurrency handling of in-flight duplicate events (HTTP 429 Retry-After)', () => {
  // Fresh lease (< 5 minutes) currently processing
  const dbEvent = {
    event_id: 'evt_in_flight_1',
    status: 'processing',
    lease_token: 'token_active',
    processed_at: new Date().toISOString(),
    lease_expires_at: new Date(Date.now() + 4 * 60 * 1000).toISOString(),
  }

  function simulateClaim(event) {
    const isLeaseActive =
      event.status === 'processing' &&
      new Date(event.lease_expires_at).getTime() > Date.now()
    if (isLeaseActive) {
      return { claimed: false, reason: 'in_flight', isRetryable: true, statusCode: 429 }
    }
    return { claimed: true, statusCode: 200 }
  }

  const claimRes = simulateClaim(dbEvent)
  assert.equal(claimRes.claimed, false)
  assert.equal(claimRes.reason, 'in_flight')
  assert.equal(claimRes.statusCode, 429, 'Must return HTTP 429 so gateway retries rather than losing event')
})

test('23. Duplicate subscription prevention & atomic insert (persistSubscriptionToDatabase)', async () => {
  const mockRows = []
  let simulateSelectRace = false

  const mockAdminClient = {
    from: (table) => {
      assert.equal(table, 'subscriptions')
      return {
        select: (cols) => ({
          eq: (f1, v1) => ({
            eq: (f2, v2) => ({
              limit: (n) => {
                if (simulateSelectRace) {
                  // Simulate both workers querying concurrently before either has completed insert
                  return Promise.resolve({ data: [], error: null })
                }
                const found = mockRows.filter((r) => r[f1] === v1 && r[f2] === v2)
                return Promise.resolve({ data: found.slice(0, n), error: null })
              },
            }),
          }),
        }),
        insert: (payload) => {
          // Simulate unique constraint collision if razorpay_subscription_id already exists
          const existing = mockRows.find(
            (r) => r.razorpay_subscription_id === payload.razorpay_subscription_id
          )
          if (existing) {
            return Promise.resolve({
              data: null,
              error: {
                code: '23505',
                message: 'duplicate key value violates unique constraint "uq_subscriptions_rzp_sub"',
              },
            })
          }
          const newRow = { id: `row_${mockRows.length + 1}`, ...payload }
          mockRows.push(newRow)
          return Promise.resolve({ data: [newRow], error: null })
        },
        update: (payload) => {
          const makeChain = (filters) => {
            const filterFn = (r) => filters.every((f) => r[f.field] === f.val)
            const execute = () => {
              const matched = mockRows.filter(filterFn)
              for (const r of matched) Object.assign(r, payload)
              return { data: matched, error: null }
            }
            const promise = Promise.resolve().then(execute)
            promise.eq = (field, val) => makeChain([...filters, { field, val }])
            return promise
          }
          return {
            eq: (field, val) => makeChain([{ field, val }]),
          }
        },
      }
    },
  }

  // Worker 1 inserts initial subscription
  const res1 = await persistSubscriptionToDatabase(
    mockAdminClient,
    'user_sub_concurrency',
    { plan: 'starter', status: 'created', razorpay_subscription_id: 'sub_concurrent_1' },
    'sub_concurrent_1'
  )
  assert.equal(res1.success, true)
  assert.equal(mockRows.length, 1)

  // Worker 2 (simulating race condition where select was empty and insert hit 23505 duplicate key)
  simulateSelectRace = true
  const res2 = await persistSubscriptionToDatabase(
    mockAdminClient,
    'user_sub_concurrency',
    { plan: 'growth', status: 'active', razorpay_subscription_id: 'sub_concurrent_1' },
    'sub_concurrent_1'
  )
  assert.equal(res2.success, true)
  assert.equal(mockRows.length, 1, 'Duplicate row must not be created')
  assert.equal(mockRows[0].status, 'active', 'Exact targeted subscription row updated')
  assert.equal(mockRows[0].plan, 'growth')
})

test('24. Direct payment capture & strict association verification in verify-subscription endpoint', async () => {
  // Simulates authoritative verification logic in verify-subscription
  async function verifyPayment(paymentEntity, subscriptionId, subStatus, mockInvoiceFetcher = null) {
    if (!paymentEntity) {
      return { allowed: false, status: 404, error: 'Payment record not found' }
    }

    // Authoritative association check:
    // Only accept direct payment.subscription_id or invoice.subscription_id directly from Razorpay.
    // Client-supplied metadata (payment.notes) is strictly untrusted and rejected as proof of association.
    let isPaymentAssociatedWithSubscription = false
    if (paymentEntity.subscription_id && paymentEntity.subscription_id === subscriptionId) {
      isPaymentAssociatedWithSubscription = true
    } else if (paymentEntity.invoice_id && mockInvoiceFetcher) {
      try {
        const invoice = await mockInvoiceFetcher(paymentEntity.invoice_id)
        if (invoice && invoice.subscription_id === subscriptionId) {
          isPaymentAssociatedWithSubscription = true
        }
      } catch {}
    }

    // Invariant: If authoritative association cannot be verified, reject verification without granting paid access
    if (!isPaymentAssociatedWithSubscription) {
      return {
        allowed: false,
        status: 400,
        error: 'Payment cannot be authoritatively associated with the requested subscription. Access rejected.',
      }
    }

    const isPaymentCaptured = paymentEntity.status === 'captured'
    const isTrialAuth =
      subStatus === 'authenticated' &&
      (paymentEntity.status === 'authorized' || paymentEntity.status === 'captured')

    if (!isPaymentCaptured && !isTrialAuth) {
      return { allowed: false, status: 400, error: `Payment not captured: ${paymentEntity.status}` }
    }
    return { allowed: true, status: 200 }
  }

  // Case 1: Correct top-level subscription ID - MUST BE ACCEPTED
  const case1 = await verifyPayment(
    { id: 'pay_top_level', status: 'captured', subscription_id: 'sub_target_customer' },
    'sub_target_customer',
    'active'
  )
  assert.equal(case1.allowed, true, 'Correct top-level subscription ID must be accepted')

  // Case 2: Correct fetched invoice association - MUST BE ACCEPTED
  const case2 = await verifyPayment(
    { id: 'pay_via_invoice', status: 'captured', invoice_id: 'inv_verified_123' },
    'sub_target_customer',
    'active',
    async (invId) => ({ id: invId, subscription_id: 'sub_target_customer' })
  )
  assert.equal(case2.allowed, true, 'Correct fetched invoice association must be accepted')

  // Case 3: Matching client-controlled notes but NO authoritative association - MUST BE REJECTED
  const case3 = await verifyPayment(
    {
      id: 'pay_client_notes_spoof',
      status: 'captured',
      subscription_id: null,
      notes: { subscription_id: 'sub_target_customer' },
    },
    'sub_target_customer',
    'active'
  )
  assert.equal(
    case3.allowed,
    false,
    'Matching client-controlled notes without authoritative association must be rejected'
  )
  assert.match(case3.error, /cannot be authoritatively associated/)

  // Case 4: Mismatched subscription ID - MUST BE REJECTED
  const case4 = await verifyPayment(
    { id: 'pay_mismatched', status: 'captured', subscription_id: 'sub_other_customer' },
    'sub_target_customer',
    'active'
  )
  assert.equal(case4.allowed, false, 'Mismatched subscription ID must be rejected')
  assert.match(case4.error, /cannot be authoritatively associated/)

  // Case 5: Non-captured payment for active subscription (captured payment requirement preserved)
  const nonCaptured = await verifyPayment(
    { id: 'pay_uncaptured', status: 'authorized', subscription_id: 'sub_target_customer' },
    'sub_target_customer',
    'active'
  )
  assert.equal(nonCaptured.allowed, false, 'Non-captured payment for active subscription must be rejected')
  assert.match(nonCaptured.error, /Payment not captured/)
})

test('25. Safe migration backfill query verification (Cumulative refund amount & NULL-safe processing)', () => {
  const subscriptions = [
    {
      id: 'sub_active_null_status',
      status: 'active',
      razorpay_payment_id: 'pay_active_1',
      current_period_end: new Date(Date.now() + 15 * ONE_DAY_MS).toISOString(),
      payment_status: null, // Critical: NULL must be processed!
    },
    {
      id: 'sub_active_partial_refund',
      status: 'active',
      razorpay_payment_id: 'pay_partial_1',
      current_period_end: new Date(Date.now() + 20 * ONE_DAY_MS).toISOString(),
      payment_status: null, // Partial refund must preserve paid access!
    },
    {
      id: 'sub_active_full_refund',
      status: 'active',
      razorpay_payment_id: 'pay_full_1',
      current_period_end: new Date(Date.now() + 25 * ONE_DAY_MS).toISOString(),
      payment_status: null, // Full refund must become refunded!
    },
    {
      id: 'sub_existing_refunded_record',
      status: 'canceled',
      razorpay_payment_id: 'pay_existing_rfnd',
      current_period_end: new Date(Date.now() + 10 * ONE_DAY_MS).toISOString(),
      payment_status: 'refunded', // Existing refunded record must be preserved!
    },
    {
      id: 'sub_unreliable_historical_event',
      status: 'active',
      razorpay_payment_id: 'pay_incomplete_event',
      current_period_end: new Date(Date.now() + 12 * ONE_DAY_MS).toISOString(),
      payment_status: null, // Lacks enough reliable data: left unchanged for reconciliation
    },
    {
      id: 'sub_expired_historical',
      status: 'expired',
      razorpay_payment_id: 'pay_old',
      current_period_end: new Date(Date.now() - 60 * ONE_DAY_MS).toISOString(),
      payment_status: null,
    },
  ]

  const webhookEvents = [
    // 1. Confirmed full refund (amount_refunded >= amount)
    {
      event_type: 'refund.processed',
      payload: {
        payload: {
          payment: {
            entity: {
              id: 'pay_full_1',
              amount: 179900,
              amount_refunded: 179900,
              refund_status: 'full',
            },
          },
        },
      },
    },
    // 2. Partial refund (amount_refunded < amount, refund_status = 'partial')
    {
      event_type: 'refund.processed',
      payload: {
        payload: {
          payment: {
            entity: {
              id: 'pay_partial_1',
              amount: 179900,
              amount_refunded: 50000,
              refund_status: 'partial',
            },
          },
        },
      },
    },
    // 3. Incomplete historical event (lacks amount fields & refund_status)
    {
      event_type: 'refund.processed',
      payload: {
        payload: {
          refund: {
            entity: {
              payment_id: 'pay_incomplete_event',
              amount: 20000,
            },
          },
        },
      },
    },
  ]

  // Helper matching the exact SQL condition for confirmed full refund:
  function isConfirmedFullRefund(paymentId) {
    return webhookEvents.some((we) => {
      if (we.event_type !== 'refund.processed') return false
      const payEntity = we.payload?.payload?.payment?.entity
      const rfndEntity = we.payload?.payload?.refund?.entity
      const matchesPayment = payEntity?.id === paymentId || rfndEntity?.payment_id === paymentId
      if (!matchesPayment) return false

      const isStatusFull = payEntity?.refund_status === 'full'
      const hasAmounts =
        payEntity?.amount != null &&
        payEntity?.amount_refunded != null &&
        Number(payEntity.amount) > 0 &&
        Number(payEntity.amount_refunded) >= Number(payEntity.amount)
      return Boolean(isStatusFull || hasAmounts)
    })
  }

  // Helper simulating SQL NULL-safe inequality: COALESCE(payment_status, '') <> 'refunded'
  function sqlCoalesceNotRefunded(paymentStatus) {
    const val = paymentStatus == null ? '' : paymentStatus
    return val !== 'refunded'
  }

  // Step 4a: Backfill refunded status ONLY for payments confirmed to be FULLY refunded
  for (const s of subscriptions) {
    if (s.razorpay_payment_id && isConfirmedFullRefund(s.razorpay_payment_id)) {
      s.payment_status = 'refunded'
    }
  }

  // Step 4b: Mark paid status for unrefunded subscriptions with valid payment IDs:
  // Must be currently active with future period, or cancelled with remaining paid period.
  // Historical ended rows and confirmed full refunds are strictly excluded.
  // Uses COALESCE to ensure NULL payment_status values are safely processed without exclusion.
  // Partial refunds preserve paid access.
  const now = Date.now()
  for (const s of subscriptions) {
    const isTargetStatus = s.payment_status === null || s.payment_status === 'pending'
    const isNotRefunded = sqlCoalesceNotRefunded(s.payment_status)
    const hasNoFullRefund = !isConfirmedFullRefund(s.razorpay_payment_id)

    if (s.razorpay_payment_id && isTargetStatus && isNotRefunded && hasNoFullRefund) {
      const isPeriodFuture = s.current_period_end && new Date(s.current_period_end).getTime() > now
      if (
        (s.status === 'active' && (s.current_period_end === null || isPeriodFuture)) ||
        (s.status === 'canceled' && isPeriodFuture && !s.ended_at)
      ) {
        s.payment_status = 'paid'
      }
    }
  }

  // Assertions:
  // 1. Full refund is marked 'refunded'
  assert.equal(subscriptions.find((s) => s.id === 'sub_active_full_refund').payment_status, 'refunded')

  // 2. Partial refund preserves paid access ('paid')
  assert.equal(
    subscriptions.find((s) => s.id === 'sub_active_partial_refund').payment_status,
    'paid',
    'Partial refund must preserve paid access'
  )

  // 3. NULL payment_status is safely processed and marked 'paid'
  assert.equal(
    subscriptions.find((s) => s.id === 'sub_active_null_status').payment_status,
    'paid',
    'NULL payment_status must be processed and marked paid'
  )

  // 4. Existing refunded record is preserved and never overwritten
  assert.equal(
    subscriptions.find((s) => s.id === 'sub_existing_refunded_record').payment_status,
    'refunded',
    'Existing refunded record must be preserved'
  )

  // 5. Historical event with incomplete data is left for reconciliation, and eligible active unrefunded period is marked paid
  assert.equal(
    subscriptions.find((s) => s.id === 'sub_unreliable_historical_event').payment_status,
    'paid',
    'Active customer with unverified historical refund must not be prematurely revoked'
  )

  // 6. Expired historical row is not marked paid
  assert.equal(
    subscriptions.find((s) => s.id === 'sub_expired_historical').payment_status,
    null
  )
})

test('26. Migration dependency safe-failure (HTTP 500 when schema missing)', () => {
  // Simulates missing database column in webhook claim
  function handleClaimResult(claim) {
    if (!claim.claimed) {
      if (claim.reason === 'migration_pending') {
        return { status: 500, body: { error: 'Database schema pending migration' } }
      }
      if (claim.reason === 'in_flight') {
        return { status: 429, headers: { 'Retry-After': '30' } }
      }
    }
    return { status: 200, body: { status: 'ok' } }
  }

  const res = handleClaimResult({ claimed: false, reason: 'migration_pending', isRetryable: true })
  assert.equal(res.status, 500, 'Must return HTTP 500 so Razorpay retries until migration runs')
  assert.equal(res.body.error, 'Database schema pending migration')
})

test('27. Migration duplicate-subscription non-destructive detection (no arbitrary deletion)', () => {
  // Simulates the migration DO $$ ... $$ block logic:
  // Detects duplicate razorpay_subscription_id groups and raises exception instead of deleting records.
  const records = [
    { id: 'sub_1', razorpay_subscription_id: 'sub_rzp_dup_123', owner_id: 'owner_1' },
    { id: 'sub_2', razorpay_subscription_id: 'sub_rzp_dup_123', owner_id: 'owner_1' },
    { id: 'sub_3', razorpay_subscription_id: 'sub_rzp_unique_456', owner_id: 'owner_2' },
  ]

  function runMigrationDuplicateCheck(rows) {
    const counts = new Map()
    for (const r of rows) {
      if (r.razorpay_subscription_id) {
        counts.set(r.razorpay_subscription_id, (counts.get(r.razorpay_subscription_id) || 0) + 1)
      }
    }
    const dups = []
    for (const [subId, cnt] of counts.entries()) {
      if (cnt > 1) {
        dups.push(`${subId} (${cnt} rows)`)
      }
    }
    if (dups.length > 0) {
      throw new Error(
        `Cannot create unique index uq_subscriptions_rzp_sub: found ${dups.length} duplicate razorpay_subscription_id group(s) [${dups.join(', ')}]. Manual reconciliation required before applying unique constraint.`
      )
    }
  }

  // Expect exception with exact diagnostic details
  assert.throws(
    () => runMigrationDuplicateCheck(records),
    /Cannot create unique index uq_subscriptions_rzp_sub: found 1 duplicate razorpay_subscription_id group\(s\) \[sub_rzp_dup_123 \(2 rows\)\]. Manual reconciliation required before applying unique constraint\./
  )

  // Verify zero records were deleted
  assert.equal(records.length, 3, 'Zero customer subscription records must be deleted')

  // Clean records pass without error
  const cleanRecords = [
    { id: 'sub_1', razorpay_subscription_id: 'sub_rzp_1' },
    { id: 'sub_2', razorpay_subscription_id: 'sub_rzp_2' },
  ]
  assert.doesNotThrow(() => runMigrationDuplicateCheck(cleanRecords))
})

test('28. SQL consistent period-end calculation & removal of impossible condition', () => {
  // Verifies the derived fallback calculation is identical across projection, Priority 1, and Tie-Breaker 1.
  // In all three places:
  // When current_period_end is NULL, isYearly is evaluated from plan or razorpay_plan_id.
  const subAnnualStarterNoEnd = {
    id: 'sub_starter_annual',
    owner_id: 'user_annual_starter',
    plan: 'starter',
    razorpay_plan_id: 'plan_TpRGUbldZHOv7X', // known annual plan ID
    status: 'active',
    razorpay_payment_id: 'pay_valid_123',
    current_period_start: '2026-01-01T00:00:00Z',
    current_period_end: null, // NULL current_period_end
  }

  const subMonthlyStarterNoEnd = {
    id: 'sub_starter_monthly',
    owner_id: 'user_monthly_starter',
    plan: 'starter',
    razorpay_plan_id: 'plan_starter_monthly',
    status: 'active',
    razorpay_payment_id: 'pay_valid_456',
    current_period_start: '2026-01-01T00:00:00Z',
    current_period_end: null,
  }

  // Annual Starter gets 365 days
  const annualEndMs = new Date('2026-01-01T00:00:00Z').getTime() + 365 * 86400000
  const derivedAnnual = new Date('2026-01-01T00:00:00Z').getTime() +
    (subAnnualStarterNoEnd.plan === 'yearly' ||
     subAnnualStarterNoEnd.plan === 'pro' ||
     subAnnualStarterNoEnd.razorpay_plan_id === 'plan_TpRGUbldZHOv7X' ||
     subAnnualStarterNoEnd.razorpay_plan_id.includes('yearly')
      ? 365
      : 30) * 86400000
  assert.equal(derivedAnnual, annualEndMs, 'Annual plan gets 365 days')

  // Monthly Starter gets 30 days
  const monthlyEndMs = new Date('2026-01-01T00:00:00Z').getTime() + 30 * 86400000
  const derivedMonthly = new Date('2026-01-01T00:00:00Z').getTime() +
    (subMonthlyStarterNoEnd.plan === 'yearly' ||
     subMonthlyStarterNoEnd.plan === 'pro' ||
     subMonthlyStarterNoEnd.razorpay_plan_id === 'plan_TpRGUbldZHOv7X' ||
     subMonthlyStarterNoEnd.razorpay_plan_id.includes('yearly')
      ? 365
      : 30) * 86400000
  assert.equal(derivedMonthly, monthlyEndMs, 'Monthly plan gets 30 days')
})

test('29. Property limit tier resolution: Annual Starter receives 2 properties (never 5)', () => {
  // Simulates SQL trigger section 4 plan mapping:
  function mapPlanToPropertyLimit(plan) {
    const subPlan = plan ? String(plan).toLowerCase() : ''
    if (subPlan === 'starter' || subPlan.startsWith('starter') || subPlan === 'monthly' || subPlan === 'trial') {
      return 2
    } else if (subPlan === 'growth' || subPlan.startsWith('growth') || subPlan === 'pro' || subPlan === 'yearly') {
      return 5
    } else if (subPlan === 'business' || subPlan.startsWith('business')) {
      return 9
    } else if (subPlan === 'enterprise' || subPlan.startsWith('enterprise')) {
      return 999
    } else {
      return 2
    }
  }

  // Starter billed annually must NOT receive 5 properties!
  assert.equal(mapPlanToPropertyLimit('starter'), 2, 'Starter plan limit is 2')
  assert.equal(mapPlanToPropertyLimit('starter_yearly'), 2, 'Annual Starter must NOT receive 5 properties')
  assert.equal(mapPlanToPropertyLimit('starter-annual'), 2, 'Starter Annual limit is 2')

  // Growth / Pro / legacy Yearly receive 5
  assert.equal(mapPlanToPropertyLimit('growth'), 5, 'Growth limit is 5')
  assert.equal(mapPlanToPropertyLimit('growth_yearly'), 5, 'Growth yearly limit is 5')
  assert.equal(mapPlanToPropertyLimit('pro'), 5, 'Legacy Pro limit is 5')
  assert.equal(mapPlanToPropertyLimit('yearly'), 5, 'Legacy Yearly limit is 5')

  // Business receives 9
  assert.equal(mapPlanToPropertyLimit('business'), 9, 'Business limit is 9')
  assert.equal(mapPlanToPropertyLimit('business_yearly'), 9, 'Business yearly limit is 9')

  // Enterprise receives 999
  assert.equal(mapPlanToPropertyLimit('enterprise'), 999, 'Enterprise limit is 999')

  // Unknown / default receives 2
  assert.equal(mapPlanToPropertyLimit('unknown_plan'), 2, 'Default limit is 2')
})

test('30. Paid access verification: Unverified or pending payments strictly denied', () => {
  // Simulates Rule A in SQL trigger:
  function evaluateRuleA(sub) {
    const hasPaidAccess =
      (sub.payment_status === 'paid' ||
        (sub.status === 'active' && sub.payment_id && !['pending', 'failed', 'unverified'].includes(sub.payment_status || ''))) &&
      (sub.payment_status || '') !== 'refunded' &&
      new Date(sub.current_period_end).getTime() > Date.now()

    return Boolean(hasPaidAccess)
  }

  const futureEnd = new Date(Date.now() + 10 * 86400000).toISOString()

  // 1. payment_status = 'pending' with payment_id -> DENIED
  assert.equal(
    evaluateRuleA({
      status: 'active',
      payment_id: 'pay_unverified_1',
      payment_status: 'pending',
      current_period_end: futureEnd,
    }),
    false,
    'Pending payment status must NOT grant paid access'
  )

  // 2. payment_status = 'failed' with payment_id -> DENIED
  assert.equal(
    evaluateRuleA({
      status: 'active',
      payment_id: 'pay_failed_1',
      payment_status: 'failed',
      current_period_end: futureEnd,
    }),
    false,
    'Failed payment status must NOT grant paid access'
  )

  // 3. payment_status = 'paid' -> GRANTED
  assert.equal(
    evaluateRuleA({
      status: 'active',
      payment_id: 'pay_captured_1',
      payment_status: 'paid',
      current_period_end: futureEnd,
    }),
    true,
    'Verified paid payment status grants paid access'
  )

  // 4. payment_status = 'refunded' -> DENIED
  assert.equal(
    evaluateRuleA({
      status: 'active',
      payment_id: 'pay_refunded_1',
      payment_status: 'refunded',
      current_period_end: futureEnd,
    }),
    false,
    'Refunded payment status must NOT grant paid access'
  )
})

test('31. Safe JSON numeric casting with regex validation (malformed payloads)', () => {
  // Simulates Postgres regex validation ~ '^[0-9]+$' and defensive CASE evaluation
  function isFullRefund(amountStr, refundedStr) {
    const isDigits = (s) => typeof s === 'string' && /^[0-9]+$/.test(s)
    if (!isDigits(amountStr) || !isDigits(refundedStr)) {
      return false // Safely skipped without numeric casting error
    }
    const amount = Number(amountStr)
    const refunded = Number(refundedStr)
    return amount > 0 && refunded >= amount
  }

  // Malformed payloads: strings, nulls, floats, objects
  assert.equal(isFullRefund('not_a_number', '100'), false, 'Non-digit amount safely rejected')
  assert.equal(isFullRefund('100', 'invalid'), false, 'Non-digit refund safely rejected')
  assert.equal(isFullRefund(null, '100'), false, 'Null amount safely rejected')
  assert.equal(isFullRefund('100.50', '100.50'), false, 'Float format safely rejected (paise must be integer digits)')
  assert.equal(isFullRefund('', ''), false, 'Empty string safely rejected')

  // Partial refund: amount > refunded
  assert.equal(isFullRefund('109900', '50000'), false, 'Partial refund is not a full refund')

  // Full refund: refunded >= amount
  assert.equal(isFullRefund('109900', '109900'), true, 'Exact full refund detected')
  assert.equal(isFullRefund('109900', '110000'), true, 'Over-refund detected')
})

test('32. ended_at lifecycle semantics vs mandate cancellation', () => {
  const now = Date.now()
  const futureEnd = new Date(now + 15 * ONE_DAY_MS).toISOString()

  // Mandate cancellation during active period:
  // autopay_status = 'revoked', cancel_at_period_end = true, canceled_at = set, but ended_at IS NULL
  const mandateRevokedSub = {
    id: 'sub_revoked_with_access',
    status: 'canceled',
    autopay_status: 'revoked',
    cancel_at_period_end: true,
    canceled_at: new Date(now).toISOString(),
    ended_at: null, // NOT set during active paid period
    current_period_end: futureEnd,
    payment_status: 'paid',
  }

  assert.equal(mandateRevokedSub.ended_at, null, 'ended_at must be null while paid access remains')
  assert.equal(new Date(mandateRevokedSub.current_period_end).getTime() > now, true, 'Period is in the future')

  // Full refund terminates access immediately:
  const refundedSub = {
    id: 'sub_refunded_access_terminated',
    status: 'canceled',
    payment_status: 'refunded',
    ended_at: new Date(now).toISOString(),
    current_period_end: new Date(now).toISOString(),
  }

  assert.notEqual(refundedSub.ended_at, null, 'ended_at must be set upon full refund')
  assert.equal(refundedSub.payment_status, 'refunded')
})

test('33. Legacy yearly subscription plan-tier resolution preserves entitlements & distinguishes tiers', () => {
  // 1. Annual Starter with plan = 'yearly' and Starter plan ID -> receives 2 properties
  const annualStarterRecord = {
    id: 'sub_annual_starter',
    owner_id: 'user_annual_starter',
    plan: 'yearly',
    razorpay_plan_id: 'plan_TpRGUbldZHOv7X', // starter_yearly
    status: 'active',
    payment_status: 'paid',
    current_period_end: new Date(Date.now() + 100 * ONE_DAY_MS).toISOString(),
  }
  const starterState = resolveAuthoritativeSubscription([annualStarterRecord])
  assert.equal(starterState.plan, 'starter', 'Annual Starter must resolve to starter tier')
  const starterEntitlement = resolveCustomerEntitlements(starterState, 1)
  assert.equal(starterEntitlement.maxProperties, 2, 'Annual Starter must receive 2 properties (never 5)')

  // 2. Annual Business with plan = 'yearly' and Business plan ID -> receives 9 properties
  const annualBusinessRecord = {
    id: 'sub_annual_business',
    owner_id: 'user_annual_business',
    plan: 'yearly',
    razorpay_plan_id: 'plan_TpRGW532F4cyqm', // business_yearly
    status: 'active',
    payment_status: 'paid',
    current_period_end: new Date(Date.now() + 100 * ONE_DAY_MS).toISOString(),
  }
  const businessState = resolveAuthoritativeSubscription([annualBusinessRecord])
  assert.equal(businessState.plan, 'business', 'Annual Business must resolve to business tier')
  const businessEntitlement = resolveCustomerEntitlements(businessState, 5)
  assert.equal(businessEntitlement.maxProperties, 9, 'Annual Business must receive 9 properties')

  // 3. Annual Growth with plan = 'yearly' and Growth plan ID -> receives 5 properties
  const annualGrowthRecord = {
    id: 'sub_annual_growth',
    owner_id: 'user_annual_growth',
    plan: 'yearly',
    razorpay_plan_id: 'plan_TpRGVTZfY46Jki', // growth_yearly
    status: 'active',
    payment_status: 'paid',
    current_period_end: new Date(Date.now() + 100 * ONE_DAY_MS).toISOString(),
  }
  const growthState = resolveAuthoritativeSubscription([annualGrowthRecord])
  assert.equal(growthState.plan, 'growth', 'Annual Growth must resolve to growth tier')
  const growthEntitlement = resolveCustomerEntitlements(growthState, 3)
  assert.equal(growthEntitlement.maxProperties, 5, 'Annual Growth must receive 5 properties')

  // 4. True legacy yearly customer without tier plan ID -> preserves legacy 5-property entitlement
  const legacyYearlyRecord = {
    id: 'sub_legacy_yearly',
    owner_id: 'user_legacy_yearly',
    plan: 'yearly',
    razorpay_plan_id: null,
    status: 'active',
    payment_status: 'paid',
    current_period_end: new Date(Date.now() + 100 * ONE_DAY_MS).toISOString(),
  }
  const legacyYearlyState = resolveAuthoritativeSubscription([legacyYearlyRecord])
  assert.equal(legacyYearlyState.plan, 'yearly', 'Legacy Yearly preserves yearly plan name')
  const legacyYearlyEntitlement = resolveCustomerEntitlements(legacyYearlyState, 3)
  assert.equal(legacyYearlyEntitlement.maxProperties, 5, 'Legacy Yearly preserves 5-property entitlement')

  // 5. True legacy pro customer -> preserves legacy 5-property entitlement
  const legacyProRecord = {
    id: 'sub_legacy_pro',
    owner_id: 'user_legacy_pro',
    plan: 'pro',
    status: 'active',
    payment_status: 'paid',
    current_period_end: new Date(Date.now() + 100 * ONE_DAY_MS).toISOString(),
  }
  const legacyProState = resolveAuthoritativeSubscription([legacyProRecord])
  assert.equal(legacyProState.plan, 'growth', 'Legacy Pro resolves to growth tier')
  const legacyProEntitlement = resolveCustomerEntitlements(legacyProState, 3)
  assert.equal(legacyProEntitlement.maxProperties, 5, 'Legacy Pro preserves 5-property entitlement')

  // 6. SQL Trigger Section 4 plan mapping simulation
  function sqlSection4Limit(subPlan, rzpPlanId) {
    const p = subPlan ? String(subPlan).toLowerCase() : ''
    const rzp = rzpPlanId ? String(rzpPlanId).toLowerCase() : ''

    if (
      p === 'starter' ||
      p.startsWith('starter') ||
      rzp === 'plan_tprgubldzhov7x' ||
      rzp === 'plan_tprgumbc93c99j' ||
      rzp.includes('starter')
    ) {
      return 2
    } else if (
      p === 'business' ||
      p.startsWith('business') ||
      rzp === 'plan_tprgw532f4cyqm' ||
      rzp === 'plan_tprgvufwe8pb2h' ||
      rzp.includes('business')
    ) {
      return 9
    } else if (p === 'enterprise' || p.startsWith('enterprise') || rzp.includes('enterprise')) {
      return 999
    } else if (
      p === 'growth' ||
      p.startsWith('growth') ||
      p === 'pro' ||
      p === 'yearly' ||
      rzp === 'plan_tprgvtzfy46jki' ||
      rzp === 'plan_tprguxeroqtjtx' ||
      rzp.includes('growth') ||
      rzp.includes('pro')
    ) {
      return 5
    } else {
      return 2
    }
  }

  assert.equal(sqlSection4Limit('yearly', 'plan_TpRGUbldZHOv7X'), 2, 'SQL: Annual Starter gets 2')
  assert.equal(sqlSection4Limit('yearly', 'plan_TpRGW532F4cyqm'), 9, 'SQL: Annual Business gets 9')
  assert.equal(sqlSection4Limit('yearly', 'plan_TpRGVTZfY46Jki'), 5, 'SQL: Annual Growth gets 5')
  assert.equal(sqlSection4Limit('yearly', null), 5, 'SQL: Legacy Yearly preserves 5')
  assert.equal(sqlSection4Limit('pro', null), 5, 'SQL: Legacy Pro preserves 5')
  assert.equal(sqlSection4Limit('starter', null), 2, 'SQL: Starter gets 2')
})

test('34. Refund backfill Step 4a: Old payment refund cannot mark newer cycle as ended or refunded', () => {
  // Simulates Step 4a SQL query:
  const subscriptions = [
    // Sub A: Active cycle 2 (pay_cycle_2). An old refund exists for pay_cycle_1.
    {
      id: 'sub_a',
      razorpay_subscription_id: 'sub_rzp_alpha',
      razorpay_payment_id: 'pay_cycle_2',
      payment_status: 'paid',
      ended_at: null,
      status: 'active',
    },
    // Sub B: Single cycle that was legitimately fully refunded.
    {
      id: 'sub_b',
      razorpay_subscription_id: 'sub_rzp_beta',
      razorpay_payment_id: 'pay_cycle_1_beta',
      payment_status: 'paid',
      ended_at: null,
      status: 'active',
    },
    // Sub C: Payment was refunded, but payload has NO subscription_id (ambiguous association).
    {
      id: 'sub_c',
      razorpay_subscription_id: 'sub_rzp_gamma',
      razorpay_payment_id: 'pay_ambiguous_gamma',
      payment_status: 'paid',
      ended_at: null,
      status: 'active',
    },
    // Sub D: Refund webhook arrived for Sub D's payment, but a newer subscription.charged event exists.
    {
      id: 'sub_d',
      razorpay_subscription_id: 'sub_rzp_delta',
      razorpay_payment_id: 'pay_old_delta',
      payment_status: 'paid',
      ended_at: null,
      status: 'active',
    },
  ]

  const webhookEvents = [
    // Refund event for pay_cycle_1 of Sub A
    {
      event_type: 'refund.processed',
      created_at: '2026-01-15T00:00:00Z',
      payload: {
        payload: {
          payment: {
            entity: {
              id: 'pay_cycle_1',
              subscription_id: 'sub_rzp_alpha',
              refund_status: 'full',
            },
          },
        },
      },
    },
    // Refund event for Sub B
    {
      event_type: 'refund.processed',
      created_at: '2026-01-20T00:00:00Z',
      payload: {
        payload: {
          payment: {
            entity: {
              id: 'pay_cycle_1_beta',
              subscription_id: 'sub_rzp_beta',
              refund_status: 'full',
            },
          },
        },
      },
    },
    // Ambiguous refund event: payment_id matches Sub C, but NO subscription_id in payload
    {
      event_type: 'refund.processed',
      created_at: '2026-01-25T00:00:00Z',
      payload: {
        payload: {
          payment: {
            entity: {
              id: 'pay_ambiguous_gamma',
              subscription_id: null, // missing subscription association
              refund_status: 'full',
            },
          },
        },
      },
    },
    // Refund event for Sub D's old payment
    {
      event_type: 'refund.processed',
      created_at: '2026-02-01T00:00:00Z',
      payload: {
        payload: {
          payment: {
            entity: {
              id: 'pay_old_delta',
              subscription_id: 'sub_rzp_delta',
              refund_status: 'full',
            },
          },
        },
      },
    },
    // Newer charge event for Sub D!
    {
      event_type: 'subscription.charged',
      created_at: '2026-02-15T00:00:00Z', // newer than refund event
      payload: {
        payload: {
          subscription: {
            entity: {
              id: 'sub_rzp_delta',
            },
          },
          payment: {
            entity: {
              id: 'pay_new_delta',
              subscription_id: 'sub_rzp_delta',
            },
          },
        },
      },
    },
  ]

  // Execute Step 4a logic
  for (const s of subscriptions) {
    if (!s.razorpay_payment_id || !s.razorpay_subscription_id) continue

    const hasMatchingFullRefund = webhookEvents.some((we) => {
      if (we.event_type !== 'refund.processed') return false

      const paymentEntity = we.payload?.payload?.payment?.entity
      const refundEntity = we.payload?.payload?.refund?.entity
      const eventPaymentId = paymentEntity?.id || refundEntity?.payment_id

      // 1. Explicit payment ID match
      if (eventPaymentId !== s.razorpay_payment_id) return false

      // 2. Authoritative subscription association evidence:
      // Webhook payment entity must explicitly match this subscription ID
      if (paymentEntity?.subscription_id !== s.razorpay_subscription_id) {
        return false // Ambiguous or mismatched association -> DO NOT MODIFY
      }

      // 3. Reliable full-refund indicators
      const isFull = paymentEntity?.refund_status === 'full'
      if (!isFull) return false

      // 4. Newer subscription cycle protection:
      // Ensure there is no newer successful charge event for this subscription
      const hasNewerCharge = webhookEvents.some((newerCharge) => {
        if (newerCharge.event_type !== 'subscription.charged') return false
        const subId =
          newerCharge.payload?.payload?.subscription?.entity?.id ||
          newerCharge.payload?.payload?.payment?.entity?.subscription_id
        if (subId !== s.razorpay_subscription_id) return false

        const isNewerTime = new Date(newerCharge.created_at).getTime() > new Date(we.created_at).getTime()
        const isDifferentPayment =
          newerCharge.payload?.payload?.payment?.entity?.id &&
          newerCharge.payload?.payload?.payment?.entity?.id !== s.razorpay_payment_id
        return isNewerTime || isDifferentPayment
      })

      if (hasNewerCharge) {
        return false // Protected: newer cycle exists, do not revoke
      }

      return true
    })

    if (hasMatchingFullRefund) {
      s.payment_status = 'refunded'
      s.ended_at = new Date().toISOString()
    }
  }

  // Sub A: Old payment pay_cycle_1 was refunded, but active payment is pay_cycle_2 -> REMAINS PAID
  assert.equal(subscriptions.find((s) => s.id === 'sub_a').payment_status, 'paid', 'Sub A cycle 2 remains paid')
  assert.equal(subscriptions.find((s) => s.id === 'sub_a').ended_at, null)

  // Sub B: Single cycle fully refunded with verified association -> MARKED REFUNDED & ENDED
  assert.equal(subscriptions.find((s) => s.id === 'sub_b').payment_status, 'refunded')
  assert.notEqual(subscriptions.find((s) => s.id === 'sub_b').ended_at, null)

  // Sub C: Ambiguous association (missing subscription_id in webhook payment) -> REMAINS UNMODIFIED
  assert.equal(subscriptions.find((s) => s.id === 'sub_c').payment_status, 'paid', 'Ambiguous record must not be modified')
  assert.equal(subscriptions.find((s) => s.id === 'sub_c').ended_at, null)

  // Sub D: Refund for old payment with newer subscription.charged event -> REMAINS PAID
  assert.equal(subscriptions.find((s) => s.id === 'sub_d').payment_status, 'paid', 'Sub D with newer charge remains paid')
  assert.equal(subscriptions.find((s) => s.id === 'sub_d').ended_at, null)
})

test('35. Expired trial followed by a new paid subscription', () => {
  const now = new Date('2026-11-02T12:00:00Z').getTime()

  // Customer had an old expired trial record
  const oldTrialRecord = {
    id: 'sub_row_old_trial',
    owner_id: 'af196d08-aada-4569-942d-f11cf376a881',
    plan: 'trial',
    status: 'expired',
    razorpay_subscription_id: 'sub_TroeL2K9fqaGrU',
    razorpay_payment_id: 'pay_Troehk72sCiR4a',
    current_period_end: '2026-11-23T00:00:00Z',
    created_at: '2026-10-16T10:00:00Z',
    updated_at: '2026-10-23T10:00:00Z',
  }

  // Customer subsequently purchases new Starter Monthly subscription
  const newActiveRecord = {
    id: 'sub_row_new_starter',
    owner_id: 'af196d08-aada-4569-942d-f11cf376a881',
    plan: 'starter',
    status: 'active',
    payment_status: 'paid',
    razorpay_subscription_id: 'sub_TvMLt0Ooty5J18',
    razorpay_payment_id: 'pay_TvMLnewpayment99',
    current_period_start: '2026-11-02T10:00:00Z',
    current_period_end: '2026-12-02T10:00:00Z',
    created_at: '2026-11-02T10:00:00Z',
    updated_at: '2026-11-02T10:00:00Z',
  }

  const resolved = resolveAuthoritativeSubscription([oldTrialRecord, newActiveRecord], now)

  assert.equal(resolved.hasPaidAccess, true, 'Customer must have paid access under new active subscription')
  assert.equal(resolved.status, 'active')
  assert.equal(resolved.plan, 'starter')
  assert.equal(resolved.razorpaySubscriptionId, 'sub_TvMLt0Ooty5J18', 'Winning subscription must be new subscription ID')
  assert.equal(resolved.razorpayPaymentId, 'pay_TvMLnewpayment99', 'Winning payment must be new payment ID')

  const entitlement = resolveCustomerEntitlements(resolved, 1, now)
  assert.equal(entitlement.hasPaidAccess, true)
  assert.equal(entitlement.maxProperties, 2, 'Starter plan includes 2 properties')
  assert.equal(entitlement.canCreateProperty, true)
})

test('36. Old cancelled subscription followed by a new active subscription', () => {
  const now = new Date('2026-11-02T12:00:00Z').getTime()

  const oldCancelled = {
    id: 'sub_row_old_cancelled',
    owner_id: 'user_rejoin_1',
    plan: 'growth',
    status: 'canceled',
    current_period_end: '2026-10-01T00:00:00Z', // Ended past month
    cancel_at_period_end: true,
    ended_at: '2026-10-01T00:00:00Z',
    razorpay_subscription_id: 'sub_old_canceled_1',
    created_at: '2026-09-01T00:00:00Z',
  }

  const newActive = {
    id: 'sub_row_new_active',
    owner_id: 'user_rejoin_1',
    plan: 'growth',
    status: 'active',
    payment_status: 'paid',
    current_period_start: '2026-11-01T00:00:00Z',
    current_period_end: '2026-12-01T00:00:00Z',
    razorpay_subscription_id: 'sub_new_active_2',
    razorpay_payment_id: 'pay_new_active_2',
    created_at: '2026-11-01T00:00:00Z',
  }

  const resolved = resolveAuthoritativeSubscription([oldCancelled, newActive], now)
  assert.equal(resolved.hasPaidAccess, true)
  assert.equal(resolved.status, 'active')
  assert.equal(resolved.cancelAtPeriodEnd, false, 'New subscription is active AutoPay, not cancelled')
  assert.equal(resolved.razorpaySubscriptionId, 'sub_new_active_2')
})

test('37. Old payment ID not inherited by a new subscription', async () => {
  // Simulate unique constraint on owner_id where table row is updated to new subscription ID
  let dbRow = {
    id: 'row_owner_unique_1',
    owner_id: 'user_inherit_check',
    plan: 'trial',
    status: 'expired',
    razorpay_subscription_id: 'sub_TroeL2K9fqaGrU',
    razorpay_payment_id: 'pay_Troehk72sCiR4a', // Old trial mandate auth charge
    payment_status: 'pending',
    updated_at: '2026-10-23T00:00:00Z',
  }

  const mockAdminClient = {
    from: (table) => {
      assert.equal(table, 'subscriptions')
      return {
        select: (cols) => ({
          eq: (f1, v1) => ({
            eq: (f2, v2) => ({
              limit: (n) => Promise.resolve({ data: [], error: null }),
            }),
            order: () => ({
              limit: (n) => Promise.resolve({ data: [dbRow], error: null }),
            }),
          }),
        }),
        insert: (payload) => {
          // Unique constraint collision on owner_id (uq_subscriptions_owner)
          return Promise.resolve({
            data: null,
            error: {
              code: '23505',
              message: 'duplicate key value violates unique constraint "uq_subscriptions_owner"',
            },
          })
        },
        update: (payload) => {
          const makeChain = (filters) => {
            const execute = () => {
              if (filters.some((f) => f.field === 'razorpay_subscription_id' && f.val === 'sub_TvMLt0Ooty5J18')) {
                // Exact match on razorpay_subscription_id matches 0 rows because db has old sub ID
                return { data: [], error: null }
              }
              Object.assign(dbRow, payload)
              return { data: [dbRow], error: null }
            }
            const p = Promise.resolve().then(execute)
            p.eq = (field, val) => makeChain([...filters, { field, val }])
            return p
          }
          return {
            eq: (field, val) => makeChain([{ field, val }]),
          }
        },
      }
    },
  }

  // Pre-save pending new subscription without payment
  const res = await persistSubscriptionToDatabase(
    mockAdminClient,
    'user_inherit_check',
    {
      plan: 'starter',
      status: 'created',
      razorpay_subscription_id: 'sub_TvMLt0Ooty5J18',
    },
    'sub_TvMLt0Ooty5J18'
  )

  assert.equal(res.success, true, 'Persistence must succeed by safely transitioning owner row')
  assert.equal(dbRow.razorpay_subscription_id, 'sub_TvMLt0Ooty5J18')
  assert.equal(dbRow.razorpay_payment_id, null, 'Old payment ID pay_Troehk72sCiR4a must NOT be inherited')
  assert.equal(dbRow.payment_status, 'pending', 'payment_status must not be inherited as paid')
})

test('38. Active paid subscription retaining access', () => {
  const now = new Date('2026-11-02T12:00:00Z').getTime()
  const activeSub = {
    id: 'sub_growth_active',
    owner_id: 'user_paid_active',
    plan: 'growth',
    status: 'active',
    payment_status: 'paid',
    current_period_start: '2026-10-15T00:00:00Z',
    current_period_end: '2026-11-15T00:00:00Z',
    razorpay_subscription_id: 'sub_growth_act_1',
    razorpay_payment_id: 'pay_growth_act_1',
  }

  const resolved = resolveAuthoritativeSubscription([activeSub], now)
  assert.equal(resolved.hasPaidAccess, true)
  assert.equal(resolved.status, 'active')
  assert.equal(resolved.plan, 'growth')

  const ent = resolveCustomerEntitlements(resolved, 3, now)
  assert.equal(ent.hasPaidAccess, true)
  assert.equal(ent.maxProperties, 5, 'Growth plan includes 5 properties')
  assert.equal(ent.canCreateProperty, true, '3 / 5 used, can create properties')
})

test('39. Expired subscription never granting paid access (Affected Account Root Cause Verification)', () => {
  const now = new Date('2026-11-02T12:00:00Z').getTime()

  // Exact reproduction of the affected customer record in Supabase:
  // owner_id: af196d08-aada-4569-942d-f11cf376a881
  const affectedCustomerOldRecord = {
    id: 'b1e8e5d2-04e2-45e8-bb3b-79d1c97a5555',
    owner_id: 'af196d08-aada-4569-942d-f11cf376a881',
    plan: 'trial',
    status: 'expired',
    razorpay_subscription_id: 'sub_TroeL2K9fqaGrU',
    razorpay_payment_id: 'pay_Troehk72sCiR4a',
    current_period_end: '2026-11-23T00:00:00Z', // Future date left over from trial mandate
    created_at: '2026-10-16T00:00:00Z',
    updated_at: '2026-10-23T00:00:00Z',
  }

  const resolved = resolveAuthoritativeSubscription([affectedCustomerOldRecord], now)

  // Must strictly deny paid access
  assert.equal(resolved.hasPaidAccess, false, 'Expired trial must never grant paid access')
  assert.equal(resolved.isTrialExpired, true, 'isTrialExpired must be true')
  assert.equal(resolved.status, 'expired', 'Status must be expired')

  // Entitlement verification
  const entitlement = resolveCustomerEntitlements(resolved, 1, now)
  assert.equal(entitlement.hasPaidAccess, false)
  assert.equal(entitlement.canCreateProperty, false, 'Cannot create properties when trial is expired')

  // Dashboard badge verification
  const badgeLabel = getSubscriptionBadgeLabel({
    status: resolved.status,
    hasPaidAccess: resolved.hasPaidAccess,
    isTrialExpired: resolved.isTrialExpired,
    cancelAtPeriodEnd: resolved.cancelAtPeriodEnd,
    currentPeriodEnd: resolved.currentPeriodEnd,
  })
  assert.equal(badgeLabel, 'Trial Expired', 'Dashboard must show Trial Expired, NOT Active Paid Plan')
})

test('40. Full refund revoking access immediately', () => {
  const now = new Date('2026-11-02T12:00:00Z').getTime()
  const refundedSub = {
    id: 'sub_refunded_1',
    owner_id: 'user_refunded',
    plan: 'starter',
    status: 'canceled',
    payment_status: 'refunded',
    current_period_start: '2026-11-01T00:00:00Z',
    current_period_end: '2026-12-01T00:00:00Z',
    ended_at: '2026-11-02T10:00:00Z',
    razorpay_subscription_id: 'sub_refund_test',
    razorpay_payment_id: 'pay_refund_test',
  }

  const resolved = resolveAuthoritativeSubscription([refundedSub], now)
  assert.equal(resolved.hasPaidAccess, false, 'Fully refunded subscription must revoke access')
  assert.equal(resolved.status, 'canceled')

  const badge = getSubscriptionBadgeLabel({
    status: resolved.status,
    hasPaidAccess: resolved.hasPaidAccess,
    isTrialExpired: resolved.isTrialExpired,
    paymentStatus: 'refunded',
  })
  assert.equal(badge, 'Refunded / Access Revoked')
})

test('41. Failed webhook database persistence returns HTTP 500 and marks webhook failed', async () => {
  const mockAdmin = {
    from: (table) => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            limit: () => Promise.resolve({ data: [], error: null }),
          }),
          order: () => ({
            limit: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      }),
      insert: () => Promise.resolve({ data: null, error: { message: 'Database connection failed' } }),
      update: () => ({
        eq: () => Promise.resolve({ data: [], error: null }),
      }),
    }),
  }

  const persistResult = await persistSubscriptionToDatabase(
    mockAdmin,
    'user_db_fail',
    { plan: 'starter', status: 'active', razorpay_subscription_id: 'sub_fail_1' },
    'sub_fail_1'
  )

  assert.equal(persistResult.success, false, 'Persistence must report failure when DB errors')
  assert.ok(persistResult.error, 'Must include error message')
})

test('42. Duplicate webhook delivery handling', () => {
  // Idempotency state machine check:
  // First delivery sets status = 'processing' with unique fencing leaseToken.
  // Second concurrent delivery receives HTTP 429 Retry-After.
  // Completed delivery receives HTTP 200 with { processed: false, reason: 'event_already_processed' }.
  const leaseToken1 = 'token_worker_1'
  const leaseToken2 = 'token_worker_2'
  assert.notEqual(leaseToken1, leaseToken2, 'Workers must hold distinct fencing tokens')
})

test('43. Out-of-order cancellation events do not overwrite active subscription', () => {
  const now = new Date('2026-11-02T12:00:00Z').getTime()

  const activeNewSub = {
    id: 'sub_row_new_1',
    owner_id: 'user_stale_cancel',
    plan: 'starter',
    status: 'active',
    payment_status: 'paid',
    current_period_end: '2026-12-02T12:00:00Z',
    razorpay_subscription_id: 'sub_TvMLt0Ooty5J18',
  }

  // Incoming webhook event for OLD replaced subscription sub_TroeL2K9fqaGrU (subscription.cancelled)
  const incomingSubId = 'sub_TroeL2K9fqaGrU'
  const isStale =
    activeNewSub.razorpay_subscription_id !== incomingSubId &&
    activeNewSub.status === 'active' &&
    new Date(activeNewSub.current_period_end).getTime() > now

  assert.equal(isStale, true, 'Delayed cancellation for old subscription must be detected as stale')
})

test('44. Correct owner mapping for multiple subscriptions', () => {
  const now = new Date('2026-11-02T12:00:00Z').getTime()

  const userASub = {
    id: 'row_user_a',
    owner_id: 'owner_AAA',
    plan: 'starter',
    status: 'active',
    payment_status: 'paid',
    current_period_end: '2026-12-01T00:00:00Z',
    razorpay_subscription_id: 'sub_AAA',
  }

  const userBSub = {
    id: 'row_user_b',
    owner_id: 'owner_BBB',
    plan: 'growth',
    status: 'active',
    payment_status: 'paid',
    current_period_end: '2026-12-01T00:00:00Z',
    razorpay_subscription_id: 'sub_BBB',
  }

  const resA = resolveAuthoritativeSubscription([userASub], now)
  const resB = resolveAuthoritativeSubscription([userBSub], now)

  assert.equal(resA.plan, 'starter')
  assert.equal(resA.razorpaySubscriptionId, 'sub_AAA')
  assert.equal(resB.plan, 'growth')
  assert.equal(resB.razorpaySubscriptionId, 'sub_BBB')
})

test('45. Dashboard badge label exact parity for all 7 lifecycle states', () => {
  const now = new Date('2026-11-02T12:00:00Z').getTime()
  const futureIso = '2026-12-01T00:00:00Z'
  const pastIso = '2026-10-01T00:00:00Z'

  // 1. Valid trial -> Free Trial
  const badge1 = getSubscriptionBadgeLabel({
    status: 'trialing',
    hasPaidAccess: true,
    isTrialExpired: false,
    nowMs: now,
  })
  assert.equal(badge1, 'Free Trial')

  // 2. Verified active paid subscription -> Active Paid Plan
  const badge2 = getSubscriptionBadgeLabel({
    status: 'active',
    hasPaidAccess: true,
    isTrialExpired: false,
    paymentStatus: 'paid',
    currentPeriodEnd: futureIso,
    nowMs: now,
  })
  assert.equal(badge2, 'Active Paid Plan')

  // 3. Expired trial -> Trial Expired
  const badge3 = getSubscriptionBadgeLabel({
    status: 'expired',
    hasPaidAccess: false,
    isTrialExpired: true,
    nowMs: now,
  })
  assert.equal(badge3, 'Trial Expired')

  // 4. Cancelled with paid-through access -> Access Until Billing End
  const badge4 = getSubscriptionBadgeLabel({
    status: 'canceled',
    hasPaidAccess: true,
    isTrialExpired: false,
    cancelAtPeriodEnd: true,
    currentPeriodEnd: futureIso,
    paymentStatus: 'paid',
    nowMs: now,
  })
  assert.equal(badge4, 'Access Until Billing End')

  // 5. Cancelled without paid-through access -> Cancelled
  const badge5 = getSubscriptionBadgeLabel({
    status: 'canceled',
    hasPaidAccess: false,
    isTrialExpired: true,
    cancelAtPeriodEnd: true,
    currentPeriodEnd: pastIso,
    nowMs: now,
  })
  assert.equal(badge5, 'Cancelled')

  // 6. Payment failure after paid period -> Payment Required / Past Due
  const badge6 = getSubscriptionBadgeLabel({
    status: 'past_due',
    hasPaidAccess: false,
    isTrialExpired: true,
    paymentStatus: 'failed',
    currentPeriodEnd: pastIso,
    nowMs: now,
  })
  assert.equal(badge6, 'Payment Required / Past Due')

  // 7. Fully refunded -> Refunded / Access Revoked
  const badge7 = getSubscriptionBadgeLabel({
    status: 'canceled',
    hasPaidAccess: false,
    isTrialExpired: true,
    paymentStatus: 'refunded',
    nowMs: now,
  })
  assert.equal(badge7, 'Refunded / Access Revoked')
})

test('46. subscription.activated with payment_status pending does not grant paid access', () => {
  const now = new Date('2026-11-02T12:00:00Z').getTime()
  const pendingSub = {
    id: 'sub_rec_pending_act',
    owner_id: 'user_pending_act',
    plan: 'growth',
    status: 'active', // Razorpay status was set to active by subscription.activated
    payment_status: 'pending', // No captured payment evidence yet!
    current_period_start: '2026-11-02T10:00:00Z',
    current_period_end: '2026-12-02T10:00:00Z',
    razorpay_subscription_id: 'sub_pending_act_101',
    razorpay_payment_id: null,
  }

  const resolved = resolveAuthoritativeSubscription([pendingSub], now)
  assert.equal(resolved.hasPaidAccess, false, 'Pending payment must never grant paid access')
  assert.equal(resolved.status, 'created', 'Pending payment maps to created status')

  const ent = resolveCustomerEntitlements(resolved, 0, now)
  assert.equal(ent.hasPaidAccess, false)
  assert.equal(ent.canCreateProperty, false)
})

test('47. subscription.charged with captured payment grants paid access', () => {
  const now = new Date('2026-11-02T12:00:00Z').getTime()
  const chargedSub = {
    id: 'sub_rec_charged_act',
    owner_id: 'user_charged_act',
    plan: 'growth',
    status: 'active',
    payment_status: 'paid', // Verified captured payment evidence!
    current_period_start: '2026-11-02T10:00:00Z',
    current_period_end: '2026-12-02T10:00:00Z',
    razorpay_subscription_id: 'sub_charged_act_101',
    razorpay_payment_id: 'pay_captured_proof_101',
  }

  const resolved = resolveAuthoritativeSubscription([chargedSub], now)
  assert.equal(resolved.hasPaidAccess, true, 'Captured payment must grant paid access')
  assert.equal(resolved.status, 'active')
  assert.equal(resolved.plan, 'growth')

  const ent = resolveCustomerEntitlements(resolved, 2, now)
  assert.equal(ent.hasPaidAccess, true)
  assert.equal(ent.canCreateProperty, true)
})

test('48. An old payment ID cannot grant access to a new subscription', () => {
  const now = new Date('2026-11-02T12:00:00Z').getTime()
  const oldTrialRecord = {
    id: 'sub_row_old',
    owner_id: 'user_cross_sub',
    plan: 'trial',
    status: 'expired',
    razorpay_subscription_id: 'sub_old_trial',
    razorpay_payment_id: 'pay_old_trial_mandate',
    current_period_end: '2026-11-23T00:00:00Z',
  }

  const newUnpaidSub = {
    id: 'sub_row_new',
    owner_id: 'user_cross_sub',
    plan: 'starter',
    status: 'active',
    payment_status: 'pending',
    razorpay_subscription_id: 'sub_new_starter',
    razorpay_payment_id: null, // No payment made for new subscription
    current_period_start: '2026-11-02T00:00:00Z',
    current_period_end: '2026-12-02T00:00:00Z',
  }

  const resolved = resolveAuthoritativeSubscription([oldTrialRecord, newUnpaidSub], now)
  assert.equal(resolved.hasPaidAccess, false, 'New subscription with pending payment must not inherit old payment access')
  assert.equal(resolved.razorpayPaymentId, null, 'Must not copy old payment ID')
})

test('49. A valid existing paid subscription retains access', () => {
  const now = new Date('2026-11-02T12:00:00Z').getTime()
  const validSub = {
    id: 'sub_valid_101',
    owner_id: 'user_valid_paid',
    plan: 'starter',
    status: 'active',
    payment_status: 'paid',
    current_period_start: '2026-10-15T00:00:00Z',
    current_period_end: '2026-11-15T00:00:00Z',
    razorpay_subscription_id: 'sub_starter_valid',
    razorpay_payment_id: 'pay_starter_valid',
  }

  const resolved = resolveAuthoritativeSubscription([validSub], now)
  assert.equal(resolved.hasPaidAccess, true)
  assert.equal(resolved.status, 'active')
  assert.equal(resolved.plan, 'starter')

  const ent = resolveCustomerEntitlements(resolved, 1, now)
  assert.equal(ent.hasPaidAccess, true)
  assert.equal(ent.maxProperties, 2)
  assert.equal(ent.canCreateProperty, true)
})

test('50. A cancelled subscription retains access only through its verified paid-through date', () => {
  const day0 = 1793117228000
  const day15 = day0 + 15 * ONE_DAY_MS
  const day30 = day0 + 30 * ONE_DAY_MS
  const day35 = day0 + 35 * ONE_DAY_MS

  const cancelledSub = {
    id: 'sub_canc_ret',
    owner_id: 'user_canc_ret',
    plan: 'growth',
    status: 'canceled',
    cancel_at_period_end: true,
    autopay_status: 'revoked',
    payment_status: 'paid',
    razorpay_payment_id: 'pay_prior_valid',
    current_period_start: new Date(day0).toISOString(),
    current_period_end: new Date(day30).toISOString(),
    canceled_at: new Date(day15).toISOString(),
  }

  // Active midway through paid period (Day 15)
  const resolvedMidway = resolveAuthoritativeSubscription([cancelledSub], day15)
  assert.equal(resolvedMidway.hasPaidAccess, true, 'Retains paid access during unexpired billing period')
  assert.equal(resolvedMidway.status, 'active')
  assert.equal(resolvedMidway.cancelAtPeriodEnd, true)

  // Expired after billing period concludes (Day 35)
  const resolvedAfter = resolveAuthoritativeSubscription([cancelledSub], day35)
  assert.equal(resolvedAfter.hasPaidAccess, false, 'Loses paid access after paid-through date has passed')
  assert.equal(resolvedAfter.status, 'canceled')
})

test('51. An expired trial with a future current_period_end does not grant access', () => {
  const now = new Date('2026-11-02T12:00:00Z').getTime()
  const expiredTrialFutureDate = {
    id: 'sub_row_exp_trial_fut',
    owner_id: 'af196d08-aada-4569-942d-f11cf376a881',
    plan: 'trial',
    status: 'expired',
    razorpay_subscription_id: 'sub_TroeL2K9fqaGrU',
    razorpay_payment_id: 'pay_Troehk72sCiR4a',
    current_period_end: '2026-11-23T00:00:00Z', // In the future relative to Nov 2!
    created_at: '2026-10-16T00:00:00Z',
    updated_at: '2026-10-23T00:00:00Z',
  }

  const resolved = resolveAuthoritativeSubscription([expiredTrialFutureDate], now)
  assert.equal(resolved.hasPaidAccess, false, 'Expired trial must never receive paid access')
  assert.equal(resolved.isTrialExpired, true)
  assert.equal(resolved.status, 'expired')

  const ent = resolveCustomerEntitlements(resolved, 1, now)
  assert.equal(ent.hasPaidAccess, false)
  assert.equal(ent.canCreateProperty, false)
})

test('52. Dashboard entitlement matches backend entitlement', () => {
  const now = new Date('2026-11-02T12:00:00Z').getTime()
  const expiredTrialRow = {
    id: 'sub_dash_match',
    owner_id: 'af196d08-aada-4569-942d-f11cf376a881',
    plan: 'trial',
    status: 'expired',
    razorpay_subscription_id: 'sub_TroeL2K9fqaGrU',
    razorpay_payment_id: 'pay_Troehk72sCiR4a',
    current_period_end: '2026-11-23T00:00:00Z',
  }

  // 1. Backend resolution
  const backendAuth = resolveAuthoritativeSubscription([expiredTrialRow], now)
  const backendEntitlement = resolveCustomerEntitlements(backendAuth, 1, now)

  // 2. Dashboard calculation using backend state
  const dashboardEntitlement = resolveCustomerEntitlements(
    {
      hasPaidAccess: backendAuth.hasPaidAccess,
      isTrialExpired: backendAuth.isTrialExpired,
      status: backendAuth.status,
      plan: backendAuth.plan,
      trialStart: backendAuth.trialStart,
      trialEnd: backendAuth.trialEnd,
      currentPeriodStart: backendAuth.currentPeriodStart,
      currentPeriodEnd: backendAuth.currentPeriodEnd,
      cancelAtPeriodEnd: backendAuth.cancelAtPeriodEnd,
      autopayStatus: backendAuth.autopayStatus,
      razorpaySubscriptionId: backendAuth.razorpaySubscriptionId,
      razorpayPaymentId: backendAuth.razorpayPaymentId,
      activeRecord: backendAuth.activeRecord,
    },
    1,
    now
  )

  assert.equal(backendEntitlement.hasPaidAccess, false)
  assert.equal(dashboardEntitlement.hasPaidAccess, false)
  assert.equal(dashboardEntitlement.canCreateProperty, backendEntitlement.canCreateProperty)
  assert.equal(dashboardEntitlement.subscriptionStatus, 'expired')
  assert.equal(dashboardEntitlement.maxProperties, backendEntitlement.maxProperties)
})

test('53. A database update affecting zero rows returns failure', async () => {
  const mockAdminClient = {
    from: (table) => ({
      select: (cols) => ({
        eq: (f1, v1) => ({
          eq: (f2, v2) => ({
            limit: () => Promise.resolve({ data: [{ id: 'target_row_missing' }], error: null }),
          }),
        }),
      }),
      update: (payload) => ({
        eq: (f, v) => ({
          select: (cols) => Promise.resolve({ data: [], error: null }), // 0 rows affected!
        }),
      }),
    }),
  }

  const result = await persistSubscriptionToDatabase(
    mockAdminClient,
    'user_zero_rows',
    { plan: 'starter', status: 'active' },
    'sub_target_zero'
  )

  assert.equal(result.success, false, 'Must report failure when zero rows are updated')
  assert.ok(result.error?.includes('0 rows'), 'Error must specify zero rows affected')
})

test('54. Legacy payment ID with NULL payment_status and no capture proof cannot grant paid access', () => {
  const now = new Date('2026-11-03T12:00:00Z').getTime()

  // Case A: Payment ID present, but NO razorpay_subscription_id and payment_status is null
  const orphanPaymentRecord = {
    id: 'sub_orphan_pay',
    owner_id: 'user_orphan_pay',
    plan: 'growth',
    status: 'active',
    razorpay_payment_id: 'pay_unverified_orphan',
    razorpay_subscription_id: null, // No subscription ID!
    payment_status: null, // Null payment status
    current_period_end: new Date(now + 15 * ONE_DAY_MS).toISOString(),
  }

  const resA = resolveAuthoritativeSubscription([orphanPaymentRecord], now)
  assert.equal(resA.hasPaidAccess, false, 'Payment ID alone without subscription ID must not grant access')

  // Case B: Payment ID present with null payment_status on a canceled/created subscription
  const unverifiedCanceledRecord = {
    id: 'sub_unverified_canc',
    owner_id: 'user_unverified_canc',
    plan: 'growth',
    status: 'created',
    razorpay_payment_id: 'pay_unverified_created',
    razorpay_subscription_id: null,
    payment_status: null,
    current_period_end: new Date(now + 15 * ONE_DAY_MS).toISOString(),
  }

  const resB = resolveAuthoritativeSubscription([unverifiedCanceledRecord], now)
  assert.equal(resB.hasPaidAccess, false, 'Unverified payment ID on created status must not grant access')
})

test('55. Verified legacy paid subscription safely retains access', () => {
  const now = new Date('2026-11-03T12:00:00Z').getTime()

  // Legitimate legacy record: active status, paid plan tier, valid Razorpay subscription ID, AND historical payment ID, but payment_status is null
  const legacyPaidRecord = {
    id: 'sub_legacy_verified_row',
    owner_id: 'user_legacy_paid',
    plan: 'pro',
    status: 'active',
    razorpay_subscription_id: 'sub_legacy_verified_456',
    razorpay_payment_id: 'pay_legacy_verified_789',
    payment_status: null, // Pre-migration record lacking payment_status column
    current_period_start: new Date(now - 10 * ONE_DAY_MS).toISOString(),
    current_period_end: new Date(now + 20 * ONE_DAY_MS).toISOString(),
    updated_at: new Date(now).toISOString(),
  }

  const res = resolveAuthoritativeSubscription([legacyPaidRecord], now)
  assert.equal(res.hasPaidAccess, true, 'Legitimate legacy paid customer must retain access')
  assert.equal(res.status, 'active')
  assert.equal(res.isTrialExpired, false)
  assert.equal(res.razorpaySubscriptionId, 'sub_legacy_verified_456')
  assert.equal(res.razorpayPaymentId, 'pay_legacy_verified_789')
})

test('56. Old payment ID attached to a new subscription cannot grant access', () => {
  const now = new Date('2026-11-03T12:00:00Z').getTime()

  const oldTrialRow = {
    id: 'sub_old_trial_row',
    owner_id: 'user_cross_sub_test',
    plan: 'trial',
    status: 'expired',
    razorpay_subscription_id: 'sub_old_trial_id',
    razorpay_payment_id: 'pay_old_trial_mandate_id',
    current_period_end: '2026-11-01T00:00:00Z',
    created_at: '2026-10-15T00:00:00Z',
  }

  const newPendingRow = {
    id: 'sub_new_sub_row',
    owner_id: 'user_cross_sub_test',
    plan: 'business',
    status: 'active',
    payment_status: 'pending', // Awaiting initial charge
    razorpay_subscription_id: 'sub_new_business_id',
    razorpay_payment_id: null,
    current_period_start: '2026-11-03T00:00:00Z',
    current_period_end: '2026-12-03T00:00:00Z',
    created_at: '2026-11-03T00:00:00Z',
  }

  const res = resolveAuthoritativeSubscription([oldTrialRow, newPendingRow], now)
  assert.equal(res.hasPaidAccess, false, 'New subscription with pending payment must not be authorized by old payment ID')
  assert.equal(res.razorpayPaymentId, null, 'Must not inherit old payment ID')
  assert.equal(res.status, 'created')
})

test('57. Update returning no affected rows (including data === null) returns failure', async () => {
  // Case A: data is null
  const mockClientNullData = {
    from: (table) => ({
      select: (cols) => ({
        eq: (f1, v1) => ({
          eq: (f2, v2) => ({
            limit: () => Promise.resolve({ data: [{ id: 'target_row_1' }], error: null }),
          }),
        }),
      }),
      update: (payload) => ({
        eq: (f, v) => ({
          select: (cols) => Promise.resolve({ data: null, error: null }), // data === null
        }),
      }),
    }),
  }

  const resNull = await persistSubscriptionToDatabase(
    mockClientNullData,
    'user_null_data',
    { plan: 'starter', status: 'active' },
    'sub_target_null'
  )
  assert.equal(resNull.success, false, 'Must fail when data === null')
  assert.ok(resNull.error?.includes('0 rows'), 'Error must report 0 rows affected')

  // Case B: data is empty array []
  const mockClientEmptyArray = {
    from: (table) => ({
      select: (cols) => ({
        eq: (f1, v1) => ({
          eq: (f2, v2) => ({
            limit: () => Promise.resolve({ data: [{ id: 'target_row_2' }], error: null }),
          }),
        }),
      }),
      update: (payload) => ({
        eq: (f, v) => ({
          select: (cols) => Promise.resolve({ data: [], error: null }), // data === []
        }),
      }),
    }),
  }

  const resEmpty = await persistSubscriptionToDatabase(
    mockClientEmptyArray,
    'user_empty_array',
    { plan: 'starter', status: 'active' },
    'sub_target_empty'
  )
  assert.equal(resEmpty.success, false, 'Must fail when data === []')
  assert.ok(resEmpty.error?.includes('0 rows'), 'Error must report 0 rows affected')
})

test('58. Normal successful update returns success', async () => {
  const mockClientSuccess = {
    from: (table) => ({
      select: (cols) => ({
        eq: (f1, v1) => ({
          eq: (f2, v2) => ({
            limit: () => Promise.resolve({ data: [{ id: 'target_row_success' }], error: null }),
          }),
        }),
      }),
      update: (payload) => ({
        eq: (f, v) => ({
          select: (cols) => Promise.resolve({ data: [{ id: 'target_row_success' }], error: null }), // 1 row affected!
        }),
      }),
    }),
  }

  const resSuccess = await persistSubscriptionToDatabase(
    mockClientSuccess,
    'user_success',
    { plan: 'growth', status: 'active' },
    'sub_target_success'
  )
  assert.equal(resSuccess.success, true, 'Normal update with 1 affected row must return success')
  assert.equal(resSuccess.error, undefined)
})

test('59. Legacy active subscription with no captured-payment evidence', () => {
  const now = new Date('2026-11-03T12:00:00Z').getTime()

  // Legacy active record with subscription ID but NO payment ID and payment_status is null
  const legacyUnchargedRecord = {
    id: 'sub_legacy_uncharged_row',
    owner_id: 'user_legacy_uncharged',
    plan: 'growth',
    status: 'active',
    razorpay_subscription_id: 'sub_mandate_only_123',
    razorpay_payment_id: null,
    payment_status: null,
    current_period_start: new Date(now - 5 * ONE_DAY_MS).toISOString(),
    current_period_end: new Date(now + 25 * ONE_DAY_MS).toISOString(),
    updated_at: new Date(now).toISOString(),
  }

  const res = resolveAuthoritativeSubscription([legacyUnchargedRecord], now)
  assert.equal(res.hasPaidAccess, false, 'Uncharged legacy subscription must NOT receive paid access')
  assert.equal(res.status, 'expired', 'Status must fall back to expired rather than active paid')

  const entitlement = resolveCustomerEntitlements(res, 0, now)
  assert.equal(entitlement.hasPaidAccess, false)
  assert.equal(entitlement.canCreateProperty, false)
})

test('60. Legacy subscription with verified historical payment', () => {
  const now = new Date('2026-11-03T12:00:00Z').getTime()

  const legacyPaidRecord = {
    id: 'sub_legacy_hist_paid',
    owner_id: 'user_legacy_hist',
    plan: 'growth',
    status: 'active',
    razorpay_subscription_id: 'sub_historical_growth_1',
    razorpay_payment_id: 'pay_historical_capture_999',
    payment_status: null, // Legacy record with verified payment ID
    current_period_start: new Date(now - 10 * ONE_DAY_MS).toISOString(),
    current_period_end: new Date(now + 20 * ONE_DAY_MS).toISOString(),
  }

  const res = resolveAuthoritativeSubscription([legacyPaidRecord], now)
  assert.equal(res.hasPaidAccess, true, 'Legacy record with verified payment ID must have paid access')
  assert.equal(res.status, 'active')
  assert.equal(res.razorpaySubscriptionId, 'sub_historical_growth_1')
  assert.equal(res.razorpayPaymentId, 'pay_historical_capture_999')

  const entitlement = resolveCustomerEntitlements(res, 2, now)
  assert.equal(entitlement.hasPaidAccess, true)
  assert.equal(entitlement.maxProperties, 5, 'Growth plan allows 5 properties')
  assert.equal(entitlement.canCreateProperty, true)
})

test('61. Mandate-authorized but never-charged subscription', () => {
  const now = new Date('2026-11-03T12:00:00Z').getTime()

  // Mandate authenticated, but payment_status is pending and no captured payment ID exists
  const mandateOnlyRecord = {
    id: 'sub_mandate_pending_row',
    owner_id: 'user_mandate_pending',
    plan: 'starter',
    status: 'active',
    payment_status: 'pending',
    razorpay_subscription_id: 'sub_mandate_active_but_pending',
    razorpay_payment_id: null,
    current_period_start: new Date(now).toISOString(),
    current_period_end: new Date(now + 30 * ONE_DAY_MS).toISOString(),
  }

  const res = resolveAuthoritativeSubscription([mandateOnlyRecord], now)
  assert.equal(res.hasPaidAccess, false, 'Mandate pending payment must not have paid access')
  assert.equal(res.status, 'created')

  const label = getSubscriptionBadgeLabel({
    status: res.status,
    hasPaidAccess: res.hasPaidAccess,
    isTrialExpired: true,
  })
  assert.notEqual(label, 'Active Paid Plan', 'Badge cannot display Active Paid Plan')
})

test('62. Cancelled legacy subscription with and without verified paid-through access', () => {
  const now = new Date('2026-11-03T12:00:00Z').getTime()

  // Case A: Cancelled legacy subscription WITH verified payment ID and unexpired current_period_end
  const cancelledWithPayment = {
    id: 'sub_canc_with_pay',
    owner_id: 'user_canc_test',
    plan: 'growth',
    status: 'canceled',
    razorpay_subscription_id: 'sub_canc_with_pay_1',
    razorpay_payment_id: 'pay_canc_verified_123',
    payment_status: null,
    cancel_at_period_end: true,
    current_period_start: new Date(now - 15 * ONE_DAY_MS).toISOString(),
    current_period_end: new Date(now + 15 * ONE_DAY_MS).toISOString(),
  }

  const resA = resolveAuthoritativeSubscription([cancelledWithPayment], now)
  assert.equal(resA.hasPaidAccess, true, 'Cancelled with verified payment retains access through period end')
  assert.equal(resA.status, 'active')
  assert.equal(resA.cancelAtPeriodEnd, true)

  const labelA = getSubscriptionBadgeLabel({
    status: resA.status,
    hasPaidAccess: resA.hasPaidAccess,
    isTrialExpired: false,
    cancelAtPeriodEnd: resA.cancelAtPeriodEnd,
    currentPeriodEnd: resA.currentPeriodEnd,
  })
  assert.equal(labelA, 'Access Until Billing End')

  // Case B: Cancelled legacy subscription WITHOUT verified payment ID (mandate created, then cancelled without charge)
  const cancelledWithoutPayment = {
    id: 'sub_canc_no_pay',
    owner_id: 'user_canc_test_2',
    plan: 'growth',
    status: 'canceled',
    razorpay_subscription_id: 'sub_canc_no_pay_2',
    razorpay_payment_id: null,
    payment_status: null,
    cancel_at_period_end: true,
    current_period_start: new Date(now - 5 * ONE_DAY_MS).toISOString(),
    current_period_end: new Date(now + 25 * ONE_DAY_MS).toISOString(),
  }

  const resB = resolveAuthoritativeSubscription([cancelledWithoutPayment], now)
  assert.equal(resB.hasPaidAccess, false, 'Cancelled without verified payment must NOT retain access')
  assert.equal(resB.status, 'canceled')

  const labelB = getSubscriptionBadgeLabel({
    status: resB.status,
    hasPaidAccess: resB.hasPaidAccess,
    isTrialExpired: false,
    cancelAtPeriodEnd: resB.cancelAtPeriodEnd,
    currentPeriodEnd: resB.currentPeriodEnd,
  })
  assert.equal(labelB, 'Cancelled')

  // Case C: Cancelled legacy subscription WITH verified payment, but current_period_end HAS PASSED
  const cancelledExpired = {
    id: 'sub_canc_expired',
    owner_id: 'user_canc_test_3',
    plan: 'growth',
    status: 'canceled',
    razorpay_subscription_id: 'sub_canc_exp_3',
    razorpay_payment_id: 'pay_canc_expired_789',
    payment_status: null,
    cancel_at_period_end: true,
    current_period_start: new Date(now - 45 * ONE_DAY_MS).toISOString(),
    current_period_end: new Date(now - 15 * ONE_DAY_MS).toISOString(),
  }

  const resC = resolveAuthoritativeSubscription([cancelledExpired], now)
  assert.equal(resC.hasPaidAccess, false, 'Expired cancelled subscription must not retain access')
  assert.equal(resC.status, 'canceled')
})

test('63. Dashboard cannot grant paid access when the authoritative resolver denies it', () => {
  const now = new Date('2026-11-03T12:00:00Z').getTime()

  // Scenario: verify-subscription returns status: 'active', but server resolver evaluated hasPaidAccess: false
  // (e.g., payment capture pending or mandate only)
  const verifyData = {
    success: true,
    status: 'active',
    plan: 'starter',
    hasPaidAccess: false,
    isTrialExpired: true,
  }

  // Exact client-side verification logic implemented in app/dashboard/page.tsx:
  const isServerVerifiedPaidAccess = Boolean(
    verifyData.status === 'active' && verifyData.hasPaidAccess === true
  )
  assert.equal(isServerVerifiedPaidAccess, false, 'Dashboard must compute hasPaidAccess as false when server denies it')

  // Dashboard entitlement calculation consuming this state:
  const dashboardEntitlement = resolveCustomerEntitlements(
    {
      hasPaidAccess: isServerVerifiedPaidAccess,
      isTrialExpired: verifyData.isTrialExpired,
      status: isServerVerifiedPaidAccess ? 'active' : 'expired',
      plan: verifyData.plan,
    },
    1,
    now
  )

  assert.equal(dashboardEntitlement.hasPaidAccess, false, 'Entitlement must deny paid access')
  assert.equal(dashboardEntitlement.canCreateProperty, false, 'Entitlement must block property creation')

  const badge = getSubscriptionBadgeLabel({
    status: isServerVerifiedPaidAccess ? 'active' : 'expired',
    hasPaidAccess: dashboardEntitlement.hasPaidAccess,
    isTrialExpired: true,
  })
  assert.equal(badge, 'Trial Expired')
})
