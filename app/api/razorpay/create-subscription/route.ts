import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getRazorpayInstance, getRazorpayPlanId, SubscriptionPlanType } from '@/lib/razorpay'
import {
  resolveAuthoritativeSubscription,
  persistSubscriptionToDatabase,
  resolveTrialSchedule,
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

    // 2. Parse and validate plan selection and customer phone
    const body = await req.json().catch(() => ({}))
    const planType: SubscriptionPlanType = body.planType === 'yearly' ? 'yearly' : 'monthly'
    const planTier: string = body.plan || body.planTier || 'growth'

    const keyId = process.env.RAZORPAY_KEY_ID
    const planId = getRazorpayPlanId(planType, planTier)
    const razorpay = getRazorpayInstance()

    // Fetch user profile from Supabase profiles table
    const { data: profile } = await supabase
      .from('profiles')
      .select('phone, full_name')
      .eq('id', user.id)
      .maybeSingle()

    // Customer phone prefill logic:
    // Only populate with the current authenticated customer's phone from:
    // 1. Explicitly provided body.phone from checkout confirmation
    // 2. Supabase Auth user.phone
    // 3. Supabase Auth user.user_metadata.phone
    // 4. Supabase public.profiles.phone
    // NEVER use the website owner's phone or any hardcoded fallback.
    const providedPhone = typeof body.phone === 'string' ? body.phone.trim() : ''
    const customerPhone = (
      providedPhone ||
      user.phone ||
      user.user_metadata?.phone ||
      profile?.phone ||
      ''
    ).trim()

    // Persist explicitly provided customer phone to profiles if not previously stored
    if (providedPhone && !profile?.phone) {
      try {
        await supabase
          .from('profiles')
          .update({ phone: providedPhone, updated_at: new Date().toISOString() })
          .eq('id', user.id)
      } catch (phoneErr) {
        console.warn('Non-fatal: failed to update customer profile phone:', phoneErr)
      }
    }

    const customerName = (
      (typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name.trim() : '') ||
      (profile?.full_name || '').trim() ||
      user.email?.split('@')[0] ||
      ''
    ).trim()

    // Canonical plan pricing in INR
    const planPrices: Record<string, { monthly: number; yearly: number }> = {
      starter: { monthly: 1099, yearly: 9999 },
      growth: { monthly: 1799, yearly: 17990 },
      business: { monthly: 2799, yearly: 27990 },
    }
    const resolvedAmount = planPrices[planTier]?.[planType] || (planType === 'yearly' ? 17990 : 1799)

    // 3. Inspect existing subscription state in Supabase to determine trial eligibility
    const { data: existingRows } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('owner_id', user.id)
      .order('updated_at', { ascending: false })

    const nowMs = Date.now()
    const resolvedState = resolveAuthoritativeSubscription(existingRows, nowMs)
    const trialSchedule = resolveTrialSchedule(existingRows, nowMs)
    const isTrialEligible = trialSchedule.isTrialEligible
    const startAt = trialSchedule.startAt

    const subscriptionPayload: any = {
      plan_id: planId,
      total_count: planType === 'yearly' ? 10 : 120, // 10 years or 120 months
      quantity: 1,
      customer_notify: 1,
      ...(user.email
        ? {
            notify_info: {
              notify_email: user.email.trim().toLowerCase(),
              ...(customerPhone ? { notify_phone: customerPhone } : {}),
            },
          }
        : {}),
      notes: {
        user_id: user.id,
        user_email: user.email || '',
        user_phone: customerPhone,
        plan_type: planType,
        plan_tier: planTier,
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
    // Security & lifecycle invariant: NEVER prematurely mark status as 'active' or 'trialing' before
    // payment/mandate authorization is verified server-side.
    try {
      const admin = await createAdminClient()
      // Preserve existing active status if user already has an active subscription;
      // otherwise, set status to 'created' (pending authorization).
      const pendingStatus = resolvedState.status === 'active' ? 'active' : 'created'

      const targetPlan = planTier

      const updateData: Record<string, any> = {
        owner_id: user.id,
        plan: targetPlan,
        status: pendingStatus,
        razorpay_subscription_id: subscription.id,
        razorpay_plan_id: planId,
        updated_at: new Date().toISOString(),
      }

      await persistSubscriptionToDatabase(admin, user.id, updateData)
    } catch (dbErr) {
      console.warn('Non-fatal: failed to pre-save pending subscription to DB:', dbErr)
    }

    // 6. Return safe public identifiers and disclosure details needed to launch Razorpay Checkout
    return NextResponse.json({
      subscriptionId: subscription.id,
      keyId,
      planType,
      plan: planTier,
      isTrial: isTrialEligible,
      trialEnd: isTrialEligible && startAt ? new Date(startAt * 1000).toISOString() : null,
      amount: resolvedAmount,
      billingInterval: planType === 'yearly' ? 'year' : 'month',
      chargeImmediate: trialSchedule.chargeImmediate,
      reason: trialSchedule.reason,
      user: {
        id: user.id,
        email: user.email,
        name: customerName,
        phone: customerPhone,
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
