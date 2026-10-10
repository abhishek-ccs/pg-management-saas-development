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

    // If customer already has an active paid subscription, they do not qualify for a second free trial
    const isAlreadyPaid = existingSub?.status === 'active' && existingSub?.razorpay_subscription_id
    const isTrialEligible = !isAlreadyPaid

    // Razorpay Subscriptions: start_at sets the first charge date.
    // When start_at is in the future, Checkout performs recurring authorization (mandate setup)
    // without charging the first full recurring payment until the trial expires.
    const trialDays = 7
    const startAt = Math.floor(Date.now() / 1000) + trialDays * 24 * 60 * 60

    const subscriptionPayload: any = {
      plan_id: planId,
      total_count: planType === 'yearly' ? 10 : 120, // 10 years or 120 months
      quantity: 1,
      customer_notify: 1,
      notes: {
        user_id: user.id,
        user_email: user.email || '',
        plan_type: planType,
        app: 'STAYBOOK',
      },
    }

    if (isTrialEligible) {
      subscriptionPayload.start_at = startAt
    }

    // 4. Create the subscription on Razorpay server
    const subscription: any = await razorpay.subscriptions.create(subscriptionPayload)

    // 5. Track pending subscription in database via service-role admin client
    try {
      const admin = await createAdminClient()
      const updateData: Record<string, any> = {
        owner_id: user.id,
        plan: planType,
        status: isTrialEligible ? 'trialing' : 'active',
        razorpay_subscription_id: subscription.id,
        razorpay_plan_id: planId,
        updated_at: new Date().toISOString(),
      }

      if (isTrialEligible) {
        updateData.trial_start = new Date().toISOString()
        updateData.trial_end = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000).toISOString()
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
            status: isTrialEligible ? 'trialing' : 'active',
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
