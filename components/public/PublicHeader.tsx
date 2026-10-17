'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Menu, X } from 'lucide-react'
import { BaseraBookLogo } from '@/components/ui/BaseraBookLogo'
import { createClient } from '@/lib/supabase/client'
import { useI18n } from '@/lib/i18n'

interface PublicHeaderProps {
  currentPath?: string
}

export function PublicHeader({ currentPath }: PublicHeaderProps) {
  const [hasSession, setHasSession] = useState<boolean | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const { t } = useI18n()

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }: { data: any }) => {
      setHasSession(!!data?.user)
    })
  }, [])

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [mobileOpen])

  const navLinks = [
    { href: '/features', label: 'Features' },
    { href: '/pricing', label: 'Pricing' },
    { href: '/faq', label: 'FAQ' },
    { href: '/contact', label: 'Support' },
  ]

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-[#eee4d7]/90 bg-[#fbf8f3]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-3.5 py-3 sm:px-8 sm:py-3.5">
          <Link
            href="/"
            className="flex items-center gap-2 group rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5a2b] shrink-0"
            aria-label="BaseraBook — Your Property. Smartly Managed."
          >
            <BaseraBookLogo iconSize={36} subtitleText="Your Property. Smartly Managed." />
          </Link>

          {/* Desktop Navigation */}
          <nav aria-label="Main Navigation" className="hidden items-center gap-7 text-sm font-medium text-[#776d62] md:flex">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`transition-colors hover:text-[#2c2926] ${
                  currentPath === link.href ? 'font-bold text-[#8b5a2b]' : ''
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Right Header Actions */}
          <div className="flex items-center gap-2 sm:gap-3">
            {hasSession ? (
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-1.5 rounded-full bg-[#8b5a2b] px-3.5 py-2 sm:px-5 sm:py-2.5 text-xs sm:text-sm font-semibold text-white shadow-xs hover:bg-[#784b20] transition-colors"
              >
                <span className="hidden xs:inline">{t.landing.goToDashboard}</span>
                <span className="xs:hidden">Dashboard</span>
                <ArrowRight className="size-3.5 sm:size-4" />
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="hidden rounded-xl px-3 py-2 text-sm font-semibold text-[#776d62] hover:text-[#2c2926] sm:block"
                >
                  {t.landing.signIn}
                </Link>
                <Link
                  href="/signup"
                  className="rounded-full bg-[#8b5a2b] px-3.5 py-2 sm:px-5 sm:py-2.5 text-xs sm:text-sm font-semibold text-white shadow-xs hover:bg-[#784b20] transition-colors whitespace-nowrap"
                >
                  <span className="hidden xs:inline">{t.landing.startFreeTrial} →</span>
                  <span className="xs:hidden">Free Trial →</span>
                </Link>
              </>
            )}

            {/* Mobile Hamburger Toggle */}
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation menu"
              aria-expanded={mobileOpen}
              className="grid size-9 place-items-center rounded-xl border border-[#e8dfd4] bg-white text-[#776d62] hover:text-[#2c2926] hover:bg-[#faf7f2] transition-colors md:hidden cursor-pointer"
            >
              <Menu className="size-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Navigation Drawer & Backdrop */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex justify-end">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-[#202536]/40 backdrop-blur-xs animate-in fade-in duration-200"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />

          {/* Sliding Panel */}
          <div className="relative z-10 w-[84%] max-w-xs h-full bg-[#fbf8f3] border-l border-[#ebe4da] shadow-2xl flex flex-col justify-between p-5 animate-in slide-in-from-right duration-300">
            <div>
              {/* Drawer Header */}
              <div className="flex items-center justify-between border-b border-[#eee4d7] pb-4">
                <BaseraBookLogo iconSize={32} showSubtitle={false} />
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  aria-label="Close navigation menu"
                  className="grid size-9 place-items-center rounded-xl border border-[#e8dfd4] bg-white text-[#776d62] hover:text-[#2c2926] hover:bg-[#faf7f2] transition-colors cursor-pointer"
                >
                  <X className="size-5" />
                </button>
              </div>

              {/* Navigation Links */}
              <nav aria-label="Mobile Navigation" className="mt-6 flex flex-col gap-1.5">
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center justify-between rounded-xl px-4 py-3 text-sm font-semibold transition-colors ${
                      currentPath === link.href
                        ? 'bg-[#f0e6d8] text-[#8b5a2b]'
                        : 'text-[#403a34] hover:bg-[#f4ede3]'
                    }`}
                  >
                    <span>{link.label}</span>
                    <ArrowRight className="size-4 text-[#a08d79]" />
                  </Link>
                ))}
              </nav>
            </div>

            {/* Bottom Actions */}
            <div className="border-t border-[#eee4d7] pt-5 space-y-3">
              {hasSession ? (
                <Link
                  href="/dashboard"
                  onClick={() => setMobileOpen(false)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#8b5a2b] py-3 text-sm font-semibold text-white shadow-xs hover:bg-[#784b20] transition-colors"
                >
                  {t.landing.goToDashboard} <ArrowRight className="size-4" />
                </Link>
              ) : (
                <>
                  <Link
                    href="/login"
                    onClick={() => setMobileOpen(false)}
                    className="flex w-full items-center justify-center rounded-xl border border-[#dfd1c0] bg-white py-2.5 text-sm font-semibold text-[#403a34] hover:bg-[#faf7f2] transition-colors"
                  >
                    {t.landing.signIn}
                  </Link>
                  <Link
                    href="/signup"
                    onClick={() => setMobileOpen(false)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#8b5a2b] py-3 text-sm font-semibold text-white shadow-xs hover:bg-[#784b20] transition-colors"
                  >
                    {t.landing.startFreeTrial} →
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
