import Link from 'next/link'
import { Building2, ArrowLeft } from 'lucide-react'
import { LegalNoticeHeader } from '@/components/legal/LegalNoticeHeader'
import { SUPPORT_EMAIL, getMailtoSupport } from '@/lib/constants'

export const metadata = {
  title: 'Terms of Service | StayBook',
  description: 'Terms and conditions governing the use of StayBook PG & Property Management SaaS platform.',
}

export default function TermsPage() {
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
          <h1 className="text-3xl font-bold tracking-tight text-[#2c2926]">StayBook Terms of Service</h1>
          <p className="mt-2 text-xs text-[#85899a]">
            Effective Date: September 28, 2026 · Version: 1.0.0 (Global B2B SaaS Edition)
          </p>

          <div className="mt-8 space-y-8 text-sm leading-7 text-[#555a6c]">
            <section>
              <h2 className="text-base font-bold text-[#2c2926]">1. Agreement to Terms</h2>
              <p className="mt-2">
                By accessing or subscribing to StayBook (&quot;Service&quot;, &quot;Platform&quot;), operated by StayBook Technologies (&quot;Company&quot;, &quot;we&quot;, &quot;us&quot;),
                you (&quot;Customer&quot;, &quot;PG Owner&quot;, &quot;Operator&quot;) agree to be legally bound by these Terms of Service. If you are entering into this agreement on behalf of
                a company or property management organization, you represent that you hold necessary authority.
              </p>
            </section>

            <section>
              <h2 className="text-base font-bold text-[#2c2926]">2. Description of Service</h2>
              <p className="mt-2">
                StayBook is a cloud-based multi-tenant property management platform enabling property managers to administer real estate properties,
                rooms, bed inventories, resident tenancy agreements, rent invoicing, utility meter readings, operating expenses, and maintenance ticketing.
              </p>
            </section>

            <section>
              <h2 className="text-base font-bold text-[#2c2926]">3. Free Trial & Subscription Lifecycle</h2>
              <p className="mt-2">
                New accounts are granted a 7-day unrestricted trial. Upon conclusion of the trial period, continuous recording of new resident agreements and
                financial entries requires an active paid subscription (e.g. Starter, Growth, or Pro plans) billed on a recurring monthly or annual basis
                via authorized gateways (Razorpay for domestic INR payments; Stripe for international transactions).
              </p>
            </section>

            <section>
              <h2 className="text-base font-bold text-[#2c2926]">4. Customer Responsibilities & Resident Data</h2>
              <p className="mt-2">
                The Customer acts as the primary Data Fiduciary (under India DPDP Act 2023) or Data Controller (under GDPR) regarding all resident
                personal information uploaded to StayBook. The Customer represents that they have obtained valid, documented consent from tenants before
                uploading their government ID numbers, phone numbers, or emergency contact records.
              </p>
            </section>

            <section>
              <h2 className="text-base font-bold text-[#2c2926]">5. Data Export & Account Deletion</h2>
              <p className="mt-2">
                In adherence to data protection standards, Customers retain absolute ownership of their business data. You may download a machine-readable
                JSON export of all properties, tenants, and ledger transactions at any time via the platform settings, or request permanent deletion of your
                account pursuant to our Privacy Policy.
              </p>
            </section>

            <section>
              <h2 className="text-base font-bold text-[#2c2926]">6. Limitation of Liability</h2>
              <p className="mt-2">
                To the maximum extent permitted by applicable law, StayBook shall not be liable for any indirect, incidental, special, or consequential damages,
                including loss of rental income, tenant dispute outcomes, or utility billing discrepancies resulting from manual input error.
              </p>
            </section>

            <section>
              <h2 className="text-base font-bold text-[#2c2926]">7. Governing Law & Dispute Resolution</h2>
              <p className="mt-2">
                These Terms shall be governed by and construed in accordance with the laws of the Republic of India. Any legal dispute or claim arising
                under these terms shall be subject to the exclusive jurisdiction of the competent courts located in New Delhi, India.
              </p>
            </section>

            <section>
              <h2 className="text-base font-bold text-[#2c2926]">8. Contact & Legal Notices</h2>
              <p className="mt-2">
                For questions regarding these Terms or formal legal notices, contact our administration team at:{' '}
                <a
                  href={getMailtoSupport('StayBook Terms of Service Inquiry')}
                  className="font-semibold text-[#9a7651] underline"
                >
                  {SUPPORT_EMAIL}
                </a>
              </p>
            </section>
          </div>
        </div>
      </div>
    </main>
  )
}
