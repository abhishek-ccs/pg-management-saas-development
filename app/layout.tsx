import type { Metadata, Viewport } from 'next'
import { Analytics } from '@vercel/analytics/next'
import { CookieConsentBanner } from '@/components/legal/CookieConsentBanner'
import { StructuredData } from '@/components/seo/StructuredData'
import { I18nProvider } from '@/lib/i18n'
import { getSiteUrl, TARGET_KEYWORDS } from '@/lib/site'
import './globals.css'

const baseUrl = getSiteUrl()

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: {
    default: 'StayBook | Property Management Software & Rental Property Management',
    template: '%s | StayBook',
  },
  description:
    'Modern cloud property management software and rental property management SaaS for PGs, hostels, apartments, and rental houses. Track occupancy, manage residents, log utilities, automate rent receipts, and reconcile ledgers.',
  keywords: TARGET_KEYWORDS,
  authors: [{ name: 'StayBook Technologies' }],
  creator: 'StayBook Technologies',
  publisher: 'StayBook Technologies',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  alternates: {
    canonical: baseUrl,
  },
  openGraph: {
    type: 'website',
    locale: 'en_IN',
    url: baseUrl,
    siteName: 'StayBook Property Management SaaS',
    title: 'StayBook | Property Management Software & Rental Property Management',
    description:
      'Replace spreadsheets with a calm, accurate rental property management system for PGs, hostels, apartments, and rental houses.',
    images: [
      {
        url: '/icon.svg',
        width: 512,
        height: 512,
        alt: 'StayBook - Property Management Software & Rental Property Management',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'StayBook | Property Management Software & Rental Property Management',
    description:
      'Modern cloud property and rental management software for PGs, hostels, apartments, and houses.',
    images: ['/icon.svg'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  icons: {
    icon: [
      { url: '/icon-light-32x32.png', media: '(prefers-color-scheme: light)' },
      { url: '/icon-dark-32x32.png', media: '(prefers-color-scheme: dark)' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  colorScheme: 'light dark',
  themeColor: '#9a7651',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="scroll-smooth">
      <head>
        <StructuredData />
      </head>
      <body className="antialiased font-sans text-[#403a34] bg-[#fbf8f3]">
        {/* WCAG 2.2 AA: Skip to main content keyboard accessibility link */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-xl focus:bg-[#9a7651] focus:px-4 focus:py-2.5 focus:text-xs focus:font-bold focus:text-white focus:shadow-2xl focus:outline-none focus:ring-2 focus:ring-white"
        >
          Skip to main content
        </a>

        <I18nProvider>
          {children}

          {/* GDPR & India DPDP Act 2023 Consent Management */}
          <CookieConsentBanner />
        </I18nProvider>

        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
