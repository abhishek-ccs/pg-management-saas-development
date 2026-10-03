import type { Metadata } from 'next'
import Link from 'next/link'
import { Mail, Clock, ShieldCheck, ArrowRight, Sparkles, HelpCircle } from 'lucide-react'
import { constructMetadata } from '@/lib/site'
import { PublicHeader } from '@/components/public/PublicHeader'
import { PublicFooter } from '@/components/public/PublicFooter'
import { SUPPORT_EMAIL, getMailtoSupport } from '@/lib/constants'

export const metadata: Metadata = constructMetadata({
  title: 'Contact Support | StayBook Property Management Software',
  description:
    'Get in touch with the StayBook support and grievance team for assistance with property setup, billing inquiries, account onboarding, or platform feedback.',
  path: '/contact',
  keywords: [
    'StayBook contact',
    'Property Management Software support',
    'PG software customer care',
    'StayBook help email',
    'rental property software inquiry',
    'Hostel software support',
  ],
})

export default function ContactPage() {
  return (
    <main id="main-content" className="min-h-screen bg-[#fbf8f3] text-[#403a34]">
      <PublicHeader currentPath="/contact" />

      {/* Hero */}
      <section className="mx-auto max-w-4xl px-5 pt-16 pb-12 sm:px-8 sm:pt-20 text-center">
        <p className="inline-flex items-center gap-2 rounded-full border border-[#e8d9c7] bg-white px-3.5 py-1.5 text-xs font-semibold text-[#9a7651] shadow-2xs">
          <Sparkles className="size-3.5" />
          Customer Support & Grievance
        </p>

        <h1 className="mt-4 text-3xl sm:text-5xl font-semibold tracking-[-0.04em] text-[#403a34]">
          We&apos;re here to help you run smoothly.
        </h1>

        <p className="mt-4 max-w-xl mx-auto text-base text-[#776d62] leading-7">
          Whether you need assistance configuring your first property, have billing questions, or require technical support, our team is at your service.
        </p>
      </section>

      {/* Contact Cards */}
      <section className="mx-auto max-w-4xl px-5 pb-20 sm:px-8">
        <div className="grid gap-6 sm:grid-cols-2">
          {/* Support Email Card */}
          <div className="rounded-3xl border border-[#eee4d7] bg-white p-7 shadow-xs">
            <span className="grid size-12 place-items-center rounded-2xl bg-[#f4ede3] text-[#9a7651]">
              <Mail className="size-6" />
            </span>
            <h2 className="mt-5 text-xl font-bold text-[#2c2926]">Support & Inquiries</h2>
            <p className="mt-2 text-xs sm:text-sm text-[#776d62] leading-6">
              For general inquiries, account assistance, feature requests, or technical questions:
            </p>
            <div className="mt-5 rounded-xl border border-[#eee4d7] bg-[#fbf8f3] p-3.5">
              <p className="text-[11px] font-semibold text-[#a08d79] uppercase tracking-wider">Email Address</p>
              <a
                href={getMailtoSupport('StayBook Support Inquiry')}
                className="mt-1 block text-sm sm:text-base font-bold text-[#9a7651] hover:underline"
              >
                {SUPPORT_EMAIL}
              </a>
            </div>
            <p className="mt-3 text-[11px] text-[#85899a] flex items-center gap-1.5">
              <Clock className="size-3.5 text-[#9a7651]" />
              Typical response time: Within 24 business hours
            </p>
          </div>

          {/* Grievance & Compliance Card */}
          <div className="rounded-3xl border border-[#eee4d7] bg-white p-7 shadow-xs">
            <span className="grid size-12 place-items-center rounded-2xl bg-[#f4ede3] text-[#9a7651]">
              <ShieldCheck className="size-6" />
            </span>
            <h2 className="mt-5 text-xl font-bold text-[#2c2926]">Grievance Redressal</h2>
            <p className="mt-2 text-xs sm:text-sm text-[#776d62] leading-6">
              In compliance with the India Digital Personal Data Protection (DPDP) Act 2023:
            </p>
            <div className="mt-5 rounded-xl border border-[#eee4d7] bg-[#fbf8f3] p-3.5">
              <p className="text-[11px] font-semibold text-[#a08d79] uppercase tracking-wider">Designated Officer</p>
              <p className="text-sm font-bold text-[#2c2926]">Grievance Redressal Officer</p>
              <a
                href={getMailtoSupport('StayBook Grievance Redressal')}
                className="mt-0.5 block text-xs sm:text-sm font-semibold text-[#9a7651] hover:underline"
              >
                {SUPPORT_EMAIL}
              </a>
            </div>
            <p className="mt-3 text-[11px] text-[#85899a] flex items-center gap-1.5">
              <Clock className="size-3.5 text-[#9a7651]" />
              Statutory acknowledgement within 48 hours
            </p>
          </div>
        </div>

        {/* Quick Links Section */}
        <div className="mt-10 rounded-2xl border border-[#eee4d7] bg-[#f4ede3]/40 p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <HelpCircle className="size-6 text-[#9a7651] shrink-0" />
            <div>
              <p className="text-sm font-bold text-[#2c2926]">Looking for quick self-serve answers?</p>
              <p className="text-xs text-[#776d62]">Check our FAQ page covering billing, trial, setup, and ledgers.</p>
            </div>
          </div>
          <Link
            href="/faq"
            className="inline-flex items-center gap-1.5 rounded-xl bg-white border border-[#dfd1c0] px-4 py-2 text-xs font-semibold text-[#776d62] hover:bg-[#faf7f2] shadow-2xs transition-colors shrink-0"
          >
            Visit FAQ Page <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </section>

      <PublicFooter />
    </main>
  )
}
