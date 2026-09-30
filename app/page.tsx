'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  Building2,
  Check,
  CircleHelp,
  DoorOpen,
  Receipt,
  Sparkles,
  Users,
  Wallet,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { LocaleSwitcher } from '@/components/i18n/LocaleSwitcher'
import { SUPPORT_EMAIL, getMailtoSupport } from '@/lib/constants'
import { useI18n } from '@/lib/i18n'
import {
  PRICING_CONFIG,
  ANNUAL_SAVINGS_AMOUNT,
  ANNUAL_SAVINGS_PERCENT,
  YEARLY_MONTHLY_EQUIVALENT,
  formatINR,
  getSavingsLabel,
} from '@/lib/pricing'

export default function LandingPage() {
  const [hasSession, setHasSession] = useState<boolean | null>(null)
  // Requirement 3: Monthly/Yearly toggle with Yearly selected by default
  const [billingCycle, setBillingCycle] = useState<'yearly' | 'monthly'>('yearly')
  const { t, locale } = useI18n()

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }: { data: any }) => {
      setHasSession(!!data?.user)
    })
  }, [])

  const features = [
    [
      locale === 'hi' ? 'प्रॉपर्टी नियंत्रण' : 'Property control',
      locale === 'hi'
        ? 'अपने पीजी प्रोफाइल, कमरे, बिस्तर और उपलब्धता को एक शांत डैशबोर्ड में रखें।'
        : 'Keep your PG profile, rooms, beds, and availability in one calm workspace.',
      Building2,
    ],
    [
      locale === 'hi' ? 'किरायेदार रिकॉर्ड' : 'Tenant records',
      locale === 'hi'
        ? 'निवासी विवरण, कमरा आवंटन, शामिल होने की तिथि और किराया सुरक्षित रूप से स्टोर करें।'
        : 'Store resident details, room assignments, joining dates, and rent information securely.',
      Users,
    ],
    [
      locale === 'hi' ? 'किराया संग्रह' : 'Rent collection',
      locale === 'hi'
        ? 'देय भुगतान ट्रैक करें और प्रत्येक संग्रह का पारदर्शी बहीखाता रखें।'
        : 'Track due payments and keep a clear record of every collection.',
      Wallet,
    ],
    [
      locale === 'hi' ? 'दैनिक संचालन' : 'Daily operations',
      locale === 'hi'
        ? 'बिजली मीटर रीडिंग, खर्च, शिकायतें और रिपोर्ट बिना किसी रजिस्टर के प्रबंधित करें।'
        : 'Organize electricity readings, expenses, complaints, and reports without spreadsheets.',
      Receipt,
    ],
  ]

  const faqs = [
    {
      q: locale === 'hi' ? 'StayNest क्या है?' : 'What is StayNest?',
      a:
        locale === 'hi'
          ? 'StayNest पीजी स्वामियों, हॉस्टलों और रेंटल प्रबंधकों के लिए विशेष रूप से बनाया गया एक क्लाउड सॉफ्टवेयर है। यह कमरों की बनावट, बिस्तर क्षमता, किरायेदार ऑनबोर्डिंग, किराया बहीखाता, बिजली बिल और दैनिक खर्चों को एक सरल डैशबोर्ड में केंद्रित करता है।'
          : 'StayNest is a dedicated rental property and PG/hostel management workspace designed for property owners and operators. It centralizes all your daily property operations—including property details, room configurations, bed capacities, tenant onboarding, rent collection tracking, utility readings, expense records, and maintenance complaints—into one seamless, intuitive dashboard.',
    },
    {
      q: locale === 'hi' ? 'StayNest का उपयोग कौन कर सकता है?' : 'Who can use StayNest?',
      a:
        locale === 'hi'
          ? 'StayNest पेइंग गेस्ट (PG), छात्र हॉस्टल, को-लिविंग और रेंटल संपत्तियों के मालिकों और प्रबंधकों के लिए आदर्श है जो पुराने कागजी रजिस्टरों और जटिल स्प्रेडशीट को अलविदा कहना चाहते हैं।'
          : 'StayNest is built specifically for owners and managers of Paying Guest (PG) accommodations, co-living facilities, student hostels, serviced apartments, and residential rental properties of any size who want to replace messy spreadsheets and manual notebooks with an organized system.',
    },
    {
      q: locale === 'hi' ? '7-दिवसीय निःशुल्क ट्रायल में क्या शामिल है?' : 'What does the 7-day free trial include?',
      a:
        locale === 'hi'
          ? 'प्रत्येक नए खाते को बिना किसी अग्रिम भुगतान के 7 दिनों के लिए StayNest के सभी फीचर्स का पूर्ण उपयोग मिलता है। आप कमरे बना सकते हैं, किरायेदारों को जोड़ सकते हैं, और रसीदें जारी कर सकते हैं।'
          : 'Every new account comes with unrestricted access to the complete StayNest workspace for 7 full days with zero upfront payment. You can set up your property profile, configure rooms and beds, onboard tenants, log rent and utility payments, record operational expenses, and test all reporting tools.',
    },
    {
      q: locale === 'hi' ? 'ट्रायल समाप्त होने के बाद क्या होता है?' : 'What happens when my trial ends?',
      a:
        locale === 'hi'
          ? '7-दिन की अवधि समाप्त होने के बाद आपका डेटा बिल्कुल सुरक्षित रहता है। दैनिक संचालन जारी रखने के लिए आप मासिक (₹1,699/माह) या वार्षिक (₹14,999/वर्ष) प्लान सक्रिय कर सकते हैं।'
          : 'When your 7-day trial concludes, all your existing property configurations, tenant records, and payment histories remain completely safe and intact. To continue recording new payments, adding rooms or residents, and logging daily entries, you simply activate either our Monthly (₹1,699/mo) or Yearly (₹14,999/yr) subscription plan.',
    },
    {
      q: locale === 'hi' ? 'क्या मैं पेशेवर भुगतान रसीदें डाउनलोड कर सकता हूँ?' : 'Can I download professional payment receipts?',
      a:
        locale === 'hi'
          ? 'हाँ! जब भी आप किराया या बिल भुगतान दर्ज करते हैं, StayNest तुरंत एक औपचारिक रसीद तैयार करता है जिसे आप व्हाट्सएप पर साझा कर सकते हैं या पीडीएफ के रूप में डाउनलोड/प्रिंट कर सकते हैं।'
          : 'Yes. Every time you record a rent or utility payment, StayNest generates a formal, formatted receipt featuring resident details, payment method, date, and amount breakdown. You can easily view, print, or save it directly as a clean PDF to share with your tenants.',
    },
  ]

  return (
    <main id="main-content" className="min-h-screen bg-[#fbf8f3] text-[#403a34]">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-[#eee4d7]/90 bg-[#fbf8f3]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-[#9a7651] text-white">
              <Building2 className="size-5" />
            </span>
            <span>
              <span className="block text-[15px] font-bold tracking-tight">StayNest</span>
              <span className="block text-[9px] font-medium uppercase tracking-[0.18em] text-[#a08d79]">
                {t.common.appName}
              </span>
            </span>
          </Link>
          <nav className="hidden items-center gap-7 text-sm text-[#776d62] md:flex">
            <Link href="#features">{t.nav.property}</Link>
            <Link href="#pricing">{t.landing.pricingTitle}</Link>
            <Link href="#faq">FAQ</Link>
            <Link href="#contact">{t.landing.footerSupport}</Link>
          </nav>
          <div className="flex items-center gap-3">
            <LocaleSwitcher />
            {hasSession ? (
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#9a7651] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#866342]"
              >
                {t.landing.goToDashboard} <ArrowRight className="size-4" />
              </Link>
            ) : (
              <>
                <Link href="/login" className="hidden rounded-xl px-3 py-2 text-sm font-semibold text-[#776d62] sm:block">
                  {t.landing.signIn}
                </Link>
                <Link href="/signup" className="rounded-xl bg-[#9a7651] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#866342]">
                  {t.landing.startFreeTrial}
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="mx-auto grid max-w-6xl gap-12 px-5 pb-20 pt-16 sm:px-8 lg:grid-cols-[1.08fr_.92fr] lg:items-center lg:pb-28 lg:pt-24">
        <div>
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#e8d9c7] bg-white px-3 py-1.5 text-xs font-semibold text-[#9a7651]">
            <Sparkles className="size-3.5" />
            {t.landing.badge}
          </p>
          <h1 className="max-w-2xl text-4xl sm:text-5xl lg:text-6xl font-semibold leading-[1.08] tracking-[-0.04em] text-[#403a34]">
            {t.landing.heroTitle}{' '}
            <span className="font-serif italic font-normal text-[#9a7651] block sm:inline">
              {t.landing.heroTitleHighlight}
            </span>
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-[#776d62] sm:text-lg">
            {t.landing.heroSubtitle}
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            {hasSession ? (
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 rounded-xl bg-[#9a7651] px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#866342]"
              >
                {t.landing.goToDashboard} <ArrowRight className="size-4" />
              </Link>
            ) : (
              <>
                <Link
                  href="/signup"
                  className="inline-flex items-center gap-2 rounded-xl bg-[#9a7651] px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#866342]"
                >
                  {t.landing.startFreeTrial} <ArrowRight className="size-4" />
                </Link>
                <Link
                  href="/login"
                  className="rounded-xl border border-[#dfd1c0] bg-white px-5 py-3 text-sm font-semibold text-[#776d62] hover:bg-[#faf7f2]"
                >
                  {t.landing.signIn}
                </Link>
              </>
            )}
          </div>
          <p className="mt-4 text-xs text-[#a08d79]">
            {locale === 'hi'
              ? '7-दिन का निःशुल्क ट्रायल। किसी क्रेडिट कार्ड की आवश्यकता नहीं। भारतीय पीजी स्वामियों के लिए निर्मित।'
              : '7-day full access free trial. No credit card required upfront. Built for property owners.'}
          </p>
        </div>

        <div className="relative rounded-[2rem] border border-[#e8d9c7] bg-[#f3eadf] p-5 shadow-[0_24px_70px_rgba(112,82,48,.12)] sm:p-7">
          <div className="rounded-2xl border border-[#eee4d7] bg-white p-5">
            <div className="mb-7 flex items-center justify-between">
              <div>
                <p className="text-xs text-[#a08d79]">{locale === 'hi' ? 'आपका कार्यक्षेत्र' : 'Your workspace'}</p>
                <p className="mt-1 text-lg font-bold">StayNest Dashboard</p>
              </div>
              <span className="rounded-full bg-[#f4ede3] px-2.5 py-1 text-[10px] font-semibold text-[#9a7651]">
                {t.pricing.trialHeader}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-[#faf7f2] p-4">
                <DoorOpen className="mb-5 size-5 text-[#9a7651]" />
                <p className="text-xs text-[#a08d79]">{t.nav.roomsBeds}</p>
                <p className="mt-1 text-2xl font-bold">12</p>
              </div>
              <div className="rounded-xl bg-[#faf7f2] p-4">
                <Users className="mb-5 size-5 text-[#9a7651]" />
                <p className="text-xs text-[#a08d79]">{t.nav.tenants}</p>
                <p className="mt-1 text-2xl font-bold">24</p>
              </div>
            </div>
            <div className="mt-3 rounded-xl border border-dashed border-[#dfd1c0] p-5 text-center">
              <p className="text-sm font-semibold">{t.property.setupPrompt}</p>
              <p className="mt-1 text-xs text-[#a08d79]">
                {locale === 'hi' ? 'कमरे, बिस्तर और किरायेदार आसानी से प्रबंधित करें।' : 'Add rooms, beds, and tenants when you are ready.'}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="border-y border-[#eee4d7] bg-white">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
          <div className="max-w-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9a7651]">
              {t.landing.featuresTitle}
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
              {t.landing.featuresSubtitle}
            </h2>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {features.map(([title, text, Icon]) => (
              <article key={title as string} className="rounded-2xl border border-[#eee4d7] bg-[#fbf8f3] p-5">
                <span className="mb-8 grid size-10 place-items-center rounded-xl bg-[#f3eadf] text-[#9a7651]">
                  <Icon className="size-5" />
                </span>
                <h3 className="font-semibold">{title as string}</h3>
                <p className="mt-2 text-sm leading-6 text-[#776d62]">{text as string}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section with Monthly/Yearly Toggle (Yearly Default) */}
      <section id="pricing" className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9a7651]">
            {t.landing.pricingTitle}
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
            {t.landing.pricingSubtitle}
          </h2>
          <p className="mt-4 text-[#776d62]">
            {locale === 'hi'
              ? 'प्रत्येक नया खाता 7 दिनों के निःशुल्क ट्रायल के साथ शुरू होता है। कोई क्रेडिट कार्ड आवश्यक नहीं।'
              : 'Every new account begins with a 7-day full access trial. No credit card required upfront.'}
          </p>

          {/* Requirement 3: Monthly/Yearly Toggle with Yearly default and dynamic savings label */}
          <div className="mt-8 inline-flex items-center rounded-2xl border border-[#e8dfd4] bg-white p-1.5 shadow-xs">
            <button
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

        <div className="mt-12 grid gap-6 md:grid-cols-3 items-stretch">
          {/* 1. Trial Plan */}
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
                  ? 'StayNest के सभी टूल्स का 7 दिन तक पूर्ण उपयोग करके देखें।'
                  : 'Full access to all StayNest tools to configure your property and see how it works for you.'}
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
              className="mt-8 block rounded-xl border border-[#d9c4aa] bg-[#fbf8f3] py-2.5 text-center text-xs font-semibold text-[#866342] hover:bg-[#f3eadf]"
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
              className="mt-8 block rounded-xl bg-[#9a7651] py-2.5 text-center text-xs font-semibold text-white shadow-sm hover:bg-[#866342]"
            >
              {hasSession ? t.landing.goToDashboard : t.landing.startFreeTrial}
            </Link>
          </div>

          {/* 3. Yearly Plan (Prominently Highlighted with Dynamic Savings) */}
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
              className="mt-8 block rounded-xl bg-[#9a7651] py-2.5 text-center text-xs font-semibold text-white shadow-sm hover:bg-[#866342]"
            >
              {hasSession ? t.landing.goToDashboard : t.landing.startFreeTrial}
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="border-t border-[#eee4d7] bg-white">
        <div className="mx-auto max-w-3xl px-5 py-20 sm:px-8">
          <div className="text-center">
            <CircleHelp className="mx-auto size-7 text-[#9a7651]" />
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">{t.landing.faqTitle}</h2>
            <p className="mt-2 text-sm text-[#776d62]">{t.landing.faqSubtitle}</p>
          </div>
          <div className="mt-10 flex flex-col gap-3">
            {faqs.map(({ q, a }) => (
              <details key={q} className="group rounded-2xl border border-[#eee4d7] p-5 transition-all open:bg-[#fbf8f3]">
                <summary className="flex cursor-pointer list-none items-center justify-between font-semibold text-[#403a34]">
                  <span>{q}</span>
                  <span className="ml-3 text-base text-[#9a7651] transition-transform duration-200 group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-sm leading-6 text-[#776d62]">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer id="contact" className="bg-[#2c2926] text-[#f8f0e5] border-t border-[#403a34]">
        <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
          <div className="grid gap-10 md:grid-cols-4">
            <div className="md:col-span-2">
              <div className="flex items-center gap-2.5">
                <span className="grid size-9 place-items-center rounded-xl bg-[#9a7651] text-white">
                  <Building2 className="size-5" />
                </span>
                <span className="text-lg font-bold">StayNest</span>
              </div>
              <p className="mt-4 max-w-sm text-xs leading-6 text-[#cbbfaf]">
                {t.landing.footerDesc}
              </p>
              <p className="mt-4 text-[11px] text-[#9a9187]">
                &copy; {new Date().getFullYear()} StayNest Technologies. Built for PG & Rental property owners.
              </p>
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-white">
                {t.landing.footerLegal}
              </p>
              <ul className="mt-3 space-y-2 text-xs text-[#cbbfaf]">
                <li>
                  <Link href="/terms" className="hover:text-white hover:underline">
                    {t.legal.termsOfService}
                  </Link>
                </li>
                <li>
                  <Link href="/privacy" className="hover:text-white hover:underline">
                    {t.legal.privacyPolicy}
                  </Link>
                </li>
                <li>
                  <Link href="/cookies" className="hover:text-white hover:underline">
                    {t.legal.cookiePolicy}
                  </Link>
                </li>
                <li>
                  <Link href="/security" className="hover:text-white hover:underline">
                    {t.legal.securityDisclosures}
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-white">
                {t.landing.footerSupport}
              </p>
              <ul className="mt-3 space-y-2 text-xs text-[#cbbfaf]">
                <li>
                  <a
                    href={getMailtoSupport('StayNest Support Inquiry')}
                    className="hover:text-white hover:underline"
                  >
                    {SUPPORT_EMAIL}
                  </a>
                </li>
                <li>
                  <span className="block text-[11px] text-[#9a9187]">
                    {locale === 'hi' ? 'शिकायत निवारण अधिकारी:' : 'Grievance Officer:'}
                  </span>
                  <a
                    href={getMailtoSupport('StayNest Grievance Redressal')}
                    className="hover:text-white hover:underline"
                  >
                    {SUPPORT_EMAIL}
                  </a>
                </li>
                <li className="pt-2">
                  <LocaleSwitcher />
                </li>
              </ul>
            </div>
          </div>
        </div>
      </footer>
    </main>
  )
}
