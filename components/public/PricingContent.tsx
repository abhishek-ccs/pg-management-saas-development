'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Check, ShieldCheck, Sparkles, HelpCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useI18n } from '@/lib/i18n'
import {
  PRICING_CONFIG,
  ANNUAL_SAVINGS_AMOUNT,
  ANNUAL_SAVINGS_PERCENT,
  YEARLY_MONTHLY_EQUIVALENT,
  formatINR,
  getSavingsLabel,
} from '@/lib/pricing'

export function PricingContent() {
  const [hasSession, setHasSession] = useState<boolean | null>(null)
  const [billingCycle, setBillingCycle] = useState<'yearly' | 'monthly'>('yearly')
  const { t, locale } = useI18n()

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }: { data: any }) => {
      setHasSession(!!data?.user)
    })
  }, [])

  return (
    <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
      {/* Header & Toggle */}
      <div className="mx-auto max-w-3xl text-center">
        <p className="inline-flex items-center gap-2 rounded-full border border-[#e8d9c7] bg-white px-3.5 py-1.5 text-xs font-semibold text-[#9a7651] shadow-2xs">
          <Sparkles className="size-3.5" />
          {locale === 'hi' ? 'पारदर्शी रेंटल प्रॉपर्टी सॉफ्टवेयर मूल्य निर्धारण' : 'Transparent Rental Property Software Pricing'}
        </p>

        <h1 className="mt-4 text-3xl sm:text-5xl font-semibold tracking-[-0.04em] text-[#403a34]">
          {locale === 'hi' ? 'सरल, अनुमानित मूल्य निर्धारण।' : 'Simple, predictable plans.'}{' '}
          <span className="font-serif italic font-normal text-[#9a7651]">
            {locale === 'hi' ? 'बिना किसी छिपे शुल्क के।' : 'No hidden fees.'}
          </span>
        </h1>

        <p className="mt-4 text-sm sm:text-base text-[#776d62] max-w-2xl mx-auto">
          {locale === 'hi'
            ? 'प्रत्येक नया खाता 7 दिनों के निःशुल्क पूर्ण उपयोग के साथ शुरू होता है। कोई क्रेडिट कार्ड आवश्यक नहीं। अपनी सुविधानुसार मासिक या वार्षिक प्लान चुनें।'
            : 'Every new account starts with a 7-day full access free trial. No credit card required upfront. Switch between flexible monthly and high-savings annual billing anytime.'}
        </p>

        {/* Toggle */}
        <div className="mt-8 inline-flex items-center rounded-2xl border border-[#e8dfd4] bg-white p-1.5 shadow-xs">
          <button
            type="button"
            onClick={() => setBillingCycle('yearly')}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
              billingCycle === 'yearly'
                ? 'bg-[#9a7651] text-white shadow-xs'
                : 'text-[#676b7d] hover:text-[#2c2926]'
            }`}
          >
            <span>{t.landing.yearlyBilling}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                billingCycle === 'yearly' ? 'bg-[#f4ede3] text-[#866342]' : 'bg-[#eaf5ea] text-[#2e7d32]'
              }`}
            >
              {getSavingsLabel(locale)}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setBillingCycle('monthly')}
            className={`rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
              billingCycle === 'monthly'
                ? 'bg-[#9a7651] text-white shadow-xs'
                : 'text-[#676b7d] hover:text-[#2c2926]'
            }`}
          >
            {t.landing.monthlyBilling}
          </button>
        </div>
      </div>

      {/* Plan Cards */}
      <div className="mt-12 grid gap-6 md:grid-cols-3 items-stretch">
        {/* 1. Free Trial */}
        <div className="flex flex-col justify-between rounded-3xl border border-[#e8dfd4] bg-white p-7 shadow-sm">
          <div>
            <span className="rounded-full bg-[#f4ede3] px-3 py-1 text-xs font-semibold text-[#9a7651]">
              {t.pricing.trialHeader}
            </span>
            <div className="mt-5 flex items-baseline gap-1">
              <span className="text-4xl font-bold">₹0</span>
              <span className="text-xs text-[#85899a]">{t.landing.sevenDays}</span>
            </div>
            <p className="mt-3 text-xs leading-5 text-[#776d62]">
              {locale === 'hi'
                ? 'StayBook के सभी टूल्स का 7 दिन तक पूर्ण उपयोग करके देखें।'
                : 'Full access to all StayBook tools to configure your properties and test operations.'}
            </p>
            <ul className="mt-6 flex flex-col gap-2.5 text-xs text-[#555a6c]">
              <li className="flex items-center gap-2">
                <Check className="size-4 shrink-0 text-[#9a7651]" />
                {locale === 'hi' ? 'संपूर्ण प्रॉपर्टी, कमरे व बिस्तर सेटअप' : 'Complete property, rooms & beds setup'}
              </li>
              <li className="flex items-center gap-2">
                <Check className="size-4 shrink-0 text-[#9a7651]" />
                {locale === 'hi' ? 'किरायेदार रिकॉर्ड एवं कमरा आवंटन' : 'Tenant records and room allocation'}
              </li>
              <li className="flex items-center gap-2">
                <Check className="size-4 shrink-0 text-[#9a7651]" />
                {locale === 'hi' ? 'किराया संग्रह एवं बहीखाता प्रविष्टियां' : 'Rent collection & payment recording'}
              </li>
              <li className="flex items-center gap-2">
                <Check className="size-4 shrink-0 text-[#9a7651]" />
                {locale === 'hi' ? 'बिजली मीटर रीडिंग व खर्च ट्रैकिंग' : 'Expenses, electricity & complaints tracking'}
              </li>
            </ul>
          </div>
          <Link
            href={hasSession ? '/dashboard' : '/signup'}
            className="mt-8 block rounded-xl border border-[#d9c4aa] bg-[#fbf8f3] py-2.5 text-center text-xs font-semibold text-[#866342] hover:bg-[#f3eadf] transition-colors"
          >
            {hasSession ? t.landing.goToDashboard : t.landing.startFreeTrial}
          </Link>
        </div>

        {/* 2. Monthly Plan */}
        <div
          className={`flex flex-col justify-between rounded-3xl p-7 transition-all ${
            billingCycle === 'monthly'
              ? 'relative border-2 border-[#9a7651] bg-[#fbf8f3] shadow-lg ring-2 ring-[#9a7651]/20'
              : 'border border-[#e8dfd4] bg-white shadow-sm'
          }`}
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-[#f3eadf] px-3 py-1 text-xs font-semibold text-[#9a7651]">
                {locale === 'hi' ? 'मासिक' : 'Monthly'}
              </span>
              {billingCycle === 'monthly' && (
                <span className="rounded-full bg-[#9a7651] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                  {locale === 'hi' ? 'सक्रिय चयन' : 'Active Choice'}
                </span>
              )}
            </div>
            <div className="mt-5 flex items-baseline gap-1">
              <span className="text-4xl font-bold">{formatINR(PRICING_CONFIG.monthlyRate)}</span>
              <span className="text-xs text-[#85899a]">{t.landing.perMonth}</span>
            </div>
            <p className="mt-3 text-xs leading-5 text-[#776d62]">
              {locale === 'hi'
                ? 'बिना किसी दीर्घकालिक अनुबंध के लचीला मासिक प्लान। कभी भी रद्द करें।'
                : 'Flexible month-to-month plan with no long-term commitment. Cancel anytime.'}
            </p>
            <ul className="mt-6 flex flex-col gap-2.5 text-xs text-[#555a6c]">
              <li className="flex items-center gap-2">
                <Check className="size-4 shrink-0 text-[#9a7651]" />
                {locale === 'hi' ? 'सभी कोर कार्यक्षेत्र फीचर्स शामिल' : 'All core workspace features included'}
              </li>
              <li className="flex items-center gap-2">
                <Check className="size-4 shrink-0 text-[#9a7651]" />
                {locale === 'hi' ? 'असीमित कमरे, बिस्तर और किरायेदार' : 'Unlimited tenants & room capacity'}
              </li>
              <li className="flex items-center gap-2">
                <Check className="size-4 shrink-0 text-[#9a7651]" />
                {locale === 'hi' ? 'व्हाट्सएप रसीदें और संपूर्ण बहीखाता' : 'Payment receipts & financial ledger'}
              </li>
              <li className="flex items-center gap-2">
                <Check className="size-4 shrink-0 text-[#9a7651]" />
                {locale === 'hi' ? 'सॉफ्ट-डिलीट और डेटा पुनर्स्थापना सुरक्षा' : 'Soft-delete and undo protection'}
              </li>
            </ul>
          </div>
          <Link
            href={hasSession ? '/dashboard' : '/signup'}
            className="mt-8 block rounded-xl bg-[#9a7651] py-2.5 text-center text-xs font-semibold text-white shadow-sm hover:bg-[#866342] transition-colors"
          >
            {hasSession ? t.landing.goToDashboard : t.landing.startFreeTrial}
          </Link>
        </div>

        {/* 3. Yearly Plan */}
        <div
          className={`flex flex-col justify-between rounded-3xl p-7 transition-all ${
            billingCycle === 'yearly'
              ? 'relative border-2 border-[#9a7651] bg-[#fbf8f3] shadow-xl ring-2 ring-[#9a7651]/20 scale-[1.02]'
              : 'border border-[#e8dfd4] bg-white shadow-sm'
          }`}
        >
          {billingCycle === 'yearly' && (
            <span className="absolute -top-3 right-6 rounded-full bg-[#9a7651] px-3.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-xs">
              {locale === 'hi' ? 'सर्वश्रेष्ठ मूल्य' : 'Best Value · Highly Recommended'}
            </span>
          )}
          <div>
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-[#f4ede3] px-3 py-1 text-xs font-semibold text-[#9a7651]">
                {locale === 'hi' ? 'वार्षिक (अनुशंसित)' : 'Yearly (Recommended)'}
              </span>
              <span className="rounded-full bg-[#eaf5ea] px-2 py-0.5 text-[10px] font-bold text-[#2e7d32]">
                {getSavingsLabel(locale)}
              </span>
            </div>
            <div className="mt-5 flex items-baseline gap-1.5">
              <span className="text-4xl font-bold">{formatINR(PRICING_CONFIG.yearlyRate)}</span>
              <span className="text-xs text-[#85899a]">{t.landing.perYear}</span>
            </div>
            <p className="mt-1 text-[11px] font-semibold text-[#9a7651]">
              {locale === 'hi'
                ? `मात्र ${formatINR(YEARLY_MONTHLY_EQUIVALENT)}/माह के बराबर (सीधी ₹${ANNUAL_SAVINGS_AMOUNT.toLocaleString('en-IN')} की बचत)`
                : `Equivalent to ${formatINR(YEARLY_MONTHLY_EQUIVALENT)}/mo (Save ${formatINR(ANNUAL_SAVINGS_AMOUNT)}/yr)`}
            </p>
            <p className="mt-3 text-xs leading-5 text-[#776d62]">
              {locale === 'hi'
                ? 'गंभीर पीजी स्वामियों के लिए वार्षिक प्लान। बिना किसी मासिक बाधा के अधिकतम बचत।'
                : 'Annual plan designed for established properties looking for long-term predictability with maximum savings.'}
            </p>
            <ul className="mt-6 flex flex-col gap-2.5 text-xs text-[#555a6c]">
              <li className="flex items-center gap-2">
                <Check className="size-4 shrink-0 text-[#9a7651]" />
                {locale === 'hi' ? 'मासिक प्लान की सभी सुविधाएं सम्मिलित' : 'Everything in Monthly included'}
              </li>
              <li className="flex items-center gap-2">
                <Check className="size-4 shrink-0 text-[#9a7651]" />
                {locale === 'hi'
                  ? `${ANNUAL_SAVINGS_PERCENT}% की सीधी छूट (${formatINR(ANNUAL_SAVINGS_AMOUNT)}/वर्ष बचत)`
                  : `Direct ${ANNUAL_SAVINGS_PERCENT}% discount (${formatINR(ANNUAL_SAVINGS_AMOUNT)}/yr savings)`}
              </li>
              <li className="flex items-center gap-2">
                <Check className="size-4 shrink-0 text-[#9a7651]" />
                {locale === 'hi' ? 'वार्षिक बहीखाता और कर रिपोर्ट निर्यात' : 'Annual financial export & tax-ready ledger'}
              </li>
              <li className="flex items-center gap-2">
                <Check className="size-4 shrink-0 text-[#9a7651]" />
                {locale === 'hi' ? 'प्राथमिकता ग्राहक ईमेल सहायता' : 'Priority email & onboarding support'}
              </li>
            </ul>
          </div>
          <Link
            href={hasSession ? '/dashboard' : '/signup'}
            className="mt-8 block rounded-xl bg-[#9a7651] py-2.5 text-center text-xs font-semibold text-white shadow-sm hover:bg-[#866342] transition-colors"
          >
            {hasSession ? t.landing.goToDashboard : t.landing.startFreeTrial}
          </Link>
        </div>
      </div>

      {/* Feature Guarantee & Trust Elements (Honest, No Fake Claims) */}
      <div className="mt-14 rounded-2xl border border-[#eee4d7] bg-white p-6 sm:p-8">
        <div className="grid gap-6 sm:grid-cols-3">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#f4ede3] text-[#9a7651]">
              <ShieldCheck className="size-5" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-[#2c2926]">Zero Lock-in Guarantee</h2>
              <p className="mt-1 text-xs text-[#776d62] leading-5">
                Export your tenant data and ledger records at any time in standard JSON or CSV formats.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#f4ede3] text-[#9a7651]">
              <Sparkles className="size-5" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-[#2c2926]">Instant 1-Minute Activation</h2>
              <p className="mt-1 text-xs text-[#776d62] leading-5">
                Sign up and immediately configure your building, rooms, and first resident without waiting.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#f4ede3] text-[#9a7651]">
              <HelpCircle className="size-5" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-[#2c2926]">Responsive Support</h2>
              <p className="mt-1 text-xs text-[#776d62] leading-5">
                Questions or issues? Reach out directly via email to our dedicated product support team.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
