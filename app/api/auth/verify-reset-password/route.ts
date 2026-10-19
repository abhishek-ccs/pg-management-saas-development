import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { isValidEmail, validatePassword } from '@/lib/validation'
import { verifyOtp } from '@/lib/security/otp-store'
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

    // 1. Rate Limiting on Reset Attempts
    const rateCheck = await checkSharedRateLimit(`otp_verify:${ip}`, ROUTE_LIMITS.otp_verify)
    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: 'Too many verification attempts. Please wait before trying again.',
          retryAfterSec: rateCheck.retryAfterSec || 60,
        },
        { status: 429 }
      )
    }

    const body = await request.json()
    const { email, otp, newPassword } = body || {}

    // 2. Strict Input Validation
    if (!email || typeof email !== 'string' || !isValidEmail(email)) {
      return NextResponse.json(
        { success: false, error: 'Please enter a valid email address.' },
        { status: 400 }
      )
    }

    if (!otp || typeof otp !== 'string' || !/^\d{6}$/.test(otp.trim())) {
      return NextResponse.json(
        { success: false, error: 'Please enter a valid 6-digit numeric verification code.' },
        { status: 400 }
      )
    }

    const passValidation = validatePassword(newPassword)
    if (!passValidation.valid) {
      return NextResponse.json(
        { success: false, error: passValidation.error || 'Password does not meet security requirements.' },
        { status: 400 }
      )
    }

    const cleanEmail = email.toLowerCase().trim()
    const cleanOtp = otp.trim()

    // 3. Cryptographic Verification & Expiry Check (5-min max)
    const verifyResult = verifyOtp(cleanEmail, cleanOtp, 'password_reset')
    if (!verifyResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: verifyResult.message,
          remainingAttempts: verifyResult.remainingAttempts,
        },
        { status: 400 }
      )
    }

    // 4. Update Password in Supabase via Admin Client
    const admin = await createAdminClient()
    const { data: userListData } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    const user = userListData?.users?.find(
      (u) => u.email?.toLowerCase() === cleanEmail
    )

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Account not found. Please initiate password reset again.' },
        { status: 404 }
      )
    }

    const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
      password: newPassword,
    })

    if (updateError) {
      logger.error('Failed to update password:', updateError)
      return NextResponse.json(
        { success: false, error: 'Could not update password. Please try again.' },
        { status: 500 }
      )
    }

    // 5. Audit Log Entry
    try {
      await admin.from('platform_audit_logs').insert({
        actor_id: user.id,
        action: 'password_reset_success',
        target_type: 'user',
        target_id: user.id,
        metadata: { ip, reset_at: new Date().toISOString() },
      })
    } catch {}

    return NextResponse.json({
      success: true,
      message: 'Your password has been reset successfully. You can now sign in with your new password.',
    })
  } catch (err: any) {
    logger.error('Unexpected error in verify-reset-password:', err)
    return NextResponse.json(
      { success: false, error: 'An unexpected error occurred while resetting your password.' },
      { status: 500 }
    )
  }
}
