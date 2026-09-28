import { NextRequest } from 'next/server'
import { createClient, createAdminClient, writeAudit } from '@/lib/supabase/server'
import { apiError, apiSuccess } from '@/lib/api-response'

export const dynamic = 'force-dynamic'

/**
 * GDPR (Article 17) & India DPDP Act 2023 Right to Erasure / Account Deletion Endpoint
 * Safely executes self-service account termination, freeing beds and removing personal records.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return apiError('UNAUTHORIZED', 'Authentication required to initiate account deletion.', 401)
    }

    const body = await request.json().catch(() => ({}))
    if (body.confirmation !== 'DELETE MY ACCOUNT') {
      return apiError(
        'VALIDATION_FAILED',
        'Explicit confirmation phrase "DELETE MY ACCOUNT" is required to prevent accidental erasure.',
        400
      )
    }

    const admin = await createAdminClient()

    // 1. Verify user role: prevent super_admin self-deletion via this route
    const { data: profile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()

    if (profile?.role === 'super_admin') {
      return apiError('FORBIDDEN', 'Super Admin accounts cannot be erased via self-service deletion.', 403)
    }

    // 2. Audit log the deletion request prior to record removal
    await admin.from('platform_audit_logs').insert({
      actor_id: user.id,
      action: 'account_self_deletion',
      target_type: 'profile',
      target_id: user.id,
      metadata: {
        email: user.email,
        deletedAt: new Date().toISOString(),
        reason: body.reason || 'User requested account erasure under privacy rights.',
      },
    })

    // 3. Free all beds configured under this owner
    await admin.from('beds').update({ status: 'available' }).eq('owner_id', user.id)

    // 4. Cascade delete user data (cascades properties, rooms, beds, tenants, etc.)
    await admin.from('profiles').delete().eq('id', user.id)

    // 5. Delete Supabase Auth user credentials
    await admin.auth.admin.deleteUser(user.id)

    // 6. Sign out current session
    await supabase.auth.signOut()

    return apiSuccess({
      message: 'Your account and associated personal property records have been permanently erased.',
    })
  } catch (err: any) {
    return apiError('INTERNAL_ERROR', 'An error occurred during account deletion.', 500, err?.message)
  }
}
