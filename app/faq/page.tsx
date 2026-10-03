import type { Metadata } from 'next'
import Link from 'next/link'
import { CircleHelp, ArrowRight, Sparkles } from 'lucide-react'
import { constructMetadata, getSiteUrl } from '@/lib/site'
import { PublicHeader } from '@/components/public/PublicHeader'
import { PublicFooter } from '@/components/public/PublicFooter'
import { PRICING_CONFIG, formatINR } from '@/lib/pricing'
import { SUPPORT_EMAIL } from '@/lib/constants'

export const metadata: Metadata = constructMetadata({
  title: 'FAQ | StayBook PG & Hostel Management Software Questions',
  description:
    'Answers to frequently asked questions about StayBook: free trial details, pricing tiers, automated rent receipts, tenant onboarding, data security, and device support.',
  path: '/faq',
  keywords: [
    'PG Management Software FAQ',
    'Hostel Management Software FAQ',
    'Rental Property Software questions',
    'Property Management Software guide',
    'StayBook FAQ',
    'PG billing software',
    'tenant management questions',
  ],
})

const FAQ_ITEMS = [
  {
    category: 'Product Overview',
    q: 'What is StayBook and how does it work?',
    a: 'StayBook is a modern cloud property and rental management software designed specifically for owners and operators of PGs (paying guests), hostels, apartments, rental houses, and societies. It eliminates paper registers and messy spreadsheets by centralizing unit configurations, resident onboarding, rent collection, utility calculations, and financial ledgers into an intuitive, calm workspace.',
  },
  {
    category: 'Product Overview',
    q: 'Who should use StayBook?',
    a: 'StayBook is built for single-building PG owners, multi-property hostel operators, residential landlords, and property managers who want accurate occupancy tracking, automated rent receipt generation, clear financial history, and peace of mind.',
  },
  {
    category: 'Pricing & Trial',
    q: 'How does the 7-day free trial work?',
    a: 'Every new account starts with 7 full days of unrestricted access with zero upfront payment and no credit card required. You can add your properties, configure rooms, set up beds, register residents, and test payment collection completely risk-free.',
  },
  {
    category: 'Pricing & Trial',
    q: 'What happens when my free trial period concludes?',
    a: `When your 7-day trial ends, all your properties, tenant profiles, and ledger history remain completely secure and intact. To continue creating new records and logging payments, you can activate either our Monthly plan (${formatINR(PRICING_CONFIG.monthlyRate)}/mo) or Annual plan (${formatINR(PRICING_CONFIG.yearlyRate)}/yr).`,
  },
  {
    category: 'Pricing & Trial',
    q: 'Can I cancel or switch subscription plans anytime?',
    a: 'Yes. There are no lock-in contracts or termination fees. You can switch between Monthly and Annual billing or cancel anytime with one click directly from your workspace.',
  },
  {
    category: 'Operations & Receipts',
    q: 'Can I send payment receipts to residents via WhatsApp?',
    a: 'Yes. Every time you log a rent or utility payment, StayBook generates a formal digital receipt containing resident details, date, payment method, and breakdown. You can share it directly with the resident over WhatsApp or download it as a PDF.',
  },
  {
    category: 'Operations & Receipts',
    q: 'How does electricity sub-meter calculation work?',
    a: 'StayBook includes a dedicated utility module where you enter initial and final meter readings along with your per-unit tariff. The system computes exact consumption charges and adds them cleanly to the tenant ledger.',
  },
  {
    category: 'Data & Security',
    q: 'What happens if I accidentally delete a resident or payment record?',
    a: 'StayBook features a protective soft-delete and Trash recovery system. Deleted records are safely stored in your Deleted Records bin for 30 days, where you can restore them and their related links with a single click.',
  },
  {
    category: 'Data & Security',
    q: 'Is my property and financial data secure?',
    a: 'Yes. StayBook isolates each property owner using PostgreSQL Row Level Security (RLS) policies at the database layer. All data in transit is encrypted using modern TLS 1.3, and all data at rest is encrypted with AES-256 standards.',
  },
]

export default function FAQPage() {
  const baseUrl = getSiteUrl()

  // Schema.org FAQPage Structured Data for rich search snippets
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ_ITEMS.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.a,
      },
    })),
  }

  return (
    <main id="main-content" className="min-h-screen bg-[#fbf8f3] text-[#403a34]">
      {/* FAQPage Schema.org JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />

      <PublicHeader currentPath="/faq" />

      {/* Hero */}
      <section className="mx-auto max-w-4xl px-5 pt-16 pb-12 sm:px-8 sm:pt-20 text-center">
        <p className="inline-flex items-center gap-2 rounded-full border border-[#e8d9c7] bg-white px-3.5 py-1.5 text-xs font-semibold text-[#9a7651] shadow-2xs">
          <Sparkles className="size-3.5" />
          Questions & Answers
        </p>

        <h1 className="mt-4 text-3xl sm:text-5xl font-semibold tracking-[-0.04em] text-[#403a34]">
          Frequently Asked Questions
        </h1>

        <p className="mt-4 max-w-xl mx-auto text-base text-[#776d62] leading-7">
          Everything you need to know about StayBook property management software, billing, rent collection, and data security.
        </p>
      </section>

      {/* FAQ List */}
      <section className="mx-auto max-w-3xl px-5 pb-20 sm:px-8">
        <div className="flex flex-col gap-4">
          {FAQ_ITEMS.map(({ q, a, category }) => (
            <details
              key={q}
              className="group rounded-2xl border border-[#eee4d7] bg-white p-6 shadow-2xs transition-all open:bg-[#fbf8f3] open:border-[#dfd1c0]"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between font-semibold text-[#403a34] text-base">
                <span className="pr-4">{q}</span>
                <span className="shrink-0 rounded-full bg-[#f4ede3] px-2.5 py-0.5 text-sm font-bold text-[#9a7651] transition-transform duration-200 group-open:rotate-45">
                  +
                </span>
              </summary>
              <div className="mt-4 border-t border-[#eee4d7]/70 pt-3">
                <span className="inline-block rounded-full bg-[#eee4d7]/60 px-2 py-0.5 text-[10px] font-semibold text-[#8c6847] mb-2 uppercase tracking-wider">
                  {category}
                </span>
                <p className="text-sm leading-6 text-[#776d62]">{a}</p>
              </div>
            </details>
          ))}
        </div>

        {/* Support Callout */}
        <div className="mt-14 rounded-2xl border border-[#e8dfd4] bg-white p-8 text-center shadow-xs">
          <CircleHelp className="mx-auto size-8 text-[#9a7651]" />
          <h2 className="mt-3 text-xl font-bold text-[#2c2926]">
            Have a question not answered here?
          </h2>
          <p className="mt-2 text-xs sm:text-sm text-[#776d62]">
            Our support team is happy to guide you with setup, tenant migration, or custom questions.
          </p>
          <div className="mt-6 flex flex-wrap justify-center items-center gap-3">
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 rounded-xl bg-[#9a7651] px-5 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-[#866342] transition-colors"
            >
              Contact Support <ArrowRight className="size-3.5" />
            </Link>
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 rounded-xl border border-[#dfd1c0] bg-white px-5 py-2.5 text-xs font-semibold text-[#776d62] hover:bg-[#faf7f2] transition-colors"
            >
              Start Free Trial
            </Link>
          </div>
        </div>
      </section>

      <PublicFooter />
    </main>
  )
}
