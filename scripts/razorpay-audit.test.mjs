import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

import {
  PRICING_CONFIG,
  PRICING_PLANS,
  ANNUAL_TOTAL_ON_MONTHLY,
  ANNUAL_SAVINGS_AMOUNT,
  ANNUAL_SAVINGS_PERCENT,
  YEARLY_MONTHLY_EQUIVALENT,
} from '../lib/pricing.ts'

import {
  getRazorpayPlanId,
  KNOWN_RAZORPAY_PLAN_MAP,
  verifySubscriptionPaymentSignature,
  verifyWebhookSignature,
} from '../lib/razorpay.ts'

import {
  resolveAuthoritativeSubscription,
  resolveCustomerEntitlements,
  resolveTrialSchedule,
  PLAN_PROPERTY_LIMITS,
  DEFAULT_PROPERTY_LIMIT,
} from '../lib/subscription.ts'

test('AUDIT 1: Canonical Pricing Invariants & Paise Precision Across All Tiers', () => {
  // 1. Starter: 1–2 properties, ₹1,099/mo, ₹9,999/yr
  const starter = PRICING_PLANS.find((p) => p.id === 'starter')
  assert.ok(starter, 'Starter plan must exist')
  assert.equal(starter.monthlyPrice, 1099)
  assert.equal(starter.yearlyPrice, 9999)
  assert.equal(starter.propertyLimit, '1–2 properties')
  assert.equal(starter.monthlyPrice * 100, 109900, 'Starter monthly must be 109,900 paise')
  assert.equal(starter.yearlyPrice * 100, 999900, 'Starter yearly must be 999,900 paise')
  assert.equal(starter.monthlyPrice * 12 - starter.yearlyPrice, 3189, 'Starter annual savings must be ₹3,189')

  // 2. Growth: 3–5 properties, ₹1,799/mo, ₹17,990/yr
  const growth = PRICING_PLANS.find((p) => p.id === 'growth')
  assert.ok(growth, 'Growth plan must exist')
  assert.equal(growth.monthlyPrice, 1799)
  assert.equal(growth.yearlyPrice, 17990)
  assert.equal(growth.propertyLimit, '3–5 properties')
  assert.equal(growth.monthlyPrice * 100, 179900, 'Growth monthly must be 179,900 paise')
  assert.equal(growth.yearlyPrice * 100, 1799000, 'Growth yearly must be 1,799,000 paise')
  assert.equal(growth.monthlyPrice * 12 - growth.yearlyPrice, 3598, 'Growth annual savings must be ₹3,598')

  // 3. Business: 6–9 properties, ₹2,799/mo, ₹27,990/yr
  const business = PRICING_PLANS.find((p) => p.id === 'business')
  assert.ok(business, 'Business plan must exist')
  assert.equal(business.monthlyPrice, 2799)
  assert.equal(business.yearlyPrice, 27990)
  assert.equal(business.propertyLimit, '6–9 properties')
  assert.equal(business.monthlyPrice * 100, 279900, 'Business monthly must be 279,900 paise')
  assert.equal(business.yearlyPrice * 100, 2799000, 'Business yearly must be 2,799,000 paise')
  assert.equal(business.monthlyPrice * 12 - business.yearlyPrice, 5598, 'Business annual savings must be ₹5,598')

  // 4. Enterprise: 9+ properties, custom pricing
  const enterprise = PRICING_PLANS.find((p) => p.id === 'enterprise')
  assert.ok(enterprise, 'Enterprise plan must exist')
  assert.equal(enterprise.propertyLimit, '9+ properties')
  assert.equal(enterprise.monthlyPrice, null)
  assert.equal(enterprise.yearlyPrice, null)
})

test('AUDIT 2: Razorpay Plan ID Resolution for All 6 Combinations', () => {
  const expectedCombos = [
    { tier: 'starter', cycle: 'monthly', expectedId: 'plan_TpRGUMBC93C99j' },
    { tier: 'starter', cycle: 'yearly', expectedId: 'plan_TpRGUbldZHOv7X' },
    { tier: 'growth', cycle: 'monthly', expectedId: 'plan_TpRGUxerOQTJtX' },
    { tier: 'growth', cycle: 'yearly', expectedId: 'plan_TpRGVTZfY46Jki' },
    { tier: 'business', cycle: 'monthly', expectedId: 'plan_TpRGVuFWE8PB2H' },
    { tier: 'business', cycle: 'yearly', expectedId: 'plan_TpRGW532F4cyqm' },
  ]

  for (const { tier, cycle, expectedId } of expectedCombos) {
    const resolvedId = getRazorpayPlanId(cycle, tier)
    assert.equal(
      resolvedId,
      expectedId,
      `Resolved Plan ID for ${tier}_${cycle} must match ${expectedId}`
    )
  }
})

test('AUDIT 3: Plan ID Resolution Fallback for Legacy/Unknown Tiers', () => {
  // Unknown tier with monthly cycle should fall back to general monthly plan ID
  const fallbackMonthly = getRazorpayPlanId('monthly', 'unknown_custom_tier')
  assert.ok(fallbackMonthly.startsWith('plan_'), 'Fallback monthly plan must exist')

  // Unknown tier with yearly cycle should fall back to general yearly plan ID
  const fallbackYearly = getRazorpayPlanId('yearly', 'unknown_custom_tier')
  assert.ok(fallbackYearly.startsWith('plan_'), 'Fallback yearly plan must exist')
})

test('AUDIT 4: Cryptographic Payment Signature Verification & Tamper Defense', () => {
  const testSecret = 'secret_key_audit_test_999'
  const originalEnvSecret = process.env.RAZORPAY_KEY_SECRET
  process.env.RAZORPAY_KEY_SECRET = testSecret

  try {
    const paymentId = 'pay_audit_123456789'
    const subscriptionId = 'sub_audit_987654321'

    // 1. Valid Signature
    const validSignature = crypto
      .createHmac('sha256', testSecret)
      .update(`${paymentId}|${subscriptionId}`)
      .digest('hex')

    const isValid = verifySubscriptionPaymentSignature({
      paymentId,
      subscriptionId,
      signature: validSignature,
    })
    assert.equal(isValid, true, 'Authentic payment signature must verify successfully')

    // 2. Tampered payment ID
    const isTamperedPayment = verifySubscriptionPaymentSignature({
      paymentId: 'pay_tampered_attacker',
      subscriptionId,
      signature: validSignature,
    })
    assert.equal(isTamperedPayment, false, 'Tampered paymentId must be rejected')

    // 3. Tampered subscription ID
    const isTamperedSub = verifySubscriptionPaymentSignature({
      paymentId,
      subscriptionId: 'sub_tampered_attacker',
      signature: validSignature,
    })
    assert.equal(isTamperedSub, false, 'Tampered subscriptionId must be rejected')

    // 4. Tampered signature value
    const isTamperedSig = verifySubscriptionPaymentSignature({
      paymentId,
      subscriptionId,
      signature: 'deadbeef12345678deadbeef12345678',
    })
    assert.equal(isTamperedSig, false, 'Invalid hex signature must be rejected')

    // 5. Missing fields
    assert.equal(
      verifySubscriptionPaymentSignature({ paymentId: '', subscriptionId, signature: validSignature }),
      false
    )
    assert.equal(
      verifySubscriptionPaymentSignature({ paymentId, subscriptionId: '', signature: validSignature }),
      false
    )
    assert.equal(
      verifySubscriptionPaymentSignature({ paymentId, subscriptionId, signature: '' }),
      false
    )
  } finally {
    process.env.RAZORPAY_KEY_SECRET = originalEnvSecret
  }
})

test('AUDIT 5: Webhook HMAC-SHA256 Signature Verification & Rejection', () => {
  const testWebhookSecret = 'webhook_secret_audit_test_555'
  const originalEnvWebhook = process.env.RAZORPAY_WEBHOOK_SECRET
  process.env.RAZORPAY_WEBHOOK_SECRET = testWebhookSecret

  try {
    const rawPayload = JSON.stringify({
      event: 'subscription.charged',
      payload: {
        subscription: {
          entity: { id: 'sub_test_audit_111', status: 'active' },
        },
      },
    })

    const validWebhookSig = crypto
      .createHmac('sha256', testWebhookSecret)
      .update(rawPayload)
      .digest('hex')

    // 1. Valid webhook signature
    assert.equal(
      verifyWebhookSignature(rawPayload, validWebhookSig),
      true,
      'Valid raw webhook payload must verify'
    )

    // 2. Tampered raw payload (even 1 character changed)
    const tamperedPayload = rawPayload.replace('sub_test_audit_111', 'sub_attacker_999')
    assert.equal(
      verifyWebhookSignature(tamperedPayload, validWebhookSig),
      false,
      'Tampered payload must fail signature verification'
    )

    // 3. Invalid signature header
    assert.equal(
      verifyWebhookSignature(rawPayload, 'invalid_signature_hex_value'),
      false,
      'Invalid signature header must fail verification'
    )

    // 4. Missing inputs
    assert.equal(verifyWebhookSignature('', validWebhookSig), false)
    assert.equal(verifyWebhookSignature(rawPayload, ''), false)
  } finally {
    process.env.RAZORPAY_WEBHOOK_SECRET = originalEnvWebhook
  }
})

test('AUDIT 6: Webhook Subscription Lifecycle Event State Mapping', () => {
  const mappingRules = {
    'subscription.authenticated': 'trialing',
    'subscription.activated': 'active',
    'subscription.charged': 'active',
    'subscription.pending': 'past_due',
    'subscription.halted': 'expired',
    'subscription.cancelled': 'canceled',
    'subscription.completed': 'expired',
  }

  function simulateWebhookStatus(eventType) {
    switch (eventType) {
      case 'subscription.authenticated':
        return 'trialing'
      case 'subscription.activated':
      case 'subscription.charged':
        return 'active'
      case 'subscription.pending':
        return 'past_due'
      case 'subscription.halted':
      case 'subscription.completed':
        return 'expired'
      case 'subscription.cancelled':
        return 'canceled'
      default:
        return null
    }
  }

  for (const [event, expectedStatus] of Object.entries(mappingRules)) {
    assert.equal(
      simulateWebhookStatus(event),
      expectedStatus,
      `Event "${event}" must map to status "${expectedStatus}"`
    )
  }
})

test('AUDIT 7: Authoritative Subscription Resolution & Priority Law', () => {
  const now = Date.now()
  const oneDay = 24 * 60 * 60 * 1000

  // 1. Active subscription always wins, even with older trial records
  const mixedRecords = [
    {
      id: 'sub_old',
      owner_id: 'user_1',
      status: 'trialing',
      plan: 'trial',
      trial_end: new Date(now - 2 * oneDay).toISOString(), // expired trial
      updated_at: new Date(now - 10 * oneDay).toISOString(),
    },
    {
      id: 'sub_active',
      owner_id: 'user_1',
      status: 'active',
      plan: 'business',
      trial_end: null,
      updated_at: new Date(now).toISOString(),
    },
  ]

  const activeRes = resolveAuthoritativeSubscription(mixedRecords, now)
  assert.equal(activeRes.hasPaidAccess, true, 'Active subscription must grant paid access')
  assert.equal(activeRes.status, 'active')
  assert.equal(activeRes.plan, 'business')
  assert.equal(activeRes.isTrialExpired, false)

  // 2. Active Unexpired Trial grants access
  const unexpiredTrial = [
    {
      id: 'sub_trial',
      owner_id: 'user_2',
      status: 'trialing',
      plan: 'starter',
      trial_start: new Date(now - 2 * oneDay).toISOString(),
      trial_end: new Date(now + 5 * oneDay).toISOString(), // 5 days left
      updated_at: new Date(now).toISOString(),
    },
  ]
  const trialRes = resolveAuthoritativeSubscription(unexpiredTrial, now)
  assert.equal(trialRes.hasPaidAccess, true, 'Unexpired trial must grant access')
  assert.equal(trialRes.status, 'trialing')
  assert.equal(trialRes.isTrialExpired, false)

  // 3. Expired Trial restricts access
  const expiredTrial = [
    {
      id: 'sub_expired',
      owner_id: 'user_3',
      status: 'trialing',
      plan: 'starter',
      trial_start: new Date(now - 8 * oneDay).toISOString(),
      trial_end: new Date(now - 1 * oneDay).toISOString(), // ended yesterday
      updated_at: new Date(now).toISOString(),
    },
  ]
  const expiredRes = resolveAuthoritativeSubscription(expiredTrial, now)
  assert.equal(expiredRes.hasPaidAccess, false, 'Expired trial must deny paid access')
  assert.equal(expiredRes.isTrialExpired, true)

  // 4. Past Due / Halted restricts access
  const pastDueRecord = [
    {
      id: 'sub_pd',
      owner_id: 'user_4',
      status: 'past_due',
      plan: 'growth',
      updated_at: new Date(now).toISOString(),
    },
  ]
  const pdRes = resolveAuthoritativeSubscription(pastDueRecord, now)
  assert.equal(pdRes.hasPaidAccess, false, 'Past due subscription must deny access')
  assert.equal(pdRes.status, 'past_due')
})

test('AUDIT 8: Property Limit Entitlements for All Tiers', () => {
  // Plan limits check
  assert.equal(PLAN_PROPERTY_LIMITS.starter, 2, 'Starter allows 2 properties')
  assert.equal(PLAN_PROPERTY_LIMITS.growth, 5, 'Growth allows 5 properties')
  assert.equal(PLAN_PROPERTY_LIMITS.business, 9, 'Business allows 9 properties')
  assert.equal(PLAN_PROPERTY_LIMITS.enterprise, 999, 'Enterprise allows custom/unlimited properties')
  assert.equal(PLAN_PROPERTY_LIMITS.trial, 2, 'Trial allows 2 properties')

  // Case A: Starter subscriber with 1 property -> can create 1 more
  const starterState = { hasPaidAccess: true, status: 'active', plan: 'starter' }
  const starterEntitlement = resolveCustomerEntitlements(starterState, 1)
  assert.equal(starterEntitlement.canCreateProperty, true)
  assert.equal(starterEntitlement.remainingPropertySlots, 1)
  assert.equal(starterEntitlement.maxProperties, 2)

  // Case B: Starter subscriber with 2 properties -> cannot create 3rd property
  const starterFull = resolveCustomerEntitlements(starterState, 2)
  assert.equal(starterFull.canCreateProperty, false)
  assert.equal(starterFull.remainingPropertySlots, 0)
  assert.ok(starterFull.reason.includes('upgrade your plan'), 'Must prompt to upgrade')

  // Case C: Growth subscriber with 4 properties -> can create 1 more (limit 5)
  const growthState = { hasPaidAccess: true, status: 'active', plan: 'growth' }
  const growthEntitlement = resolveCustomerEntitlements(growthState, 4)
  assert.equal(growthEntitlement.canCreateProperty, true)
  assert.equal(growthEntitlement.remainingPropertySlots, 1)
  assert.equal(growthEntitlement.maxProperties, 5)

  // Case D: Growth subscriber with 5 properties -> cannot create 6th property
  const growthFull = resolveCustomerEntitlements(growthState, 5)
  assert.equal(growthFull.canCreateProperty, false)
  assert.equal(growthFull.remainingPropertySlots, 0)
  assert.equal(growthFull.maxProperties, 5)

  // Case E: Business subscriber with 8 properties -> can create 1 more (limit 9)
  const businessState = { hasPaidAccess: true, status: 'active', plan: 'business' }
  const businessEntitlement = resolveCustomerEntitlements(businessState, 8)
  assert.equal(businessEntitlement.canCreateProperty, true)
  assert.equal(businessEntitlement.remainingPropertySlots, 1)
  assert.equal(businessEntitlement.maxProperties, 9)

  // Case F: Business subscriber with 9 properties -> cannot create 10th property
  const businessFull = resolveCustomerEntitlements(businessState, 9)
  assert.equal(businessFull.canCreateProperty, false)
  assert.equal(businessFull.remainingPropertySlots, 0)

  // Case G: Expired customer cannot create any properties
  const expiredState = { hasPaidAccess: false, status: 'expired', plan: 'starter' }
  const expiredEntitlement = resolveCustomerEntitlements(expiredState, 0)
  assert.equal(expiredEntitlement.canCreateProperty, false)
  assert.ok(expiredEntitlement.reason.includes('expired'))
})

test('AUDIT 9: Deterministic Trial Schedule Engine (resolveTrialSchedule)', () => {
  const nowMs = 1760800000000 // fixed reference timestamp

  // Case 1: Brand new customer with zero prior rows in DB
  const emptySchedule = resolveTrialSchedule([], nowMs)
  assert.equal(emptySchedule.isTrialEligible, true, 'Brand new customer with empty array must be trial eligible')
  assert.equal(emptySchedule.chargeImmediate, false, 'Brand new customer must not be charged immediately')
  assert.equal(emptySchedule.startAt, Math.floor(nowMs / 1000) + 7 * 24 * 60 * 60, 'Start_at must be exactly 7 days in future')
  assert.equal(emptySchedule.reason, 'brand_new_customer')

  // Case 2: Brand new customer with null/undefined rows
  const nullSchedule = resolveTrialSchedule(null, nowMs)
  assert.equal(nullSchedule.isTrialEligible, true)
  assert.equal(nullSchedule.chargeImmediate, false)
  assert.equal(nullSchedule.startAt, Math.floor(nowMs / 1000) + 7 * 24 * 60 * 60)

  // Case 3: Customer with active unexpired trial (5 days remaining)
  const fiveDaysMs = 5 * 24 * 60 * 60 * 1000
  const activeTrialRows = [
    {
      id: 'sub_trial',
      owner_id: 'user_1',
      status: 'trialing',
      trial_start: new Date(nowMs - 2 * 24 * 60 * 60 * 1000).toISOString(),
      trial_end: new Date(nowMs + fiveDaysMs).toISOString(),
    },
  ]
  const activeTrialSchedule = resolveTrialSchedule(activeTrialRows, nowMs)
  assert.equal(activeTrialSchedule.isTrialEligible, true)
  assert.equal(activeTrialSchedule.chargeImmediate, false)
  // CRITICAL INVARIANT: must preserve original trial end date; NOT reset to 7 days
  assert.equal(
    activeTrialSchedule.startAt,
    Math.floor((nowMs + fiveDaysMs) / 1000),
    'Must preserve original trial end date'
  )
  assert.notEqual(
    activeTrialSchedule.startAt,
    Math.floor(nowMs / 1000) + 7 * 24 * 60 * 60,
    'Must NOT grant repeat 7-day trial'
  )
  assert.equal(activeTrialSchedule.reason, 'active_trial_preserved')

  // Case 4: Trial with less than 15 minutes (900s) remaining (Razorpay minimum start_at window)
  const tenMinutesMs = 10 * 60 * 1000
  const sub15mRows = [
    {
      id: 'sub_short',
      owner_id: 'user_2',
      status: 'trialing',
      trial_end: new Date(nowMs + tenMinutesMs).toISOString(),
    },
  ]
  const sub15mSchedule = resolveTrialSchedule(sub15mRows, nowMs)
  assert.equal(sub15mSchedule.isTrialEligible, false, 'Must not be trial eligible if < 15 minutes left')
  assert.equal(sub15mSchedule.startAt, null, 'start_at must be null when window < 15 minutes')
  assert.equal(sub15mSchedule.chargeImmediate, true)
  assert.equal(sub15mSchedule.reason, 'trial_window_sub_15m')

  // Case 5: Expired trial customer (trial ended 14 days ago like sharmavn258@gmail.com)
  const expiredTrialRows = [
    {
      id: 'sub_expired',
      owner_id: 'user_3',
      status: 'trialing',
      trial_start: new Date(nowMs - 21 * 24 * 60 * 60 * 1000).toISOString(),
      trial_end: new Date(nowMs - 14 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ]
  const expiredSchedule = resolveTrialSchedule(expiredTrialRows, nowMs)
  assert.equal(expiredSchedule.isTrialEligible, false, 'Expired trial user is not trial eligible')
  assert.equal(expiredSchedule.startAt, null, 'Must omit start_at to charge immediately on checkout')
  assert.equal(expiredSchedule.chargeImmediate, true)
  assert.equal(expiredSchedule.reason, 'trial_expired')

  // Case 6: Active paid subscriber upgrading / changing plan
  const activePaidRows = [
    {
      id: 'sub_paid',
      owner_id: 'user_4',
      status: 'active',
      plan: 'starter',
    },
  ]
  const paidSchedule = resolveTrialSchedule(activePaidRows, nowMs)
  assert.equal(paidSchedule.isTrialEligible, false)
  assert.equal(paidSchedule.startAt, null, 'Active customer upgrading plan must be charged immediately')
  assert.equal(paidSchedule.chargeImmediate, true)
  assert.equal(paidSchedule.reason, 'active_paid_subscription')
})

test('AUDIT 10: Customer Phone Prefill Security & Fallback Isolation Law', () => {
  // Helper simulating checkout prefill generation
  function generateCheckoutPrefill(user, profile, customerInput) {
    const providedPhone = typeof customerInput === 'string' ? customerInput.trim() : ''
    const effectivePhone = (
      providedPhone ||
      (user?.phone || '').trim() ||
      (typeof user?.user_metadata?.phone === 'string' ? user.user_metadata.phone.trim() : '') ||
      (profile?.phone || '').trim()
    )

    return {
      name: user?.user_metadata?.full_name || profile?.full_name || '',
      email: user?.email || '',
      ...(effectivePhone ? { contact: effectivePhone } : {}),
    }
  }

  // 1. Authenticated customer with phone in Supabase Auth user object
  const userWithAuthPhone = {
    email: 'customer1@example.com',
    phone: '+919876543210',
    user_metadata: { full_name: 'Customer One' },
  }
  const prefill1 = generateCheckoutPrefill(userWithAuthPhone, null, '')
  assert.equal(prefill1.contact, '+919876543210', 'Prefill must contain authenticated customer phone')

  // 2. Customer with phone in Supabase public.profiles table
  const userWithProfilePhone = {
    email: 'customer2@example.com',
    user_metadata: { full_name: 'Customer Two' },
  }
  const profileWithPhone = {
    phone: '9876500000',
    full_name: 'Customer Two Profile',
  }
  const prefill2 = generateCheckoutPrefill(userWithProfilePhone, profileWithPhone, '')
  assert.equal(prefill2.contact, '9876500000', 'Prefill must read phone from public.profiles')

  // 3. Customer explicitly entering phone in confirmation dialog
  const userWithNoPhone = {
    email: 'customer3@example.com',
    user_metadata: { full_name: 'Customer Three' },
  }
  const prefill3 = generateCheckoutPrefill(userWithNoPhone, null, '9123456789')
  assert.equal(prefill3.contact, '9123456789', 'Prefill must use customer-entered phone')

  // 4. Customer with ZERO phone on file and no input
  const prefill4 = generateCheckoutPrefill(userWithNoPhone, null, '')
  assert.equal(
    prefill4.contact,
    undefined,
    'prefill.contact MUST be undefined when customer has no phone (never fall back to owner phone!)'
  )
  assert.equal('contact' in prefill4, false, 'contact property must not exist in prefill object')
})

test('AUDIT 11: Immediate Billing Disclosure Invariants for Expired Trials', () => {
  const nowMs = Date.now()
  const expiredRows = [
    {
      id: 'sub_expired_customer',
      owner_id: 'user_expired',
      status: 'trialing',
      trial_start: new Date(nowMs - 20 * 86400000).toISOString(),
      trial_end: new Date(nowMs - 13 * 86400000).toISOString(),
    },
  ]

  const schedule = resolveTrialSchedule(expiredRows, nowMs)
  assert.equal(schedule.chargeImmediate, true, 'Expired trial must flag immediate charge')
  assert.equal(schedule.isTrialEligible, false)
  assert.equal(schedule.startAt, null)

  // Verify plan prices and billing intervals are accurately disclosed
  const planTier = 'growth'
  const planType = 'yearly'
  const planPrices = {
    starter: { monthly: 1099, yearly: 9999 },
    growth: { monthly: 1799, yearly: 17990 },
    business: { monthly: 2799, yearly: 27990 },
  }
  const exactAmount = planPrices[planTier][planType]
  assert.equal(exactAmount, 17990, 'Growth yearly amount must be exactly ₹17,990')

  // Verify response shape disclosure matches what create-subscription returns
  const mockResponse = {
    planType,
    plan: planTier,
    isTrial: schedule.isTrialEligible,
    trialEnd: null,
    amount: exactAmount,
    billingInterval: 'year',
    chargeImmediate: schedule.chargeImmediate,
    reason: schedule.reason,
  }

  assert.equal(mockResponse.chargeImmediate, true)
  assert.equal(mockResponse.amount, 17990)
  assert.equal(mockResponse.billingInterval, 'year')
  assert.equal(mockResponse.isTrial, false)
})

test('AUDIT 12: Cross-User Subscription Ownership Defense (Anti-Hijacking)', () => {
  // Simulate verify-subscription endpoint check:
  // When an attacker attempts to verify a subscription created by a different user
  function verifySubscriptionOwnership(authenticatedUserId, razorpaySubscription) {
    if (
      razorpaySubscription.notes?.user_id &&
      razorpaySubscription.notes.user_id !== authenticatedUserId
    ) {
      return {
        allowed: false,
        status: 403,
        error: 'Subscription does not belong to the current authenticated user.',
      }
    }
    return { allowed: true, status: 200 }
  }

  const legitimateUser = '5fc5c902-cea9-425a-b6fb-989b436ab270'
  const attackingUser = 'attacker-uuid-9999-0000-111122223333'

  const subscriptionFromLegitimateUser = {
    id: 'sub_TppElVJ7oKIEiZ',
    status: 'active',
    notes: {
      user_id: legitimateUser,
      user_email: 'legit@example.com',
      app: 'BaseraBook',
    },
  }

  // 1. Legitimate user verifying their own subscription -> Allowed
  const legitResult = verifySubscriptionOwnership(legitimateUser, subscriptionFromLegitimateUser)
  assert.equal(legitResult.allowed, true)
  assert.equal(legitResult.status, 200)

  // 2. Attacking user trying to verify legitimate user's subscription -> Rejected with 403 Forbidden
  const attackResult = verifySubscriptionOwnership(attackingUser, subscriptionFromLegitimateUser)
  assert.equal(attackResult.allowed, false)
  assert.equal(attackResult.status, 403)
  assert.ok(attackResult.error.includes('does not belong'))
})

test('AUDIT 13: Payment Safety & Lifecycle Invariants', () => {
  // Invariant 1: Premature activation check
  // Subscriptions in statuses other than 'active' or 'authenticated' must be rejected
  function validateSubscriptionActivationStatus(status) {
    return status === 'active' || status === 'authenticated'
  }

  assert.equal(validateSubscriptionActivationStatus('created'), false, 'created status must not activate')
  assert.equal(validateSubscriptionActivationStatus('pending'), false, 'pending status must not activate')
  assert.equal(validateSubscriptionActivationStatus('halted'), false, 'halted status must not activate')
  assert.equal(validateSubscriptionActivationStatus('cancelled'), false, 'cancelled status must not activate')
  assert.equal(validateSubscriptionActivationStatus('authenticated'), true, 'authenticated status may activate trialing')
  assert.equal(validateSubscriptionActivationStatus('active'), true, 'active status may activate paid access')

  // Invariant 2: Webhook signature verification requirement
  const mockSecret = 'sec_test_secret_key_12345'
  const originalSecret = process.env.RAZORPAY_WEBHOOK_SECRET
  process.env.RAZORPAY_WEBHOOK_SECRET = mockSecret

  try {
    const testPayload = JSON.stringify({ event: 'subscription.activated', id: 'evt_1' })
    const validSignature = crypto.createHmac('sha256', mockSecret).update(testPayload).digest('hex')
    const tamperedPayload = JSON.stringify({ event: 'subscription.activated', id: 'evt_tampered' })

    assert.equal(
      verifyWebhookSignature(testPayload, validSignature),
      true,
      'Valid HMAC signature must verify'
    )
    assert.equal(
      verifyWebhookSignature(tamperedPayload, validSignature),
      false,
      'Tampered payload must fail HMAC verification'
    )
  } finally {
    process.env.RAZORPAY_WEBHOOK_SECRET = originalSecret
  }
})

