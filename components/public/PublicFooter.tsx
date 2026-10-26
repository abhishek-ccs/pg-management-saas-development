'use client'

import Link from 'next/link'
import { BaseraBookLogo } from '@/components/ui/BaseraBookLogo'
import { SUPPORT_EMAIL, getMailtoSupport } from '@/lib/constants'
import { useI18n } from '@/lib/i18n'

export function PublicFooter() {
  const { t, locale } = useI18n()

  return (
    <footer className="content-visibility-auto border-t border-[#403a34] bg-[#2c2926] text-[#f8f0e5]">
      <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
        <div className="grid gap-10 sm:grid-cols-2 md:grid-cols-4">
          {/* Brand Info */}
          <div>
            <div className="inline-flex items-center rounded-lg bg-[#F8F2E8] px-3 py-2">
              <BaseraBookLogo iconSize={36} subtitleText="Your Property. Smartly Managed." />
            </div>
            <p className="mt-3 max-w-xs text-xs leading-6 text-[#cbbfaf]">
              {t.landing.footerDesc}
            </p>
            <p className="mt-4 text-[11px] text-[#9a9187]">
              &copy; {new Date().getFullYear()} BaseraBook Technologies. Built for property owners & managers.
            </p>
          </div>

          {/* Product Links */}
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-white">
              Platform
            </p>
            <ul className="mt-3 space-y-2 text-xs text-[#cbbfaf]">
              <li>
                <Link href="/about" prefetch={false} className="transition-colors hover:text-white hover:underline">
                  About Us
                </Link>
              </li>
              <li>
                <Link href="/features" prefetch={false} className="transition-colors hover:text-white hover:underline">
                  Features Overview
                </Link>
              </li>
              <li>
                <Link href="/pricing" prefetch={false} className="transition-colors hover:text-white hover:underline">
                  Pricing Plans
                </Link>
              </li>
              <li>
                <Link href="/faq" prefetch={false} className="transition-colors hover:text-white hover:underline">
                  FAQ & Guides
                </Link>
              </li>
              <li>
                <Link href="/contact" prefetch={false} className="transition-colors hover:text-white hover:underline">
                  Support & Contact
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal Links */}
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-white">
              {t.landing.footerLegal}
            </p>
            <ul className="mt-3 space-y-2 text-xs text-[#cbbfaf]">
              <li>
                <Link href="/terms" prefetch={false} className="transition-colors hover:text-white hover:underline">
                  {t.legal.termsOfService}
                </Link>
              </li>
              <li>
                <Link href="/privacy" prefetch={false} className="transition-colors hover:text-white hover:underline">
                  {t.legal.privacyPolicy}
                </Link>
              </li>
              <li>
                <Link href="/cookies" prefetch={false} className="transition-colors hover:text-white hover:underline">
                  {t.legal.cookiePolicy}
                </Link>
              </li>
              <li>
                <Link href="/security" prefetch={false} className="transition-colors hover:text-white hover:underline">
                  {t.legal.securityDisclosures}
                </Link>
              </li>
            </ul>
          </div>

          {/* Support and Staff */}
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-white">
              {t.landing.footerSupport}
            </p>
            <ul className="mt-3 space-y-2 text-xs text-[#cbbfaf]">
              <li>
                <a
                  href="mailto:baserabook.team@gmail.com"
                  className="transition-colors hover:text-white hover:underline break-all"
                >
                  {SUPPORT_EMAIL}
                </a>
              </li>
              <li>
                <span className="block text-[11px] text-[#9a9187]">
                  {locale === 'hi' ? 'शिकायत निवारण अधिकारी:' : 'Grievance Officer:'}
                </span>
                <a
                  href={getMailtoSupport('BaseraBook Grievance Redressal')}
                  className="transition-colors hover:text-white hover:underline break-all"
                >
                  {SUPPORT_EMAIL}
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </footer>
  )
}
