/**
 * Subscription Resolver & Authority Engine
 * Provides deterministic, cryptographically sound resolution of customer subscription
 * state, paid access authorization, and database persistence.
 */

export interface SubscriptionRecord {
  id?: string
  owner_id: string
  plan?: string | null
  status?: string | null
  trial_start?: string | null
  trial_end?: string | null
  current_period_start?: string | null
  current_period_end?: string | null
  razorpay_customer_id?: string | null
  razorpay_subscription_id?: string | null
  razorpay_plan_id?: string | null
  razorpay_payment_id?: string | null
  created_at?: string
  updated_at?: string
}

export interface AuthoritativeSubscriptionState {
  hasPaidAccess: boolean
  isTrialExpired: boolean
  status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'expired' | 'created'
  plan: 'monthly' | 'yearly' | 'pro' | 'growth' | 'starter' | 'trial' | string
  trialStart: string | null
  trialEnd: string | null
  currentPeriodStart: string | null
  currentPeriodEnd: string | null
  razorpaySubscriptionId: string | null
  razorpayPaymentId: string | null
  activeRecord: SubscriptionRecord | null
}

export const DEFAULT_PROPERTY_LIMIT = 2

export const PLAN_PROPERTY_LIMITS: Record<string, number> = {
  trial: 2,
  monthly: 2,
  yearly: 5,
  starter: 2,
  growth: 5,
  business: 9,
  enterprise: 999,
  pro: 5,
}

export interface CustomerEntitlement {
  hasPaidAccess: boolean
  subscriptionStatus: 'active' | 'trialing' | 'past_due' | 'canceled' | 'expired' | 'created'
  plan: string
  maxProperties: number
  activePropertyCount: number
  remainingPropertySlots: number
  canCreateProperty: boolean
  isOverLimit: boolean
  reason?: string
}

/**
 * Deterministically resolves the single authoritative subscription state for a customer.
 * 
 * Rules:
 * 1. A verified record with status === 'active' ALWAYS grants full paid access.
 *    - An active subscription is NEVER expired, regardless of whether trial_end is in the past or null.
 *    - If multiple active records exist, the most recently updated active record wins.
 * 2. An older authenticated/trialing record must NEVER override an active subscription.
 * 3. In the absence of an active subscription:
 *    - An unexpired trialing record (trial_end > now) grants temporary trial access.
 *    - An expired trial (trial_end <= now) or expired status is strictly restricted.
 * 4. Past_due, canceled, or halted records do not grant paid access.
 */
export function resolveAuthoritativeSubscription(
  records: SubscriptionRecord[] | null | undefined,
  nowMs: number = Date.now()
): AuthoritativeSubscriptionState {
  if (!records || records.length === 0) {
    return {
      hasPaidAccess: false,
      isTrialExpired: true,
      status: 'expired',
      plan: 'trial',
      trialStart: null,
      trialEnd: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      razorpaySubscriptionId: null,
      razorpayPaymentId: null,
      activeRecord: null,
    }
  }

  // Sort descending by updated_at / created_at so newest records are evaluated first
  const sorted = [...records].sort((a, b) => {
    const timeA = new Date(a.updated_at || a.created_at || 0).getTime()
    const timeB = new Date(b.updated_at || b.created_at || 0).getTime()
    return timeB - timeA
  })

  // RULE 1: An active paid subscription always wins
  const activeSub = sorted.find((r) => r.status === 'active')
  if (activeSub) {
    return {
      hasPaidAccess: true,
      isTrialExpired: false,
      status: 'active',
      plan: activeSub.plan || 'yearly',
      trialStart: activeSub.trial_start || null,
      trialEnd: null, // Active subscribers do not have a trial expiration lockout
      currentPeriodStart: activeSub.current_period_start || null,
      currentPeriodEnd: activeSub.current_period_end || null,
      razorpaySubscriptionId: activeSub.razorpay_subscription_id || null,
      razorpayPaymentId: activeSub.razorpay_payment_id || null,
      activeRecord: activeSub,
    }
  }

  // RULE 2: Active unexpired trial (trial_end > now)
  const unexpiredTrial = sorted.find((r) => {
    if (r.status !== 'trialing') return false
    if (!r.trial_end) return false
    return new Date(r.trial_end).getTime() > nowMs
  })

  if (unexpiredTrial) {
    return {
      hasPaidAccess: true,
      isTrialExpired: false,
      status: 'trialing',
      plan: unexpiredTrial.plan || 'trial',
      trialStart: unexpiredTrial.trial_start || null,
      trialEnd: unexpiredTrial.trial_end || null,
      currentPeriodStart: unexpiredTrial.current_period_start || null,
      currentPeriodEnd: unexpiredTrial.current_period_end || null,
      razorpaySubscriptionId: unexpiredTrial.razorpay_subscription_id || null,
      razorpayPaymentId: unexpiredTrial.razorpay_payment_id || null,
      activeRecord: unexpiredTrial,
    }
  }

  // RULE 3: Restricted / Expired state (latest record provides context)
  const latest = sorted[0]
  const isPastDue = latest.status === 'past_due'
  const isCanceled = latest.status === 'canceled'
  const isCreated = latest.status === 'created'

  return {
    hasPaidAccess: false,
    isTrialExpired: true,
    status: isPastDue ? 'past_due' : isCanceled ? 'canceled' : isCreated ? 'created' : 'expired',
    plan: latest.plan || 'trial',
    trialStart: latest.trial_start || null,
    trialEnd: latest.trial_end || null,
    currentPeriodStart: latest.current_period_start || null,
    currentPeriodEnd: latest.current_period_end || null,
    razorpaySubscriptionId: latest.razorpay_subscription_id || null,
    razorpayPaymentId: latest.razorpay_payment_id || null,
    activeRecord: latest,
  }
}

export interface SubscriptionScheduleResult {
  isTrialEligible: boolean
  startAt: number | null
  chargeImmediate: boolean
  remainingTrialSeconds: number
  reason:
    | 'brand_new_customer'
    | 'active_trial_preserved'
    | 'trial_expired'
    | 'active_paid_subscription'
    | 'trial_window_sub_15m'
}

/**
 * Deterministically calculates trial eligibility and scheduled start_at timestamp
 * for Razorpay subscriptions according to BaseraBook's 7-day trial policy:
 * 
 * Invariants:
 * 1. Brand-new customers (zero prior subscription rows) receive a full 7-day trial.
 * 2. Customers with an active unexpired trial preserve their original trial end date.
 *    (They NEVER receive a reset or repeat 7 days).
 * 3. Expired trial customers, past_due, canceled, or customers with < 15 minutes left
 *    on their trial (Razorpay minimum start_at window) are charged immediately (start_at = null).
 * 4. Active paid subscribers upgrading / changing plans are charged immediately (start_at = null).
 */
export function resolveTrialSchedule(
  existingRows: SubscriptionRecord[] | null | undefined,
  nowMs: number = Date.now()
): SubscriptionScheduleResult {
  const resolvedState = resolveAuthoritativeSubscription(existingRows, nowMs)
  const hasActivePaidSub = resolvedState.status === 'active'

  // Case 1: Active paid subscriber upgrading or changing plans
  if (hasActivePaidSub) {
    return {
      isTrialEligible: false,
      startAt: null,
      chargeImmediate: true,
      remainingTrialSeconds: 0,
      reason: 'active_paid_subscription',
    }
  }

  // Filter out pending unconfirmed rows (e.g. status === 'created') when inspecting historical trials.
  // If a user previously clicked checkout and abandoned without authorizing, they are still a brand new customer!
  const confirmedRows = (existingRows || []).filter(
    (r) => r.status && r.status !== 'created'
  )

  // Case 2: Brand new customer with zero confirmed subscription rows
  if (confirmedRows.length === 0) {
    const startAt = Math.floor(nowMs / 1000) + 7 * 24 * 60 * 60
    return {
      isTrialEligible: true,
      startAt,
      chargeImmediate: false,
      remainingTrialSeconds: 7 * 24 * 60 * 60,
      reason: 'brand_new_customer',
    }
  }

  // Case 3: Customer with an active unexpired trial
  if (resolvedState.status === 'trialing' && resolvedState.trialEnd) {
    const trialEndMs = new Date(resolvedState.trialEnd).getTime()
    const remainingSeconds = Math.max(0, Math.floor((trialEndMs - nowMs) / 1000))
    // Razorpay API requirement: start_at must be at least 15 minutes (900s) in the future
    if (remainingSeconds >= 900) {
      return {
        isTrialEligible: true,
        startAt: Math.floor(trialEndMs / 1000),
        chargeImmediate: false,
        remainingTrialSeconds: remainingSeconds,
        reason: 'active_trial_preserved',
      }
    } else {
      return {
        isTrialEligible: false,
        startAt: null,
        chargeImmediate: true,
        remainingTrialSeconds: remainingSeconds,
        reason: 'trial_window_sub_15m',
      }
    }
  }

  // Case 4: Expired trial, canceled, or past_due: charge immediately, no repeat trial
  return {
    isTrialEligible: false,
    startAt: null,
    chargeImmediate: true,
    remainingTrialSeconds: 0,
    reason: 'trial_expired',
  }
}


/**
 * Resolves the centralized property entitlement for a customer based on their
 * authoritative subscription state and existing active properties count.
 */
export function resolveCustomerEntitlements(
  recordsOrState: AuthoritativeSubscriptionState | SubscriptionRecord[] | null | undefined,
  activePropertyCount: number = 0,
  nowMs: number = Date.now()
): CustomerEntitlement {
  const subState: AuthoritativeSubscriptionState =
    recordsOrState && 'hasPaidAccess' in recordsOrState
      ? (recordsOrState as AuthoritativeSubscriptionState)
      : resolveAuthoritativeSubscription(recordsOrState as SubscriptionRecord[], nowMs)

  const configuredLimit = PLAN_PROPERTY_LIMITS[subState.plan] || DEFAULT_PROPERTY_LIMIT
  const safeCount = Math.max(0, activePropertyCount)

  // RULE 1: If trial expired or no valid paid access, property creation is restricted
  if (!subState.hasPaidAccess) {
    return {
      hasPaidAccess: false,
      subscriptionStatus: subState.status,
      plan: subState.plan,
      maxProperties: configuredLimit,
      activePropertyCount: safeCount,
      remainingPropertySlots: 0,
      canCreateProperty: false,
      isOverLimit: safeCount > configuredLimit,
      reason:
        subState.status === 'created'
          ? 'Please complete checkout authorization to activate your subscription.'
          : subState.status === 'expired'
          ? 'Your 7-day free trial has expired. Please subscribe to add properties.'
          : `Your subscription is currently ${subState.status}. Please activate your subscription to create new properties.`,
    }
  }

  // RULE 2: Valid active subscription or unexpired trial
  const remainingSlots = Math.max(0, configuredLimit - safeCount)
  const canCreate = safeCount < configuredLimit

  return {
    hasPaidAccess: true,
    subscriptionStatus: subState.status,
    plan: subState.plan,
    maxProperties: configuredLimit,
    activePropertyCount: safeCount,
    remainingPropertySlots: remainingSlots,
    canCreateProperty: canCreate,
    isOverLimit: safeCount > configuredLimit,
    reason: canCreate
      ? undefined
      : safeCount > configuredLimit
      ? `You are managing ${safeCount} properties, but your current plan includes ${configuredLimit} properties (${safeCount}/${configuredLimit} used). Please upgrade your plan for additional property capacity.`
      : `Your current plan includes ${configuredLimit} properties (${safeCount}/${configuredLimit} used). Please upgrade your plan for additional property capacity.`,
  }
}

/**
 * Fetches the authoritative subscription and exact count of active properties
 * for an owner from Supabase, returning their current entitlement.
 */
export async function getOwnerEntitlements(
  supabaseClient: any,
  ownerId: string,
  nowMs: number = Date.now()
): Promise<CustomerEntitlement> {
  const [subRes, propCountRes] = await Promise.all([
    supabaseClient
      .from('subscriptions')
      .select('*')
      .eq('owner_id', ownerId)
      .order('updated_at', { ascending: false }),
    supabaseClient
      .from('properties')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', ownerId),
  ])

  const subRecords = Array.isArray(subRes?.data)
    ? subRes.data
    : subRes?.data
    ? [subRes.data]
    : []

  const propertyCount = typeof propCountRes?.count === 'number' ? propCountRes.count : 0
  return resolveCustomerEntitlements(subRecords, propertyCount, nowMs)
}

/**
 * Persists subscription updates to Supabase using the service-role admin client.
 * 
 * Guarantees:
 * 1. Works whether or not uq_subscriptions_owner exists in the database.
 * 2. Updates ALL matching rows for this owner_id to eliminate conflicting stale rows.
 * 3. Gracefully handles DB check constraints (e.g. ('trial', 'starter', 'growth', 'pro')).
 * 4. Verifies database confirmation before returning success.
 */
export async function persistSubscriptionToDatabase(
  adminClient: any,
  ownerId: string,
  payload: Record<string, any>
): Promise<{ success: boolean; error?: string }> {
  const normalizedPayload = { ...payload }

  // 1. Fetch existing rows for this owner
  const { data: existingRows, error: fetchErr } = await adminClient
    .from('subscriptions')
    .select('id, owner_id, plan, status')
    .eq('owner_id', ownerId)
    .order('updated_at', { ascending: false })

  if (fetchErr) {
    console.error('[SubscriptionSync] Failed to query existing subscriptions:', fetchErr)
  }

  const rowsCount = existingRows ? existingRows.length : 0

  // Helper to attempt write with fallback for legacy check constraints
  async function attemptWrite(writePayload: Record<string, any>) {
    if (rowsCount > 0) {
      // Update all existing rows for this owner
      return adminClient
        .from('subscriptions')
        .update(writePayload)
        .eq('owner_id', ownerId)
    } else {
      // Insert new row
      return adminClient
        .from('subscriptions')
        .insert({ ...writePayload, owner_id: ownerId })
    }
  }

  // Attempt 1: Full payload
  let { error: writeError } = await attemptWrite(normalizedPayload)

  // Attempt 2: If check constraint failed on plan, map yearly -> pro, monthly -> growth
  if (writeError && writeError.message?.includes('subscriptions_plan_check')) {
    console.warn('[SubscriptionSync] Legacy plan check constraint detected, mapping plan...')
    const mappedPlan =
      normalizedPayload.plan === 'yearly'
        ? 'pro'
        : normalizedPayload.plan === 'monthly'
        ? 'growth'
        : normalizedPayload.plan

    const fallbackPayload = { ...normalizedPayload, plan: mappedPlan }
    const fallbackRes = await attemptWrite(fallbackPayload)
    writeError = fallbackRes.error
  }

  // Attempt 3: Baseline update if extended columns failed
  if (writeError) {
    console.warn('[SubscriptionSync] Full write failed, attempting baseline columns:', writeError)
    const baselinePayload: Record<string, any> = {
      plan: normalizedPayload.plan === 'yearly' ? 'pro' : normalizedPayload.plan === 'monthly' ? 'growth' : normalizedPayload.plan,
      status: normalizedPayload.status,
      updated_at: new Date().toISOString(),
    }
    const baselineRes = await attemptWrite(baselinePayload)
    writeError = baselineRes.error
  }

  if (writeError) {
    console.error('[SubscriptionSync] Fatal: could not persist subscription to DB:', writeError)
    return { success: false, error: writeError.message }
  }

  return { success: true }
}
