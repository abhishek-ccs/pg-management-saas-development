'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Building2, Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { isValidEmail } from '@/lib/validation'

export const dynamic = 'force-dynamic'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (event.nativeEvent instanceof SubmitEvent && (event.nativeEvent as SubmitEvent).submitter === null) return
    setLoading(true)
    setError('')
    setMessage('')

    if (!isValidEmail(email)) {
      setError('Please enter a valid email address.')
      setLoading(false)
      return
    }

    const supabase = createClient()
    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (authError) {
      setError(
        authError.message.toLowerCase().includes('confirm')
          ? 'Please confirm your email before signing in.'
          : 'Invalid email or password.'
      )
      setLoading(false)
      return
    }

    const destination = new URLSearchParams(window.location.search).get('next') || '/dashboard'
    setMessage('Signed in successfully.')
    router.push(destination)
    router.refresh()
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#f7f3ed] px-5 py-10">
      <div className="w-full max-w-md rounded-3xl border border-[#e8dfd4] bg-white p-7 shadow-sm">
        <div className="mb-8 flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-2xl bg-[#9a7651] text-white">
            <Building2 className="size-5" />
          </div>
          <div>
            <p className="font-bold">StayBook</p>
            <p className="text-[11px] uppercase tracking-[0.16em] text-[#9296a5]">Secure sign in</p>
          </div>
        </div>

        <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
        <p className="mt-2 text-sm text-[#85899a]">Sign in to manage your property or platform.</p>

        <form onSubmit={submit} className="mt-7 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-[#555a6c]">
            Email <span className="text-[#9a7651]">*</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="e.g. owner@example.com"
              className="rounded-xl border border-[#e4d9cc] px-3 py-3 text-sm outline-none focus:border-[#b19372] focus:ring-2 focus:ring-[#f1e8dc]"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-xs font-semibold text-[#555a6c]">
            Password <span className="text-[#9a7651]">*</span>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="Enter your password"
                className="w-full rounded-xl border border-[#e4d9cc] px-3 py-3 pr-11 text-sm outline-none focus:border-[#b19372] focus:ring-2 focus:ring-[#f1e8dc]"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9296a5]"
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </label>

          {error && (
            <p role="alert" className="rounded-xl bg-[#fff0e9] px-3 py-2.5 text-xs font-medium text-[#b95c3c]">
              {error}
            </p>
          )}

          {message && (
            <p className="rounded-xl bg-[#e7f7f0] px-3 py-2.5 text-xs font-medium text-[#328d68]">
              {message}
            </p>
          )}

          <button
            disabled={loading}
            className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-[#9a7651] py-3 text-sm font-semibold text-white disabled:opacity-60 hover:bg-[#866342]"
          >
            {loading && <Loader2 className="size-4 animate-spin" />}
            Sign in
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[#85899a]">
          Don&apos;t have an account yet?{' '}
          <Link href="/signup" className="font-semibold text-[#9a7651] hover:underline">
            Start 7-day free trial
          </Link>
        </p>

        <p className="mt-3 text-center text-xs text-[#a08d79]">
          <Link href="/" className="hover:underline">
            Back to StayBook
          </Link>
        </p>

        <div className="mt-6 flex items-start gap-2 rounded-xl bg-[#f6f5ff] p-3 text-[11px] leading-4 text-[#696c9b]">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" />
          Platform administration is restricted to the server-verified Super Admin account.
        </div>
      </div>
    </main>
  )
}
