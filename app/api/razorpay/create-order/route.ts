
import { NextResponse } from 'next/server'
import Razorpay from 'razorpay'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function POST() {
  try {
    // 1. Check environment variables
    const keyId = process.env.RAZORPAY_KEY_ID
    const keySecret = process.env.RAZORPAY_KEY_SECRET
    const amount = Number(process.env.STAYBOOK_PLAN_AMOUNT_PAISE)

    if (!keyId || !keySecret || !Number.isSafeInteger(amount) || amount <= 0) {
      return NextResponse.json(
        { error: 'Payment configuration is incomplete.' },
        { status: 500 }
      )
    }

    // 2. Verify the logged-in user
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Please log in to continue.' },
        { status: 401 }
      )
    }

    // 3. Create Razorpay order on the server
    const razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    })

    const order = await razorpay.orders.create({
      amount,
      currency: 'INR',
      receipt: `sb_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`,
      notes: {
        product: 'STAYBOOK',
        customer_id: user.id,
      },
    })

    // 4. Return only the details needed by Checkout
    return NextResponse.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId,
    })
  } catch (error) {
    console.error('Razorpay order creation failed:', error)

    return NextResponse.json(
      { error: 'Unable to start payment. Please try again.' },
      { status: 500 }
    )
  }
}
