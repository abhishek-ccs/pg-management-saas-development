import { SUPPORT_EMAIL } from '@/lib/constants'

export function StructuredData() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://staybook.in'

  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${baseUrl}/#organization`,
        name: 'StayBook Technologies',
        url: baseUrl,
        logo: `${baseUrl}/icon.svg`,
        email: SUPPORT_EMAIL,
        description: 'Modern property and rental management SaaS for PGs, hostels, apartments, and rental houses.',
        sameAs: ['https://x.com/staybook', 'https://linkedin.com/company/staybook'],
      },
      {
        '@type': 'SoftwareApplication',
        '@id': `${baseUrl}/#software`,
        name: 'StayBook',
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'All modern web browsers (Chrome, Safari, Firefox, Edge)',
        url: baseUrl,
        description: 'Complete property, PG, hostel, and rental management software featuring automated rent collection, unit and bed occupancy tracking, utility calculation, and tenant ledger.',

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
