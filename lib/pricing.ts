/**
 * Canonical Pricing Engine for StayNest SaaS
 * Single source of truth for subscription plans, rates, and savings calculations.
 */

export const PRICING_CONFIG = {
  monthlyRate: 1699,
  yearlyRate: 14999,
  currency: 'INR',
  currencySymbol: '₹',
  trialDays: 7,
} as const

// Calculations
export const ANNUAL_TOTAL_ON_MONTHLY = PRICING_CONFIG.monthlyRate * 12 // ₹20,388
export const ANNUAL_SAVINGS_AMOUNT = ANNUAL_TOTAL_ON_MONTHLY - PRICING_CONFIG.yearlyRate // ₹5,389
export const ANNUAL_SAVINGS_PERCENT = Math.round((ANNUAL_SAVINGS_AMOUNT / ANNUAL_TOTAL_ON_MONTHLY) * 100) // 26%
export const YEARLY_MONTHLY_EQUIVALENT = Math.round(PRICING_CONFIG.yearlyRate / 12) // ₹1,250

export function formatINR(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`
}

export function getSavingsLabel(locale: 'en' | 'hi' = 'en'): string {
  const amountStr = formatINR(ANNUAL_SAVINGS_AMOUNT)
  if (locale === 'hi') {
    return `${ANNUAL_SAVINGS_PERCENT}% बचाएं (${amountStr}/वर्ष)`
  }
  return `Save ${ANNUAL_SAVINGS_PERCENT}% (${amountStr}/yr)`
}

export interface PlanFeature {
  textEn: string
  textHi: string
}

export interface PlanTier {
  id: 'trial' | 'monthly' | 'yearly'
  titleEn: string
  titleHi: string
  descriptionEn: string
  descriptionHi: string
  price: number
  intervalEn: string
  intervalHi: string
  features: PlanFeature[]
  badgeEn?: string
  badgeHi?: string
}

export const PLANS: { trial: PlanTier; monthly: PlanTier; yearly: PlanTier } = {
  trial: {
    id: 'trial',
    titleEn: '7-Day Free Trial',
    titleHi: '7-दिवसीय निःशुल्क ट्रायल',
    descriptionEn: 'Full workspace access with live database isolation. Zero credit card needed.',
    descriptionHi: 'संपूर्ण कार्यक्षेत्र का उपयोग। किसी क्रेडिट कार्ड की आवश्यकता नहीं।',
    price: 0,
    intervalEn: 'for 7 days',
    intervalHi: '7 दिनों के लिए',
    features: [
      { textEn: 'Complete property, rooms & beds setup', textHi: 'संपूर्ण प्रॉपर्टी, कमरे और बिस्तरों का सेटअप' },
      { textEn: 'Tenant records & room allocation', textHi: 'किरायेदार रिकॉर्ड और कमरा आवंटन' },
      { textEn: 'Rent collection & payment recording', textHi: 'किराया संग्रह और भुगतान रसीदें' },
      { textEn: 'Electricity meter tracking & expenses', textHi: 'बिजली मीटर और खर्च ट्रैकिंग' },
    ],
  },
  monthly: {
    id: 'monthly',
    titleEn: 'Monthly Subscription',
    titleHi: 'मासिक सदस्यता',
    descriptionEn: 'Flexible month-to-month billing with no lock-in. Cancel anytime with 1 click.',
    descriptionHi: 'बिना किसी प्रतिबद्धता के मासिक बिलिंग। कभी भी रद्द करें।',
    price: PRICING_CONFIG.monthlyRate,
    intervalEn: '/ month',
    intervalHi: '/ महीना',
    badgeEn: 'Flexible',
    badgeHi: 'लचीला',
    features: [
      { textEn: 'Unlimited properties, rooms & beds', textHi: 'असीमित प्रॉपर्टी, कमरे और बिस्तर' },
      { textEn: 'Full rent ledger with soft-delete & restore', textHi: 'सॉफ्ट-डिलीट और पुनर्स्थापना के साथ बहीखाता' },
      { textEn: 'WhatsApp & SMS payment receipt sharing', textHi: 'व्हाट्सएप और एसएमएस रसीद साझाकरण' },
      { textEn: 'Real-time occupancy & collection analytics', textHi: 'वास्तविक समय में अधिभोग व आय रिपोर्ट' },
      { textEn: 'Standard email support', textHi: 'मानक ईमेल सहायता' },
    ],
  },
  yearly: {
    id: 'yearly',
    titleEn: 'Annual Subscription',
    titleHi: 'वार्षिक सदस्यता',
    descriptionEn: 'Best value for serious PG owners. Uninterrupted operations with maximum savings.',
    descriptionHi: 'गंभीर पीजी स्वामियों के लिए सर्वश्रेष्ठ। अधिकतम बचत और निर्बाध संचालन।',
    price: PRICING_CONFIG.yearlyRate,
    intervalEn: '/ year',
    intervalHi: '/ वर्ष',
    badgeEn: `Best Value · Save ${ANNUAL_SAVINGS_PERCENT}%`,
    badgeHi: `सर्वश्रेष्ठ मूल्य · ${ANNUAL_SAVINGS_PERCENT}% बचत`,
    features: [
      { textEn: 'Everything in Monthly included', textHi: 'मासिक प्लान की सभी सुविधाएं शामिल' },
      { textEn: `Effective ${formatINR(YEARLY_MONTHLY_EQUIVALENT)}/month (Save ${formatINR(ANNUAL_SAVINGS_AMOUNT)}/yr)`, textHi: `मात्र ${formatINR(YEARLY_MONTHLY_EQUIVALENT)}/माह (वार्षिक ${formatINR(ANNUAL_SAVINGS_AMOUNT)} बचत)` },
      { textEn: 'Annual accounting & tax export pack (JSON/CSV)', textHi: 'वार्षिक लेखा व कर निर्यात (JSON/CSV)' },
      { textEn: 'Priority email & onboarding assistance', textHi: 'प्राथमिकता ईमेल एवं ऑनबोर्डिंग सहायता' },
      { textEn: 'Zero monthly renewal interruptions', textHi: 'मासिक नवीनीकरण की कोई चिंता नहीं' },
    ],
  },
}
