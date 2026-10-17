import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { isValidEmail } from '@/lib/validation'
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

    // 1. Rate Limiting on Verification Attempts
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
    const { email, otp } = body || {}

    // 2. Input Validation
    if (!email || typeof email !== 'string' || !isValidEmail(email)) {
      return NextResponse.json(
        { success: false, error: 'Please provide a valid email address.' },
        { status: 400 }
      )
    }

    if (!otp || typeof otp !== 'string' || !/^\d{6}$/.test(otp.trim())) {
      return NextResponse.json(
        { success: false, error: 'Please enter a valid 6-digit numeric verification code.' },
        { status: 400 }
      )
    }

    const cleanEmail = email.toLowerCase().trim()
    const cleanOtp = otp.trim()

    // 3. Cryptographic Verification & Brute-Force Check
    const verifyResult = verifyOtp(cleanEmail, cleanOtp, 'signup_verification')
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

    // 4. Update Supabase User: Mark Email Confirmed
    const admin = await createAdminClient()
    const { data: userListData } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    const user = userListData?.users?.find(
      (u) => u.email?.toLowerCase() === cleanEmail
    )

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Account not found. Please start registration again.' },
        { status: 404 }
      )
    }

    // Confirm email in auth.users
    const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
      email_confirm: true,
    })

    if (updateError) {
      logger.error('Failed to update email_confirm on user:', updateError)
    }

    // 5. Ensure Profile Exists and is Active
    const fullName = user.user_metadata?.full_name || cleanEmail.split('@')[0]
    await admin.from('profiles').upsert(
      {
        id: user.id,
        email: cleanEmail,
        full_name: fullName,
        role: 'pg_owner',
        status: 'active',
      },
      { onConflict: 'id' }
    )

    // 6. Record Audit Log
    try {
      await admin.from('platform_audit_logs').insert({
        actor_id: user.id,
        action: 'email_verification_success',
        target_type: 'user',
        target_id: user.id,
        metadata: { email: cleanEmail, verified_at: new Date().toISOString() },
      })
    } catch (auditErr) {
      logger.warn('Audit log write error:', { error: String(auditErr) })
    }

    return NextResponse.json({
      success: true,
      message: 'Email confirmed successfully! Your account is now verified.',
    })
  } catch (err: any) {
    logger.error('Unexpected error in verify-signup-otp:', err)
    return NextResponse.json(
      { success: false, error: 'An unexpected error occurred during verification.' },
      { status: 500 }
    )
  }
}
