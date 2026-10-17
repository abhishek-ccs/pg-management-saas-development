import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { isValidEmail } from '@/lib/validation'
import { storeOtp, checkResendCooldown } from '@/lib/security/otp-store'
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

    // 1. Token Bucket Rate Limiting
    const rateCheck = await checkSharedRateLimit(`otp_send:${ip}`, ROUTE_LIMITS.otp_send)
    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: 'Too many requests. Please wait before requesting another code.',
          retryAfterSec: rateCheck.retryAfterSec || 30,
        },
        { status: 429 }
      )
    }

    const body = await request.json()
    const { fullName, email, password } = body || {}

    // 2. Strict Input Validation
    if (!fullName || typeof fullName !== 'string' || fullName.trim().length < 2 || fullName.trim().length > 100) {
      return NextResponse.json(
        { success: false, error: 'Please enter a valid full name (2–100 characters).' },
        { status: 400 }
      )
    }

    if (!email || typeof email !== 'string' || !isValidEmail(email)) {
      return NextResponse.json(
        { success: false, error: 'Please enter a valid email address.' },
        { status: 400 }
      )
    }

    if (!password || typeof password !== 'string' || password.length < 6 || password.length > 72) {
      return NextResponse.json(
        { success: false, error: 'Password must be between 6 and 72 characters.' },
        { status: 400 }
      )
    }

    const cleanEmail = email.toLowerCase().trim()
    const cleanName = fullName.trim()

    // 3. Resend Cooldown Check
    const cooldownCheck = checkResendCooldown(cleanEmail, 'signup_verification')
    if (!cooldownCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: `Please wait ${cooldownCheck.remainingSec}s before requesting a new code.`,
          remainingSec: cooldownCheck.remainingSec,
        },
        { status: 429 }
      )
    }

    const admin = await createAdminClient()

    // 4. Check if user already exists and is verified
    const { data: userListData } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    const existingUser = userListData?.users?.find(
      (u) => u.email?.toLowerCase() === cleanEmail
    )

    if (existingUser && existingUser.email_confirmed_at) {
      return NextResponse.json(
        {
          success: false,
          error: 'An account with this email is already registered. Please sign in instead.',
        },
        { status: 400 }
      )
    }

    // 5. Generate 6-digit signup OTP via Supabase Auth Admin
    const linkRes = await admin.auth.admin.generateLink({
      type: 'signup',
      email: cleanEmail,
      password,
      options: {
        data: { full_name: cleanName },
      },
    })

    if (linkRes.error) {
      logger.error('Supabase generateLink signup error:', linkRes.error)
      return NextResponse.json(
        {
          success: false,
          error: linkRes.error.message.toLowerCase().includes('already')
            ? 'This email is already registered. Please sign in.'
            : 'Unable to initiate account registration. Please verify your details.',
        },
        { status: 400 }
      )
    }

    const emailOtp = linkRes.data?.properties?.email_otp
    if (!emailOtp || emailOtp.length !== 6) {
      logger.error('Failed to generate 6-digit OTP from Supabase Admin')
      return NextResponse.json(
        { success: false, error: 'Could not generate verification code. Please try again.' },
        { status: 500 }
      )
    }

    // 6. Securely hash and store OTP with 5-minute expiry and attempt tracking
    storeOtp(cleanEmail, emailOtp, 'signup_verification')

    // 7. Dispatch branded OTP email via Resend
    const emailResult = await sendOtpEmail({
      to: cleanEmail,
      otp: emailOtp,
      purpose: 'signup',
      name: cleanName,
    })

    if (!emailResult.success) {
      logger.error('Signup OTP email dispatch failed via Resend:', {
        to: cleanEmail,
        error: emailResult.error,
      })
      return NextResponse.json(
        {
          success: false,
          error: emailResult.error
            ? `Unable to send verification email: ${emailResult.error}`
            : 'Failed to send verification email. Please try again.',
        },
        { status: 502 }
      )
    }

    return NextResponse.json({
      success: true,
      message: `A 6-digit verification code has been sent to ${cleanEmail}. It expires in 5 minutes.`,
    })
  } catch (err: any) {
    logger.error('Unexpected error in signup-otp:', err)
    return NextResponse.json(
      { success: false, error: 'An unexpected error occurred. Please try again later.' },
      { status: 500 }
    )
  }
}
