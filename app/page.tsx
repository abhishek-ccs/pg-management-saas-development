'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  Wallet,
  Users,
  Bell,
  Receipt,
  BedDouble,
  FileSpreadsheet,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { BaseraBookLogo } from '@/components/ui/BaseraBookLogo'
import { LocaleSwitcher } from '@/components/i18n/LocaleSwitcher'
import { PublicFooter } from '@/components/public/PublicFooter'
import { DashboardHeroPreview } from '@/components/landing/DashboardHeroPreview'
import { useI18n } from '@/lib/i18n'

export default function LandingPage() {
  const [hasSession, setHasSession] = useState<boolean | null>(null)
  const { locale } = useI18n()

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }: { data: any }) => {
      setHasSession(!!data?.user)
    })
  }, [])

  const compactFeatures = [
    {
      title: 'Rent Tracking',
      description: 'Real-time ledger tracking for collected rent, pending balances, and overdue accounts.',
      icon: Wallet,
    },
    {
      title: 'Tenant Management',
      description: 'Secure resident records, room and bed allocations, KYC documents, and check-in history.',
      icon: Users,
    },
    {
      title: 'Payment Receipts',
      description: 'Automated branded payment receipts ready for 1-click WhatsApp sharing and PDF download.',
      icon: Receipt,
    },
    {
      title: 'Room & Bed Management',
      description: 'Visual property layout, floor plans, bed availability, and occupancy rate tracking.',
      icon: BedDouble,
    },
    {
      title: 'Payment Reminders',
      description: 'Automated, polite WhatsApp and SMS reminders sent to tenants before rent due dates.',
      icon: Bell,
    },
    {
      title: 'Reports & Records',
      description: 'Tax-ready annual financial ledgers, utility billing breakdowns, and 30-day trash recovery.',
      icon: FileSpreadsheet,
    },
  ]

  return (
    <main id="main-content" className="min-h-screen bg-[#fbf8f3] text-[#403a34]">
      {/* 1. Compact Navbar */}
      <header className="sticky top-0 z-20 border-b border-[#eee4d7]/90 bg-[#fbf8f3]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-8 sm:py-3.5">
          <Link
            href="/"
            className="flex items-center gap-2.5 group rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5a2b]"
            aria-label="BaseraBook — Your Property. Smartly Managed."
          >
            <BaseraBookLogo iconSize={38} subtitleText="Your Property. Smartly Managed." />
          </Link>

          <nav aria-label="Main Navigation" className="hidden items-center gap-7 text-sm font-medium text-[#776d62] md:flex">
            <Link href="#features" className="transition-colors hover:text-[#2c2926]">
              Features
            </Link>
            <Link href="/pricing" className="transition-colors hover:text-[#2c2926]">
              Pricing
            </Link>
            <Link href="/faq" className="transition-colors hover:text-[#2c2926]">
              FAQ
            </Link>
          </nav>

          <div className="flex items-center gap-3">
            <LocaleSwitcher />
            {hasSession ? (
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-1.5 rounded-full bg-[#8b5a2b] px-4 py-2 sm:px-5 sm:py-2.5 text-xs sm:text-sm font-semibold text-white shadow-xs hover:bg-[#784b20] transition-colors"
              >
                Go to Dashboard <ArrowRight className="size-3.5 sm:size-4" />
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="hidden rounded-xl px-3 py-2 text-sm font-semibold text-[#776d62] hover:text-[#2c2926] sm:block"
                >
                  Sign In
                </Link>
                <Link
                  href="/signup"
                  className="rounded-full bg-[#8b5a2b] px-4 py-2 sm:px-5 sm:py-2.5 text-xs sm:text-sm font-semibold text-white shadow-xs hover:bg-[#784b20] transition-colors whitespace-nowrap"
                >
                  Start Free 7-Day Trial →
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* 2. Hero Section: Minimal Text (Left) + Large Dashboard Visual (Right) */}
      <section className="mx-auto max-w-7xl px-5 pt-8 pb-14 sm:px-8 sm:pt-12 sm:pb-18 lg:pt-14 lg:pb-20">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-8 items-center">
          {/* Left: Minimal Copy & CTAs */}
          <div className="lg:col-span-5 flex flex-col justify-center">
            <h1 className="text-3xl sm:text-4xl lg:text-[44px] font-semibold tracking-[-0.035em] text-[#2C221E] leading-[1.16]">
              Manage your rentals.
              <span className="block font-serif italic font-normal text-[#9a7651] mt-1 sm:mt-1.5">
                Without the daily chaos.
              </span>
            </h1>

            <p className="mt-4 text-base sm:text-lg text-[#776d62] leading-relaxed max-w-lg">
              Track rooms, tenants, rent dues and receipts — all in one place.
            </p>

            {/* Three Compact Icon Labels */}
            <div className="mt-5 flex flex-wrap items-center gap-2 sm:gap-2.5" aria-label="Key features">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-[#e8dfd4] bg-white px-3 py-1.5 text-xs font-semibold text-[#5c4a3b] shadow-2xs">
                <Wallet className="size-3.5 text-[#9a7651]" />
                <span>Rent Tracking</span>
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-full border border-[#e8dfd4] bg-white px-3 py-1.5 text-xs font-semibold text-[#5c4a3b] shadow-2xs">
                <Users className="size-3.5 text-[#9a7651]" />
                <span>Tenant Records</span>
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-full border border-[#e8dfd4] bg-white px-3 py-1.5 text-xs font-semibold text-[#5c4a3b] shadow-2xs">
                <Bell className="size-3.5 text-[#9a7651]" />
                <span>Payment Reminders</span>
              </div>
            </div>

            {/* Two Action Buttons */}
            <div className="mt-7 flex flex-wrap items-center gap-3">
              {hasSession ? (
                <Link
                  href="/dashboard"
                  className="inline-flex items-center gap-2 rounded-xl bg-[#8b5a2b] px-6 py-3.5 text-sm font-semibold text-white shadow-xs hover:bg-[#784b20] transition-colors"
                >
                  Go to Dashboard <ArrowRight className="size-4" />
                </Link>
              ) : (
                <>
                  <Link
                    href="/signup"
                    className="inline-flex items-center gap-2 rounded-xl bg-[#8b5a2b] px-6 py-3.5 text-sm font-semibold text-white shadow-xs hover:bg-[#784b20] transition-colors"
                  >
                    Start Free 7-Day Trial <ArrowRight className="size-4" />
                  </Link>
                  <Link
                    href="#features"
                    className="rounded-xl border border-[#dfd1c0] bg-white px-5 py-3.5 text-sm font-semibold text-[#776d62] hover:bg-[#faf7f2] transition-colors"
                  >
                    Explore Features
                  </Link>
                </>
              )}
            </div>

            {/* Accurate Signup Flow Note */}
            <p className="mt-3.5 text-xs text-[#a08d79]">
              7 days free · No credit card required
            </p>
          </div>

          {/* Right: Large Premium Dashboard Preview */}
          <div className="lg:col-span-7 w-full">
            <DashboardHeroPreview />
          </div>
        </div>
      </section>

      {/* 4. Below the Hero: ONLY Six Compact Feature Cards */}
      <section id="features" className="border-t border-[#eee4d7] bg-white py-14 sm:py-18">
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <div className="max-w-2xl">
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-[-0.03em] text-[#2C221E]">
              Everything you need for calm property management
            </h2>
            <p className="mt-2 text-sm text-[#776d62]">
              Designed specifically for PG, hostel, and residential rental operators.
            </p>
          </div>

          <div className="mt-8 grid gap-3.5 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {compactFeatures.map(({ title, description, icon: Icon }) => (
              <article
                key={title}
                className="rounded-2xl border border-[#eee4d7] bg-[#fbf8f3] p-5 hover:border-[#dfd1c0] hover:bg-white hover:shadow-2xs transition-all"
              >
                <div className="grid size-9 place-items-center rounded-xl bg-[#f3eadf] text-[#9a7651]">
                  <Icon className="size-4.5" />
                </div>
                <h3 className="mt-3.5 text-sm sm:text-base font-semibold text-[#2C221E]">
                  {title}
                </h3>
                <p className="mt-1 text-xs sm:text-sm text-[#776d62] leading-relaxed">
                  {description}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* 5. Clean Shared Footer */}
      <PublicFooter />
    </main>
  )
}
