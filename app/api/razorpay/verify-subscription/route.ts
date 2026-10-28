import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import {
  getRazorpayInstance,
  verifySubscriptionPaymentSignature,
  SubscriptionPlanType,
} from '@/lib/razorpay'
import { persistSubscriptionToDatabase } from '@/lib/subscription'
import { sendSubscriptionActivatedEmail } from '@/lib/email/client'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate user
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized. Please sign in to verify subscription.' },
        { status: 401 }
      )
    }

    // 2. Parse payload from Razorpay Checkout handler
    const body = await req.json().catch(() => ({}))
    const {
      razorpay_payment_id,
      razorpay_subscription_id,
      razorpay_signature,
      planType,
    }: {
      razorpay_payment_id?: string
      razorpay_subscription_id?: string
      razorpay_signature?: string
      planType?: SubscriptionPlanType
    } = body

    if (!razorpay_payment_id || !razorpay_subscription_id || !razorpay_signature) {
      return NextResponse.json(
        { error: 'Incomplete verification parameters from payment provider.' },
        { status: 400 }
      )
    }

    // 3. Cryptographically verify signature on server
    const isSignatureValid = verifySubscriptionPaymentSignature({
      paymentId: razorpay_payment_id,
      subscriptionId: razorpay_subscription_id,
      signature: razorpay_signature,
    })

    if (!isSignatureValid) {
      console.error('Razorpay subscription signature verification failed:', {
        userId: user.id,
        subscriptionId: razorpay_subscription_id,
        paymentId: razorpay_payment_id,
      })
      return NextResponse.json(
        { error: 'Invalid payment signature. Verification failed.' },
        { status: 400 }
      )
    }

    // 4. Fetch the authoritative subscription details from Razorpay API
    const razorpay = getRazorpayInstance()
    const rzpSub: any = await razorpay.subscriptions.fetch(razorpay_subscription_id)

    if (!rzpSub) {
      return NextResponse.json(
        { error: 'Subscription not found in Razorpay records.' },
        { status: 404 }
      )
    }

    // Security check: ensure subscription was not initiated for a different user
    if (rzpSub.notes?.user_id && rzpSub.notes.user_id !== user.id) {
      console.error('Subscription user mismatch:', {
        expected: user.id,
        found: rzpSub.notes.user_id,
      })
      return NextResponse.json(
        { error: 'Subscription does not belong to the current authenticated user.' },
        { status: 403 }
      )
    }

    // 5. Update BaseraBook database status via service-role admin client
    const targetPlan = (body.plan || rzpSub.notes?.plan_tier || planType || rzpSub.notes?.plan_type || 'growth') as string

    // Security & Lifecycle check: Subscription must be confirmed active or authenticated
    if (rzpSub.status !== 'active' && rzpSub.status !== 'authenticated') {
      console.warn('Subscription in non-activatable status:', {
        userId: user.id,
        subscriptionId: razorpay_subscription_id,
        rzpStatus: rzpSub.status,
      })
      return NextResponse.json(
        {
          error: `Subscription payment could not be confirmed. Status with payment provider: ${rzpSub.status}.`,
          status: rzpSub.status,
        },
        { status: 400 }
      )
    }

    const admin = await createAdminClient()

    // Fetch existing subscription to check if renewing an active period
    const { data: existingRows } = await admin
      .from('subscriptions')
      .select('*')
      .eq('owner_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(1)
    const existingSub = existingRows?.[0] || null

    // Requirement 6: Do not grant access merely because mandate is authenticated
    // if customer trial has expired and payment was not charged
    if (rzpSub.status === 'authenticated') {
      const isTrialUnexpired = existingSub?.trial_end && new Date(existingSub.trial_end).getTime() > Date.now()
      if (!isTrialUnexpired && !rzpSub.start_at) {
        return NextResponse.json(
          {
            error: 'Subscription mandate authorized, but payment has not been processed and trial has expired. Access requires verified payment.',
            status: rzpSub.status,
          },
          { status: 400 }
        )
      }
    }

    const normalizedStatus = rzpSub.status === 'active' ? 'active' : 'trialing'
    const isYearly = targetPlan === 'yearly' || planType === 'yearly' || (rzpSub.notes?.plan_type === 'yearly')
    const durationDays = isYearly ? 365 : 30
    const nowMs = Date.now()

    let periodStart = rzpSub.current_start ? new Date(rzpSub.current_start * 1000).toISOString() : new Date().toISOString()
    let periodEnd: string | null = null

    if (rzpSub.current_end) {
      periodEnd = new Date(rzpSub.current_end * 1000).toISOString()
    } else if (normalizedStatus === 'active') {
      // If renewing an existing active subscription before expiry, extend from existing period end:
      if (existingSub?.current_period_end && new Date(existingSub.current_period_end).getTime() > nowMs) {
        const baseTime = new Date(existingSub.current_period_end).getTime()
        periodEnd = new Date(baseTime + durationDays * 86400000).toISOString()
      } else {
        periodEnd = new Date(nowMs + durationDays * 86400000).toISOString()
      }
    }

    const updatePayload: Record<string, any> = {
      owner_id: user.id,
      plan: targetPlan,
      status: normalizedStatus,
      razorpay_subscription_id,
      razorpay_payment_id,
      autopay_status: 'active',
      payment_status: normalizedStatus === 'active' ? 'paid' : 'pending',
      cancel_at_period_end: false,
      canceled_at: null,
      updated_at: new Date().toISOString(),
    }

    if (periodStart) {
      updatePayload.current_period_start = periodStart
    }
    if (periodEnd) {
      updatePayload.current_period_end = periodEnd
    }

    // When subscription is active, customer is an active paid subscriber: clear trial_end
    if (normalizedStatus === 'active') {
      updatePayload.trial_end = null
    } else if (normalizedStatus === 'trialing') {
      if (rzpSub.start_at) {
        updatePayload.trial_start = new Date().toISOString()
        updatePayload.trial_end = new Date(rzpSub.start_at * 1000).toISOString()
      } else if (existingSub?.trial_end) {
        updatePayload.trial_end = existingSub.trial_end
      }
    }

    const { success: persistOk, error: persistErr } = await persistSubscriptionToDatabase(
      admin,
      user.id,
      updatePayload
    )

    if (!persistOk) {
      console.error('[VerifySubscription] Database persistence error:', persistErr)
      return NextResponse.json(
        {
          error:
            'Subscription authorized with payment gateway, but database persistence failed. Our system will synchronize automatically via webhook.',
          warning: persistErr,
          status: normalizedStatus,
          plan: targetPlan,
          subscriptionId: razorpay_subscription_id,
        },
        { status: 500 }
      )
    }

    // 6. Send transactional confirmation email directly to the customer's authenticated email address
    if (user.email) {
      try {
        const planPrices: Record<string, { monthly: number; yearly: number }> = {
          starter: { monthly: 1099, yearly: 9999 },
          growth: { monthly: 1799, yearly: 17990 },
          business: { monthly: 2799, yearly: 27990 },
        }
        const effectiveInterval = planType === 'yearly' ? 'yearly' : 'monthly'
        const effectiveAmount =
          planPrices[targetPlan]?.[effectiveInterval] ||
          (effectiveInterval === 'yearly' ? 17990 : 1799)
        const customerName =
          (typeof user.user_metadata?.full_name === 'string'
            ? user.user_metadata.full_name.trim()
            : '') || user.email.split('@')[0]

        const planDisplayNames: Record<string, string> = {
          starter: 'Starter',
          growth: 'Growth',
          business: 'Business',
          enterprise: 'Enterprise',
        }
        const formattedPlanName = planDisplayNames[targetPlan] || targetPlan.toUpperCase()

        await sendSubscriptionActivatedEmail({
          to: user.email,
          customerName,
          planName: formattedPlanName,
          billingInterval: effectiveInterval,
          amount: effectiveAmount,
          isTrial: normalizedStatus === 'trialing',
          trialEnd: updatePayload.trial_end || null,
          subscriptionId: razorpay_subscription_id,
        })
      } catch (emailErr) {
        console.warn('Non-fatal: failed to dispatch customer subscription confirmation email:', emailErr)
      }
    }

    return NextResponse.json({
      success: true,
      status: normalizedStatus,
      plan: targetPlan,
      subscriptionId: razorpay_subscription_id,
    })
  } catch (error: any) {
    console.error('Subscription verification error:', error)
    return NextResponse.json(
      { error: error?.message || 'Server error verifying subscription.' },
      { status: 500 }
    )
  }
}
