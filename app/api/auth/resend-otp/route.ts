import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { isValidEmail } from '@/lib/validation'
import { storeOtp, checkResendCooldown, generateNumericOtp, type OtpPurpose } from '@/lib/security/otp-store'
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

    // 1. Rate Limiting
    const rateCheck = await checkSharedRateLimit(`otp_send:${ip}`, ROUTE_LIMITS.otp_send)
    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: 'Too many resend requests. Please wait a moment before trying again.',
          retryAfterSec: rateCheck.retryAfterSec || 30,
        },
        { status: 429 }
      )
    }

    const body = await request.json()
    const { email, purpose } = body || {}

    // 2. Input Validation
    if (!email || typeof email !== 'string' || !isValidEmail(email)) {
      return NextResponse.json(
        { success: false, error: 'Please enter a valid email address.' },
        { status: 400 }
      )
    }

    if (purpose !== 'signup_verification' && purpose !== 'password_reset') {
      return NextResponse.json(
        { success: false, error: 'Invalid verification purpose.' },
        { status: 400 }
      )
    }

    const cleanEmail = email.toLowerCase().trim()
    const otpPurpose = purpose as OtpPurpose

    // 3. Resend Cooldown Check (60s minimum)
    const cooldownCheck = checkResendCooldown(cleanEmail, otpPurpose)
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
    let otp = generateNumericOtp()

    if (otpPurpose === 'password_reset') {
      // Safe user lookup for password reset
      const { data: userListData } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
      const user = userListData?.users?.find(
        (u) => u.email?.toLowerCase() === cleanEmail
      )

      if (user) {
        try {
          const linkRes = await admin.auth.admin.generateLink({
            type: 'recovery',
            email: cleanEmail,
          })
          if (linkRes.data?.properties?.email_otp && linkRes.data.properties.email_otp.length === 6) {
            otp = linkRes.data.properties.email_otp
          }
        } catch {}

        storeOtp(cleanEmail, otp, 'password_reset')
        await sendOtpEmail({
          to: cleanEmail,
          otp,
          purpose: 'password_reset',
          name: user.user_metadata?.full_name || cleanEmail.split('@')[0],
        })
      }

      // Generic response to avoid email enumeration
      return NextResponse.json({
        success: true,
        message: 'A fresh verification code was sent if the account exists.',
      })
    }

    // For signup_verification
    try {
      const linkRes = await admin.auth.admin.generateLink({
        type: 'signup',
        email: cleanEmail,
        password: `TmpPsw_${generateNumericOtp()}!`,
      })
      if (linkRes.data?.properties?.email_otp && linkRes.data.properties.email_otp.length === 6) {
        otp = linkRes.data.properties.email_otp
      }
    } catch {}

    storeOtp(cleanEmail, otp, 'signup_verification')
    await sendOtpEmail({
      to: cleanEmail,
      otp,
      purpose: 'signup',
    })

    return NextResponse.json({
      success: true,
      message: `A fresh 6-digit verification code has been sent to ${cleanEmail}. It expires in 5 minutes.`,
    })
  } catch (err: any) {
    logger.error('Unexpected error in resend-otp:', err)
    return NextResponse.json(
      { success: false, error: 'Could not resend verification code. Please try again.' },
      { status: 500 }
    )
  }
}
