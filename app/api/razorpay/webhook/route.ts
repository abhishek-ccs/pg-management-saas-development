import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { verifyWebhookSignature } from '@/lib/razorpay'

export const runtime = 'nodejs'

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
    const eventId = payload.event_id || `${payload.event}_${payload.created_at || Date.now()}`
    const eventType: string = payload.event
    const eventEntity = payload.payload?.subscription?.entity || payload.payload?.payment?.entity

    if (!eventEntity) {
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

    // 3. Process Subscription Lifecycle Events
    const subscriptionEntity = payload.payload?.subscription?.entity
    const subscriptionId = subscriptionEntity?.id || eventEntity.subscription_id
    const userId = subscriptionEntity?.notes?.user_id

    if (subscriptionId) {
      // Find the subscription row either by razorpay_subscription_id or by user_id
      let targetOwnerId = userId

      if (!targetOwnerId) {
        try {
          const { data: foundSub } = await admin
            .from('subscriptions')
            .select('owner_id')
            .eq('razorpay_subscription_id', subscriptionId)
            .maybeSingle()
          targetOwnerId = foundSub?.owner_id
        } catch {
          // Ignore
        }
      }

      if (targetOwnerId) {
        let newStatus: string | null = null

        switch (eventType) {
          case 'subscription.authenticated':
            // Customer authorized recurring mandate (starts 7-day trial)
            newStatus = 'trialing'
            break

          case 'subscription.activated':
            // Subscription is fully active
            newStatus = 'active'
            break

          case 'subscription.charged':
            // A recurring cycle charge succeeded
            newStatus = 'active'
            break

          case 'subscription.pending':
            // Charge attempt failed or is in retry queue
            newStatus = 'past_due'
            break

          case 'subscription.halted':
            // Retries exhausted
            newStatus = 'expired'
            break

          case 'subscription.cancelled':
            // Subscription was cancelled
            newStatus = 'canceled'
            break

          case 'subscription.completed':
            // All scheduled cycles finished
            newStatus = 'expired'
            break

          default:
            break
        }

        if (newStatus) {
          const updateData: Record<string, any> = {
            status: newStatus,
            razorpay_subscription_id: subscriptionId,
            updated_at: new Date().toISOString(),
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

          const { error: updateErr } = await admin
            .from('subscriptions')
            .update(updateData)
            .eq('owner_id', targetOwnerId)

          if (updateErr) {
            // Fallback for baseline columns
            await admin
              .from('subscriptions')
              .update({ status: newStatus, updated_at: new Date().toISOString() })
              .eq('owner_id', targetOwnerId)
          }

          console.log(
            `✔ Webhook updated subscription: user=${targetOwnerId}, status=${newStatus}, event=${eventType}`
          )
        }
      }
    }

    // 4. Record event in idempotency log
    try {
      await admin.from('razorpay_webhook_events').insert({
        event_id: eventId,
        event_type: eventType,
        payload,
        processed_at: new Date().toISOString(),
      })
    } catch {
      // Non-fatal if table pending
    }

    return NextResponse.json({ status: 'ok', processed: true }, { status: 200 })
  } catch (error: any) {
    console.error('Fatal webhook processing error:', error)
    return NextResponse.json({ error: error?.message || 'Webhook error' }, { status: 500 })
  }
}
