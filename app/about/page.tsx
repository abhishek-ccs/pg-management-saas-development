import type { Metadata } from 'next'
import Link from 'next/link'
import {
  Building2,
  Users,
  Wallet,
  Zap,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  Compass,
  Home,
  Receipt,
  Layers,
} from 'lucide-react'
import { constructMetadata } from '@/lib/site'
import { PublicHeader } from '@/components/public/PublicHeader'
import { PublicFooter } from '@/components/public/PublicFooter'

export const metadata: Metadata = constructMetadata({
  title: 'About Us | BaseraBook Property Management Software',
  description:
    'Learn about BaseraBook — the modern property management SaaS built for PGs, hostels, rental houses, and apartments to streamline rent tracking, utility billing, receipts, and operations.',
  path: '/about',
  keywords: [
    'About BaseraBook',
    'PG Management SaaS',
    'Hostel Management Software',
    'Rental Property Management',
    'Apartment Management Software',
    'Rent Tracking Software',
    'Electricity Bill Calculator',
    'Property Operations',
  ],
})

const PROPERTY_TYPES = [
  {
    icon: Building2,
    title: 'PGs & Co-Living',
    description:
      'Manage multi-sharing rooms, bed vacancies, meal preferences, and tenant onboarding seamlessly across single or multi-branch properties.',
  },
  {
    icon: Layers,
    title: 'Student & Working Hostels',
    description:
      'Coordinate high-density room assignments, emergency guardian records, check-in dates, and structured monthly fee cycles without friction.',
  },
  {
    icon: Home,
    title: 'Rental Houses & Flats',
    description:
      'Track individual family leases, maintenance charges, security deposits, and scheduled rental payments for standalone rental properties.',
  },
  {
    icon: Users,
    title: 'Apartments & Residential Units',
    description:
      'Handle multiple units across floors, recurring dues, common utility distributions, and digital payment receipts from one unified dashboard.',
  },
]

const CORE_PILLARS = [
  {
    icon: Wallet,
    title: 'Automated Rent & Payment Tracking',
    description:
      'Keep your ledger audit-ready. Record rent received via UPI, cash, or bank transfers, calculate pending dues automatically, and generate clean digital receipts.',
  },
  {
    icon: Zap,
    title: 'Transparent Electricity Sub-Meter Billing',
    description:
      'Eliminate utility disputes. Log initial and final meter readings, apply per-unit tariffs, and bill residents accurately based on actual consumption.',
  },
  {
    icon: Receipt,
    title: 'Digital Receipts & WhatsApp Sharing',
    description:
      'Deliver instant, professional payment receipts to residents via WhatsApp and downloadable PDFs, creating immediate trust and verifiable proof.',
  },
  {
    icon: ShieldCheck,
    title: 'Secure Records & Trash Recovery',
    description:
      'Rely on robust Row Level Security (RLS) to ensure absolute tenant and owner privacy, accompanied by 30-day soft-delete protection against accidental record loss.',
  },
]

export default function AboutPage() {
  return (
    <main id="main-content" className="min-h-screen bg-[#fbf8f3] text-[#403a34]">
      <PublicHeader currentPath="/about" />

      {/* Hero Section */}
      <section className="mx-auto max-w-5xl px-5 pt-16 pb-12 sm:px-8 sm:pt-20 sm:pb-16 text-center">
        <p className="inline-flex items-center gap-2 rounded-full border border-[#e8d9c7] bg-white px-3.5 py-1.5 text-xs font-semibold text-[#9a7651] shadow-2xs">
          <Sparkles className="size-3.5" />
          About BaseraBook
        </p>

        <h1 className="mt-4 text-3xl sm:text-5xl lg:text-6xl font-semibold tracking-[-0.04em] text-[#403a34] max-w-3xl mx-auto">
          Modern property management.{' '}
          <span className="font-serif italic font-normal text-[#9a7651]">
            Calm, accurate, and efficient.
          </span>
        </h1>

        <p className="mt-5 max-w-2xl mx-auto text-base sm:text-lg text-[#776d62] leading-relaxed">
          BaseraBook is a purpose-built property management SaaS for paying guest (PG) accommodations, student hostels, rental houses, and residential apartments. We help property owners manage rent collection, electricity sub-meter billing, payment receipts, and resident operations with clarity and confidence.
        </p>

        <div className="mt-8 flex flex-wrap justify-center items-center gap-3">
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 rounded-xl bg-[#9a7651] px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#866342] transition-colors"
          >
            Start 7-Day Free Trial <ArrowRight className="size-4" />
          </Link>
          <Link
            href="/features"
            className="inline-flex items-center gap-2 rounded-xl border border-[#dfd1c0] bg-white px-6 py-3 text-sm font-semibold text-[#776d62] hover:bg-[#faf7f2] transition-colors"
          >
            Explore All Features
          </Link>
        </div>
      </section>

      {/* Mission Statement */}
      <section className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
        <div className="rounded-3xl border border-[#e8d9c7] bg-white p-8 sm:p-12 shadow-sm">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
            <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-[#f3eadf] text-[#9a7651]">
              <Compass className="size-7" />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-[#9a7651]">
                Our Mission
              </p>
              <h2 className="mt-2 text-2xl sm:text-3xl font-semibold tracking-tight text-[#2c2926]">
                Replacing paper registers and spreadsheets with clarity and trust.
              </h2>
              <p className="mt-3 text-sm sm:text-base text-[#776d62] leading-relaxed">
                Property management in India and emerging markets has long relied on handwritten registers, scattered WhatsApp chats, and complex spreadsheet formulas that invite billing disputes and lost payments. Our mission is to provide owners with a calm, dependable software platform that turns chaotic day-to-day operations into an automated, transparent, and error-free routine.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Properties Supported */}
      <section className="mx-auto max-w-5xl px-5 py-12 sm:px-8">
        <div className="text-center max-w-2xl mx-auto">
          <p className="text-xs font-bold uppercase tracking-wider text-[#9a7651]">
            Tailored For You
          </p>
          <h2 className="mt-2 text-2xl sm:text-3xl font-semibold tracking-tight text-[#2c2926]">
            Built for diverse property operations
          </h2>
          <p className="mt-2 text-sm text-[#776d62]">
            Whether you operate a single rental unit or a multi-building hostel network, BaseraBook adapts to your inventory layout.
          </p>
        </div>

        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {PROPERTY_TYPES.map((item) => {
            const Icon = item.icon
            return (
              <div
                key={item.title}
                className="flex flex-col rounded-2xl border border-[#eee4d7] bg-white p-6 shadow-2xs hover:shadow-sm transition-shadow"
              >
                <span className="grid size-11 place-items-center rounded-xl bg-[#f3eadf] text-[#9a7651]">
                  <Icon className="size-5" />
                </span>
                <h3 className="mt-4 text-base font-bold text-[#2c2926]">
                  {item.title}
                </h3>
                <p className="mt-2 text-xs sm:text-sm text-[#776d62] leading-relaxed">
                  {item.description}
                </p>
              </div>
            )
          })}
        </div>
      </section>

      {/* Core Operational Capabilities */}
      <section className="border-t border-[#eee4d7] bg-[#f5ede2]/50 py-16 sm:py-20">
        <div className="mx-auto max-w-5xl px-5 sm:px-8">
          <div className="text-center max-w-2xl mx-auto">
            <p className="text-xs font-bold uppercase tracking-wider text-[#9a7651]">
              How BaseraBook Helps
            </p>
            <h2 className="mt-2 text-2xl sm:text-3xl font-semibold tracking-tight text-[#2c2926]">
              Designed around daily property workflows
            </h2>
            <p className="mt-2 text-sm text-[#776d62]">
              Every tool in BaseraBook directly tackles a time-consuming manual task faced by property owners.
            </p>
          </div>

          <div className="mt-10 grid gap-6 sm:grid-cols-2">
            {CORE_PILLARS.map((pillar) => {
              const Icon = pillar.icon
              return (
                <div
                  key={pillar.title}
                  className="rounded-2xl border border-[#e8d9c7] bg-white p-6 sm:p-7 shadow-2xs"
                >
                  <div className="flex items-center gap-3.5">
                    <span className="grid size-10 place-items-center rounded-xl bg-[#f3eadf] text-[#9a7651]">
                      <Icon className="size-5" />
                    </span>
                    <h3 className="text-base sm:text-lg font-bold text-[#2c2926]">
                      {pillar.title}
                    </h3>
                  </div>
                  <p className="mt-3 text-xs sm:text-sm text-[#776d62] leading-relaxed">
                    {pillar.description}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Core Principles */}
      <section className="mx-auto max-w-5xl px-5 py-16 sm:px-8">
        <div className="rounded-3xl border border-[#eee4d7] bg-white p-8 sm:p-10 shadow-sm">
          <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-[#2c2926] text-center">
            Our Core Principles
          </h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-3">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-[#9a7651]" />
                <h3 className="text-sm font-bold text-[#2c2926]">Simplicity Over Clutter</h3>
              </div>
              <p className="text-xs text-[#776d62] leading-relaxed">
                We believe software should feel fast and straightforward. No unnecessary jargon or overwhelming menus — just what you need to run your properties smoothly.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-[#9a7651]" />
                <h3 className="text-sm font-bold text-[#2c2926]">Mathematical Precision</h3>
              </div>
              <p className="text-xs text-[#776d62] leading-relaxed">
                Rent balance, meter calculations, and deposit deductions are tracked transparently, preventing disputes between owners and residents.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-[#9a7651]" />
                <h3 className="text-sm font-bold text-[#2c2926]">Data Security & Privacy</h3>
              </div>
              <p className="text-xs text-[#776d62] leading-relaxed">
                Your resident records and financial ledgers belong solely to you. We safeguard your data with strict tenant isolation and modern encryption.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Call to Action */}
      <section className="mx-auto max-w-5xl px-5 pb-16 sm:px-8 sm:pb-24 text-center">
        <div className="rounded-3xl border border-[#e8d9c7] bg-[#f3eadf] p-8 sm:p-12 shadow-sm">
          <Building2 className="mx-auto size-10 text-[#9a7651]" />
          <h2 className="mt-4 text-2xl sm:text-3xl font-semibold tracking-tight text-[#2c2926]">
            Experience easier property management
          </h2>
          <p className="mt-3 max-w-xl mx-auto text-xs sm:text-sm text-[#776d62] leading-relaxed">
            Start your 7-day full access free trial today. Set up your properties, add your first room, and generate digital receipts in minutes.
          </p>
          <div className="mt-7 flex flex-wrap justify-center items-center gap-3">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 rounded-xl bg-[#9a7651] px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#866342] transition-colors"
            >
              Start Free Trial <ArrowRight className="size-4" />
            </Link>
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 rounded-xl border border-[#dfd1c0] bg-white px-6 py-3 text-sm font-semibold text-[#776d62] hover:bg-[#faf7f2] transition-colors"
            >
              Contact Support
            </Link>
          </div>
        </div>
      </section>

      <PublicFooter />
    </main>
  )
}
