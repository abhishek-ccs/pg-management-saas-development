import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://staynest.in'

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
          '/login',
          '/signup',
        ],
        disallow: [
          '/dashboard/',
          '/admin/',
          '/api/',
          '/_next/',
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}
