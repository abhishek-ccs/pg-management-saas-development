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
import { LandingNavbar } from '@/components/landing/LandingNavbar'
import { PublicFooter } from '@/components/public/PublicFooter'
import { DashboardHeroPreview } from '@/components/landing/DashboardHeroPreview'

export default function LandingPage() {
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
      {/* 1. Compact Responsive Navbar (renders LocaleSwitcher for language selection) */}
      <LandingNavbar />

      {/* 2. Hero Section: Minimal Text (Left) + Large Dashboard Visual (Right) */}
      <section className="mx-auto max-w-7xl px-4 pt-8 pb-14 sm:px-8 sm:pt-12 sm:pb-18 lg:pt-14 lg:pb-20 overflow-x-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-8 items-center">
          {/* Left: Minimal Copy & CTAs */}
          <div className="lg:col-span-5 flex flex-col justify-center">
            <h1 className="text-[26px] xs:text-3xl sm:text-4xl lg:text-[44px] font-semibold tracking-[-0.035em] text-[#2C221E] leading-[1.18]">
              Manage your rentals.
              <span className="block font-serif italic font-normal text-[#9a7651] mt-1 sm:mt-1.5">
                Without the daily chaos.
              </span>
            </h1>

            <p className="mt-3 sm:mt-4 text-sm sm:text-base lg:text-lg text-[#5c5247] leading-relaxed max-w-lg">
              Track rooms, tenants, rent dues and receipts — all in one place.
            </p>

            {/* Three Compact Icon Labels */}
            <div className="mt-4 sm:mt-5 flex flex-wrap items-center gap-2 sm:gap-2.5" aria-label="Key features">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-[#e8dfd4] bg-white px-2.5 py-1 sm:px-3 sm:py-1.5 text-xs font-semibold text-[#5c4a3b] shadow-2xs">
                <Wallet className="size-3.5 text-[#845c34]" />
                <span>Rent Tracking</span>
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-full border border-[#e8dfd4] bg-white px-2.5 py-1 sm:px-3 sm:py-1.5 text-xs font-semibold text-[#5c4a3b] shadow-2xs">
                <Users className="size-3.5 text-[#845c34]" />
                <span>Tenant Records</span>
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-full border border-[#e8dfd4] bg-white px-2.5 py-1 sm:px-3 sm:py-1.5 text-xs font-semibold text-[#5c4a3b] shadow-2xs">
                <Bell className="size-3.5 text-[#845c34]" />
                <span>Payment Reminders</span>
              </div>
            </div>

            {/* Two Action Buttons */}
            <div className="mt-6 sm:mt-7 flex flex-col xs:flex-row items-stretch xs:items-center gap-3">
              <Link
                href="/signup"
                prefetch={false}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#8b5a2b] px-6 py-3.5 text-sm font-semibold text-white shadow-xs hover:bg-[#784b20] transition-colors min-h-[44px]"
              >
                Start Free 7-Day Trial <ArrowRight className="size-4" />
              </Link>
              <Link
                href="#features"
                className="inline-flex items-center justify-center rounded-xl border border-[#dfd1c0] bg-white px-5 py-3.5 text-sm font-semibold text-[#5c5247] hover:bg-[#faf7f2] transition-colors min-h-[44px]"
              >
                Explore Features
              </Link>
            </div>

            {/* Accurate Signup Flow Note - WCAG AA Conformance Contrast */}
            <p className="mt-3.5 text-xs text-[#6b5a4b] font-medium">
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
      <section id="features" className="content-visibility-auto border-t border-[#eee4d7] bg-white py-14 sm:py-18">
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <div className="max-w-2xl">
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-[-0.03em] text-[#2C221E]">
              Everything you need for calm property management
            </h2>
            <p className="mt-2 text-sm text-[#5c5247]">
              Designed specifically for PG, hostel, and residential rental operators.
            </p>
          </div>

          <div className="mt-8 grid gap-3.5 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {compactFeatures.map(({ title, description, icon: Icon }) => (
              <article
                key={title}
                className="rounded-2xl border border-[#eee4d7] bg-[#fbf8f3] p-5 hover:border-[#dfd1c0] hover:bg-white hover:shadow-2xs transition-all"
              >
                <div className="grid size-9 place-items-center rounded-xl bg-[#f3eadf] text-[#845c34]">
                  <Icon className="size-4.5" />
                </div>
                <h3 className="mt-3.5 text-sm sm:text-base font-semibold text-[#2C221E]">
                  {title}
                </h3>
                <p className="mt-1 text-xs sm:text-sm text-[#5c5247] leading-relaxed">
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
