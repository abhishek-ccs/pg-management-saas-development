import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { isValidEmail } from '@/lib/validation'
import { storeOtp, checkResendCooldown, generateNumericOtp } from '@/lib/security/otp-store'
import { sendOtpEmail } from '@/lib/email/client'
import { checkSharedRateLimit, ROUTE_LIMITS } from '@/lib/security/rate-limiter'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const ip =
      request.headers.get('x-vercel-ip') ||
      request.headers.get('cf-connecting-ip') ||
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      '127.0.0.1'

    // 1. Rate Limiting on Password Reset Requests
    const rateCheck = await checkSharedRateLimit(`password_reset:${ip}`, ROUTE_LIMITS.password_reset)
    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: 'Too many password reset requests. Please wait before trying again.',
          retryAfterSec: rateCheck.retryAfterSec || 60,
        },
        { status: 429 }
      )
    }

    const body = await request.json()
    const { email } = body || {}

    // 2. Input Validation
    if (!email || typeof email !== 'string' || !isValidEmail(email)) {
      return NextResponse.json(
        { success: false, error: 'Please enter a valid email address.' },
        { status: 400 }
      )
    }

    const cleanEmail = email.toLowerCase().trim()

    // 3. Resend Cooldown Check
    const cooldownCheck = checkResendCooldown(cleanEmail, 'password_reset')
    if (!cooldownCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: `Please wait ${cooldownCheck.remainingSec}s before requesting another code.`,
          remainingSec: cooldownCheck.remainingSec,
        },
        { status: 429 }
      )
    }

    // 4. Uniform Public Response Message (Prevents Account Enumeration / Information Leakage)
    const publicSuccessResponse = {
      success: true,
      message: 'If an account exists with that email address, a 6-digit verification code has been sent.',
    }

    const admin = await createAdminClient()

    // 5. Look up user safely
    const { data: userListData } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    const user = userListData?.users?.find(
      (u) => u.email?.toLowerCase() === cleanEmail
    )

    // If user does not exist, return identical generic response (no information leakage)
    if (!user) {
      logger.info('Password reset requested for non-existent email (silent drop):', { email: cleanEmail })
      return NextResponse.json(publicSuccessResponse)
    }

    // 6. Generate 6-digit recovery OTP
    let otp = generateNumericOtp()
    try {
      const linkRes = await admin.auth.admin.generateLink({
        type: 'recovery',
        email: cleanEmail,
      })
      if (linkRes.data?.properties?.email_otp && linkRes.data.properties.email_otp.length === 6) {
        otp = linkRes.data.properties.email_otp
      }
    } catch (linkErr) {
      logger.warn('Supabase generateLink fallback to numeric OTP:', { error: String(linkErr) })
    }

    // 7. Store hashed OTP with 5-minute expiry in secure tracker
    storeOtp(cleanEmail, otp, 'password_reset')

    // 8. Dispatch Branded Email via Resend
    const fullName = user.user_metadata?.full_name || cleanEmail.split('@')[0]
    await sendOtpEmail({
      to: cleanEmail,
      otp,
      purpose: 'password_reset',
      name: fullName,
    })

    // 9. Record Audit Log
    try {
      await admin.from('platform_audit_logs').insert({
        actor_id: user.id,
        action: 'password_reset_requested',
        target_type: 'user',
        target_id: user.id,
        metadata: { ip, requested_at: new Date().toISOString() },
      })
    } catch {}

    return NextResponse.json(publicSuccessResponse)
  } catch (err: any) {
    logger.error('Unexpected error in forgot-password:', err)
    return NextResponse.json(
      { success: false, error: 'An unexpected error occurred. Please try again later.' },
      { status: 500 }
    )
  }
}
