'use server'

import { revalidatePath } from 'next/cache'
import { suspendProfile, extendTrial, extendSubscription } from '@/lib/supabase/server'

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
