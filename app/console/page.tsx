'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Eye, EyeOff, Loader2, ShieldCheck, CheckCircle2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

function SuperAdminConsoleContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const isLogout = searchParams.get('logout') === 'true'
  const isUnauthorized = searchParams.get('error') === 'unauthorized'

  // Handle immediate logout cleanup or redirect if already authenticated as super_admin
  useEffect(() => {
    async function checkExistingSession() {
      if (isLogout) {
        await supabase.auth.signOut()
        setNotice('You have been securely signed out from the Super Admin Console.')
        return
      }

      if (isUnauthorized) {
        setError('Super Admin privileges required to access the administrative console.')
      }

      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role, status')
          .eq('id', user.id)
          .maybeSingle()

        if (profile?.role === 'super_admin' && profile?.status === 'active') {
          router.replace('/admin')
        } else {
          // If an owner session is active, sign out to ensure clean slate on /console
          await supabase.auth.signOut()
        }
      }
    }

    checkExistingSession()
  }, [isLogout, isUnauthorized, router, supabase])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setNotice('')

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (authError || !data?.user) {
        setError('Invalid administrator credentials.')
        setLoading(false)
        return
      }

      // Verify Super Admin authorization directly against database
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role, status, must_change_password')
        .eq('id', data.user.id)
        .maybeSingle()

      if (profileError || profile?.role !== 'super_admin' || profile.status !== 'active') {
        // Enforce strict denial: clear any session created for non-super_admin
        await supabase.auth.signOut()
        setError('Access denied. This account does not possess Super Admin privileges.')
        setLoading(false)
        return
      }

      // First-login forced password change check
      if (profile?.must_change_password === true) {
        router.push('/admin/setup-security')
        router.refresh()
        return
      }

      // Verified Super Admin -> Redirect to existing dashboard
      router.push('/admin')
      router.refresh()
    } catch {
      setError('An unexpected error occurred during administrative verification.')
      setLoading(false)
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#36302a] px-5 py-10 selection:bg-[#c39d72] selection:text-white">
      <div className="w-full max-w-md rounded-3xl border border-[#6b5847] bg-[#4a4138] p-7 text-[#f8f0e5] shadow-2xl backdrop-blur-md">
        <div className="mb-8 flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-2xl bg-[#c39d72] text-[#36302a] shadow-inner font-bold">
            <ShieldCheck className="size-6" />
          </div>
          <div>
            <p className="font-bold text-white tracking-wide">StayBook</p>
            <p className="text-[11px] uppercase tracking-[0.18em] text-[#d6c7b6]">Platform Console</p>
          </div>
        </div>

        <h1 className="text-2xl font-bold tracking-tight text-white">Super Admin Access</h1>
        <p className="mt-1.5 text-xs text-[#cbbfaf]">
          Internal governance and system operations. Authorized personnel only.
        </p>

        {notice && (
          <div className="mt-5 flex items-center gap-2 rounded-xl bg-[#2d4a36] border border-[#4d7d5a] px-3.5 py-3 text-xs text-[#d1fae5]">
            <CheckCircle2 className="size-4 shrink-0 text-[#34d399]" />
            <span>{notice}</span>
          </div>
        )}

        {error && (
          <div role="alert" className="mt-5 rounded-xl bg-[#662f26] border border-[#8b3d31] px-3.5 py-3 text-xs text-[#ffe2dc]">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-[#eadbca]">
            Console Email
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="admin@staybook.internal"
              className="rounded-xl border border-[#786654] bg-[#36302a] px-3.5 py-3 text-sm text-white placeholder:text-[#8d7e6f] outline-none focus:border-[#c39d72] transition-colors"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-xs font-semibold text-[#eadbca]">
            Password
            <div className="relative">
              <input
                type={show ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full rounded-xl border border-[#786654] bg-[#36302a] px-3.5 py-3 pr-11 text-sm text-white outline-none focus:border-[#c39d72] transition-colors"
              />
              <button
                type="button"
                onClick={() => setShow(!show)}
                aria-label="Toggle password visibility"
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#cbbfaf] hover:text-white"
              >
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </label>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-[#c39d72] py-3.5 text-sm font-semibold text-[#36302a] disabled:opacity-60 hover:bg-[#b08b62] active:scale-[0.99] transition-all shadow-md"
          >
            {loading && <Loader2 className="size-4 animate-spin text-[#36302a]" />}
            Authenticate Console
          </button>
        </form>

        <div className="mt-7 pt-5 border-t border-[#5c5044] text-center">
          <Link
            href="/"
            className="text-xs text-[#cbbfaf] hover:text-white hover:underline transition-colors"
          >
            Return to Public Website
          </Link>
        </div>
      </div>
    </main>
  )
}

export default function SuperAdminConsolePage() {
  return (
    <Suspense
      fallback={
        <main className="grid min-h-screen place-items-center bg-[#36302a] px-5 py-10">
          <div className="w-full max-w-md rounded-3xl border border-[#6b5847] bg-[#4a4138] p-7 text-[#f8f0e5] shadow-2xl flex items-center justify-center min-h-[400px]">
            <Loader2 className="size-6 animate-spin text-[#c39d72]" />
          </div>
        </main>
      }
    >
      <SuperAdminConsoleContent />
    </Suspense>
  )
}
