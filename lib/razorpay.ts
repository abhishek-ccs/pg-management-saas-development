import Razorpay from 'razorpay'
import crypto from 'node:crypto'

export type SubscriptionPlanType = 'monthly' | 'yearly'

export function getRazorpayInstance(): Razorpay {
  const keyId = process.env.RAZORPAY_KEY_ID
  const keySecret = process.env.RAZORPAY_KEY_SECRET

  if (!keyId || !keySecret) {
    throw new Error('Razorpay credentials (RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET) are missing in environment variables.')
  }

  return new Razorpay({
    key_id: keyId,
    key_secret: keySecret,
  })
}

export function getRazorpayPlanId(planType: SubscriptionPlanType): string {
  const planId =
    planType === 'yearly'
      ? process.env.RAZORPAY_YEARLY_PLAN_ID
      : process.env.RAZORPAY_MONTHLY_PLAN_ID

  if (!planId) {
    throw new Error(
      `Missing Razorpay plan ID for ${planType} subscription. Please set RAZORPAY_${planType.toUpperCase()}_PLAN_ID.`
    )
  }

  return planId
}

/**
 * Verifies the payment signature returned by the client-side Razorpay Checkout modal
 * for a subscription. Format for subscription verification:
 * HMAC_SHA256(razorpay_payment_id + '|' + razorpay_subscription_id, secret) === razorpay_signature
 */
export function verifySubscriptionPaymentSignature({
  paymentId,
  subscriptionId,
  signature,
}: {
  paymentId: string
  subscriptionId: string
  signature: string
}): boolean {
  const keySecret = process.env.RAZORPAY_KEY_SECRET
  if (!keySecret || !paymentId || !subscriptionId || !signature) {
    return false
  }

  const generatedSignature = crypto
    .createHmac('sha256', keySecret)
    .update(`${paymentId}|${subscriptionId}`)
    .digest('hex')

  try {
    return crypto.timingSafeEqual(
      Buffer.from(generatedSignature, 'hex'),
      Buffer.from(signature, 'hex')
    )
  } catch {
    return false
  }
}

/**
 * Validates the raw-body webhook signature using the configured RAZORPAY_WEBHOOK_SECRET.
 */
export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET
  if (!webhookSecret || !signature || !rawBody) {
    return false
  }

  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(rawBody)
    .digest('hex')

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature, 'hex'),
      Buffer.from(signature, 'hex')
    )
  } catch {
    return false
  }
}
