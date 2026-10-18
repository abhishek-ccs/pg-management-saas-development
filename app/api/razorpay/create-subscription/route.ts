import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getRazorpayInstance, getRazorpayPlanId, SubscriptionPlanType } from '@/lib/razorpay'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    // 1. Verify user authentication with Supabase
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required. Please log in to select a subscription plan.' },
        { status: 401 }
      )
    }

    // 2. Parse and validate plan selection
    const body = await req.json().catch(() => ({}))
    const planType: SubscriptionPlanType = body.planType === 'yearly' ? 'yearly' : 'monthly'

    const keyId = process.env.RAZORPAY_KEY_ID
    const planId = getRazorpayPlanId(planType)
    const razorpay = getRazorpayInstance()

    // 3. Inspect existing subscription state in Supabase to determine trial eligibility
    const { data: existingSub } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('owner_id', user.id)
      .maybeSingle()

    const nowMs = Date.now()
    const trialEndMs = existingSub?.trial_end ? new Date(existingSub.trial_end).getTime() : 0
    const hasActivePaidSub = existingSub?.status === 'active' || Boolean(existingSub?.razorpay_payment_id)
    const isTrialExpired = (trialEndMs > 0 && trialEndMs <= nowMs) || existingSub?.status === 'expired'

    // Free trial eligibility law:
    // - Customers whose trial has expired or who already had a paid subscription must be charged immediately.
    // - Eligible new customers (or active unexpired trial users) preserve their 7-day trial before the first recurring charge.
    let isTrialEligible = false
    let startAt: number | null = null

    if (!hasActivePaidSub && !isTrialExpired) {
      if (!existingSub) {
        // Brand new customer: eligible for full 7-day trial
        isTrialEligible = true
        startAt = Math.floor(nowMs / 1000) + 7 * 24 * 60 * 60
      } else if (existingSub.status === 'trialing' && trialEndMs > nowMs) {
        const remainingSeconds = Math.floor((trialEndMs - nowMs) / 1000)
        // Razorpay API requirement: start_at must be at least 15 minutes (900s) in the future
        if (remainingSeconds >= 900) {
          isTrialEligible = true
          startAt = Math.floor(trialEndMs / 1000)
        }
      }
    }

    const subscriptionPayload: any = {
      plan_id: planId,
      total_count: planType === 'yearly' ? 10 : 120, // 10 years or 120 months
      quantity: 1,
      customer_notify: 1,
      notes: {
        user_id: user.id,
        user_email: user.email || '',
        plan_type: planType,
        app: 'BaseraBook',
      },
    }

    // Only pass start_at for customers eligible for trial.
    // For expired trial customers, omitting start_at charges the first payment immediately
    // during Checkout, transitioning the subscription to 'active' rather than 'authenticated'.
    if (isTrialEligible && startAt) {
      subscriptionPayload.start_at = startAt
    }

    // 4. Create the subscription on Razorpay server
    const subscription: any = await razorpay.subscriptions.create(subscriptionPayload)

    // 5. Track pending subscription in database via service-role admin client
    // Security & lifecycle invariant: NEVER prematurely mark status as 'active' before payment is verified.
    try {
      const admin = await createAdminClient()
      const pendingStatus =
        existingSub?.status === 'active'
          ? 'active'
          : isTrialEligible
          ? 'trialing'
          : (existingSub?.status || 'expired')

      const updateData: Record<string, any> = {
        owner_id: user.id,
        plan: planType,
        status: pendingStatus,
        razorpay_subscription_id: subscription.id,
        razorpay_plan_id: planId,
        updated_at: new Date().toISOString(),
      }

      if (!existingSub && isTrialEligible && startAt) {
        updateData.trial_start = new Date().toISOString()
        updateData.trial_end = new Date(startAt * 1000).toISOString()
      }

      const { error: upsertErr } = await admin
        .from('subscriptions')
        .upsert(updateData, { onConflict: 'owner_id' })

      if (upsertErr) {
        // Fallback for case where extended columns are not yet executed in Supabase SQL Editor
        await admin.from('subscriptions').upsert(
          {
            owner_id: user.id,
            plan: planType,
            status: pendingStatus,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'owner_id' }
        )
      }
    } catch (dbErr) {
      console.warn('Non-fatal: failed to pre-save pending subscription to DB:', dbErr)
    }

    // 6. Return only the safe public identifiers needed to launch Razorpay Checkout
    return NextResponse.json({
      subscriptionId: subscription.id,
      keyId,
      planType,
      isTrial: isTrialEligible,
      amount: planType === 'yearly' ? 14999 : 1699,
      user: {
        id: user.id,
        email: user.email,
        name: user.user_metadata?.full_name || '',
      },
    })
  } catch (error: any) {
    console.error('Error creating Razorpay subscription:', error)
    return NextResponse.json(
      {
        error:
          error?.message ||
          'Failed to initialize subscription with Razorpay. Please check configuration.',
      },
      { status: 500 }
    )
  }
}
