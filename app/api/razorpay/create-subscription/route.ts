import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getRazorpayInstance, getRazorpayPlanId, SubscriptionPlanType } from '@/lib/razorpay'
import {
  resolveAuthoritativeSubscription,
  persistSubscriptionToDatabase,
} from '@/lib/subscription'

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
    const { data: existingRows } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('owner_id', user.id)
      .order('updated_at', { ascending: false })

    const nowMs = Date.now()
    const resolvedState = resolveAuthoritativeSubscription(existingRows, nowMs)
    const hasActivePaidSub = resolvedState.status === 'active'
    const isTrialExpired = resolvedState.isTrialExpired

    // Free trial eligibility law:
    // - Customers whose trial has expired or who already have a paid subscription must be charged immediately.
    // - Eligible new customers (or active unexpired trial users) preserve their 7-day trial before the first recurring charge.
    let isTrialEligible = false
    let startAt: number | null = null

    if (!hasActivePaidSub && !isTrialExpired) {
      if (!existingRows || existingRows.length === 0) {
        // Brand new customer: eligible for full 7-day trial
        isTrialEligible = true
        startAt = Math.floor(nowMs / 1000) + 7 * 24 * 60 * 60
      } else if (resolvedState.status === 'trialing' && resolvedState.trialEnd) {
        const trialEndMs = new Date(resolvedState.trialEnd).getTime()
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
        plan_tier: body.plan || 'growth',
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
        resolvedState.status === 'active'
          ? 'active'
          : isTrialEligible
          ? 'trialing'
          : resolvedState.status

      const targetPlan = body.plan || (planType === 'yearly' ? 'growth' : 'growth')

      const updateData: Record<string, any> = {
        owner_id: user.id,
        plan: targetPlan,
        status: pendingStatus,
        razorpay_subscription_id: subscription.id,
        razorpay_plan_id: planId,
        updated_at: new Date().toISOString(),
      }

      if ((!existingRows || existingRows.length === 0) && isTrialEligible && startAt) {
        updateData.trial_start = new Date().toISOString()
        updateData.trial_end = new Date(startAt * 1000).toISOString()
      }

      await persistSubscriptionToDatabase(admin, user.id, updateData)
    } catch (dbErr) {
      console.warn('Non-fatal: failed to pre-save pending subscription to DB:', dbErr)
    }

    // 6. Return only the safe public identifiers needed to launch Razorpay Checkout
    return NextResponse.json({
      subscriptionId: subscription.id,
      keyId,
      planType,
      plan: body.plan || 'growth',
      isTrial: isTrialEligible,
      amount: body.amount || (planType === 'yearly' ? 17990 : 1799),
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
