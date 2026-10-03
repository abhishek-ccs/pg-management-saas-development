'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { StayBookLogo } from '@/components/ui/StayBookLogo'
import { LocaleSwitcher } from '@/components/i18n/LocaleSwitcher'
import { createClient } from '@/lib/supabase/client'
import { useI18n } from '@/lib/i18n'

interface PublicHeaderProps {
  currentPath?: string
}

export function PublicHeader({ currentPath }: PublicHeaderProps) {
  const [hasSession, setHasSession] = useState<boolean | null>(null)
  const { t } = useI18n()

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }: { data: any }) => {
      setHasSession(!!data?.user)
    })
  }, [])

  return (
    <header className="sticky top-0 z-30 border-b border-[#eee4d7]/90 bg-[#fbf8f3]/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <StayBookLogo iconSize={38} subtitleText="PROPERTY MANAGEMENT" />
        </Link>

        <nav aria-label="Main Navigation" className="hidden items-center gap-7 text-sm font-medium text-[#776d62] md:flex">
          <Link
            href="/features"
            className={`transition-colors hover:text-[#2c2926] ${
              currentPath === '/features' ? 'font-bold text-[#8b5a2b]' : ''
            }`}
          >
            Features
          </Link>
          <Link
            href="/pricing"
            className={`transition-colors hover:text-[#2c2926] ${
              currentPath === '/pricing' ? 'font-bold text-[#8b5a2b]' : ''
            }`}
          >
            Pricing
          </Link>
          <Link
            href="/faq"
            className={`transition-colors hover:text-[#2c2926] ${
              currentPath === '/faq' ? 'font-bold text-[#8b5a2b]' : ''
            }`}
          >
            FAQ
          </Link>
          <Link
            href="/contact"
            className={`transition-colors hover:text-[#2c2926] ${
              currentPath === '/contact' ? 'font-bold text-[#8b5a2b]' : ''
            }`}
          >
            Support
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          <LocaleSwitcher />
          {hasSession ? (
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 rounded-full bg-[#8b5a2b] px-4 py-2 sm:px-5 sm:py-2.5 text-xs sm:text-sm font-semibold text-white shadow-xs hover:bg-[#784b20] transition-colors"
            >
              {t.landing.goToDashboard} <ArrowRight className="size-3.5 sm:size-4" />
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
                className="rounded-full bg-[#8b5a2b] px-4 py-2 sm:px-5 sm:py-2.5 text-xs sm:text-sm font-semibold text-white shadow-xs hover:bg-[#784b20] transition-colors"
              >
                {t.landing.startFreeTrial} →
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
