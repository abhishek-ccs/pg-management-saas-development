'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Cookie, Shield, Check, X, Settings2 } from 'lucide-react'

interface ConsentPreferences {
  essential: true
  functional: boolean
  analytics: boolean
  timestamp: string
}

export function CookieConsentBanner() {
  const [mounted, setMounted] = useState(false)
  const [showBanner, setShowBanner] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  const [preferences, setPreferences] = useState<ConsentPreferences>({
    essential: true,
    functional: true,
    analytics: true,
    timestamp: '',
  })

  useEffect(() => {
    setMounted(true)
    const stored = localStorage.getItem('staynest_consent')
    if (!stored) {
      // Delay slightly for smooth page entrance
      const timer = setTimeout(() => setShowBanner(true), 1200)
      return () => clearTimeout(timer)
    }
  }, [])

  if (!mounted || !showBanner) return null

  function saveConsent(updated: ConsentPreferences) {
    const payload = { ...updated, timestamp: new Date().toISOString() }
    localStorage.setItem('staynest_consent', JSON.stringify(payload))
    document.cookie = `staynest_consent=${encodeURIComponent(JSON.stringify(payload))}; path=/; max-age=31536000; SameSite=Lax`
    setShowBanner(false)
  }

  function handleAcceptAll() {
    saveConsent({ essential: true, functional: true, analytics: true, timestamp: '' })
  }

  function handleEssentialOnly() {
    saveConsent({ essential: true, functional: false, analytics: false, timestamp: '' })
  }

  function handleSaveCustom() {
    saveConsent(preferences)
  }

  return (
    <aside
      role="dialog"
      aria-label="Privacy and Cookie Consent"
      aria-describedby="cookie-consent-desc"
      className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-2xl rounded-3xl border border-[#e8dfd4] bg-white/95 p-6 shadow-2xl backdrop-blur-md transition-all animate-in fade-in slide-in-from-bottom-4 sm:bottom-6 sm:left-6 sm:right-6"
    >
      <div className="flex items-start gap-4">
        <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[#faf7f2] text-[#9a7651]">
          <Cookie className="size-5" />
        </div>
        <div className="flex-1">
          <h2 className="text-sm font-bold text-[#2c2926]">Your Privacy Choices & Consent</h2>
          <p id="cookie-consent-desc" className="mt-1 text-xs leading-5 text-[#595e70]">
            We use strictly necessary cookies to keep you signed in securely, alongside optional preference and analytics cookies
            compliant with the India Digital Personal Data Protection (DPDP) Act 2023 and GDPR.{' '}
            <Link href="/cookies" className="text-[#9a7651] underline font-medium hover:text-[#866342]">
              Read our Cookie Policy
            </Link>.
          </p>

          {/* Granular Preference Accordion */}
          {showDetails && (
            <div className="mt-4 space-y-3 rounded-2xl border border-[#eee4d7] bg-[#faf7f2] p-4 text-xs">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-bold text-[#2c2926]">Essential & Security Cookies</span>
                  <p className="text-[11px] text-[#776d62]">Required for session authentication and CSRF protection.</p>
                </div>
                <span className="rounded-md bg-[#e7f7f0] px-2 py-0.5 text-[10px] font-bold text-[#328d68]">Required</span>
              </div>

              <div className="flex items-center justify-between border-t border-[#e8dfd4] pt-2.5">
                <div>
                  <span className="font-bold text-[#2c2926]">Functional Preferences</span>
                  <p className="text-[11px] text-[#776d62]">Remembers language selection (EN/HI) and UI layout.</p>
                </div>
                <input
                  type="checkbox"
                  checked={preferences.functional}
                  onChange={(e) => setPreferences((prev) => ({ ...prev, functional: e.target.checked }))}
                  className="size-4 accent-[#9a7651]"
                  aria-label="Allow Functional Preferences cookies"
                />
              </div>

              <div className="flex items-center justify-between border-t border-[#e8dfd4] pt-2.5">
                <div>
                  <span className="font-bold text-[#2c2926]">Core Web Vitals Analytics</span>
                  <p className="text-[11px] text-[#776d62]">Anonymous latency and speed diagnostics without tracking PII.</p>
                </div>
                <input
                  type="checkbox"
                  checked={preferences.analytics}
                  onChange={(e) => setPreferences((prev) => ({ ...prev, analytics: e.target.checked }))}
                  className="size-4 accent-[#9a7651]"
                  aria-label="Allow Analytics cookies"
                />
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="mt-5 flex flex-wrap items-center gap-2.5">
            <button
              onClick={handleAcceptAll}
              type="button"
              className="rounded-xl bg-[#9a7651] px-4 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-[#866342] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9a7651]"
            >
              Accept All
            </button>
            <button
              onClick={handleEssentialOnly}
              type="button"
              className="rounded-xl border border-[#dcd3c5] bg-white px-3.5 py-2 text-xs font-semibold text-[#555a6c] hover:bg-[#faf7f2] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9a7651]"
            >
              Essential Only
            </button>
            <button
              onClick={() => {
                if (showDetails) {
                  handleSaveCustom()
                } else {
                  setShowDetails(true)
                }
              }}
              type="button"
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-[#776d62] hover:text-[#2c2926] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9a7651]"
            >
              <Settings2 className="size-3.5 text-[#9a7651]" />
              {showDetails ? 'Save My Preferences' : 'Customize'}
            </button>
          </div>
        </div>
      </div>
    </aside>
  )
}
