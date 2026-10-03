import type { Metadata } from 'next'
import Link from 'next/link'
import {
  Building2,
  Users,
  Wallet,
  Receipt,
  ShieldCheck,
  DoorOpen,
  ArrowRight,
  Sparkles,
  Zap,
  RotateCcw,
  CheckCircle2,
} from 'lucide-react'
import { constructMetadata } from '@/lib/site'
import { PublicHeader } from '@/components/public/PublicHeader'
import { PublicFooter } from '@/components/public/PublicFooter'

export const metadata: Metadata = constructMetadata({
  title: 'Features | StayBook Modern PG & Hostel Management Software',
  description:
    'Explore comprehensive tools built for property managers and owners: room & bed inventory, tenant KYC onboarding, rent ledgers, WhatsApp receipts, electricity sub-meter calculation, and data restore safety.',
  path: '/features',
  keywords: [
    'PG Management Software',
    'Hostel Management Software',
    'Property Management Software',
    'Rental Property Software',
    'Rental Property Management',
    'PG room management',
    'hostel billing system',
    'tenant record software',
    'rent ledger SaaS',
  ],
})

const FEATURE_MODULES = [
  {
    icon: Building2,
    badge: 'Inventory Control',
    title: 'Property & Room Management',
    description:
      'Structure multiple buildings, floors, rooms, and individual bed slots with accurate capacity counters. Get an instant real-time view of occupied vs. vacant units across your properties.',
    highlights: [
      'Multi-property portfolio overview from a single login',
      'Configurable room types (Single, Double, Triple sharing)',
      'Real-time bed availability indicators',
      'Base rent and deposit configuration per room/bed',
    ],
  },
  {
    icon: Users,
    badge: 'Resident KYC',
    title: 'Tenant Records & Onboarding',
    description:
      'Digitize your resident register. Securely record resident profiles, contact details, emergency guardians, check-in dates, room allocations, and vacate requests without lost paper files.',
    highlights: [
      'Fast resident registration with room & bed assignment',
      'Contact numbers, emergency guardians, and identity records',
      'Active vs. vacated resident status tracking',
      'Security deposit recording and refund history',
    ],
  },
  {
    icon: Wallet,
    badge: 'Financial Ledger',
    title: 'Rent Collection & Digital Ledgers',
    description:
      'Eliminate payment disputes with an audit-ready financial ledger. Track monthly dues, log payments across cash, UPI, or bank transfer, and maintain transparent tenant accounts.',
    highlights: [
      'Automatic monthly rent due calculation',
      'Detailed transaction ledgers with payment mode tracking',
      'Formal printable receipts & 1-click WhatsApp sharing',
      'Pending dues breakdown with overdue flags',
    ],
  },
  {
    icon: Zap,
    badge: 'Utility Billing',
    title: 'Electricity Meter & Expense Tracking',
    description:
      'Fairly bill utility consumption without manual math. Record initial and final meter readings, apply unit rates, and log routine property operating costs in seconds.',
    highlights: [
      'Electricity sub-meter readings with automatic unit math',
      'Per-unit electricity tariff calculation and billing',
      'Categorized property expense tracking (repairs, supplies)',
      'Net monthly operating income calculations',
    ],
  },
  {
    icon: RotateCcw,
    badge: 'Data Protection',
    title: 'Soft-Delete & Trash Recovery',
    description:
      'Never lose accidental deletions again. Deleted properties, rooms, beds, tenants, or ledger entries move to a dedicated Trash bin where they can be restored with 1 click.',
    highlights: [
      'Safe soft-delete with 30-day trash retention',
      '1-click instant record restoration',
      'Automatic cascade restoration of associated relations',
      'Immutable activity logs for every deletion and restore',
    ],
  },
  {
    icon: ShieldCheck,
    badge: 'Privacy & Security',
    title: 'Enterprise-Grade Security & Isolation',
    description:
      'Your financial and resident records are protected with bank-grade security. Rigorous Row Level Security (RLS) ensures complete data isolation between property owners.',
    highlights: [
      'Row Level Security (RLS) enforced at the database layer',
      'Encrypted transit via TLS 1.3 and encrypted data at rest',
      'India DPDP Act 2023 & GDPR aligned privacy practices',
      'Automated cloud backups with zero local server burden',
    ],
  },
]

export default function FeaturesPage() {
  return (
    <main id="main-content" className="min-h-screen bg-[#fbf8f3] text-[#403a34]">
      <PublicHeader currentPath="/features" />

      {/* Hero Header */}
      <section className="mx-auto max-w-6xl px-5 pt-16 pb-12 sm:px-8 sm:pt-20 sm:pb-16 text-center">
        <p className="inline-flex items-center gap-2 rounded-full border border-[#e8d9c7] bg-white px-3.5 py-1.5 text-xs font-semibold text-[#9a7651] shadow-2xs">
          <Sparkles className="size-3.5" />
          Modern Property Management Software
        </p>

        <h1 className="mt-4 text-3xl sm:text-5xl lg:text-6xl font-semibold tracking-[-0.04em] text-[#403a34] max-w-4xl mx-auto">
          Built for daily operations.{' '}
          <span className="font-serif italic font-normal text-[#9a7651]">
            Calm, accurate, and reliable.
          </span>
        </h1>

        <p className="mt-5 max-w-2xl mx-auto text-base sm:text-lg text-[#776d62] leading-7">
          StayBook brings your properties, rooms, tenants, rent collections, and utility bills together into one cohesive, cloud-based workspace.
        </p>

        <div className="mt-8 flex flex-wrap justify-center items-center gap-3">
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 rounded-xl bg-[#9a7651] px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#866342] transition-colors"
          >
            Start 7-Day Free Trial <ArrowRight className="size-4" />
          </Link>
          <Link
            href="/pricing"
            className="inline-flex items-center gap-2 rounded-xl border border-[#dfd1c0] bg-white px-6 py-3 text-sm font-semibold text-[#776d62] hover:bg-[#faf7f2] transition-colors"
          >
            View Pricing Plans
          </Link>
        </div>
      </section>

      {/* Feature Modules Grid */}
      <section className="border-t border-[#eee4d7] bg-white py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {FEATURE_MODULES.map((module) => {
              const Icon = module.icon
              return (
                <article
                  key={module.title}
                  className="flex flex-col justify-between rounded-3xl border border-[#eee4d7] bg-[#fbf8f3] p-7 transition-shadow hover:shadow-md"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="grid size-11 place-items-center rounded-2xl bg-[#f3eadf] text-[#9a7651]">
                        <Icon className="size-5" />
                      </span>
                      <span className="rounded-full bg-[#f4ede3] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#9a7651]">
                        {module.badge}
                      </span>
                    </div>

                    <h2 className="mt-6 text-xl font-bold tracking-tight text-[#2c2926]">
                      {module.title}
                    </h2>
                    <p className="mt-2.5 text-xs sm:text-sm text-[#776d62] leading-6">
                      {module.description}
                    </p>

                    <div className="mt-6 border-t border-[#eee4d7] pt-5">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-[#a08d79]">
                        Capabilities
                      </p>
                      <ul className="mt-3 space-y-2 text-xs text-[#555a6c]">
                        {module.highlights.map((item) => (
                          <li key={item} className="flex items-start gap-2">
                            <CheckCircle2 className="size-3.5 shrink-0 text-[#9a7651] mt-0.5" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="mx-auto max-w-5xl px-5 py-16 sm:px-8 sm:py-20 text-center">
        <div className="rounded-3xl border border-[#e8d9c7] bg-[#f3eadf] p-8 sm:p-12 shadow-sm">
          <DoorOpen className="mx-auto size-10 text-[#9a7651]" />
          <h2 className="mt-4 text-2xl sm:text-4xl font-semibold tracking-tight text-[#2c2926]">
            Ready to upgrade your property operations?
          </h2>
          <p className="mt-3 max-w-xl mx-auto text-xs sm:text-sm text-[#776d62] leading-6">
            Get started in 60 seconds with our 7-day full access free trial. No credit card required upfront.
          </p>
          <div className="mt-7">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 rounded-xl bg-[#9a7651] px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#866342] transition-colors"
            >
              Start Free Trial Now <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </section>

      <PublicFooter />
    </main>
  )
}
