'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Menu, X } from 'lucide-react'
import { BaseraBookLogo } from '@/components/ui/BaseraBookLogo'
import { LocaleSwitcher } from '@/components/i18n/LocaleSwitcher'
import { useI18n } from '@/lib/i18n'

export function LandingNavbar() {
  const { t, locale } = useI18n()
  const [hasSession, setHasSession] = useState<boolean | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    let isMounted = true
    import('@/lib/supabase/client').then(({ createClient }) => {
      if (!isMounted) return
      const supabase = createClient()
      supabase.auth.getUser().then(({ data }: { data: any }) => {
        if (isMounted) setHasSession(!!data?.user)
      })
    })
    return () => {
      isMounted = false
    }
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

  return (
    <>
      {/* 1. Compact Responsive Navbar */}
      <header className="sticky top-0 z-20 w-full border-b border-[#eee4d7]/90 bg-[#fbf8f3]/95 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-1.5 px-2.5 py-2.5 sm:gap-4 sm:px-6 md:px-8 sm:py-3.5">
          <Link
            href="/"
            className="flex items-center gap-1.5 sm:gap-2 group rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5a2b] shrink-0"
            aria-label="BaseraBook — Your Property. Smartly Managed."
          >
            <BaseraBookLogo
              iconSize={36}
              subtitleText="Your Property. Smartly Managed."
              subtitleClassName="hidden sm:block"
            />
          </Link>

          <nav aria-label="Main Navigation" className="hidden items-center gap-7 text-sm font-medium text-[#776d62] md:flex">
            <Link href="#features" className="transition-colors hover:text-[#2c2926]">
              {locale === 'hi' ? 'विशेषताएं' : 'Features'}
            </Link>
            <Link href="/pricing" className="transition-colors hover:text-[#2c2926]">
              {locale === 'hi' ? 'मूल्य निर्धारण' : 'Pricing'}
            </Link>
            <Link href="/faq" className="transition-colors hover:text-[#2c2926]">
              {locale === 'hi' ? 'सामान्य प्रश्न (FAQ)' : 'FAQ'}
            </Link>
            <Link href="/contact" className="transition-colors hover:text-[#2c2926]">
              {locale === 'hi' ? 'सहायता' : 'Support'}
            </Link>
          </nav>

          <div className="flex items-center gap-1.5 sm:gap-2.5 md:gap-3 shrink-0">
            <LocaleSwitcher />
            {hasSession ? (
              <Link
                href="/dashboard"
                prefetch={false}
                className="inline-flex items-center gap-1.5 rounded-full bg-[#8b5a2b] px-2.5 py-1.5 sm:px-5 sm:py-2.5 text-xs sm:text-sm font-semibold text-white shadow-xs hover:bg-[#784b20] transition-colors shrink-0 min-h-[34px]"
              >
                <span className="hidden sm:inline">{t.landing.goToDashboard}</span>
                <span className="sm:hidden">{locale === 'hi' ? 'डैशबोर्ड' : 'Dashboard'}</span>
                <ArrowRight className="size-3.5 sm:size-4 shrink-0" />
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  prefetch={false}
                  className="hidden rounded-xl px-3 py-2 text-sm font-semibold text-[#776d62] hover:text-[#2c2926] sm:block"
                >
                  {t.landing.signIn}
                </Link>
                <Link
                  href="/signup"
                  prefetch={false}
                  className="inline-flex items-center justify-center rounded-full bg-[#8b5a2b] px-2 py-1.5 min-[360px]:px-2.5 sm:px-4 md:px-5 sm:py-2.5 text-[11px] min-[360px]:text-xs sm:text-sm font-semibold text-white shadow-xs hover:bg-[#784b20] transition-colors whitespace-nowrap shrink-0 min-h-[34px]"
                >
                  <span className="hidden sm:inline">{t.landing.startFreeTrial} →</span>
                  <span className="hidden min-[360px]:inline sm:hidden">{locale === 'hi' ? 'निःशुल्क ट्रायल' : 'Free Trial'}</span>
                  <span className="min-[360px]:hidden">{locale === 'hi' ? 'ट्रायल' : 'Trial'}</span>
                </Link>
              </>
            )}

            {/* Mobile Hamburger Button */}
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation menu"
              aria-expanded={mobileOpen}
              className="grid size-8.5 sm:size-9 place-items-center rounded-xl border border-[#e8dfd4] bg-white text-[#776d62] hover:text-[#2c2926] hover:bg-[#faf7f2] transition-colors md:hidden cursor-pointer shrink-0"
            >
              <Menu className="size-4.5 sm:size-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Navigation Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex justify-end" role="dialog" aria-modal="true" aria-label="Mobile Navigation">
          <div
            className="fixed inset-0 bg-[#202536]/40 backdrop-blur-xs animate-in fade-in duration-200"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <div className="relative z-10 w-[84%] max-w-xs h-full bg-[#fbf8f3] border-l border-[#ebe4da] shadow-2xl flex flex-col justify-between p-5 animate-in slide-in-from-right duration-300">
            <div>
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

              <nav aria-label="Mobile Navigation" className="mt-6 flex flex-col gap-1.5">
                <Link
                  href="#features"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center justify-between rounded-xl px-4 py-3 text-sm font-semibold text-[#403a34] hover:bg-[#f4ede3] transition-colors"
                >
                  <span>{locale === 'hi' ? 'विशेषताएं' : 'Features'}</span>
                  <ArrowRight className="size-4 text-[#a08d79]" />
                </Link>
                <Link
                  href="/pricing"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center justify-between rounded-xl px-4 py-3 text-sm font-semibold text-[#403a34] hover:bg-[#f4ede3] transition-colors"
                >
                  <span>{locale === 'hi' ? 'मूल्य निर्धारण' : 'Pricing'}</span>
                  <ArrowRight className="size-4 text-[#a08d79]" />
                </Link>
                <Link
                  href="/faq"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center justify-between rounded-xl px-4 py-3 text-sm font-semibold text-[#403a34] hover:bg-[#f4ede3] transition-colors"
                >
                  <span>{locale === 'hi' ? 'सामान्य प्रश्न (FAQ)' : 'FAQ'}</span>
                  <ArrowRight className="size-4 text-[#a08d79]" />
                </Link>
                <Link
                  href="/contact"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center justify-between rounded-xl px-4 py-3 text-sm font-semibold text-[#403a34] hover:bg-[#f4ede3] transition-colors"
                >
                  <span>{locale === 'hi' ? 'सहायता व शिकायत' : 'Support & Grievance'}</span>
                  <ArrowRight className="size-4 text-[#a08d79]" />
                </Link>
              </nav>
            </div>

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
