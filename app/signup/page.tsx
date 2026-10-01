'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Building2, CheckCircle2, Eye, EyeOff, Loader2, Mail, ShieldCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { isValidEmail } from '@/lib/validation'

export default function SignupPage() {
  const router = useRouter()
  const supabase = createClient()
  const [step, setStep] = useState<'form' | 'otp'>('form')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [resending, setResending] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setInterval(() => {
      setCooldown((prev) => (prev > 0 ? prev - 1 : 0))
    }, 1000)
    return () => clearInterval(timer)
  }, [cooldown])

  async function submitSignup(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setMessage('')

    if (!isValidEmail(email)) {
      setError('Please enter a valid email address (e.g. owner@example.com).')
      setLoading(false)
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      setLoading(false)
      return
    }

    const { data, error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL ?? `${window.location.origin}/auth/callback`,
        data: { full_name: fullName.trim() },
      },
    })

    if (authError) {
      setError(
        authError.message.toLowerCase().includes('password')
          ? 'Use a stronger password.'
          : 'We could not create your account. Please check your details.'
      )
      setLoading(false)
      return
    }

    // Check if session was immediately created (e.g. if email confirmation is turned off in Supabase)
    if (data.session) {
      setMessage('Account created! Setting up your workspace...')
      setTimeout(() => router.push('/dashboard'), 1000)
      return
    }

    // Otherwise show OTP verification screen
    setStep('otp')
    setCooldown(60)
    setMessage(`A 6-digit verification code has been sent to ${email.trim()}.`)
    setLoading(false)
  }

  async function handleVerifyOtp(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!otp.trim()) {
      setError('Please enter the 6-digit verification code.')
      return
    }

    setVerifying(true)
    setError('')
    setMessage('')

    const { data, error: verifyError } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: otp.trim(),
      type: 'signup',
    })

    if (verifyError) {
      setError(
        verifyError.message.toLowerCase().includes('expired')
          ? 'Verification code has expired. Please request a new code.'
          : 'Invalid verification code. Please check your email and try again.'
      )
      setVerifying(false)
      return
    }

    setMessage('Email verified successfully! Preparing your workspace...')
    setTimeout(() => {
      router.push('/dashboard')
      router.refresh()
    }, 1200)
  }

  async function handleResendOtp() {
    if (cooldown > 0 || resending) return
    setResending(true)
    setError('')
    setMessage('')

    const { error: resendError } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim(),
    })

    if (resendError) {
      setError('Unable to resend verification code right now. Please wait a moment.')
    } else {
      setMessage(`A fresh verification code was sent to ${email.trim()}.`)
      setCooldown(60)
    }
    setResending(false)
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#fbf8f3] px-5 py-10">
      <div className="w-full max-w-md rounded-3xl border border-[#e8dfd4] bg-white p-7 shadow-sm">
        <div className="mb-8 flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-2xl bg-[#9a7651] text-white">
            <Building2 className="size-5" />
          </div>
          <div>
            <p className="font-bold">StayBook</p>
            <p className="text-[11px] uppercase tracking-[0.16em] text-[#9296a5]">
              {step === 'otp' ? 'Email verification' : 'Create your owner account'}
            </p>
          </div>
        </div>

        {step === 'form' ? (
          <>
            <h1 className="text-2xl font-bold tracking-tight">Start your 7-day free trial</h1>
            <p className="mt-2 text-sm text-[#85899a]">Set up your PG workspace in a few simple steps.</p>

            <form onSubmit={submitSignup} className="mt-7 flex flex-col gap-4">
              <label className="flex flex-col gap-1.5 text-xs font-semibold text-[#555a6c]">
                Full name <span className="text-[#9a7651]">*</span>
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  placeholder="e.g. Rahul Sharma"
                  className="rounded-xl border border-[#e4d9cc] px-3 py-3 text-sm outline-none focus:border-[#b19372]"
                />
              </label>

              <label className="flex flex-col gap-1.5 text-xs font-semibold text-[#555a6c]">
                Email <span className="text-[#9a7651]">*</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder="e.g. rahul@example.com"
                  className="rounded-xl border border-[#e4d9cc] px-3 py-3 text-sm outline-none focus:border-[#b19372]"
                />
              </label>

              <label className="flex flex-col gap-1.5 text-xs font-semibold text-[#555a6c]">
                Password <span className="text-[#9a7651]">*</span>
                <div className="relative">
                  <input
                    type={show ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    placeholder="Minimum 6 characters"
                    className="w-full rounded-xl border border-[#e4d9cc] px-3 py-3 pr-11 text-sm outline-none focus:border-[#b19372]"
                  />
                  <button
                    type="button"
                    onClick={() => setShow(!show)}
                    aria-label="Toggle password visibility"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9296a5]"
                  >
                    {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </label>

              {error && (
                <p role="alert" className="rounded-xl bg-[#fff0e9] px-3 py-2.5 text-xs text-[#b95c3c]">
                  {error}
                </p>
              )}

              {message && (
                <p className="rounded-xl bg-[#e7f7f0] px-3 py-2.5 text-xs text-[#328d68]">
                  {message}
                </p>
              )}

              <button
                disabled={loading}
                className="flex items-center justify-center gap-2 rounded-xl bg-[#9a7651] py-3 text-sm font-semibold text-white disabled:opacity-60 hover:bg-[#866342]"
              >
                {loading && <Loader2 className="size-4 animate-spin" />}
                Create owner account
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-[#85899a]">
              Already have an account?{' '}
              <Link href="/login" className="font-semibold text-[#9a7651] hover:underline">
                Sign in
              </Link>
            </p>

            <p className="mt-4 text-center text-xs text-[#a08d79]">
              <Link href="/" className="hover:underline">
                Back to StayBook
              </Link>
            </p>
          </>
        ) : (
          <>
            <div className="mb-4 inline-flex items-center gap-2 text-xs font-semibold text-[#9a7651]">
              <Mail className="size-4" />
              Check your inbox
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Enter verification code</h1>
            <p className="mt-2 text-sm text-[#85899a]">
              We sent a 6-digit single-use OTP code to <strong className="text-[#3d3934]">{email}</strong>. Enter the code below or click the link in your email to verify.
            </p>

            <form onSubmit={handleVerifyOtp} className="mt-7 flex flex-col gap-4">
              <label className="flex flex-col gap-1.5 text-xs font-semibold text-[#555a6c]">
                6-digit OTP code <span className="text-[#9a7651]">*</span>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  required
                  placeholder="e.g. 123456"
                  className="rounded-xl border border-[#e4d9cc] px-4 py-3 text-center text-xl font-mono tracking-[0.25em] outline-none focus:border-[#b19372]"
                />
              </label>

              {error && (
                <p role="alert" className="rounded-xl bg-[#fff0e9] px-3 py-2.5 text-xs text-[#b95c3c]">
                  {error}
                </p>
              )}

              {message && (
                <p className="rounded-xl bg-[#e7f7f0] px-3 py-2.5 text-xs text-[#328d68]">
                  {message}
                </p>
              )}

              <button
                disabled={verifying}
                className="flex items-center justify-center gap-2 rounded-xl bg-[#9a7651] py-3 text-sm font-semibold text-white disabled:opacity-60 hover:bg-[#866342]"
              >
                {verifying && <Loader2 className="size-4 animate-spin" />}
                Verify & Activate Account
              </button>
            </form>

            <div className="mt-5 flex items-center justify-between border-t border-[#f0f1f4] pt-4 text-xs">
              <button
                type="button"
                onClick={() => {
                  setStep('form')
                  setError('')
                  setMessage('')
                }}
                className="flex items-center gap-1.5 font-medium text-[#74798a] hover:text-[#3d3934]"
              >
                <ArrowLeft className="size-3.5" />
                Change email
              </button>

              <button
                type="button"
                disabled={cooldown > 0 || resending}
                onClick={handleResendOtp}
                className="font-semibold text-[#9a7651] hover:underline disabled:opacity-50"
              >
                {resending ? 'Sending...' : cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  )
}
