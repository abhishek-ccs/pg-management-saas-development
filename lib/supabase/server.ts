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

  // 1. Guaranteed baseline profile columns
  const { data: baseProfile, error: baseError } = await supabase
    .from('profiles')
    .select('id, email, full_name, phone, role, status, created_at, updated_at')
    .eq('id', user.id)
    .maybeSingle()

  if (baseError || !baseProfile) {
    return { user, profile: null }
  }

  // 2. Resilient check for optional/extended security and preference columns
  let mustChangePassword = false
  let mfaEnrolled = false
  let preferredLanguage = 'en'

  try {
    const { data: extProfile } = await supabase
      .from('profiles')
      .select('must_change_password, mfa_enrolled, preferred_language')
      .eq('id', user.id)
      .maybeSingle()

    if (extProfile) {
      if (typeof extProfile.must_change_password === 'boolean') {
        mustChangePassword = extProfile.must_change_password
      }
      if (typeof extProfile.mfa_enrolled === 'boolean') {
        mfaEnrolled = extProfile.mfa_enrolled
      }
      if (extProfile.preferred_language) {
        preferredLanguage = extProfile.preferred_language
      }
    }
  } catch {
    // Schema doesn't have extended columns yet - safe fallback
  }

  const profile = {
    ...baseProfile,
    must_change_password: mustChangePassword,
    mfa_enrolled: mfaEnrolled,
    preferred_language: preferredLanguage,
  }

  return { user, profile }
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



