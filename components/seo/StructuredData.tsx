import { SUPPORT_EMAIL } from '@/lib/constants'
import { PRICING_CONFIG } from '@/lib/pricing'
import { getSiteUrl } from '@/lib/site'

export function StructuredData() {
  const baseUrl = getSiteUrl()

  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${baseUrl}/#organization`,
        name: 'StayBook Technologies',
        url: baseUrl,
        logo: {
          '@type': 'ImageObject',
          url: `${baseUrl}/icon.svg`,
          width: 512,
          height: 512,
        },
        email: SUPPORT_EMAIL,
        description:
          'Modern cloud property management software and rental property management SaaS for PGs, hostels, apartments, and rental houses.',
        contactPoint: [
          {
            '@type': 'ContactPoint',
            email: SUPPORT_EMAIL,
            contactType: 'customer support',
            availableLanguage: ['en', 'hi'],
          },
        ],
      },
      {
        '@type': 'SoftwareApplication',
        '@id': `${baseUrl}/#software`,
        name: 'StayBook',
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'All modern web browsers (Chrome, Safari, Firefox, Edge)',
        url: baseUrl,
        description:
          'Property management software and rental property management SaaS for PGs, hostels, and apartments with resident records, automated rent receipts, bed availability, and ledgers.',
        publisher: {
          '@id': `${baseUrl}/#organization`,
        },
        offers: [
          {
            '@type': 'Offer',
            name: `${PRICING_CONFIG.trialDays}-Day Free Trial`,
            price: '0',
            priceCurrency: PRICING_CONFIG.currency,
            description: 'Full workspace access with live database isolation. Zero credit card needed.',
          },
          {
            '@type': 'Offer',
            name: 'Monthly Subscription',
            price: String(PRICING_CONFIG.monthlyRate),
            priceCurrency: PRICING_CONFIG.currency,
            billingDuration: 'P1M',
            description: 'Flexible month-to-month billing with no lock-in. Cancel anytime with 1 click.',
          },
          {
            '@type': 'Offer',
            name: 'Annual Subscription',
            price: String(PRICING_CONFIG.yearlyRate),
            priceCurrency: PRICING_CONFIG.currency,
            billingDuration: 'P1Y',
            description: 'Best value for serious PG owners. Uninterrupted operations with maximum savings.',
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
