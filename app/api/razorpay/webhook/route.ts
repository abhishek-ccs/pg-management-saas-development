import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { verifyWebhookSignature } from '@/lib/razorpay'
import { persistSubscriptionToDatabase } from '@/lib/subscription'

export const runtime = 'nodejs'

async function recordWebhookEvent(
  admin: any,
  eventId: string,
  eventType: string,
  payload: any
) {
  try {
    await admin.from('razorpay_webhook_events').insert({
      event_id: eventId,
      event_type: eventType,
      payload,
      processed_at: new Date().toISOString(),
    })
  } catch (err) {
    console.warn('[Webhook] Non-fatal: failed to record idempotency log:', err)
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

    // 2. Idempotency Check: prevent duplicate event processing
    try {
      const { data: existingEvent } = await admin
        .from('razorpay_webhook_events')
        .select('id')
        .eq('event_id', eventId)
        .maybeSingle()

      if (existingEvent) {
        // Event has already been processed successfully
        return NextResponse.json({ status: 'already_processed' }, { status: 200 })
      }
    } catch {
      // If table is pending creation, proceed safely
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
      // Out-of-order event check:
      // If user has already renewed with a newer subscription and active paid-through date,
      // do not let a delayed cancellation for a replaced older subscription override it.
      if (
        existingSub?.razorpay_subscription_id &&
        subscriptionId &&
        existingSub.razorpay_subscription_id !== subscriptionId &&
        existingSub.current_period_end &&
        new Date(existingSub.current_period_end).getTime() > Date.now()
      ) {
        console.warn(
          `[Webhook] Ignored event for replaced subscription ${subscriptionId}; active subscription is ${existingSub.razorpay_subscription_id}`
        )
        await recordWebhookEvent(admin, eventId, eventType, payload)
        return NextResponse.json({ status: 'ignored_stale_subscription' }, { status: 200 })
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
          updateData.payment_status = 'paid'
          updateData.cancel_at_period_end = false
          updateData.trial_end = null

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
          updateData.autopay_status = 'revoked'
          updateData.cancel_at_period_end = true
          updateData.canceled_at = new Date().toISOString()

          // Determine the paid-through date
          const eventEndTs = subscriptionEntity?.current_end
          const eventPeriodEnd = eventEndTs ? new Date(eventEndTs * 1000).toISOString() : null
          const paidThrough = eventPeriodEnd || existingSub?.current_period_end || null
          const isPaidPeriodActive = paidThrough ? new Date(paidThrough).getTime() > nowMs : false
          const paidCount =
            subscriptionEntity?.paid_count ?? (existingSub?.razorpay_payment_id ? 1 : 0)

          if (isPaidPeriodActive && paidCount > 0) {
            // CRITICAL INVARIANT: DO NOT immediately cancel customer subscription!
            // Customer paid for the full period; maintain active status until paidThrough.
            updateData.status = 'active'
            updateData.current_period_end = paidThrough
            updateData.payment_status = 'paid'
          } else {
            // Period has already ended or user cancelled before making any payment
            if (existingSub?.trial_end && new Date(existingSub.trial_end).getTime() > nowMs) {
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

        case 'refund.created':
        case 'refund.processed':
        case 'refund.speed_changed': {
          // Customer was refunded: revoke access immediately
          updateData.status = 'canceled'
          updateData.payment_status = 'refunded'
          updateData.ended_at = new Date().toISOString()
          updateData.current_period_end = new Date().toISOString()
          break
        }

        default:
          break
      }

      const { success: persistOk, error: persistErr } = await persistSubscriptionToDatabase(
        admin,
        targetOwnerId,
        updateData
      )

      if (persistOk) {
        console.log(
          `✔ Webhook updated subscription: user=${targetOwnerId}, status=${updateData.status || existingSub?.status}, event=${eventType}`
        )
      } else {
        console.error(
          `❌ Webhook failed to persist subscription: user=${targetOwnerId}, error=${persistErr}`
        )
      }
    }

    // 4. Record event in idempotency log
    await recordWebhookEvent(admin, eventId, eventType, payload)

    return NextResponse.json({ status: 'ok', processed: true }, { status: 200 })
  } catch (error: any) {
    console.error('Fatal webhook processing error:', error)
    return NextResponse.json({ error: error?.message || 'Webhook error' }, { status: 500 })
  }
}
