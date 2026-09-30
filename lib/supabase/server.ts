import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {}
        },
      },
    },
  )
}

export async function getCurrentProfile() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { user: null, profile: null }
  const { data: profile } = await supabase
    .from('profiles')
    .select('id,email,full_name,role,status,must_change_password,mfa_enrolled,preferred_language')
    .eq('id', user.id)
    .maybeSingle()
  return { user, profile }
}

export function isSuperAdmin(profile: { role?: string; status?: string } | null) {
  return profile?.role === 'super_admin' && profile.status === 'active'
}

export function isPgOwner(profile: { role?: string; status?: string } | null) {
  return profile?.role === 'pg_owner' && profile.status === 'active'
}

export async function createAdminClient() {
  const { createClient: createSupabaseClient } = await import('@supabase/supabase-js')
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variable. Server admin operations require valid credentials.'
    )
  }
  return createSupabaseClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function writeAudit(action: string, targetType: string, targetId?: string, metadata: Record<string, unknown> = {}) {
  const { user, profile } = await getCurrentProfile()
  if (!user || !isSuperAdmin(profile)) return false
  const admin = await createAdminClient()
  await admin.from('platform_audit_logs').insert({ actor_id: user.id, action, target_type: targetType, target_id: targetId ?? null, metadata })
  return true
}

export async function ensureSuperAdmin(email: string) {
  const allowedAdmins = (process.env.SUPER_ADMIN_EMAILS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean)
  if (!allowedAdmins.includes(email.toLowerCase())) return false

  const admin = await createAdminClient()
  const { data: userData } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const user = userData.users.find((candidate) => candidate.email?.toLowerCase() === email.toLowerCase())
  if (!user) return false
  const { error } = await admin.from('profiles').upsert({ id: user.id, email: user.email ?? email, role: 'super_admin', status: 'active' }, { onConflict: 'id' })
  return !error
}

export async function getPlatformCounts() {
  const admin = await createAdminClient()
  const [profiles, audit, properties, tenants, subscriptions, payments] = await Promise.all([
    admin.from('profiles').select('id, email, full_name, role, status, created_at').order('created_at', { ascending: false }),
    admin.from('platform_audit_logs').select('id, action, target_type, created_at, metadata').order('created_at', { ascending: false }).limit(50),
    admin.from('properties').select('id, owner_id, name, city, contact_number, created_at'),
    admin.from('tenants').select('id, owner_id, full_name, status, monthly_rent, created_at'),
    admin.from('subscriptions').select('id, owner_id, plan, status, trial_start, trial_end, current_period_end'),
    admin.from('payments').select('id, amount, paid_at, payment_method'),
  ])
  return {
    profiles: profiles.data ?? [],
    audit: audit.data ?? [],
    properties: properties.data ?? [],
    tenants: tenants.data ?? [],
    subscriptions: subscriptions.data ?? [],
    payments: payments.data ?? [],
  }
}

export async function requireSuperAdmin() {
  const current = await getCurrentProfile()
  if (!isSuperAdmin(current.profile)) return null
  return current
}

export async function requirePgOwner() {
  const current = await getCurrentProfile()
  if (!isPgOwner(current.profile)) return null
  return current
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
}

export async function signIn(email: string, password: string) {
  const supabase = await createClient()
  return supabase.auth.signInWithPassword({ email, password })
}

export async function signUp(email: string, password: string, fullName: string) {
  const supabase = await createClient()
  return supabase.auth.signUp({ email, password, options: { data: { full_name: fullName }, emailRedirectTo: process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL ?? 'http://localhost:3000/auth/callback' } })
}

export async function getServerUser() {
  const supabase = await createClient()
  return supabase.auth.getUser()
}

export async function getSupabase() { return createClient() }

export async function getPropertyData(userId: string) {
  const supabase = await createClient()
  return supabase.from('properties').select('*').eq('owner_id', userId).order('created_at', { ascending: false })
}

export async function getTenantData(userId: string) {
  const supabase = await createClient()
  return supabase.from('tenants').select('*').eq('owner_id', userId).order('created_at', { ascending: false })
}

export async function getPaymentData(userId: string) {
  const supabase = await createClient()
  return supabase.from('payments').select('*').eq('owner_id', userId).order('paid_at', { ascending: false })
}

export async function getComplaintData(userId: string) {
  const supabase = await createClient()
  return supabase.from('complaints').select('*').eq('owner_id', userId).order('created_at', { ascending: false })
}

export async function getExpenseData(userId: string) {
  const supabase = await createClient()
  return supabase.from('expenses').select('*').eq('owner_id', userId).order('created_at', { ascending: false })
}

export async function getElectricityData(userId: string) {
  const supabase = await createClient()
  return supabase.from('electricity_readings').select('*').eq('owner_id', userId).order('created_at', { ascending: false })
}

export async function getRoomsData(userId: string) {
  const supabase = await createClient()
  return supabase.from('rooms').select('*').eq('owner_id', userId).order('created_at', { ascending: false })
}

export async function getOwnerDashboard(userId: string) {
  return Promise.all([getPropertyData(userId), getTenantData(userId), getPaymentData(userId), getComplaintData(userId), getExpenseData(userId), getElectricityData(userId), getRoomsData(userId)])
}

export async function getProfileByEmail(email: string) {
  const admin = await createAdminClient()
  return admin.from('profiles').select('id,email,full_name,role,status').eq('email', email).maybeSingle()
}

export async function suspendProfile(id: string, status: 'active' | 'suspended') {
  const current = await requireSuperAdmin()
  if (!current) return false
  const admin = await createAdminClient()
  const { error } = await admin.from('profiles').update({ status, updated_at: new Date().toISOString() }).eq('id', id).neq('role', 'super_admin')
  if (!error) await writeAudit(status === 'active' ? 'reactivate_customer' : 'suspend_customer', 'profile', id)
  return !error
}

export async function extendTrial(id: string, days: number) {
  const current = await requireSuperAdmin()
  if (!current) return false

  const admin = await createAdminClient()
  const { data: sub } = await admin.from('subscriptions').select('id,trial_end').eq('owner_id', id).maybeSingle()

  const baseDate = sub?.trial_end ? new Date(sub.trial_end) : new Date()
  const newTrialEnd = new Date(Math.max(Date.now(), baseDate.getTime()) + days * 86400000).toISOString()

  let updateError = null
  if (sub) {
    const { error } = await admin
      .from('subscriptions')
      .update({ trial_end: newTrialEnd, status: 'trialing', updated_at: new Date().toISOString() })
      .eq('owner_id', id)
    updateError = error
  } else {
    const { error } = await admin.from('subscriptions').insert({
      owner_id: id,
      plan: 'trial',
      status: 'trialing',
      trial_start: new Date().toISOString(),
      trial_end: newTrialEnd,
    })
    updateError = error
  }

  if (!updateError) {
    await writeAudit('extend_trial', 'profile', id, { days, newTrialEnd })
    return true
  }
  return false
}

export async function extendSubscription(id: string, days: number) {
  const current = await requireSuperAdmin()
  if (!current) return false

  const admin = await createAdminClient()
  const { data: sub } = await admin.from('subscriptions').select('id,current_period_end').eq('owner_id', id).maybeSingle()

  const baseDate = sub?.current_period_end ? new Date(sub.current_period_end) : new Date()
  const newPeriodEnd = new Date(Math.max(Date.now(), baseDate.getTime()) + days * 86400000).toISOString()

  let updateError = null
  if (sub) {
    const { error } = await admin
      .from('subscriptions')
      .update({ current_period_end: newPeriodEnd, status: 'active', updated_at: new Date().toISOString() })
      .eq('owner_id', id)
    updateError = error
  } else {
    const { error } = await admin.from('subscriptions').insert({
      owner_id: id,
      plan: 'starter',
      status: 'active',
      current_period_start: new Date().toISOString(),
      current_period_end: newPeriodEnd,
    })
    updateError = error
  }

  if (!updateError) {
    await writeAudit('extend_subscription', 'profile', id, { days, newPeriodEnd })
    return true
  }
  return false
}

export async function updateCustomerPlan(id: string, plan: 'trial' | 'monthly' | 'yearly') {
  const current = await requireSuperAdmin()
  if (!current) return false

  const admin = await createAdminClient()
  const { error } = await admin
    .from('subscriptions')
    .upsert({
      owner_id: id,
      plan,
      status: plan === 'trial' ? 'trialing' : 'active',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'owner_id' })

  if (!error) {
    await writeAudit('change_plan', 'subscription', id, { plan })
    return true
  }
  return false
}

export async function deleteCustomerProfile(id: string) {
  const current = await requireSuperAdmin()
  if (!current) return { success: false, error: 'Unauthorized.' }

  const admin = await createAdminClient()

  // 1. Check target profile
  const { data: targetProfile } = await admin
    .from('profiles')
    .select('id, email, role')
    .eq('id', id)
    .maybeSingle()

  if (!targetProfile) {
    return { success: false, error: 'Customer profile not found.' }
  }

  // Founder deletion immunity check
  const founderEmails = (process.env.SUPER_ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)

  if (
    targetProfile.role === 'super_admin' ||
    founderEmails.includes(targetProfile.email.toLowerCase())
  ) {
    return {
      success: false,
      error: 'Platform founders and super administrators are protected by deletion immunity.',
    }
  }

  // Delete user from auth (cascades all owner data)
  const { error: deleteAuthError } = await admin.auth.admin.deleteUser(id)
  if (deleteAuthError) {
    return { success: false, error: deleteAuthError.message }
  }

  await writeAudit('delete_customer', 'profile', id, {
    deletedEmail: targetProfile.email,
  })

  return { success: true }
}

export async function getPlatformAuditLogs() {
  const current = await requireSuperAdmin()
  if (!current) return []
  const admin = await createAdminClient()
  const { data } = await admin
    .from('platform_audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)
  return data || []
}

