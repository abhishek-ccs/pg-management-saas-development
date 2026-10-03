import type { Metadata } from 'next'
import Link from 'next/link'
import { Building2, ArrowLeft, ShieldCheck, Mail } from 'lucide-react'
import { LegalNoticeHeader } from '@/components/legal/LegalNoticeHeader'
import { PublicFooter } from '@/components/public/PublicFooter'
import { SUPPORT_EMAIL, getMailtoSupport } from '@/lib/constants'
import { constructMetadata } from '@/lib/site'

export const metadata: Metadata = constructMetadata({
  title: 'Privacy Policy | StayBook Rental Property Management',
  description:
    'StayBook privacy policy explaining data protection, customer privacy, and compliance with the India Digital Personal Data Protection (DPDP) Act 2023 and EU GDPR.',
  path: '/privacy',
  keywords: [
    'StayBook privacy policy',
    'property management software privacy',
    'tenant data protection',
    'DPDP Act 2023 compliance',
  ],
})

export default function PrivacyPage() {
  return (
    <main id="main-content" className="min-h-screen bg-[#fbf8f3] text-[#403a34]">
      {/* Header */}
      <header className="border-b border-[#eee4d7]/90 bg-[#fbf8f3]/95 px-6 py-4 sticky top-0 z-20 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-[#9a7651] text-white">
              <Building2 className="size-5" />
            </span>
            <span className="text-base font-bold tracking-tight">StayBook</span>
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#9a7651] hover:underline"
          >
            <ArrowLeft className="size-3.5" /> Back to Home
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-12">
        <LegalNoticeHeader />

        <div className="rounded-3xl border border-[#e8dfd4] bg-white p-8 sm:p-12 shadow-sm">
          <div className="flex items-center gap-2.5 text-[#9a7651]">
            <ShieldCheck className="size-6" />
            <span className="text-xs font-bold uppercase tracking-wider">Privacy & Data Governance</span>
          </div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-[#2c2926]">StayBook Privacy Policy</h1>
          <p className="mt-2 text-xs text-[#85899a]">
            Effective Date: September 28, 2026 · Compliant with India DPDP Act 2023 & EU GDPR
          </p>

          <div className="mt-8 space-y-8 text-sm leading-7 text-[#555a6c]">
            <section>
              <h2 className="text-base font-bold text-[#2c2926]">1. Overview & Data Roles</h2>
              <p className="mt-2">
                StayBook respects your fundamental right to privacy. In operating our property management software, StayBook functions as:
              </p>
              <ul className="mt-2 list-disc pl-5 space-y-1">
                <li>
                  <strong className="text-[#3d3934]">Data Fiduciary / Data Controller</strong> for registered property owners&apos; account information, subscription records, and direct platform communications.
                </li>
                <li>
                  <strong className="text-[#3d3934]">Data Processor</strong> for resident (tenant) records, occupancy logs, and financial transaction notes uploaded into the workspace by PG Owners.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-base font-bold text-[#2c2926]">2. Information We Process</h2>
              <div className="mt-3 space-y-3">
                <div className="rounded-xl border border-[#eee4d7] bg-[#faf7f2] p-4">
                  <h3 className="font-bold text-[#3d3934]">A. Property Owner Account Data</h3>
                  <p className="text-xs text-[#676b7d] mt-1">Full name, email address, property name, physical address, business contact phone, and authentication credentials.</p>
                </div>
                <div className="rounded-xl border border-[#eee4d7] bg-[#faf7f2] p-4">
                  <h3 className="font-bold text-[#3d3934]">B. Resident Information (Uploaded by Owner)</h3>
                  <p className="text-xs text-[#676b7d] mt-1">Resident name, mobile number, emergency contact, room and bed assignment, monthly rent, security deposit amount, joining date, and government ID type/number.</p>
                </div>
                <div className="rounded-xl border border-[#eee4d7] bg-[#faf7f2] p-4">
                  <h3 className="font-bold text-[#3d3934]">C. Financial & Payment Metadata</h3>
                  <p className="text-xs text-[#676b7d] mt-1">Transaction reference numbers, payment mode (UPI, Cash, Bank Transfer), timestamps, and gateway IDs (Razorpay Order ID, Stripe Customer ID). StayBook does not store complete debit/credit card numbers or CVVs.</p>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-base font-bold text-[#2c2926]">3. Lawful Basis for Processing</h2>
              <p className="mt-2">
                We process your personal information under the following legal bases:
              </p>
              <ul className="mt-2 list-disc pl-5 space-y-1">
                <li><strong className="text-[#3d3934]">Contractual Performance:</strong> Providing cloud property management, automated rent receipts, and subscription services.</li>
                <li><strong className="text-[#3d3934]">Legal Obligation:</strong> Retaining financial records, tax invoices, and dispute evidence pursuant to Indian and international tax statutes.</li>
                <li><strong className="text-[#3d3934]">Explicit Consent:</strong> Provided by you upon registration and managing optional cookie analytics.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-base font-bold text-[#2c2926]">4. Authorized Sub-processors</h2>
              <p className="mt-2">StayBook engages strictly vetted cloud infrastructure providers bound by contractual data protection agreements:</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 text-xs">
                <div className="border border-[#e8dfd4] rounded-xl p-3 bg-white">
                  <p className="font-bold text-[#3d3934]">Supabase Inc.</p>
                  <p className="text-[#776d62]">Database hosting, row-level security, and authentication services.</p>
                </div>
                <div className="border border-[#e8dfd4] rounded-xl p-3 bg-white">
                  <p className="font-bold text-[#3d3934]">Vercel Inc.</p>
                  <p className="text-[#776d62]">Global edge hosting, serverless computing, and CDN security.</p>
                </div>
                <div className="border border-[#e8dfd4] rounded-xl p-3 bg-white">
                  <p className="font-bold text-[#3d3934]">Razorpay Software Pvt. Ltd.</p>
                  <p className="text-[#776d62]">Domestic INR payment gateway and recurring subscription management.</p>
                </div>
                <div className="border border-[#e8dfd4] rounded-xl p-3 bg-white">
                  <p className="font-bold text-[#3d3934]">Stripe Inc.</p>
                  <p className="text-[#776d62]">International multi-currency payment processing and customer portal.</p>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-base font-bold text-[#2c2926]">5. Your Data Protection Rights</h2>
              <p className="mt-2">Both Indian DPDP Act 2023 and GDPR guarantee you the following enforceable rights:</p>
              <ul className="mt-2 list-disc pl-5 space-y-1.5">
                <li><strong className="text-[#3d3934]">Right to Data Portability:</strong> You may instantly export your complete property, resident, and financial records in standard JSON format via your dashboard settings or the <code className="text-[#9a7651]">/api/user/export</code> endpoint.</li>
                <li><strong className="text-[#3d3934]">Right to Correction:</strong> You can edit and rectify any inaccurate property, room, or resident details directly in real-time.</li>
                <li><strong className="text-[#3d3934]">Right to Erasure (&quot;Right to be Forgotten&quot;):</strong> You may request permanent deletion of your account and personal records via <code className="text-[#9a7651]">/api/user/delete-account</code>. Historical financial audit logs are retained strictly as required by applicable tax retention mandates.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-base font-bold text-[#2c2926]">6. Grievance Officer & Data Protection Officer (DPO)</h2>
              <p className="mt-2">
                In compliance with Section 10 of the India Digital Personal Data Protection Act 2023, StayBook has appointed a dedicated Grievance Officer
                and Data Protection Officer to address any privacy complaints or data access requests:
              </p>
              <div className="mt-3 rounded-2xl border border-[#dcd3c5] bg-[#faf7f2] p-5 text-xs space-y-1.5">
                <p><strong className="text-[#3d3934]">Designation:</strong> Data Protection & Grievance Redressal Officer</p>
                <p><strong className="text-[#3d3934]">Entity:</strong> StayBook Technologies</p>
                <p><strong className="text-[#3d3934]">Official Email:</strong> <a href={getMailtoSupport('StayBook Privacy & Grievance Request')} className="text-[#9a7651] underline font-semibold">{SUPPORT_EMAIL}</a></p>
                <p><strong className="text-[#3d3934]">Redressal SLA:</strong> All formal privacy inquiries are acknowledged within 24 hours and resolved within 7 business days.</p>
              </div>
            </section>
          </div>
        </div>
      </div>

      <PublicFooter />
    </main>
  )
}
