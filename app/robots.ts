import type { MetadataRoute } from 'next'
import { getSiteUrl } from '@/lib/site'

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getSiteUrl()

  return {
    rules: [
      {
        userAgent: '*',
        allow: [
          '/',
          '/pricing',
          '/features',
          '/faq',
          '/contact',
          '/terms',
          '/privacy',
          '/cookies',
          '/security',
        ],
        disallow: [
          '/dashboard',
          '/dashboard/',
          '/admin',
          '/admin/',
          '/login',
          '/signup',
          '/auth/',
          '/api/',
          '/_next/',
          '/private/',
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}
