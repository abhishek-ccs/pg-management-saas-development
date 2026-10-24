'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  RotateCw,
  ShieldCheck,
} from 'lucide-react'
import { isValidEmail, validatePassword } from '@/lib/validation'

export default function ForgotPasswordPage() {
  const router = useRouter()
  const [step, setStep] = useState<'request' | 'reset'>('request')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [timerLeft, setTimerLeft] = useState(300) // 5 minutes (300s)

  // Resend cooldown timer
  useEffect(() => {
    if (cooldown <= 0) return
    const interval = setInterval(() => {
      setCooldown((prev) => (prev > 0 ? prev - 1 : 0))
    }, 1000)
    return () => clearInterval(interval)
  }, [cooldown])

  // 5-minute OTP countdown timer
  useEffect(() => {
    if (step !== 'reset' || timerLeft <= 0) return
    const interval = setInterval(() => {
      setTimerLeft((prev) => (prev > 0 ? prev - 1 : 0))
    }, 1000)
    return () => clearInterval(interval)
  }, [step, timerLeft])

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`
  }

  // Step 1: Request Password Reset Code
  async function handleRequestReset(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setMessage('')

    if (!isValidEmail(email)) {
      setError('Please enter a valid email address (e.g. owner@example.com).')
      setLoading(false)
      return
    }

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })

      const data = await res.json()
      if (!res.ok || !data.success) {
        setError(data?.error || 'Unable to process your request. Please try again.')
        setLoading(false)
        return
      }

      setStep('reset')
      setCooldown(60)
      setTimerLeft(300)
      setMessage(data.message || 'A 6-digit verification code has been sent to your email.')
    } catch {
      setError('Network error. Please check your internet connection.')
    } finally {
      setLoading(false)
    }
  }

  // Step 2: Verify OTP and Reset Password
  async function handleResetPassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setMessage('')

    if (!otp.trim() || !/^\d{6}$/.test(otp.trim())) {
      setError('Please enter the 6-digit numeric verification code.')
      return
    }

    const passValidation = validatePassword(newPassword)
    if (!passValidation.valid) {
      setError(passValidation.error || 'New password must be at least 8 characters and include uppercase, lowercase, numbers, and symbols.')
      return
    }

    if (timerLeft <= 0) {
      setError('This verification code has expired (5-minute limit). Please request a fresh code.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/verify-reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          otp: otp.trim(),
          newPassword,
        }),
      })

      const data = await res.json()
      if (!res.ok || !data.success) {
        setError(data?.error || 'Failed to reset password. Please check your code.')
        setLoading(false)
        return
      }

      setMessage('Password reset successfully! Redirecting you to sign in...')
      setTimeout(() => {
        router.push('/login?reset=success')
      }, 1500)
    } catch {
      setError('Network error. Please try again.')
      setLoading(false)
    }
  }

  // Resend OTP handler
  async function handleResendCode() {
    if (cooldown > 0 || resending) return
    setResending(true)
    setError('')
    setMessage('')

    try {
      const res = await fetch('/api/auth/resend-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          purpose: 'password_reset',
        }),
      })

      const data = await res.json()
      if (!res.ok || !data.success) {
        setError(data?.error || 'Unable to resend code right now.')
      } else {
        setMessage('A fresh 6-digit code has been sent to your email.')
        setCooldown(60)
        setTimerLeft(300)
      }
    } catch {
      setError('Network error. Could not resend code.')
    } finally {
      setResending(false)
    }
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

        {step === 'request' ? (
          <>
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-[#faf7f2] border border-[#e8dfd4] px-3 py-1 text-xs font-semibold text-[#8b5a2b]">
              <KeyRound className="size-3.5" />
              <span>Account Recovery</span>
            </div>

            <h1 className="text-2xl font-bold tracking-tight text-[#2c221e]">Forgot password?</h1>
            <p className="mt-1 text-xs text-[#676b7d] leading-relaxed">
              Enter your registered account email and we will send you a secure 6-digit verification code to reset your password.
            </p>

            <form onSubmit={handleRequestReset} className="mt-6 flex flex-col gap-4">
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
                {loading ? 'Sending verification code...' : 'Send Verification Code'}
              </button>
            </form>

            <p className="mt-6 text-center text-xs text-[#676b7d]">
              Remember your password?{' '}
              <Link href="/login" className="font-semibold text-[#8b5a2b] hover:underline">
                Sign in
              </Link>
            </p>
          </>
        ) : (
          <>
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-[#faf7f2] border border-[#e8dfd4] px-3 py-1 text-xs font-semibold text-[#8b5a2b]">
              <Clock className="size-3.5" />
              <span>Step 2 of 2: Verify & Reset</span>
            </div>

            <h1 className="text-2xl font-bold tracking-tight text-[#2c221e]">Enter verification code</h1>
            <p className="mt-1 text-xs text-[#676b7d] leading-relaxed">
              We sent a 6-digit code to <strong className="text-[#2c221e] break-all">{email}</strong>. Enter the code and your new password below.
            </p>

            <form onSubmit={handleResetPassword} className="mt-6 flex flex-col gap-4">
              <label className="flex flex-col gap-1.5 text-xs font-semibold text-[#555a6c]">
                <div className="flex items-center justify-between">
                  <span>6-Digit Verification Code <span className="text-[#8b5a2b]">*</span></span>
                  <span className={`text-[11px] font-semibold ${timerLeft <= 60 ? 'text-[#b95c3c] font-bold' : 'text-[#8b5a2b]'}`}>
                    Expires in: {formatTimer(timerLeft)}
                  </span>
                </div>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  required
                  placeholder="123456"
                  className="rounded-xl border border-[#e4e6ec] bg-white px-3 sm:px-4 py-3 text-center text-xl sm:text-2xl font-mono font-bold tracking-[0.2em] sm:tracking-[0.3em] text-[#2c221e] outline-none transition-colors focus:border-[#8b5a2b] focus:ring-1 focus:ring-[#8b5a2b]"
                />
              </label>

              <label className="flex flex-col gap-1.5 text-xs font-semibold text-[#555a6c]">
                New Password <span className="text-[#8b5a2b]">*</span>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-[#999daa]" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={8}
                    maxLength={128}
                    autoComplete="new-password"
                    placeholder="At least 8 characters"
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
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-[11px] text-[#85899a]">
                  <span className={newPassword.length >= 8 && newPassword.length <= 128 ? 'text-[#1e7e34] font-medium' : ''}>
                    ✓ 8–128 chars
                  </span>
                  <span className={/[A-Z]/.test(newPassword) && /[a-z]/.test(newPassword) ? 'text-[#1e7e34] font-medium' : ''}>
                    ✓ Upper & Lowercase
                  </span>
                  <span className={/[0-9]/.test(newPassword) && /[^A-Za-z0-9]/.test(newPassword) ? 'text-[#1e7e34] font-medium' : ''}>
                    ✓ Number & Symbol
                  </span>
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
                {loading ? 'Updating password...' : 'Reset Password'}
              </button>

              <div className="flex items-center justify-between border-t border-[#f0ebe3] pt-4 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setStep('request')
                    setError('')
                    setMessage('')
                  }}
                  className="flex items-center gap-1 font-semibold text-[#676b7d] hover:text-[#2c221e] transition-colors"
                >
                  <ArrowLeft className="size-3.5" /> Change email
                </button>

                <button
                  type="button"
                  disabled={cooldown > 0 || resending}
                  onClick={handleResendCode}
                  className="flex items-center gap-1 font-semibold text-[#8b5a2b] hover:underline disabled:opacity-50 disabled:no-underline transition-colors"
                >
                  {resending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <RotateCw className="size-3.5" />
                  )}
                  {resending ? 'Sending...' : cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
                </button>
              </div>
            </form>
          </>
        )}

        <div className="mt-6 flex items-start gap-2 rounded-xl border border-[#e8dfd4] bg-[#faf7f2] p-3 text-[11px] leading-relaxed text-[#7d756d]">
          <ShieldCheck className="size-4 shrink-0 text-[#8b5a2b] mt-0.5" />
          <span>
            Verification codes are single-use, cryptographically hashed, and strictly expire after 5 minutes to safeguard your account.
          </span>
        </div>
      </div>
    </main>
  )
}
