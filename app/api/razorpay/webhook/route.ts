import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { verifyWebhookSignature } from '@/lib/razorpay'
import { persistSubscriptionToDatabase } from '@/lib/subscription'

export const runtime = 'nodejs'

/**
 * Atomic Webhook Event Claiming & Concurrency Lease Protection
 * Guarantees that simultaneous duplicate deliveries cannot both execute business logic.
 * Preserves failed events so Razorpay retries can re-claim and re-process.
 * Fencing tokens prevent expired workers from overwriting newer worker results.
 */
interface WebhookClaimResult {
  claimed: boolean
  leaseToken?: string
  reason?: 'already_completed' | 'in_flight' | 'concurrent_claim_lost' | 'migration_pending' | 'claim_error'
  isRetryable?: boolean
}

async function claimWebhookEvent(
  admin: any,
  eventId: string,
  eventType: string,
  payload: any
): Promise<WebhookClaimResult> {
  const leaseToken = crypto.randomUUID()
  const leaseDurationMs = 5 * 60 * 1000 // 5-minute lease duration
  const now = Date.now()
  const leaseExpiresAt = new Date(now + leaseDurationMs).toISOString()

  try {
    const { data: existing, error: selectErr } = await admin
      .from('razorpay_webhook_events')
      .select('id, status, lease_token, lease_expires_at, processed_at')
      .eq('event_id', eventId)
      .maybeSingle()

    // Missing column check: if status or lease_token column does not exist yet on DB
    if (selectErr) {
      if (
        selectErr.message?.includes('column') ||
        selectErr.message?.includes('does not exist') ||
        selectErr.code === '42703'
      ) {
        console.error('[Webhook] Schema migration missing required webhook tracking columns:', selectErr.message)
        return { claimed: false, reason: 'migration_pending', isRetryable: true }
      }
      console.warn('[Webhook] Select error during claim:', selectErr)
      return { claimed: false, reason: 'claim_error', isRetryable: true }
    }

    if (existing) {
      // 1. If already completed, idempotently acknowledge
      if (existing.status === 'completed') {
        return { claimed: false, reason: 'already_completed', isRetryable: false }
      }

      // 2. If currently processing: check if lease is still active
      const processedTime = new Date(existing.processed_at || 0).getTime()
      const expiryTime = existing.lease_expires_at
        ? new Date(existing.lease_expires_at).getTime()
        : processedTime + leaseDurationMs
      const isLeaseActive = existing.status === 'processing' && expiryTime > now

      if (isLeaseActive) {
        // In-flight duplicate: another worker is actively executing.
        // Return retryable in_flight status so caller does NOT acknowledge HTTP 200 prematurely.
        return { claimed: false, reason: 'in_flight', isRetryable: true }
      }

      // 3. Lease has expired OR prior attempt failed: atomically re-claim the lease with fencing token
      const { data: reClaimed, error: updateErr } = await admin
        .from('razorpay_webhook_events')
        .update({
          status: 'processing',
          lease_token: leaseToken,
          lease_expires_at: leaseExpiresAt,
          processed_at: new Date().toISOString(),
          error: null,
        })
        .eq('id', existing.id)
        .eq('status', existing.status)
        .select('id')

      if (updateErr || !reClaimed || reClaimed.length === 0) {
        return { claimed: false, reason: 'concurrent_claim_lost', isRetryable: true }
      }
      return { claimed: true, leaseToken }
    }

    // 4. Brand new event: atomically reserve the lease
    const { error: insertErr } = await admin
      .from('razorpay_webhook_events')
      .insert({
        event_id: eventId,
        event_type: eventType,
        payload,
        status: 'processing',
        lease_token: leaseToken,
        lease_expires_at: leaseExpiresAt,
        processed_at: new Date().toISOString(),
      })

    if (insertErr) {
      // Missing column check (migration dependency)
      if (
        insertErr.message?.includes('column') ||
        insertErr.message?.includes('does not exist') ||
        insertErr.code === '42703'
      ) {
        console.error('[Webhook] Schema migration missing required webhook tracking columns:', insertErr.message)
        return { claimed: false, reason: 'migration_pending', isRetryable: true }
      }

      // Duplicate key: concurrent worker inserted at exact same millisecond
      if (
        insertErr.code === '23505' ||
        insertErr.message?.includes('duplicate key') ||
        insertErr.message?.includes('unique constraint')
      ) {
        return { claimed: false, reason: 'in_flight', isRetryable: true }
      }

      console.warn('[Webhook] Failed to insert webhook event claim:', insertErr)
      return { claimed: false, reason: 'claim_error', isRetryable: true }
    }

    return { claimed: true, leaseToken }
  } catch (err: any) {
    console.error('[Webhook] Fatal claim error:', err)
    return { claimed: false, reason: 'claim_error', isRetryable: true }
  }
}

async function markWebhookCompleted(admin: any, eventId: string, leaseToken?: string) {
  try {
    let query = admin
      .from('razorpay_webhook_events')
      .update({ status: 'completed', processed_at: new Date().toISOString(), error: null })
      .eq('event_id', eventId)

    if (leaseToken) {
      query = query.eq('lease_token', leaseToken)
    }
    await query
  } catch (err) {
    console.warn('[Webhook] Failed to mark completed:', err)
  }
}

async function markWebhookFailed(admin: any, eventId: string, errorMsg: string, leaseToken?: string) {
  try {
    let query = admin
      .from('razorpay_webhook_events')
      .update({ status: 'failed', error: errorMsg, processed_at: new Date().toISOString() })
      .eq('event_id', eventId)

    if (leaseToken) {
      query = query.eq('lease_token', leaseToken)
    }
    await query
  } catch (err) {
    console.warn('[Webhook] Failed to mark failed:', err)
  }
}

async function isLeaseValid(admin: any, eventId: string, leaseToken?: string): Promise<boolean> {
  if (!leaseToken) return true
  try {
    const { data } = await admin
      .from('razorpay_webhook_events')
      .select('lease_token, status')
      .eq('event_id', eventId)
      .maybeSingle()
    return data?.lease_token === leaseToken && data?.status === 'processing'
  } catch {
    return false
  }
}

export async function POST(req: NextRequest) {
  try {
    // 1. Read raw request body as text for cryptographic HMAC signature verification
    const rawBody = await req.text()
    const signature = req.headers.get('x-razorpay-signature')

    if (!signature) {
      console.warn('Razorpay webhook missing signature header')
      return NextResponse.json({ error: 'Missing webhook signature' }, { status: 400 })
    }

    const isValid = verifyWebhookSignature(rawBody, signature)
    if (!isValid) {
      console.error('Invalid Razorpay webhook signature')
      return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 400 })
    }

    const payload = JSON.parse(rawBody)
    const eventId =
      req.headers.get('x-razorpay-event-id') ||
      payload.event_id ||
      payload.id ||
      `${payload.event}_${payload.created_at || Date.now()}`
    const eventType: string = payload.event
    const eventEntity = payload.payload?.subscription?.entity || payload.payload?.payment?.entity

    if (!eventEntity && !payload.payload?.refund) {
      // Unrelated event, acknowledge cleanly
      return NextResponse.json({ status: 'ignored_unrelated' }, { status: 200 })
    }

    const admin = await createAdminClient()

    // 2. Atomic Idempotency Claim: prevent concurrent duplicate execution
    const claim = await claimWebhookEvent(admin, eventId, eventType, payload)
    if (!claim.claimed) {
      if (claim.reason === 'already_completed') {
        return NextResponse.json({ status: 'already_completed' }, { status: 200 })
      }
      if (claim.reason === 'in_flight') {
        return NextResponse.json(
          { status: 'in_flight', message: 'Webhook event is currently being processed by another worker' },
          { status: 429, headers: { 'Retry-After': '30' } }
        )
      }
      if (claim.reason === 'migration_pending') {
        return NextResponse.json(
          { error: 'Database schema pending migration' },
          { status: 500 }
        )
      }
      if (claim.isRetryable) {
        return NextResponse.json(
          { status: claim.reason || 'contention', message: 'Concurrent worker lease contention' },
          { status: 429, headers: { 'Retry-After': '10' } }
        )
      }
      return NextResponse.json({ status: claim.reason || 'unprocessed' }, { status: 200 })
    }

    // 3. Process Subscription & Payment Lifecycle Events
    const subscriptionEntity = payload.payload?.subscription?.entity
    const paymentEntity = payload.payload?.payment?.entity
    const refundEntity = payload.payload?.refund?.entity
    const subscriptionId =
      subscriptionEntity?.id || eventEntity?.subscription_id || paymentEntity?.subscription_id
    const userId =
      subscriptionEntity?.notes?.user_id ||
      paymentEntity?.notes?.user_id ||
      refundEntity?.notes?.user_id

    // Find the matching subscription row in Supabase
    let existingSub: any = null
    let targetOwnerId = userId

    if (subscriptionId) {
      const { data: foundSubs } = await admin
        .from('subscriptions')
        .select('*')
        .eq('razorpay_subscription_id', subscriptionId)
        .order('updated_at', { ascending: false })
        .limit(1)
      if (foundSubs && foundSubs.length > 0) {
        existingSub = foundSubs[0]
        targetOwnerId = existingSub.owner_id
      }
    }

    if (!targetOwnerId && paymentEntity?.id) {
      const { data: foundByPayment } = await admin
        .from('subscriptions')
        .select('*')
        .eq('razorpay_payment_id', paymentEntity.id)
        .order('updated_at', { ascending: false })
        .limit(1)
      if (foundByPayment && foundByPayment.length > 0) {
        existingSub = foundByPayment[0]
        targetOwnerId = existingSub.owner_id
      }
    }

    if (!existingSub && targetOwnerId) {
      const { data: foundByUser } = await admin
        .from('subscriptions')
        .select('*')
        .eq('owner_id', targetOwnerId)
        .order('updated_at', { ascending: false })
        .limit(1)
      if (foundByUser && foundByUser.length > 0) {
        existingSub = foundByUser[0]
      }
    }

    if (targetOwnerId) {
      const isSameSubscription = Boolean(
        existingSub?.razorpay_subscription_id &&
        subscriptionId &&
        existingSub.razorpay_subscription_id === subscriptionId
      )

      // Out-of-order event check:
      // If user has already renewed with a newer subscription and active paid-through date,
      // do not let a delayed cancellation or failure for a replaced older subscription override it.
      if (
        !isSameSubscription &&
        existingSub?.razorpay_subscription_id &&
        subscriptionId &&
        existingSub.status === 'active' &&
        existingSub.current_period_end &&
        new Date(existingSub.current_period_end).getTime() > Date.now()
      ) {
        if (
          eventType === 'subscription.cancelled' ||
          eventType.startsWith('mandate.') ||
          eventType === 'subscription.halted' ||
          eventType === 'subscription.paused' ||
          eventType === 'payment.failed'
        ) {
          console.warn(
            `[Webhook] Ignored ${eventType} event for replaced subscription ${subscriptionId}; active subscription is ${existingSub.razorpay_subscription_id}`
          )
          await markWebhookCompleted(admin, eventId, claim.leaseToken)
          return NextResponse.json({ status: 'ignored_stale_subscription' }, { status: 200 })
        }
      }

      const nowMs = Date.now()
      const updateData: Record<string, any> = {
        updated_at: new Date().toISOString(),
      }

      if (subscriptionId) {
        updateData.razorpay_subscription_id = subscriptionId
      }
      if (subscriptionEntity?.notes?.plan_tier) {
        updateData.plan = subscriptionEntity.notes.plan_tier
      }

      switch (eventType) {
        case 'subscription.charged': {
          // A cycle charge succeeded (first payment or recurring renewal)
          const startTs = subscriptionEntity?.current_start
          const endTs = subscriptionEntity?.current_end
          const periodStart = startTs
            ? new Date(startTs * 1000).toISOString()
            : new Date().toISOString()
          let periodEnd: string
          if (endTs) {
            periodEnd = new Date(endTs * 1000).toISOString()
          } else {
            const isYearly =
              subscriptionEntity?.plan_id?.includes('yearly') ||
              existingSub?.plan === 'yearly' ||
              subscriptionEntity?.notes?.plan_type === 'yearly'
            periodEnd = new Date(nowMs + (isYearly ? 365 : 30) * 86400000).toISOString()
          }

          updateData.status = 'active'
          updateData.autopay_status = 'active'
          updateData.payment_status = 'paid'
          updateData.cancel_at_period_end = false
          updateData.canceled_at = null
          updateData.current_period_start = periodStart
          updateData.current_period_end = periodEnd
          updateData.trial_end = null

          const paymentId = paymentEntity?.id || payload.payload?.payment?.entity?.id
          if (paymentId) {
            updateData.razorpay_payment_id = paymentId
          }
          break
        }

        case 'subscription.activated': {
          // Subscription activated on Razorpay
          updateData.status = 'active'
          updateData.autopay_status = 'active'
          updateData.cancel_at_period_end = false
          updateData.trial_end = null

          // INVARIANT: Never inherit an old subscription's payment ID or payment status!
          // Only mark payment_status = 'paid' if there is proof of captured payment for THIS subscription.
          const isCapturedPayment = paymentEntity?.status === 'captured'
          const isSameSubPaid = isSameSubscription && existingSub?.payment_status === 'paid'

          if (isCapturedPayment || isSameSubPaid) {
            updateData.payment_status = 'paid'
            if (paymentEntity?.id) {
              updateData.razorpay_payment_id = paymentEntity.id
            }
          } else {
            updateData.payment_status = 'pending'
          }

          if (subscriptionEntity?.current_start) {
            updateData.current_period_start = new Date(
              subscriptionEntity.current_start * 1000
            ).toISOString()
          }
          if (subscriptionEntity?.current_end) {
            updateData.current_period_end = new Date(
              subscriptionEntity.current_end * 1000
            ).toISOString()
          }
          break
        }

        case 'subscription.authenticated': {
          // Customer authorized recurring mandate (starts 7-day trial)
          updateData.autopay_status = 'active'

          if (subscriptionEntity?.start_at) {
            updateData.status = 'trialing'
            updateData.trial_start = new Date().toISOString()
            updateData.trial_end = new Date(subscriptionEntity.start_at * 1000).toISOString()
          } else if (existingSub?.trial_end && new Date(existingSub.trial_end).getTime() > nowMs) {
            updateData.status = 'trialing'
          }
          // Note: If trial has already expired and no payment was made, do NOT grant active access!
          break
        }

        case 'subscription.cancelled':
        case 'mandate.revoked':
        case 'mandate.cancelled': {
          // AutoPay mandate cancelled or revoked (e.g. customer cancelled AutoPay in UPI app)
          // Stop future automatic debits
          updateData.status = 'canceled'
          updateData.autopay_status = 'revoked'
          updateData.cancel_at_period_end = true
          updateData.canceled_at = new Date().toISOString()

          // Determine the paid-through date with strict integrity:
          // A cancellation event MUST NEVER fraudulently extend access. It can ONLY preserve
          // a paid billing period supported by a legitimate prior payment or verified cycle.
          const hasLegitimatePayment = Boolean(existingSub?.razorpay_payment_id)
          const isRefunded = existingSub?.payment_status === 'refunded'

          // Use previously verified paid-through date; fall back to event current_end only if existing was unset
          const eventEndTs = subscriptionEntity?.current_end
          const eventPeriodEnd = eventEndTs ? new Date(eventEndTs * 1000).toISOString() : null
          const paidThrough = existingSub?.current_period_end || eventPeriodEnd || null
          const isPaidPeriodActive = paidThrough ? new Date(paidThrough).getTime() > nowMs : false

          if (isPaidPeriodActive && hasLegitimatePayment && !isRefunded) {
            // Customer legitimately paid for the full period; maintain paid-through date
            // while recording the subscription as cancelled with AutoPay revoked.
            updateData.current_period_end = paidThrough
            updateData.payment_status = 'paid'
          } else {
            // Period has already ended or user cancelled before making any payment or payment refunded
            if (existingSub?.trial_end && new Date(existingSub.trial_end).getTime() > nowMs && !isRefunded) {
              updateData.status = 'trialing'
            } else {
              updateData.status = 'canceled'
              updateData.ended_at = new Date().toISOString()
            }
          }
          break
        }

        case 'subscription.pending': {
          // Renewal charge attempt failed or in retry queue
          updateData.autopay_status = 'pending'
          // Invariant: Do not erase a previously paid-through date!
          if (existingSub?.current_period_end) {
            updateData.current_period_end = existingSub.current_period_end
            if (new Date(existingSub.current_period_end).getTime() <= nowMs) {
              updateData.status = 'past_due'
            }
          } else {
            updateData.status = 'past_due'
          }
          break
        }

        case 'subscription.halted': {
          // Retries exhausted
          updateData.autopay_status = 'failed'
          if (
            existingSub?.current_period_end &&
            new Date(existingSub.current_period_end).getTime() > nowMs
          ) {
            updateData.current_period_end = existingSub.current_period_end
          } else {
            updateData.status = 'expired'
            updateData.ended_at = new Date().toISOString()
          }
          break
        }

        case 'subscription.paused': {
          updateData.autopay_status = 'paused'
          break
        }

        case 'subscription.resumed': {
          updateData.autopay_status = 'active'
          updateData.cancel_at_period_end = false
          break
        }

        case 'subscription.completed': {
          // All scheduled cycles finished
          updateData.autopay_status = 'completed'
          if (
            existingSub?.current_period_end &&
            new Date(existingSub.current_period_end).getTime() > nowMs
          ) {
            updateData.status = 'active'
            updateData.cancel_at_period_end = true
          } else {
            updateData.status = 'expired'
            updateData.ended_at = new Date().toISOString()
          }
          break
        }

        case 'payment.failed': {
          // Payment attempt failed: preserve existing paid-through date
          if (
            existingSub?.current_period_end &&
            new Date(existingSub.current_period_end).getTime() > nowMs
          ) {
            updateData.current_period_end = existingSub.current_period_end
          } else {
            updateData.payment_status = 'failed'
          }
          break
        }

        case 'refund.processed': {
          const refundedPaymentId = refundEntity?.payment_id || paymentEntity?.id
          const activePaymentId = existingSub?.razorpay_payment_id

          // 1. Payment match check: Ignore refund if it does not match current active payment
          if (!activePaymentId || refundedPaymentId !== activePaymentId) {
            console.log(
              `[Webhook] Refund for prior/unmatched payment ${refundedPaymentId} processed. Active payment ${activePaymentId} retained.`
            )
            break
          }

          // 2. Cumulative and full refund check: Only a confirmed full refund of current payment revokes access
          const totalChargeAmount = Number(paymentEntity?.amount || 0)
          const cumulativeRefunded = Number(paymentEntity?.amount_refunded || refundEntity?.amount || 0)
          const isFullRefund =
            paymentEntity?.refund_status === 'full' ||
            (totalChargeAmount > 0 && cumulativeRefunded >= totalChargeAmount)

          if (isFullRefund) {
            updateData.status = 'canceled'
            updateData.payment_status = 'refunded'
            updateData.ended_at = new Date().toISOString()
            updateData.current_period_end = new Date().toISOString()
            updateData.cancel_at_period_end = true
            console.warn(
              `[Webhook] Full refund confirmed for active payment ${activePaymentId}. Paid access revoked.`
            )
          } else {
            console.log(
              `[Webhook] Partial refund processed (${cumulativeRefunded}/${totalChargeAmount}) for ${activePaymentId}. Active access retained.`
            )
          }
          break
        }

        case 'refund.created':
        case 'refund.failed':
        case 'refund.speed_changed': {
          // Acknowledge cleanly without modifying subscription entitlement
          break
        }

        default:
          break
      }

      // 3b. Fencing Token Check: Verify this worker's lease is still active before writing
      const isLeaseActive = await isLeaseValid(admin, eventId, claim.leaseToken)
      if (!isLeaseActive) {
        console.warn(
          `[Webhook] Fencing token expired for event ${eventId}. Worker aborted without writing.`
        )
        return NextResponse.json({ error: 'Worker lease expired' }, { status: 409 })
      }

      const { success: persistOk, error: persistErr } = await persistSubscriptionToDatabase(
        admin,
        targetOwnerId,
        updateData,
        subscriptionId
      )

      if (!persistOk) {
        console.error(
          `❌ Webhook failed to persist subscription: user=${targetOwnerId}, error=${persistErr}`
        )
        await markWebhookFailed(admin, eventId, persistErr || 'Database persistence failed')
        return NextResponse.json(
          { error: persistErr || 'Failed to persist subscription to database' },
          { status: 500 }
        )
      }

      console.log(
        `✔ Webhook updated subscription: user=${targetOwnerId}, status=${updateData.status || existingSub?.status}, event=${eventType}`
      )
    }

    // 4. Mark event as completed in idempotency log using fencing token
    await markWebhookCompleted(admin, eventId, claim.leaseToken)

    return NextResponse.json({ status: 'ok', processed: true }, { status: 200 })
  } catch (error: any) {
    console.error('Fatal webhook processing error:', error)
    try {
      const admin = await createAdminClient()
      const rawEventId = req.headers.get('x-razorpay-event-id') || 'unknown'
      await markWebhookFailed(admin, rawEventId, error?.message || 'Webhook error')
    } catch {}
    return NextResponse.json({ error: error?.message || 'Webhook error' }, { status: 500 })
  }
}
