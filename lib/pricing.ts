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
      { textEn: 'Up to 2 properties (rooms & beds included)', textHi: '2 प्रॉपर्टी तक (कमरे और बिस्तर शामिल)' },
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

export interface PricingPlan {
  id: 'starter' | 'growth' | 'business' | 'enterprise'
  name: string
  nameHi: string
  propertyLimit: string
  propertyLimitHi: string
  monthlyPrice: number | null
  yearlyPrice: number | null
  annualSavings: number | null
  popular?: boolean
  descriptionEn: string
  descriptionHi: string
  featuresEn: string[]
  featuresHi: string[]
}

export const PRICING_PLANS: PricingPlan[] = [
  {
    id: 'starter',
    name: 'Starter',
    nameHi: 'स्टार्टर',
    propertyLimit: '1–2 properties',
    propertyLimitHi: '1–2 प्रॉपर्टी',
    monthlyPrice: 1099,
    yearlyPrice: 9999,
    annualSavings: 3189,
    descriptionEn: 'Essential property management for independent PGs, flats, and rental units.',
    descriptionHi: 'स्वतंत्र पीजी और रेंटल संपत्तियों के प्रबंधन के लिए आवश्यक उपकरण।',
    featuresEn: [
      'Manage 1–2 properties',
      'Unlimited rooms, beds & tenants',
      'Automated rent due dates & tracking',
      'WhatsApp & SMS payment receipts',
      'Standard email support',
    ],
    featuresHi: [
      '1–2 प्रॉपर्टी तक प्रबंधन',
      'असीमित कमरे, बिस्तर और किरायेदार',
      'स्वचालित किराया देय तिथि और ट्रैकिंग',
      'व्हाट्सएप और एसएमएस भुगतान रसीदें',
      'मानक ईमेल सहायता',
    ],
  },
  {
    id: 'growth',
    name: 'Growth',
    nameHi: 'ग्रोथ',
    propertyLimit: '3–5 properties',
    propertyLimitHi: '3–5 प्रॉपर्टी',
    monthlyPrice: 1799,
    yearlyPrice: 17990,
    annualSavings: 3598,
    popular: true,
    descriptionEn: 'Complete operations suite for expanding PG & hostel operators.',
    descriptionHi: 'विस्तारित पीजी और हॉस्टल संचालकों के लिए संपूर्ण संचालन समाधान।',
    featuresEn: [
      'Manage 3–5 properties',
      'Everything in Starter included',
      'Multi-property isolation & switcher',
      'Mid-cycle electricity bill calculator',
      'Soft-delete with 30-day trash restore',
      'Priority email & onboarding support',
    ],
    featuresHi: [
      '3–5 प्रॉपर्टी तक प्रबंधन',
      'स्टार्टर की सभी सुविधाएं शामिल',
      'मल्टी-प्रॉपर्टी आइसोलेशन व स्विचर',
      'मिड-साइकिल बिजली बिल कैलकुलेटर',
      '30-दिन ट्रैश डेटा पुनर्स्थापना',
      'प्राथमिकता ईमेल एवं ऑनबोर्डिंग सहायता',
    ],
  },
  {
    id: 'business',
    name: 'Business',
    nameHi: 'बिजनेस',
    propertyLimit: '6–9 properties',
    propertyLimitHi: '6–9 प्रॉपर्टी',
    monthlyPrice: 2799,
    yearlyPrice: 27990,
    annualSavings: 5598,
    descriptionEn: 'High-volume scale and financial control for multi-building operations.',
    descriptionHi: 'मल्टी-बिल्डिंग संचालन के लिए उच्च-स्तरीय वित्तीय नियंत्रण।',
    featuresEn: [
      'Manage 6–9 properties',
      'Everything in Growth included',
      'Tax-ready financial exports (CSV/JSON)',
      'Tenant self-service portal & links',
      'Staff admin security & controls',
      'Dedicated account assistance',
    ],
    featuresHi: [
      '6–9 प्रॉपर्टी तक प्रबंधन',
      'ग्रोथ की सभी सुविधाएं शामिल',
      'कर-अनुकूल वित्तीय निर्यात (CSV/JSON)',
      'किरायेदार स्वयं-सेवा पोर्टल और लिंक',
      'स्टाफ एडमिन सुरक्षा नियंत्रण',
      'समर्पित खाता सहायता',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    nameHi: 'एंटरप्राइज',
    propertyLimit: '9+ properties',
    propertyLimitHi: '9+ प्रॉपर्टी',
    monthlyPrice: null,
    yearlyPrice: null,
    annualSavings: null,
    descriptionEn: 'Tailored architecture, custom integrations, and SLA for large portfolios.',
    descriptionHi: 'बड़े पोर्टफोलियो के लिए अनुकूलित वास्तुकला और एसएलए।',
    featuresEn: [
      '9+ properties & custom capacity',
      'Everything in Business included',
      'Custom spreadsheet data migration',
      'Tailored integrations & workflows',
      'Dedicated account manager & SLA',
    ],
    featuresHi: [
      '9+ प्रॉपर्टी एवं असीमित क्षमता',
      'बिजनेस की सभी सुविधाएं शामिल',
      'स्प्रेडशीट से डेटा माइग्रेशन',
      'अनुकूलित एकीकरण और वर्कफ़्लो',
      'समर्पित खाता प्रबंधक और एसएलए',
    ],
  },
]
