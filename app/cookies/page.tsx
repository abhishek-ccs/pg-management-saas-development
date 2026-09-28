import Link from 'next/link'
import { Building2, ArrowLeft, Cookie } from 'lucide-react'
import { LegalNoticeHeader } from '@/components/legal/LegalNoticeHeader'

export const metadata = {
  title: 'Cookie Policy | StayNest',
  description: 'Detailed breakdown of essential, functional, and analytics cookies used across StayNest.',
}

export default function CookiePolicyPage() {
  return (
    <main id="main-content" className="min-h-screen bg-[#fbf8f3] text-[#403a34]">
      {/* Header */}
      <header className="border-b border-[#eee4d7]/90 bg-[#fbf8f3]/95 px-6 py-4 sticky top-0 z-20 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-[#9a7651] text-white">
              <Building2 className="size-5" />
            </span>
            <span className="text-base font-bold tracking-tight">StayNest</span>
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
            <Cookie className="size-6" />
            <span className="text-xs font-bold uppercase tracking-wider">Cookie Governance</span>
          </div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-[#2c2926]">StayNest Cookie Policy</h1>
          <p className="mt-2 text-xs text-[#85899a]">
            Effective Date: September 28, 2026 · Compliant with ePrivacy Directive & DPDP Act 2023
          </p>

          <div className="mt-8 space-y-8 text-sm leading-7 text-[#555a6c]">
            <section>
              <h2 className="text-base font-bold text-[#2c2926]">1. What Are Cookies?</h2>
              <p className="mt-2">
                Cookies are compact cryptographic text files placed on your device by websites you visit. They enable session persistence,
                security verification, and preference retention across web pages.
              </p>
            </section>

            <section>
              <h2 className="text-base font-bold text-[#2c2926]">2. Classification of Cookies We Use</h2>
              <div className="mt-4 space-y-4">
                <div className="rounded-2xl border border-[#e8dfd4] p-5">
                  <h3 className="font-bold text-[#3d3934] text-sm flex items-center justify-between">
                    <span>1. Strictly Necessary Cookies</span>
                    <span className="rounded-md bg-[#e7f7f0] px-2 py-0.5 text-[10px] font-bold text-[#328d68]">Always Active</span>
                  </h3>
                  <p className="mt-2 text-xs text-[#676b7d]">
                    Essential for secure authentication, CSRF validation, and maintaining active property owner sessions. Without these cookies,
                    the StayNest SaaS dashboard cannot operate securely.
                  </p>
                  <p className="mt-2 font-mono text-[11px] text-[#9a7651]">
                    Key Cookies: <code className="bg-[#faf7f2] px-1.5 py-0.5 rounded">sb-*-auth-token</code>, <code className="bg-[#faf7f2] px-1.5 py-0.5 rounded">staynest_consent</code>
                  </p>
                </div>

                <div className="rounded-2xl border border-[#e8dfd4] p-5">
                  <h3 className="font-bold text-[#3d3934] text-sm flex items-center justify-between">
                    <span>2. Functional & Preference Cookies</span>
                    <span className="rounded-md bg-[#f4ede3] px-2 py-0.5 text-[10px] font-bold text-[#9a7651]">User Controlled</span>
                  </h3>
                  <p className="mt-2 text-xs text-[#676b7d]">
                    Stores your personalized UI choices such as language preference (English vs Hindi), sidebar expansion states, and default filters.
                  </p>
                  <p className="mt-2 font-mono text-[11px] text-[#9a7651]">
                    Key Cookies: <code className="bg-[#faf7f2] px-1.5 py-0.5 rounded">staynest_locale</code>
                  </p>
                </div>

                <div className="rounded-2xl border border-[#e8dfd4] p-5">
                  <h3 className="font-bold text-[#3d3934] text-sm flex items-center justify-between">
                    <span>3. Performance & Analytics Cookies</span>
                    <span className="rounded-md bg-[#f4ede3] px-2 py-0.5 text-[10px] font-bold text-[#9a7651]">Optional / Consent Required</span>
                  </h3>
                  <p className="mt-2 text-xs text-[#676b7d]">
                    Measures Core Web Vitals (page load speeds, rendering latency, layout stability) to optimize SaaS responsiveness. Never tracks
                    identifiable personal resident information.
                  </p>
                  <p className="mt-2 font-mono text-[11px] text-[#9a7651]">
                    Key Cookies: <code className="bg-[#faf7f2] px-1.5 py-0.5 rounded">_va_analytics</code>
                  </p>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-base font-bold text-[#2c2926]">3. Managing Your Preferences</h2>
              <p className="mt-2">
                You can adjust your cookie consent preferences at any time by clearing your browser cookies or clicking the &quot;Cookie Preferences&quot;
                button in your platform account settings.
              </p>
            </section>
          </div>
        </div>
      </div>
    </main>
  )
}
