import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
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
          '/console',
          '/console/',
          '/login',
          '/signup',
          '/auth/',
          '/api/',
          '/_next/',
          '/private/',
        ],
      },
    ],
    sitemap: 'https://baserabook.in/sitemap.xml',
  }
}
