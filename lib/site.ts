import type { Metadata } from 'next'

export const CANONICAL_SITE_URL = 'https://baserabook.in'

/**
 * Site URL Resolver
 * Enforces https://baserabook.in as the single canonical production domain.
 * Guards against internal Vercel subdomains (*.vercel.app) or misconfigured
 * environment variables overriding SEO canonicals.
 */
export function getSiteUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL

  if (envUrl && !envUrl.includes('vercel.app')) {
    return envUrl.replace(/\/$/, '')
  }

  return CANONICAL_SITE_URL
}

export const SITE_NAME = 'BaseraBook'
export const DEFAULT_OG_IMAGE = '/icon.svg'

export const TARGET_KEYWORDS = [
  'Property Management Software',
  'Rental Property Management',
  'PG Management Software',
  'Hostel Management Software',
  'Rental Property Software',
  'Rent Tracking Software',
  'PG Software',
  'Hostel Management System',
  'Tenant Management Software',
  'Rent Ledger SaaS',
  'BaseraBook',
]

interface MetadataProps {
  title: string
  description: string
  path?: string
  noIndex?: boolean
  keywords?: string[]
  ogImage?: string
}

/**
 * Construct standard production-grade metadata with dynamic canonical,
 * OpenGraph, Twitter card, and search indexing directives.
 */
export function constructMetadata({
  title,
  description,
  path = '',
  noIndex = false,
  keywords = TARGET_KEYWORDS,
  ogImage = DEFAULT_OG_IMAGE,
}: MetadataProps): Metadata {
  const siteUrl = getSiteUrl()
  const normalizedPath = (!path || path === '/') ? '/' : (path.startsWith('/') ? path : `/${path}`)
  const canonicalUrl = `${siteUrl}${normalizedPath}`

  return {
    title,
    description,
    keywords,
    authors: [{ name: 'BaseraBook Technologies' }],
    creator: 'BaseraBook Technologies',
    publisher: 'BaseraBook Technologies',
    metadataBase: new URL(siteUrl),
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: SITE_NAME,
      locale: 'en_IN',
      type: 'website',
      images: [
        {
          url: ogImage,
          width: 512,
          height: 512,
          alt: `${SITE_NAME} - Property Management Software & Rental Property Management`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage],
    },
    robots: noIndex
      ? {
          index: false,
          follow: false,
          nocache: true,
          googleBot: {
            index: false,
            follow: false,
            noimageindex: true,
            'max-video-preview': -1,
            'max-image-preview': 'none',
            'max-snippet': -1,
          },
        }
      : {
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
  }
}
