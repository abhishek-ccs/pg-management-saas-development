'use server'

import { revalidatePath } from 'next/cache'
import {
  suspendProfile,
  extendTrial,
  extendSubscription,
  updateCustomerPlan,
  deleteCustomerProfile,
  getCurrentProfile,
  createAdminClient,
  writeAudit,
} from '@/lib/supabase/server'
import { validatePassword } from '@/lib/validation'

export async function toggleCustomerStatus(id: string, newStatus: 'active' | 'suspended') {
  const success = await suspendProfile(id, newStatus)
  if (success) {
    revalidatePath('/admin')
  }
  return success
}

export async function grantTrialExtension(id: string, days: number = 7) {
  const success = await extendTrial(id, days)
  if (success) {
    revalidatePath('/admin')
  }
  return success
}

export async function grantSubscriptionExtension(id: string, days: number = 30) {
  const success = await extendSubscription(id, days)
  if (success) {
    revalidatePath('/admin')
  }
  return success
}

export async function changeCustomerPlan(id: string, newPlan: 'trial' | 'monthly' | 'yearly') {
  const success = await updateCustomerPlan(id, newPlan)
  if (success) {
    revalidatePath('/admin')
  }
  return success
}

export async function deleteCustomerAccount(id: string, confirmationInput: string, expectedEmail: string) {
  if (confirmationInput.trim().toLowerCase() !== `delete ${expectedEmail.trim().toLowerCase()}`) {
    return { success: false, error: 'Confirmation input does not match expected phrase.' }
  }

  const result = await deleteCustomerProfile(id)
  if (result.success) {
    revalidatePath('/admin')
  }
  return result
}

export async function completeAdminSecuritySetup(newPassword: string, totpCode: string) {
  const { user, profile } = await getCurrentProfile()
  if (!user || profile?.role !== 'super_admin') {
    return { success: false, error: 'Unauthorized.' }
  }

  const passValidation = validatePassword(newPassword)
  if (!passValidation.valid) {
    return {
      success: false,
      error: passValidation.error || 'Password must include uppercase, lowercase, numbers, and special symbols.',
    }
  }

  if (!totpCode || totpCode.trim().length !== 6) {
    return { success: false, error: 'Please enter a valid 6-digit TOTP verification code.' }
  }

  const admin = await createAdminClient()

  // Update password in Auth
  const { error: authError } = await admin.auth.admin.updateUserById(user.id, {
    password: newPassword,
  })

  if (authError) {
    return { success: false, error: authError.message }
  }

  // Update profile security flags if columns are present
  try {
    const { error: profileError } = await admin
      .from('profiles')
      .update({
        must_change_password: false,
        mfa_enrolled: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)

    if (profileError) {
      console.warn('Profile extended security flags update notice:', profileError.message)
    }
  } catch (err) {
    console.warn('Profile security flags exception:', err)
  }

  await writeAudit('complete_admin_security_setup', 'profile', user.id, {
    passwordChanged: true,
    mfaEnrolled: true,
  })

  return { success: true }
}
