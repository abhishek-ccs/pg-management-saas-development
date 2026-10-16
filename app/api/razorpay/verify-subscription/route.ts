import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import {
  getRazorpayInstance,
  verifySubscriptionPaymentSignature,
  SubscriptionPlanType,
} from '@/lib/razorpay'

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
    const targetPlan = (planType || rzpSub.notes?.plan_type || 'monthly') as SubscriptionPlanType
    const normalizedStatus =
      rzpSub.status === 'active'
        ? 'active'
        : rzpSub.status === 'authenticated'
        ? 'trialing'
        : 'active'

    const admin = await createAdminClient()

    const updatePayload: Record<string, any> = {
      owner_id: user.id,
      plan: targetPlan,
      status: normalizedStatus,
      razorpay_subscription_id,
      razorpay_payment_id,
      updated_at: new Date().toISOString(),
    }

    if (rzpSub.current_start) {
      updatePayload.current_period_start = new Date(rzpSub.current_start * 1000).toISOString()
    }
    if (rzpSub.current_end) {
      updatePayload.current_period_end = new Date(rzpSub.current_end * 1000).toISOString()
    }

    const { error: dbError } = await admin
      .from('subscriptions')
      .upsert(updatePayload, { onConflict: 'owner_id' })

    if (dbError) {
      console.warn('Failed to save full subscription row, attempting baseline update:', dbError)
      // Fallback for baseline table columns
      await admin.from('subscriptions').upsert(
        {
          owner_id: user.id,
          plan: targetPlan,
          status: normalizedStatus,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'owner_id' }
      )
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
