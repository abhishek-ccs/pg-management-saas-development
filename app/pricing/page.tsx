import type { Metadata } from 'next'
import { constructMetadata } from '@/lib/site'
import { PublicHeader } from '@/components/public/PublicHeader'
import { PublicFooter } from '@/components/public/PublicFooter'
import { PricingContent } from '@/components/public/PricingContent'

export const metadata: Metadata = constructMetadata({
  title: 'Pricing Plans | StayBook Rental Property & PG Management Software',
  description:
    'Transparent pricing for StayBook property management software. 7-day full access free trial, flexible monthly subscription at ₹1,699/mo, and 26% discounted annual billing at ₹14,999/yr for PG and hostel owners.',
  path: '/pricing',
  keywords: [
    'Rental Property Software',
    'Property Management Software',
    'PG Management Software',
    'Hostel Management Software',
    'Rental Property Software pricing',
    'PG software cost',
    'Hostel management software price',
    'tenant management software',
  ],
})

export default function PricingPage() {
  return (
    <main id="main-content" className="min-h-screen bg-[#fbf8f3] text-[#403a34]">
      <PublicHeader currentPath="/pricing" />
      <PricingContent />
      <PublicFooter />
    </main>
  )
}
