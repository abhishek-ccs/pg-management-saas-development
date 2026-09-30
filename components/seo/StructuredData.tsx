import { SUPPORT_EMAIL } from '@/lib/constants'

export function StructuredData() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://staynest.in'

  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${baseUrl}/#organization`,
        name: 'StayNest Technologies',
        url: baseUrl,
        logo: `${baseUrl}/icon.svg`,
        email: SUPPORT_EMAIL,
        description: 'Global cloud property management and rental SaaS workspace.',
        sameAs: ['https://x.com/staynest', 'https://linkedin.com/company/staynest'],
      },
      {
        '@type': 'SoftwareApplication',
        '@id': `${baseUrl}/#software`,
        name: 'StayNest',
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'All modern web browsers (Chrome, Safari, Firefox, Edge)',
        url: baseUrl,
        description: 'Complete PG, hostel, and rental property management software featuring automated rent collection, bed occupancy tracking, electricity calculations, and tenant ledger.',
        offers: [
          {
            '@type': 'Offer',
            name: '7-Day Free Trial',
            price: '0',
            priceCurrency: 'INR',
          },
          {
            '@type': 'Offer',
            name: 'Starter Plan',
            price: '499',
            priceCurrency: 'INR',
            billingDuration: 'P1M',
          },
          {
            '@type': 'Offer',
            name: 'Growth Pro',
            price: '999',
            priceCurrency: 'INR',
            billingDuration: 'P1M',
          },
        ],
      },
    ],
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
    />
  )
}
