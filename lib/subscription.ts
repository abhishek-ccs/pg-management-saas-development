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
  cancel_at_period_end?: boolean | null
  canceled_at?: string | null
  autopay_status?: string | null
  payment_status?: string | null
  ended_at?: string | null
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
  cancelAtPeriodEnd?: boolean
  canceledAt?: string | null
  autopayStatus?: string | null
  paymentStatus?: string | null
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
export const KNOWN_YEARLY_PLAN_IDS = new Set([
  'plan_TpRGUbldZHOv7X', // starter_yearly
  'plan_TpRGVTZfY46Jki', // growth_yearly
  'plan_TpRGW532F4cyqm', // business_yearly
])

/**
 * Resolves the actual plan tier from stored record data (plan string and razorpay_plan_id).
 * Ensures legacy 'yearly' subscriptions are assigned the correct property limit based
 * on their actual tier, not billing frequency, while preserving legacy customer entitlements.
 */
export function resolvePlanTier(recordOrPlan: SubscriptionRecord | string | null | undefined): string {
  if (!recordOrPlan) return 'trial'
  if (typeof recordOrPlan === 'string') {
    const p = recordOrPlan.toLowerCase().trim()
    if (p === 'starter' || p.startsWith('starter')) return 'starter'
    if (p === 'business' || p.startsWith('business')) return 'business'
    if (p === 'enterprise' || p.startsWith('enterprise')) return 'enterprise'
    if (p === 'growth' || p.startsWith('growth') || p === 'pro') return 'growth'
    if (p === 'yearly') return 'yearly'
    return p || 'trial'
  }

  const r = recordOrPlan
  const plan = (r.plan || '').toLowerCase().trim()
  const rzpPlan = (r.razorpay_plan_id || '').toLowerCase().trim()

  if (
    plan === 'starter' ||
    plan.startsWith('starter') ||
    rzpPlan === 'plan_tprgubldzhov7x' ||
    rzpPlan === 'plan_tprgumbc93c99j' ||
    rzpPlan.includes('starter')
  ) {
    return 'starter'
  }
  if (
    plan === 'business' ||
    plan.startsWith('business') ||
    rzpPlan === 'plan_tprgw532f4cyqm' ||
    rzpPlan === 'plan_tprgvufwe8pb2h' ||
    rzpPlan.includes('business')
  ) {
    return 'business'
  }
  if (plan === 'enterprise' || plan.startsWith('enterprise') || rzpPlan.includes('enterprise')) {
    return 'enterprise'
  }
  if (
    plan === 'growth' ||
    plan.startsWith('growth') ||
    plan === 'pro' ||
    rzpPlan === 'plan_tprgvtzfy46jki' ||
    rzpPlan === 'plan_tprguxeroqtjtx' ||
    rzpPlan.includes('growth') ||
    rzpPlan.includes('pro')
  ) {
    return 'growth'
  }
  if (plan === 'yearly') {
    // Legacy yearly with no tier in razorpay_plan_id preserves legacy 5-property entitlement
    return 'yearly'
  }
  return plan || 'trial'
}

export function isAnnualPlan(r: SubscriptionRecord): boolean {
  if (r.plan === 'yearly' || r.plan === 'pro') return true
  if (r.razorpay_plan_id) {
    if (KNOWN_YEARLY_PLAN_IDS.has(r.razorpay_plan_id)) return true
    if (r.razorpay_plan_id.toLowerCase().includes('yearly') || r.razorpay_plan_id.toLowerCase().includes('annual')) return true
  }
  if (r.current_period_start && r.current_period_end) {
    const startMs = new Date(r.current_period_start).getTime()
    const endMs = new Date(r.current_period_end).getTime()
    if (endMs - startMs > 60 * 86400000) return true
  }
  return false
}

/**
 * Evaluates whether a subscription record possesses verified captured-payment evidence.
 *
 * Invariants:
 * 1. Explicit payment_status === 'paid' is authoritative proof of payment capture.
 * 2. Explicit non-paid statuses ('pending', 'failed', 'refunded', 'unverified') are strictly disqualified.
 * 3. In legacy records (payment_status is null or undefined), a non-empty razorpay_subscription_id
 *    alone DOES NOT prove a successful charge (e.g. mandate authorized without charge).
 * 4. Legitimate legacy paid subscriptions are preserved ONLY where trusted existing evidence
 *    establishes that the exact subscription was successfully charged:
 *    - Valid paid plan tier (plan !== 'trial')
 *    - Valid non-empty razorpay_subscription_id belonging to this exact subscription
 *    - Status is 'active' (or unexpired paid-through canceled period)
 *    - Verified historical payment evidence: a valid non-empty razorpay_payment_id for this subscription.
 * 5. If capture evidence cannot be established (e.g. no payment_id and payment_status is NULL),
 *    automatic paid access is denied, and the ambiguous case is logged for reconciliation.
 */
export function hasAuthoritativePaymentEvidence(
  r: SubscriptionRecord,
  _nowMs: number = Date.now()
): boolean {
  const isPaidPlan = r.plan !== 'trial'
  if (!isPaidPlan) {
    return false
  }

  // Rule 2: Explicitly disqualified payment statuses
  if (
    r.payment_status === 'refunded' ||
    r.payment_status === 'failed' ||
    r.payment_status === 'pending' ||
    r.payment_status === 'unverified'
  ) {
    return false
  }

  // Rule 1: Authoritative captured payment status
  if (r.payment_status === 'paid') {
    return true
  }

  // Rule 3, 4, 5: payment_status is null or undefined (legacy record)
  const hasSubId = Boolean(
    r.razorpay_subscription_id &&
    typeof r.razorpay_subscription_id === 'string' &&
    r.razorpay_subscription_id.trim().length > 0
  )

  const hasPaymentId = Boolean(
    r.razorpay_payment_id &&
    typeof r.razorpay_payment_id === 'string' &&
    r.razorpay_payment_id.trim().length > 0
  )

  const isEligibleStatus = r.status === 'active' || r.status === 'canceled'

  // Trusted legacy verification:
  // Requires an eligible status (active or canceled), on a paid plan, with an authoritative
  // Razorpay subscription ID AND verified historical captured payment evidence (razorpay_payment_id).
  // An active subscription ID alone without a payment ID does NOT prove a successful charge!
  if (isEligibleStatus && hasSubId && hasPaymentId) {
    return true
  }

  // If capture evidence cannot be established, deny automatic paid access and log the record for reconciliation.
  if (hasSubId || hasPaymentId) {
    console.warn(
      `[SubscriptionAuthority] Unverified legacy payment evidence: record=${r.id || 'unknown'}, owner=${r.owner_id}, sub_id=${r.razorpay_subscription_id || 'none'}, payment_id=${r.razorpay_payment_id || 'none'}, status=${r.status}, plan=${r.plan}. Cannot establish proof of successful charge without payment_status='paid' or verified payment_id. Automatic paid access denied; flagged for reconciliation.`
    )
  }

  return false
}

export function getDerivedPeriodEndMs(r: SubscriptionRecord): number | null {
  if (r.current_period_end) {
    return new Date(r.current_period_end).getTime()
  }
  // Bounded safe fallback: ONLY for active records with authoritative payment proof
  // Anchored to current_period_start, or immutable created_at. Never updated_at!
  const hasPayment = hasAuthoritativePaymentEvidence(r)

  if (hasPayment && r.status === 'active') {
    const rawDate = r.current_period_start || r.created_at || r.updated_at;
    const baseMs = rawDate ? new Date(rawDate).getTime() : Date.now();
    if (baseMs > 0) {
      const isYearly = isAnnualPlan(r);
      return baseMs + (isYearly ? 365 : 30) * 86400000;
    }
  }
  // If cancelled with null dates, or no payment proof, returns null (strictly expired)
  return null
}

export function getDerivedTrialEndMs(r: SubscriptionRecord): number | null {
  if (r.trial_end) {
    return new Date(r.trial_end).getTime()
  }
  if (r.status === 'trialing' && r.created_at) {
    return new Date(r.created_at).getTime() + 7 * 86400000
  }
  return null
}

/**
 * Resolves the canonical dashboard subscription badge label according to BaseraBook's
 * authoritative 7-state lifecycle matrix:
 *
 * 1. Valid trial -> 'Free Trial'
 * 2. Verified active paid subscription -> 'Active Paid Plan'
 * 3. Expired trial -> 'Trial Expired'
 * 4. Cancelled with paid-through access -> 'Access Until Billing End'
 * 5. Cancelled without paid-through access -> 'Cancelled'
 * 6. Payment failure after paid period -> 'Payment Required / Past Due'
 * 7. Fully refunded -> 'Refunded / Access Revoked'
 */
export function getSubscriptionBadgeLabel(params: {
  status?: string | null
  hasPaidAccess?: boolean
  isTrialExpired?: boolean
  cancelAtPeriodEnd?: boolean | null
  currentPeriodEnd?: string | null
  paymentStatus?: string | null
  nowMs?: number
}): string {
  const status = params.status || 'expired'
  const hasPaidAccess = Boolean(params.hasPaidAccess)
  const isTrialExpired = Boolean(params.isTrialExpired)
  const cancelAtPeriodEnd = Boolean(params.cancelAtPeriodEnd)
  const paymentStatus = params.paymentStatus || 'pending'
  const nowMs = params.nowMs ?? Date.now()

  // State 7: Fully refunded
  if (paymentStatus === 'refunded') {
    return 'Refunded / Access Revoked'
  }

  const isPeriodActive = Boolean(
    params.currentPeriodEnd && new Date(params.currentPeriodEnd).getTime() > nowMs
  )

  // States 4 & 5: Cancelled subscriptions
  if (status === 'canceled' || cancelAtPeriodEnd) {
    if (hasPaidAccess && isPeriodActive) {
      return 'Access Until Billing End'
    }
    return 'Cancelled'
  }

  // State 6: Payment failure after paid period
  if (status === 'past_due' || paymentStatus === 'failed') {
    if (!hasPaidAccess || !isPeriodActive) {
      return 'Payment Required / Past Due'
    }
  }

  // State 2: Verified active paid subscription
  if (hasPaidAccess && status === 'active') {
    return 'Active Paid Plan'
  }

  // State 1: Valid unexpired trial
  if (status === 'trialing' && !isTrialExpired) {
    return 'Free Trial'
  }

  // State 3: Expired trial
  if (isTrialExpired || status === 'expired') {
    return 'Trial Expired'
  }

  // Fallback for created or unauthenticated states
  if (status === 'created') {
    return 'Trial Expired'
  }

  return 'Free Trial'
}

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
      cancelAtPeriodEnd: false,
      canceledAt: null,
      autopayStatus: 'none',
      paymentStatus: 'pending',
      razorpaySubscriptionId: null,
      razorpayPaymentId: null,
      activeRecord: null,
    }
  }

  // Sort records deterministically with complete parity to the PostgreSQL trigger
  const sorted = [...records].sort((a, b) => {
    const getRank = (r: SubscriptionRecord) => {
      // Explicitly expired or ended records must NEVER rank as active or trialing
      const isExplicitlyExpired =
        r.status === 'expired' ||
        (Boolean(r.ended_at) && new Date(r.ended_at!).getTime() <= nowMs)
      if (isExplicitlyExpired) {
        return 3
      }

      const endMs = getDerivedPeriodEndMs(r)
      const isPaidPlan = r.plan !== 'trial'
      const hasVerifiedPayment = hasAuthoritativePaymentEvidence(r, nowMs)
      const isEligibleStatus =
        (r.status === 'active' || r.status === 'canceled') &&
        isPaidPlan

      if (
        isEligibleStatus &&
        hasVerifiedPayment &&
        endMs !== null &&
        endMs > nowMs
      ) {
        return 1
      }
      const trialMs = getDerivedTrialEndMs(r)
      if (r.status === 'trialing' && trialMs !== null && trialMs > nowMs) {
        return 2
      }
      return 3
    }
    const rankDiff = getRank(a) - getRank(b)
    if (rankDiff !== 0) return rankDiff

    // Secondary Tie-Breaker 1: Furthest derived period end
    const endA = getDerivedPeriodEndMs(a) || 0
    const endB = getDerivedPeriodEndMs(b) || 0
    if (endB !== endA) return endB - endA

    // Secondary Tie-Breaker 2: Furthest derived trial end
    const trialA = getDerivedTrialEndMs(a) || 0
    const trialB = getDerivedTrialEndMs(b) || 0
    if (trialB !== trialA) return trialB - trialA

    // Secondary Tie-Breaker 3: Created at DESC (immutable creation order)
    const timeA = new Date(a.created_at || a.updated_at || 0).getTime()
    const timeB = new Date(b.created_at || b.updated_at || 0).getTime()
    if (timeB !== timeA) return timeB - timeA

    // Secondary Tie-Breaker 4: String ID comparison for total ordering
    return String(b.id || '').localeCompare(String(a.id || ''))
  })

  const winning = sorted[0]
  const winningEndMs = getDerivedPeriodEndMs(winning)
  const isWinningExplicitlyExpired =
    winning.status === 'expired' ||
    (Boolean(winning.ended_at) && new Date(winning.ended_at!).getTime() <= nowMs)

  const isWinningPaidPlan = winning.plan !== 'trial'
  const hasWinningPayment = hasAuthoritativePaymentEvidence(winning, nowMs)
  const isWinningStatusEligible =
    (winning.status === 'active' || winning.status === 'canceled') &&
    isWinningPaidPlan

  const isPaidActive = Boolean(
    !isWinningExplicitlyExpired &&
    isWinningStatusEligible &&
    hasWinningPayment &&
    winningEndMs !== null &&
    winningEndMs > nowMs
  )

  if (isPaidActive) {
    const isMandateCancelled = Boolean(
      winning.cancel_at_period_end ||
      winning.status === 'canceled' ||
      winning.autopay_status === 'revoked' ||
      winning.autopay_status === 'cancelled'
    )
    const periodEndIso = winning.current_period_end || new Date(winningEndMs!).toISOString()

    return {
      hasPaidAccess: true,
      isTrialExpired: false,
      status: 'active',
      plan: winning ? resolvePlanTier(winning) : 'yearly',
      trialStart: winning.trial_start || null,
      trialEnd: null,
      currentPeriodStart: winning.current_period_start || null,
      currentPeriodEnd: periodEndIso,
      cancelAtPeriodEnd: isMandateCancelled,
      canceledAt: winning.canceled_at || null,
      autopayStatus: winning.autopay_status || (isMandateCancelled ? 'revoked' : 'active'),
      paymentStatus: 'paid',
      razorpaySubscriptionId: winning.razorpay_subscription_id || null,
      razorpayPaymentId: winning.razorpay_payment_id || null,
      activeRecord: winning,
    }
  }

  const winningTrialMs = getDerivedTrialEndMs(winning)
  const isTrialActive = Boolean(
    winning.status === 'trialing' &&
    winningTrialMs !== null &&
    winningTrialMs > nowMs
  )

  if (isTrialActive) {
    const trialEndIso = winning.trial_end || new Date(winningTrialMs!).toISOString()
    return {
      hasPaidAccess: true,
      isTrialExpired: false,
      status: 'trialing',
      plan: winning.plan || 'trial',
      trialStart: winning.trial_start || null,
      trialEnd: trialEndIso,
      currentPeriodStart: winning.current_period_start || null,
      currentPeriodEnd: winning.current_period_end || null,
      cancelAtPeriodEnd: Boolean(winning.cancel_at_period_end),
      canceledAt: winning.canceled_at || null,
      autopayStatus: winning.autopay_status || 'none',
      paymentStatus: winning.payment_status || 'pending',
      razorpaySubscriptionId: winning.razorpay_subscription_id || null,
      razorpayPaymentId: winning.razorpay_payment_id || null,
      activeRecord: winning,
    }
  }

  // Expired / Inactive state
  const isRefunded = winning.payment_status === 'refunded'
  const isPeriodExpired = Boolean(winningEndMs !== null && winningEndMs <= nowMs)

  let resolvedStatus: AuthoritativeSubscriptionState['status'] = 'expired'
  if (isRefunded) {
    resolvedStatus = 'canceled'
  } else if (isPeriodExpired) {
    resolvedStatus = winning.status === 'canceled' ? 'canceled' : winning.status === 'past_due' ? 'past_due' : 'expired'
  } else if (winning.status === 'past_due') {
    resolvedStatus = 'past_due'
  } else if (winning.status === 'canceled') {
    resolvedStatus = 'canceled'
  } else if (winning.status === 'created' || (winning.status === 'active' && winning.payment_status === 'pending')) {
    resolvedStatus = 'created'
  }

  return {
    hasPaidAccess: false,
    isTrialExpired: true,
    status: resolvedStatus,
    plan: winning.plan || 'trial',
    trialStart: winning.trial_start || null,
    trialEnd: winning.trial_end || null,
    currentPeriodStart: winning.current_period_start || null,
    currentPeriodEnd: winning.current_period_end || null,
    cancelAtPeriodEnd: Boolean(winning.cancel_at_period_end),
    canceledAt: winning.canceled_at || null,
    autopayStatus: winning.autopay_status || 'none',
    paymentStatus: winning.payment_status || (isRefunded ? 'refunded' : 'pending'),
    razorpaySubscriptionId: winning.razorpay_subscription_id || null,
    razorpayPaymentId: winning.razorpay_payment_id || null,
    activeRecord: winning,
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

  const effectiveTier = subState.activeRecord
    ? resolvePlanTier(subState.activeRecord)
    : resolvePlanTier(subState.plan)
  const configuredLimit = PLAN_PROPERTY_LIMITS[effectiveTier] || DEFAULT_PROPERTY_LIMIT
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
  payload: Record<string, any>,
  targetSubscriptionId?: string | null
): Promise<{ success: boolean; error?: string }> {
  const normalizedPayload = { ...payload }
  const subscriptionId = targetSubscriptionId || normalizedPayload.razorpay_subscription_id

  // 1. Check if a row specifically for this razorpay_subscription_id exists
  let targetRowId: string | null = null
  if (subscriptionId) {
    const { data: matchedRows } = await adminClient
      .from('subscriptions')
      .select('id')
      .eq('owner_id', ownerId)
      .eq('razorpay_subscription_id', subscriptionId)
      .limit(1)
    if (matchedRows && matchedRows.length > 0) {
      targetRowId = matchedRows[0].id
    }
  }

  // Security invariant: If subscriptionId is provided but does not match any existing row,
  // we MUST NEVER fall back to updating another subscription belonging to this owner.
  // We insert a new row atomically for this specific subscription ID.

  // Helper to attempt write with fallback for legacy check constraints and concurrent insert protection
  async function attemptWrite(writePayload: Record<string, any>) {
    if (targetRowId) {
      // Scoped update to the single targeted row
      let updateQuery = adminClient
        .from('subscriptions')
        .update(writePayload)
        .eq('id', targetRowId)
      if (typeof updateQuery.select === 'function') {
        updateQuery = updateQuery.select('id')
      }
      return updateQuery
    } else if (subscriptionId) {
      // Atomic insert for new Razorpay subscription ID
      const payloadWithSub = {
        ...writePayload,
        owner_id: ownerId,
        razorpay_subscription_id: subscriptionId,
      }
      let insertQuery = adminClient
        .from('subscriptions')
        .insert(payloadWithSub)
      if (typeof insertQuery.select === 'function') {
        insertQuery = insertQuery.select('id')
      }
      const insertRes = await insertQuery

      // Handle simultaneous insert collision or unique constraint violation on owner_id (e.g. uq_subscriptions_owner)
      if (
        insertRes.error &&
        (insertRes.error.code === '23505' ||
          insertRes.error.message?.includes('duplicate key') ||
          insertRes.error.message?.includes('unique constraint') ||
          insertRes.error.message?.includes('uq_subscriptions'))
      ) {
        // 1. Check if another worker concurrently inserted this exact razorpay_subscription_id
        let updateExactQuery = adminClient
          .from('subscriptions')
          .update(writePayload)
          .eq('owner_id', ownerId)
          .eq('razorpay_subscription_id', subscriptionId)
        if (typeof updateExactQuery.select === 'function') {
          updateExactQuery = updateExactQuery.select('id')
        }
        const updateExact = await updateExactQuery

        if (!updateExact.error && updateExact.data && (!Array.isArray(updateExact.data) || updateExact.data.length > 0)) {
          return updateExact
        }

        // 2. If updateExact matched 0 rows, the unique constraint (e.g. uq_subscriptions_owner)
        // was triggered because an existing row exists for owner_id under a different/old subscription ID.
        // We look up the existing row for this owner to verify safe transition.
        const { data: ownerRows } = await adminClient
          .from('subscriptions')
          .select('*')
          .eq('owner_id', ownerId)
          .order('updated_at', { ascending: false })
          .limit(1)

        if (ownerRows && ownerRows.length > 0) {
          const existing = ownerRows[0]
          // Safe replacement rules:
          // 1. Existing row is expired, trial, created, or canceled without active paid access
          // 2. OR incoming write payload is authoritative (active or paid, NEVER merely 'created' over active subscription)
          const isExistingExpiredOrTrial =
            existing.status === 'expired' ||
            existing.plan === 'trial' ||
            existing.status === 'created' ||
            existing.status === 'canceled'

          const isNewPayloadAuthoritative =
            writePayload.status === 'active' ||
            writePayload.payment_status === 'paid'

          if (isExistingExpiredOrTrial || isNewPayloadAuthoritative) {
            targetRowId = existing.id
            // INVARIANT: Never inherit the old subscription's payment ID or payment status!
            const safeUpdatePayload = {
              ...writePayload,
              razorpay_subscription_id: subscriptionId,
              razorpay_payment_id:
                writePayload.razorpay_payment_id !== undefined ? writePayload.razorpay_payment_id : null,
              payment_status:
                writePayload.payment_status !== undefined ? writePayload.payment_status : 'pending',
            }
            let safeUpdateQuery = adminClient
              .from('subscriptions')
              .update(safeUpdatePayload)
              .eq('id', existing.id)
            if (typeof safeUpdateQuery.select === 'function') {
              safeUpdateQuery = safeUpdateQuery.select('id')
            }
            return safeUpdateQuery
          } else {
            console.warn(
              `[SubscriptionSync] Refusing to overwrite active subscription ${existing.razorpay_subscription_id} with ${subscriptionId}`
            )
            return {
              data: null,
              error: {
                message: `Active subscription ${existing.razorpay_subscription_id} cannot be overwritten by ${subscriptionId}`,
              },
            }
          }
        }

        return updateExact
      }
      return insertRes
    } else {
      // Safe insert when no specific subscription ID is designated
      let insertQuery = adminClient
        .from('subscriptions')
        .insert({ ...writePayload, owner_id: ownerId })
      if (typeof insertQuery.select === 'function') {
        insertQuery = insertQuery.select('id')
      }
      return insertQuery
    }
  }

  // Attempt 1: Full payload
  let writeRes = await attemptWrite(normalizedPayload)
  let writeError = writeRes.error

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
    writeRes = await attemptWrite(fallbackPayload)
    writeError = writeRes.error
  }

  // Attempt 3: If new columns (cancel_at_period_end, autopay_status, etc.) don't exist yet, retry with existing schema columns
  if (writeError && (writeError.message?.includes('column') || writeError.message?.includes('does not exist'))) {
    console.warn('[SubscriptionSync] Retrying write without newest columns:', writeError.message)
    const midPayload: Record<string, any> = {
      plan: normalizedPayload.plan === 'yearly' ? 'pro' : normalizedPayload.plan === 'monthly' ? 'growth' : normalizedPayload.plan,
      status: normalizedPayload.status,
      current_period_start: normalizedPayload.current_period_start,
      current_period_end: normalizedPayload.current_period_end,
      trial_start: normalizedPayload.trial_start,
      trial_end: normalizedPayload.trial_end,
      razorpay_customer_id: normalizedPayload.razorpay_customer_id,
      razorpay_subscription_id: normalizedPayload.razorpay_subscription_id,
      razorpay_plan_id: normalizedPayload.razorpay_plan_id,
      razorpay_payment_id: normalizedPayload.razorpay_payment_id,
      updated_at: new Date().toISOString(),
    }
    writeRes = await attemptWrite(midPayload)
    writeError = writeRes.error
  }

  // Attempt 4: Baseline update if extended columns failed
  if (writeError) {
    console.warn('[SubscriptionSync] Full write failed, attempting baseline columns:', writeError)
    const baselinePayload: Record<string, any> = {
      plan: normalizedPayload.plan === 'yearly' ? 'pro' : normalizedPayload.plan === 'monthly' ? 'growth' : normalizedPayload.plan,
      status: normalizedPayload.status,
      updated_at: new Date().toISOString(),
    }
    writeRes = await attemptWrite(baselinePayload)
    writeError = writeRes.error
  }

  if (writeError) {
    console.error('[SubscriptionSync] Fatal: could not persist subscription to DB:', writeError)
    return { success: false, error: writeError.message }
  }

  // Reliable Supabase update/select result check:
  // A response with data === null, undefined, or an empty array (data.length === 0)
  // CANNOT be treated as proof that an update or insert affected any row.
  const affectedCount = Array.isArray(writeRes?.data)
    ? writeRes.data.length
    : writeRes?.data
      ? 1
      : 0

  if (affectedCount === 0) {
    return { success: false, error: 'Database operation affected 0 rows' }
  }

  return { success: true }
}
