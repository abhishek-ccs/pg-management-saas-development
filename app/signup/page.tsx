'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  Sparkles,
  User,
} from 'lucide-react'
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

    if (!fullName.trim()) {
      setError('Please enter your full name.')
      setLoading(false)
      return
    }

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
          ? 'Please use a stronger password (at least 6 characters).'
          : authError.message.toLowerCase().includes('already registered')
          ? 'This email is already registered. Please sign in instead.'
          : 'We could not create your account. Please verify your details.'
      )
      setLoading(false)
      return
    }

    // Check if session was immediately created (e.g. email confirmation disabled)
    if (data.session) {
      setMessage('Account created successfully! Preparing your workspace...')
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

    setMessage('Email verified successfully! Opening your workspace...')
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
    <main className="grid min-h-screen place-items-center bg-[#faf7f2] px-4 py-8 sm:py-12">
      <div className="w-full max-w-md rounded-3xl border border-[#e8dfd4] bg-white p-6 sm:p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
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

        {step === 'form' ? (
          <>
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-[#faf7f2] border border-[#e8dfd4] px-3 py-1 text-[11px] font-semibold text-[#8b5a2b]">
              <Sparkles className="size-3.5" />
              <span>7-Day Free Trial · No Credit Card Required</span>
            </div>

            <h1 className="text-2xl font-bold tracking-tight text-[#2c221e]">Create your owner account</h1>
            <p className="mt-1 text-xs text-[#676b7d]">
              Get your rental property up and running in less than 3 minutes.
            </p>

            <form onSubmit={submitSignup} className="mt-6 flex flex-col gap-4">
              <label className="flex flex-col gap-1.5 text-xs font-semibold text-[#555a6c]">
                Full Name <span className="text-[#8b5a2b]">*</span>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-[#999daa]" />
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    placeholder="e.g. Rahul Sharma"
                    className="w-full rounded-xl border border-[#e4e6ec] bg-white pl-10 pr-3.5 py-2.5 text-sm font-normal text-[#2c221e] outline-none transition-colors focus:border-[#8b5a2b] focus:ring-1 focus:ring-[#8b5a2b]"
                  />
                </div>
              </label>

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
                    placeholder="e.g. rahul@example.com"
                    className="w-full rounded-xl border border-[#e4e6ec] bg-white pl-10 pr-3.5 py-2.5 text-sm font-normal text-[#2c221e] outline-none transition-colors focus:border-[#8b5a2b] focus:ring-1 focus:ring-[#8b5a2b]"
                  />
                </div>
              </label>

              <label className="flex flex-col gap-1.5 text-xs font-semibold text-[#555a6c]">
                Password <span className="text-[#8b5a2b]">*</span>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-[#999daa]" />
                  <input
                    type={show ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    placeholder="Minimum 6 characters"
                    className="w-full rounded-xl border border-[#e4e6ec] bg-white pl-10 pr-11 py-2.5 text-sm font-normal text-[#2c221e] outline-none transition-colors focus:border-[#8b5a2b] focus:ring-1 focus:ring-[#8b5a2b]"
                  />
                  <button
                    type="button"
                    onClick={() => setShow(!show)}
                    aria-label="Toggle password visibility"
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#999daa] hover:text-[#555a6c] transition-colors p-1"
                  >
                    {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                <span className="text-[11px] text-[#85899a]">Must be at least 6 characters long.</span>
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
                className="mt-1 flex items-center justify-center gap-2 rounded-xl bg-[#8b5a2b] py-3 text-sm font-semibold text-white shadow-xs hover:bg-[#784b20] active:scale-[0.99] disabled:opacity-60 transition-all cursor-pointer"
              >
                {loading && <Loader2 className="size-4 animate-spin text-white" />}
                {loading ? 'Creating your workspace...' : 'Start 7-Day Free Trial'}
              </button>
            </form>

            <p className="mt-6 text-center text-xs text-[#676b7d]">
              Already have an account?{' '}
              <Link href="/login" className="font-semibold text-[#8b5a2b] hover:underline">
                Sign in
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
                By creating an account, you agree to BaseraBook&apos;s Terms of Service and Privacy Policy. All customer data is strictly isolated.
              </span>
            </div>
          </>
        ) : (
          <>
            <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-[#faf7f2] border border-[#e8dfd4] px-3 py-1 text-xs font-semibold text-[#8b5a2b]">
              <Mail className="size-3.5" />
              <span>Check your inbox</span>
            </div>

            <h1 className="text-2xl font-bold tracking-tight text-[#2c221e]">Enter verification code</h1>
            <p className="mt-1 text-xs text-[#676b7d]">
              We sent a 6-digit confirmation code to <strong className="text-[#2c221e]">{email}</strong>. Enter it below to activate your account.
            </p>

            <form onSubmit={handleVerifyOtp} className="mt-6 flex flex-col gap-4">
              <label className="flex flex-col gap-1.5 text-xs font-semibold text-[#555a6c]">
                6-Digit Verification Code <span className="text-[#8b5a2b]">*</span>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  required
                  placeholder="123456"
                  className="rounded-xl border border-[#e4e6ec] bg-white px-4 py-3 text-center text-2xl font-mono font-bold tracking-[0.3em] text-[#2c221e] outline-none transition-colors focus:border-[#8b5a2b] focus:ring-1 focus:ring-[#8b5a2b]"
                />
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
                disabled={verifying}
                className="mt-1 flex items-center justify-center gap-2 rounded-xl bg-[#8b5a2b] py-3 text-sm font-semibold text-white shadow-xs hover:bg-[#784b20] active:scale-[0.99] disabled:opacity-60 transition-all cursor-pointer"
              >
                {verifying && <Loader2 className="size-4 animate-spin text-white" />}
                {verifying ? 'Verifying & Activating...' : 'Verify & Launch Workspace'}
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
                className="flex items-center gap-1.5 font-medium text-[#74798a] hover:text-[#2c221e] transition-colors"
              >
                <ArrowLeft className="size-3.5" />
                Change email
              </button>

              <button
                type="button"
                disabled={cooldown > 0 || resending}
                onClick={handleResendOtp}
                className="font-semibold text-[#8b5a2b] hover:underline disabled:opacity-40 transition-colors"
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
