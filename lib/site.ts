import type { Metadata } from 'next'

/**
 * Site URL Resolver
 * Allows zero-hardcoding of fake domains while ensuring canonical tags,
 * Open Graph URLs, sitemaps, and structured data automatically reflect
 * the connected production domain or local development environment.
 */
export function getSiteUrl(): string {
  const envUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '') ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '') ||
    'https://staybook.in'

  return envUrl.replace(/\/$/, '')
}

export const SITE_NAME = 'StayBook'
export const DEFAULT_OG_IMAGE = '/icon.svg'

export const TARGET_KEYWORDS = [
  'Property Management Software',
  'Rental Property Management',
  'PG Management Software',
  'Hostel Management Software',
  'Rental Property Software',
  'PG Software',
  'Hostel Management System',
  'Tenant Management Software',
  'Rent Ledger SaaS',
  'StayBook',
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
  const canonicalUrl = path ? `${siteUrl}${path.startsWith('/') ? path : `/${path}`}` : siteUrl

  return {
    title,
    description,
    keywords,
    authors: [{ name: 'StayBook Technologies' }],
    creator: 'StayBook Technologies',
    publisher: 'StayBook Technologies',
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
