'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function AdminLoginPage() {
  const router = useRouter()
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (authError || !data?.user) {
      setError('Invalid admin credentials.')
      setLoading(false)
      return
    }

    const { data: baseProfile, error: profileError } = await supabase
      .from('profiles')
      .select('role, status')
      .eq('id', data.user.id)
      .maybeSingle()

    if (profileError || baseProfile?.role !== 'super_admin' || baseProfile.status !== 'active') {
      await supabase.auth.signOut()
      setError('This account does not have platform super administrator access.')
      setLoading(false)
      return
    }

    // Safely check if first-login password change is flagged
    let needsSecuritySetup = false
    try {
      const { data: extProfile } = await supabase
        .from('profiles')
        .select('must_change_password')
        .eq('id', data.user.id)
        .maybeSingle()

      if (extProfile?.must_change_password === true) {
        needsSecuritySetup = true
      }
    } catch {}

    if (needsSecuritySetup) {
      router.push('/admin/setup-security')
      router.refresh()
      return
    }

    router.push('/admin')
    router.refresh()
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#403a34] px-5 py-10">
      <div className="w-full max-w-md rounded-3xl border border-[#705b47] bg-[#51483f] p-7 text-[#f8f0e5] shadow-2xl">
        <div className="mb-8 flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-2xl bg-[#c39d72] text-white">
            <ShieldCheck className="size-5" />
          </div>
          <div>
            <p className="font-bold">StayNest</p>
            <p className="text-[11px] uppercase tracking-[0.16em] text-[#cbbfaf]">Platform Admin</p>
          </div>
        </div>

        <h1 className="text-2xl font-bold tracking-tight">Admin sign in</h1>
        <p className="mt-2 text-sm text-[#cbbfaf]">Manage the StayNest platform securely.</p>

        <form onSubmit={submit} className="mt-7 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-[#eadbca]">
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="rounded-xl border border-[#806d5a] bg-[#403a34] px-3 py-3 text-sm text-white outline-none focus:border-[#c39d72]"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-xs font-semibold text-[#eadbca]">
            Password
            <div className="relative">
              <input
                type={show ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full rounded-xl border border-[#806d5a] bg-[#403a34] px-3 py-3 pr-11 text-sm text-white outline-none focus:border-[#c39d72]"
              />
              <button
                type="button"
                onClick={() => setShow(!show)}
                aria-label="Toggle password visibility"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#cbbfaf]"
              >
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </label>

          {error && (
            <p role="alert" className="rounded-xl bg-[#6d493e] px-3 py-2.5 text-xs text-[#f7d2c5]">
              {error}
            </p>
          )}

          <button
            disabled={loading}
            className="flex items-center justify-center gap-2 rounded-xl bg-[#c39d72] py-3 text-sm font-semibold text-[#403a34] disabled:opacity-60 hover:bg-[#b08b62] transition-colors"
          >
            {loading && <Loader2 className="size-4 animate-spin" />}
            Sign in to admin
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-[#cbbfaf]">
          <Link href="/" className="hover:underline">
            Return to public website
          </Link>
        </p>
      </div>
    </main>
  )
}
