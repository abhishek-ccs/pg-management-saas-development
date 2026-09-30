import Link from 'next/link'
import { Building2, ArrowLeft, ShieldCheck, Lock, Database, Server, Key } from 'lucide-react'
import { LegalNoticeHeader } from '@/components/legal/LegalNoticeHeader'
import { SUPPORT_EMAIL, getMailtoSupport } from '@/lib/constants'

export const metadata = {
  title: 'Security Architecture & Sub-processors | StayNest',
  description: 'Enterprise security standards, database encryption, Row Level Security, and sub-processor disclosures.',
}

export default function SecurityPage() {
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
            <ShieldCheck className="size-6" />
            <span className="text-xs font-bold uppercase tracking-wider">Enterprise Security Posture</span>
          </div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-[#2c2926]">StayNest Security Architecture</h1>
          <p className="mt-2 text-xs text-[#85899a]">
            Last Updated: September 28, 2026 · SOC 2 & ISO 27001 Aligned Controls
          </p>

          <div className="mt-8 space-y-8 text-sm leading-7 text-[#555a6c]">
            <section>
              <h2 className="text-base font-bold text-[#2c2926]">1. Multi-Tenant Cryptographic Isolation</h2>
              <p className="mt-2">
                StayNest implements defense-in-depth security principles. Multi-tenant customer data is isolated at the database engine level
                utilizing PostgreSQL Row Level Security (RLS) policies. Every incoming query is bound to the verified cryptographic JWT identity of the
                authenticated user, preventing cross-tenant data leakage even in the event of client-side code compromise.
              </p>
            </section>

            <section>
              <h2 className="text-base font-bold text-[#2c2926]">2. Core Security Controls</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-[#e8dfd4] bg-[#faf7f2] p-5">
                  <div className="flex items-center gap-2 text-[#9a7651]">
                    <Lock className="size-5" />
                    <h3 className="font-bold text-[#3d3934] text-xs">Encryption In-Transit & At-Rest</h3>
                  </div>
                  <p className="mt-2 text-xs text-[#676b7d]">
                    All data in transit is encrypted using modern TLS 1.3 with HSTS preloading. Database volumes and automated backup snapshots
                    are encrypted at rest using AES-256.
                  </p>
                </div>

                <div className="rounded-2xl border border-[#e8dfd4] bg-[#faf7f2] p-5">
                  <div className="flex items-center gap-2 text-[#9a7651]">
                    <Key className="size-5" />
                    <h3 className="font-bold text-[#3d3934] text-xs">Privileged Role Defense</h3>
                  </div>
                  <p className="mt-2 text-xs text-[#676b7d]">
                    Super Admin privileges cannot be assigned via public signups or client mutations. Role escalation is blocked via database triggers,
                    and all administrative actions are immutably logged to platform audit logs.
                  </p>
                </div>

                <div className="rounded-2xl border border-[#e8dfd4] bg-[#faf7f2] p-5">
                  <div className="flex items-center gap-2 text-[#9a7651]">
                    <Server className="size-5" />
                    <h3 className="font-bold text-[#3d3934] text-xs">Edge Abuse & Rate Limiting</h3>
                  </div>
                  <p className="mt-2 text-xs text-[#676b7d]">
                    Next.js Edge Middleware enforces token-bucket rate limiting on authentication and API routes, preventing automated credential stuffing,
                    brute-force attacks, and scraping.
                  </p>
                </div>

                <div className="rounded-2xl border border-[#e8dfd4] bg-[#faf7f2] p-5">
                  <div className="flex items-center gap-2 text-[#9a7651]">
                    <Database className="size-5" />
                    <h3 className="font-bold text-[#3d3934] text-xs">Automated Redundancy</h3>
                  </div>
                  <p className="mt-2 text-xs text-[#676b7d]">
                    Daily automated database snapshots and point-in-time recovery (PITR) safeguards customer business records against regional cloud outages
                    and accidental disasters.
                  </p>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-base font-bold text-[#2c2926]">3. Incident Response & Breach Notification</h2>
              <p className="mt-2">
                StayNest maintains a documented incident response runbook. In the unlikely event of a verified data breach impacting personal resident
                or property records, affected customers and relevant supervisory authorities will be formally notified within 72 hours of verification
                pursuant to GDPR and Section 8(6) of the India DPDP Act 2023.
              </p>
            </section>

            <section>
              <h2 className="text-base font-bold text-[#2c2926]">4. Responsible Vulnerability Disclosure</h2>
              <p className="mt-2">
                If you discover a security vulnerability or suspect an incident, please report it immediately to our security response team at:{' '}
                <a
                  href={getMailtoSupport('Security Vulnerability Disclosure')}
                  className="font-semibold text-[#9a7651] underline"
                >
                  {SUPPORT_EMAIL}
                </a>
                . We investigate all actionable reports promptly.
              </p>
            </section>
          </div>
        </div>
      </div>
    </main>
  )
}
