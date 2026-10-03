'use client'

import Link from 'next/link'
import { StayBookLogo } from '@/components/ui/StayBookLogo'
import { LocaleSwitcher } from '@/components/i18n/LocaleSwitcher'
import { SUPPORT_EMAIL, getMailtoSupport } from '@/lib/constants'
import { useI18n } from '@/lib/i18n'

export function PublicFooter() {
  const { t, locale } = useI18n()

  return (
    <footer className="border-t border-[#403a34] bg-[#2c2926] text-[#f8f0e5]">
      <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
        <div className="grid gap-10 sm:grid-cols-2 md:grid-cols-4">
          {/* Brand Info */}
          <div>
            <div className="flex items-center gap-2.5">
              <StayBookLogo iconSize={36} subtitleText="PROPERTY MANAGEMENT" />
            </div>
            <p className="mt-4 max-w-xs text-xs leading-6 text-[#cbbfaf]">
              {t.landing.footerDesc}
            </p>
            <p className="mt-4 text-[11px] text-[#9a9187]">
              &copy; {new Date().getFullYear()} StayBook Technologies. Built for property owners & managers.
            </p>
          </div>

          {/* Product Links */}
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-white">
              Platform
            </p>
            <ul className="mt-3 space-y-2 text-xs text-[#cbbfaf]">
              <li>
                <Link href="/features" className="transition-colors hover:text-white hover:underline">
                  Features Overview
                </Link>
              </li>
              <li>
                <Link href="/pricing" className="transition-colors hover:text-white hover:underline">
                  Pricing Plans
                </Link>
              </li>
              <li>
                <Link href="/faq" className="transition-colors hover:text-white hover:underline">
                  FAQ & Guides
                </Link>
              </li>
              <li>
                <Link href="/contact" className="transition-colors hover:text-white hover:underline">
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
                <Link href="/terms" className="transition-colors hover:text-white hover:underline">
                  {t.legal.termsOfService}
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="transition-colors hover:text-white hover:underline">
                  {t.legal.privacyPolicy}
                </Link>
              </li>
              <li>
                <Link href="/cookies" className="transition-colors hover:text-white hover:underline">
                  {t.legal.cookiePolicy}
                </Link>
              </li>
              <li>
                <Link href="/security" className="transition-colors hover:text-white hover:underline">
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
                  href={getMailtoSupport('StayBook Support Inquiry')}
                  className="transition-colors hover:text-white hover:underline"
                >
                  {SUPPORT_EMAIL}
                </a>
              </li>
              <li>
                <span className="block text-[11px] text-[#9a9187]">
                  {locale === 'hi' ? 'शिकायत निवारण अधिकारी:' : 'Grievance Officer:'}
                </span>
                <a
                  href={getMailtoSupport('StayBook Grievance Redressal')}
                  className="transition-colors hover:text-white hover:underline"
                >
                  {SUPPORT_EMAIL}
                </a>
              </li>
              <li className="pt-2">
                <LocaleSwitcher />
              </li>
              <li className="border-t border-[#403a34] pt-2">
                <Link
                  href="/admin/login"
                  className="flex items-center gap-1.5 text-[11px] text-[#8b8277] transition-colors hover:text-[#f8f0e5]"
                >
                  <span className="size-1.5 rounded-full bg-[#8b8277]" />
                  {locale === 'hi' ? 'स्टाफ लॉगिन' : 'Staff Login'}
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </footer>
  )
}
