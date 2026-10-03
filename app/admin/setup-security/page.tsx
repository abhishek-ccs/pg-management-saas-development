'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ShieldAlert, KeyRound, Smartphone, Check, Loader2, AlertTriangle, ArrowRight } from 'lucide-react'
import { completeAdminSecuritySetup } from '../actions'

export default function AdminSetupSecurityPage() {
  const router = useRouter()
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  // Validation indicators
  const is12Chars = newPassword.length >= 12
  const hasUpper = /[A-Z]/.test(newPassword)
  const hasLower = /[a-z]/.test(newPassword)
  const hasNumber = /[0-9]/.test(newPassword)
  const hasSpecial = /[^A-Za-z0-9]/.test(newPassword)
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword
  const isPasswordValid = is12Chars && hasUpper && hasLower && hasNumber && hasSpecial && passwordsMatch

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!isPasswordValid) {
      setError('Please fulfill all password requirements before continuing.')
      return
    }

    if (totpCode.trim().length !== 6) {
      setError('Please enter a 6-digit authenticator verification code.')
      return
    }

    setLoading(true)
    try {
      const res = await completeAdminSecuritySetup(newPassword, totpCode.trim())
      if (!res.success) {
        setError(res.error || 'Failed to complete security setup.')
        setLoading(false)
        return
      }

      setSuccess(true)
      setTimeout(() => {
        router.push('/admin')
        router.refresh()
      }, 1500)
    } catch (err: any) {
      setError(err?.message || 'Unexpected security setup error.')
      setLoading(false)
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#2c2926] px-5 py-12 text-[#f8f0e5]">
      <div className="w-full max-w-lg rounded-3xl border border-[#705b47] bg-[#3d3630] p-8 shadow-2xl">
        <div className="flex items-center gap-3 border-b border-[#5a4f45] pb-5">
          <div className="grid size-12 place-items-center rounded-2xl bg-[#c39d72] text-[#2c2926]">
            <ShieldAlert className="size-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">First-Login Security Enforcement</h1>
            <p className="text-xs text-[#cbbfaf]">Super Administrator Security Baseline</p>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-[#b46b1a]/40 bg-[#b46b1a]/15 p-4 text-xs text-[#ffdcb0]">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="size-4 shrink-0 text-[#ffb86c] mt-0.5" />
            <p>
              Your account was initialized with a temporary setup password. For enterprise safety, you must set a strong 12+ character password and verify MFA before access to the Platform Console is granted.
            </p>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-[#b95c3c]/50 bg-[#b95c3c]/20 p-3 text-xs text-[#ffc9c9]">
            {error}
          </div>
        )}

        {success ? (
          <div className="mt-6 rounded-2xl border border-[#2e7d32]/50 bg-[#2e7d32]/20 p-6 text-center">
            <div className="mx-auto grid size-12 place-items-center rounded-full bg-[#2e7d32] text-white mb-3">
              <Check className="size-6" />
            </div>
            <h2 className="text-base font-bold text-white">Security Baseline Satisfied</h2>
            <p className="mt-1 text-xs text-[#b8f5be]">Redirecting to Platform Super Admin Console...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-5">
            {/* Step 1: Password Change */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-[#c39d72]">
                <KeyRound className="size-4" />
                <span>Step 1: Set Permanent Admin Password (12+ Chars)</span>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#cbbfaf] mb-1">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 12 characters..."
                  required
                  className="w-full rounded-xl border border-[#705b47] bg-[#2c2926] px-3.5 py-2.5 text-sm text-white outline-none focus:border-[#c39d72]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#cbbfaf] mb-1">Confirm New Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat new password..."
                  required
                  className="w-full rounded-xl border border-[#705b47] bg-[#2c2926] px-3.5 py-2.5 text-sm text-white outline-none focus:border-[#c39d72]"
                />
              </div>

              {/* Password Requirements Checklist */}
              <div className="grid grid-cols-2 gap-2 text-[11px] text-[#cbbfaf] pt-1">
                <span className={`flex items-center gap-1.5 ${is12Chars ? 'text-[#8ee294]' : 'text-[#a09a93]'}`}>
                  <span className={`size-1.5 rounded-full ${is12Chars ? 'bg-[#8ee294]' : 'bg-[#776d62]'}`} />
                  12+ characters
                </span>
                <span className={`flex items-center gap-1.5 ${hasUpper && hasLower ? 'text-[#8ee294]' : 'text-[#a09a93]'}`}>
                  <span className={`size-1.5 rounded-full ${hasUpper && hasLower ? 'bg-[#8ee294]' : 'bg-[#776d62]'}`} />
                  Upper & lowercase
                </span>
                <span className={`flex items-center gap-1.5 ${hasNumber ? 'text-[#8ee294]' : 'text-[#a09a93]'}`}>
                  <span className={`size-1.5 rounded-full ${hasNumber ? 'bg-[#8ee294]' : 'bg-[#776d62]'}`} />
                  At least 1 number
                </span>
                <span className={`flex items-center gap-1.5 ${hasSpecial ? 'text-[#8ee294]' : 'text-[#a09a93]'}`}>
                  <span className={`size-1.5 rounded-full ${hasSpecial ? 'bg-[#8ee294]' : 'bg-[#776d62]'}`} />
                  Special symbol
                </span>
              </div>
            </div>

            {/* Step 2: MFA Enrollment */}
            <div className="space-y-3 pt-3 border-t border-[#5a4f45]">
              <div className="flex items-center gap-2 text-xs font-bold text-[#c39d72]">
                <Smartphone className="size-4" />
                <span>Step 2: Authenticator App (TOTP) Verification</span>
              </div>

              <p className="text-xs text-[#cbbfaf]">
                Open your authenticator app (Google Authenticator, 1Password, Authy) and enter your 6-digit verification code.
              </p>

              <div>
                <label className="block text-xs font-medium text-[#cbbfaf] mb-1">6-Digit TOTP Code</label>
                <input
                  type="text"
                  maxLength={6}
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="e.g. 582910"
                  required
                  className="w-full tracking-widest text-center font-mono rounded-xl border border-[#705b47] bg-[#2c2926] px-3.5 py-2.5 text-base text-white outline-none focus:border-[#c39d72]"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !isPasswordValid || totpCode.length !== 6}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[#c39d72] py-3 text-sm font-bold text-[#2c2926] shadow-sm hover:bg-[#b08b62] disabled:opacity-50 transition-colors"
            >
              {loading ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Verifying Security Setup...
                </>
              ) : (
                <>
                  Lock In Security & Enter Admin Console <ArrowRight className="size-4" />
                </>
              )}
            </button>
          </form>
        )}

        <div className="mt-6 text-center text-xs text-[#a09a93]">
          <Link href="/console?switch=true" className="hover:text-white hover:underline">
            Cancel & Sign In as Different User
          </Link>
        </div>
      </div>
    </main>
  )
}
