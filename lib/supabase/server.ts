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
  const { data: profile } = await supabase.from('profiles').select('id,email,full_name,role,status').eq('id', user.id).maybeSingle()
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
  return createSupabaseClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function writeAudit(action: string, targetType: string, targetId?: string, metadata: Record<string, unknown> = {}) {
  const { user, profile } = await getCurrentProfile()
  if (!user || !isSuperAdmin(profile)) return false
  const admin = await createAdminClient()
  await admin.from('platform_audit_logs').insert({ actor_id: user.id, action, target_type: targetType, target_id: targetId ?? null, metadata })
  return true
}

export async function ensureSuperAdmin(email: string) {
  if (email !== 'sharmavn258@gmail.com') return false
  const admin = await createAdminClient()
  const { data: userData } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const user = userData.users.find((candidate) => candidate.email?.toLowerCase() === email)
  if (!user) return false
  const { error } = await admin.from('profiles').upsert({ id: user.id, email, role: 'super_admin', status: 'active' }, { onConflict: 'id' })
  return !error
}

export async function getPlatformCounts() {
  const admin = await createAdminClient()
  const [profiles, audit] = await Promise.all([
    admin.from('profiles').select('id, email, full_name, role, status, created_at').order('created_at', { ascending: false }),
    admin.from('platform_audit_logs').select('id, action, target_type, created_at, metadata').order('created_at', { ascending: false }).limit(50),
  ])
  return { profiles: profiles.data ?? [], audit: audit.data ?? [] }
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
  await writeAudit('extend_trial', 'profile', id, { days })
  return true
}

export async function extendSubscription(id: string, days: number) {
  const current = await requireSuperAdmin()
  if (!current) return false
  await writeAudit('extend_subscription', 'profile', id, { days })
  return true
}
