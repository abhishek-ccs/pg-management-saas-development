'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertCircle, Building2, CheckCircle2, Eye, EyeOff, Loader2, Lock, Mail, ShieldCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { isValidEmail, getSafeRedirectPath } from '@/lib/validation'

export const dynamic = 'force-dynamic'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [unverifiedEmail, setUnverifiedEmail] = useState(false)

  // Detect URL status parameters on mount
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('reset') === 'success') {
      setMessage('Password reset successfully! Please sign in with your new password.')
    }
    if (params.get('error') === 'unverified') {
      setError('Please verify your email before accessing your dashboard.')
      setUnverifiedEmail(true)
    }
  }, [])

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (event.nativeEvent instanceof SubmitEvent && (event.nativeEvent as SubmitEvent).submitter === null) return
    setLoading(true)
    setError('')
    setMessage('')
    setUnverifiedEmail(false)

    if (!isValidEmail(email)) {
      setError('Please enter a valid email address (e.g. owner@example.com).')
      setLoading(false)
      return
    }

    const supabase = createClient()
    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (authError) {
      const isUnconfirmed = authError.message.toLowerCase().includes('confirm')
      setError(
        isUnconfirmed
          ? 'Please verify your email before signing in. Check your inbox for your 6-digit code.'
          : 'Invalid email or password. Please verify your credentials.'
      )
      if (isUnconfirmed) {
        setUnverifiedEmail(true)
      }
      setLoading(false)
      return
    }

    // Check if user email is unconfirmed
    if (data?.user && !data.user.email_confirmed_at) {
      await supabase.auth.signOut()
      setError('Please verify your email before accessing your dashboard.')
      setUnverifiedEmail(true)
      setLoading(false)
      return
    }

    const destination = getSafeRedirectPath(
      new URLSearchParams(window.location.search).get('next'),
      '/dashboard'
    )
    setMessage('Signed in successfully! Opening your workspace...')
    router.push(destination)
    router.refresh()
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#faf7f2] px-3.5 py-8 sm:px-4 sm:py-12">
      <div className="w-full max-w-md rounded-3xl border border-[#e8dfd4] bg-white p-5 sm:p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
        {/* Brand Header */}
        <div className="mb-6 flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-2xl bg-[#8b5a2b] text-white shadow-sm">
            <Building2 className="size-5" />
          </div>
          <div>
            <p className="font-bold text-base text-[#2c221e]">BaseraBook</p>
            <p className="text-[11px] uppercase tracking-[0.16em] text-[#8b5a2b] font-semibold">
              Your Property. Smartly Managed.
            </p>
          </div>
        </div>

        <h1 className="text-2xl font-bold tracking-tight text-[#2c221e]">Sign in to BaseraBook</h1>
        <p className="mt-1 text-xs text-[#676b7d]">
          Manage your rental properties, rooms, beds, and tenant rent collections.
        </p>

        <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-[#555a6c]">
            Email Address <span className="text-[#8b5a2b]">*</span>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-[#999daa]" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="e.g. owner@example.com"
                className="w-full rounded-xl border border-[#e4e6ec] bg-white pl-10 pr-3.5 py-2.5 text-sm font-normal text-[#2c221e] outline-none transition-colors focus:border-[#8b5a2b] focus:ring-1 focus:ring-[#8b5a2b]"
              />
            </div>
          </label>

          <label className="flex flex-col gap-1.5 text-xs font-semibold text-[#555a6c]">
            <div className="flex items-center justify-between">
              <span>Password <span className="text-[#8b5a2b]">*</span></span>
              <Link
                href="/forgot-password"
                className="font-semibold text-[#8b5a2b] hover:underline transition-colors"
              >
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-[#999daa]" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="Enter your account password"
                className="w-full rounded-xl border border-[#e4e6ec] bg-white pl-10 pr-11 py-2.5 text-sm font-normal text-[#2c221e] outline-none transition-colors focus:border-[#8b5a2b] focus:ring-1 focus:ring-[#8b5a2b]"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#999daa] hover:text-[#555a6c] transition-colors p-1"
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </label>

          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-xl border border-[#ffcfc7] bg-[#fff5f2] p-3 text-xs text-[#b95c3c]">
              <AlertCircle className="size-4 shrink-0 mt-0.5 text-[#b95c3c]" />
              <span>{error}</span>
            </div>
          )}

          {message && (
            <div className="flex items-start gap-2 rounded-xl border border-[#a3e4be] bg-[#f0fbf5] p-3 text-xs text-[#236b4e]">
              <CheckCircle2 className="size-4 shrink-0 mt-0.5 text-[#236b4e]" />
              <span>{message}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-1 flex items-center justify-center gap-2 rounded-xl bg-[#8b5a2b] py-3 text-sm font-semibold text-white shadow-xs hover:bg-[#784b20] active:scale-[0.99] disabled:opacity-60 transition-all cursor-pointer min-h-[44px]"
          >
            {loading && <Loader2 className="size-4 animate-spin text-white" />}
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-[#676b7d]">
          Don&apos;t have an account yet?{' '}
          <Link href="/signup" className="font-semibold text-[#8b5a2b] hover:underline">
            Start 7-day free trial
          </Link>
        </p>

        <p className="mt-3 text-center text-xs text-[#85899a]">
          <Link href="/" className="hover:text-[#2c221e] hover:underline transition-colors">
            ← Back to BaseraBook Homepage
          </Link>
        </p>

        <div className="mt-6 flex items-start gap-2 rounded-xl border border-[#e8dfd4] bg-[#faf7f2] p-3 text-[11px] leading-relaxed text-[#7d756d]">
          <ShieldCheck className="size-4 shrink-0 text-[#8b5a2b] mt-0.5" />
          <span>
            Secure encrypted workspace. Super Admin portal access is protected via role-based access control.
          </span>
        </div>
      </div>
    </main>
  )
}
