'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, ShieldCheck, Sparkles, HelpCircle, AlertCircle, X, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { resolveAuthoritativeSubscription, AuthoritativeSubscriptionState } from '@/lib/subscription'
import { useI18n } from '@/lib/i18n'
import { PRICING_PLANS, PricingPlan, formatINR } from '@/lib/pricing'

export function PricingContent() {
  const router = useRouter()
  const [hasSession, setHasSession] = useState<boolean | null>(null)
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [subState, setSubState] = useState<AuthoritativeSubscriptionState | null>(null)
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerPhoneInput, setCustomerPhoneInput] = useState('')
  const [customerName, setCustomerName] = useState('')
  // Requirement 2: Default selection: Monthly
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly')
  const [confirmingPlan, setConfirmingPlan] = useState<{
    plan: PricingPlan
    cycle: 'monthly' | 'yearly'
  } | null>(null)
  const [loadingPlan, setLoadingPlan] = useState<'monthly' | 'yearly' | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const { t, locale } = useI18n()

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const requestedInterval = params.get('interval') || params.get('billing')
      const targetCycle: 'monthly' | 'yearly' = requestedInterval === 'yearly' ? 'yearly' : 'monthly'
      if (requestedInterval === 'monthly' || requestedInterval === 'yearly') {
        setBillingCycle(targetCycle)
      }

      const requestedPlanId = params.get('plan')
      const autoCheckout = params.get('checkout') === '1'
      if (requestedPlanId && autoCheckout) {
        const found = PRICING_PLANS.find((p) => p.id === requestedPlanId)
        if (found && found.id !== 'enterprise') {
          setConfirmingPlan({
            plan: found,
            cycle: targetCycle,
          })
        }
      }
    }

    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data }: { data: any }) => {
      const user = data?.user
      setHasSession(!!user)
      if (user) {
        const [{ data: subs }, { data: profile }] = await Promise.all([
          supabase
            .from('subscriptions')
            .select('*')
            .eq('owner_id', user.id)
            .order('updated_at', { ascending: false }),
          supabase
            .from('profiles')
            .select('phone, full_name')
            .eq('id', user.id)
            .maybeSingle(),
        ])
        const resolved = resolveAuthoritativeSubscription(subs)
        setSubState(resolved)
        const phone = (user.phone || user.user_metadata?.phone || profile?.phone || '').trim()
        setCustomerPhone(phone)
        setCustomerPhoneInput(phone)
        const name = (user.user_metadata?.full_name || profile?.full_name || user.email?.split('@')[0] || '').trim()
        setCustomerName(name)
        if (resolved.hasPaidAccess && resolved.status === 'active') {
          setIsSubscribed(true)
        }
      }
    })
  }, [])

  const loadRazorpayScript = useCallback((): Promise<boolean> => {
    return new Promise((resolve) => {
      if (typeof window !== 'undefined' && (window as any).Razorpay) {
        resolve(true)
        return
      }
      const existing = document.getElementById('razorpay-checkout-script')
      if (existing) {
        existing.addEventListener('load', () => resolve(true))
        existing.addEventListener('error', () => resolve(false))
        return
      }
      const script = document.createElement('script')
      script.id = 'razorpay-checkout-script'
      script.src = 'https://checkout.razorpay.com/v1/checkout.js'
      script.async = true
      script.onload = () => resolve(true)
      script.onerror = () => resolve(false)
      document.body.appendChild(script)
    })
  }, [])

  function handleSelectPlan(plan: PricingPlan) {
    if (plan.id === 'enterprise') {
      router.push('/contact?plan=enterprise')
      return
    }

    // 1. If not authenticated, route through signup preserving intended plan & interval
    if (!hasSession) {
      const destination = `/pricing?plan=${plan.id}&interval=${billingCycle}&checkout=1`
      router.push(`/signup?plan=${plan.id}&interval=${billingCycle}&next=${encodeURIComponent(destination)}`)
      return
    }

    // 2. If already subscribed, route straight to dashboard
    if (isSubscribed) {
      router.push('/dashboard')
      return
    }

    // 3. Before payment, open confirmation modal showing selected plan, total amount, and billing period
    setErrorMessage('')
    setConfirmingPlan({
      plan,
      cycle: billingCycle,
    })
  }

  async function handleProceedToPayment(plan: PricingPlan, cycle: 'monthly' | 'yearly') {
    setErrorMessage('')
    setLoadingPlan(cycle)

    try {
      const amount = cycle === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice
      const phoneToSend = (customerPhoneInput || customerPhone || '').trim()

      // Create server-side subscription on Razorpay
      const res = await fetch('/api/razorpay/create-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planType: cycle,
          plan: plan.id,
          amount,
          phone: phoneToSend,
        }),
      })

      const data = await res.json()

      if (!res.ok || !data.subscriptionId) {
        throw new Error(data.error || 'Failed to initialize subscription with Razorpay.')
      }

      // Load Razorpay Checkout SDK
      const scriptReady = await loadRazorpayScript()
      if (!scriptReady) {
        throw new Error('Unable to load payment gateway checkout. Please check internet connection.')
      }

      // Close pre-checkout confirmation modal before opening checkout popup
      setConfirmingPlan(null)

      // Only pass contact if customer has provided/verified a phone number.
      // NEVER use any developer or website owner fallback.
      const effectivePhone = (phoneToSend || data.user?.phone || customerPhone || '').trim()

      // Open Razorpay Checkout modal
      const options = {
        key: data.keyId,
        subscription_id: data.subscriptionId,
        name: 'BaseraBook',
        description: `${plan.name} (${cycle === 'yearly' ? 'Yearly' : 'Monthly'}) — ${formatINR(amount || 0)}`,
        image: '/favicon.ico',
        prefill: {
          name: data.user?.name || customerName || '',
          email: data.user?.email || '',
          ...(effectivePhone ? { contact: effectivePhone } : {}),
        },
        theme: {
          color: '#8b5a2b',
        },
        handler: async (response: {
          razorpay_payment_id: string
          razorpay_subscription_id: string
          razorpay_signature: string
        }) => {
          try {
            const verifyRes = await fetch('/api/razorpay/verify-subscription', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_subscription_id: response.razorpay_subscription_id,
                razorpay_signature: response.razorpay_signature,
                planType: cycle,
                plan: plan.id,
              }),
            })

            const verifyData = await verifyRes.json()
            if (verifyRes.ok && verifyData.success) {
              window.location.href = '/dashboard?subscription=success'
            } else {
              setErrorMessage(
                verifyData.error ||
                  'Payment authorization received, but verification could not be confirmed.'
              )
            }
          } catch (err: any) {
            setErrorMessage(err?.message || 'Error communicating with verification server.')
          } finally {
            setLoadingPlan(null)
          }
        },
        modal: {
          ondismiss: () => {
            setLoadingPlan(null)
          },
        },
      }

      const rzp = new (window as any).Razorpay(options)
      rzp.on('payment.failed', (failResp: any) => {
        setErrorMessage(
          failResp.error?.description || 'Payment mandate authorization failed or was declined.'
        )
        setLoadingPlan(null)
      })
      rzp.open()
    } catch (err: any) {
      console.error('Subscription start failed:', err)
      setErrorMessage(err?.message || 'Unable to open payment modal. Please try again.')
      setLoadingPlan(null)
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 sm:py-16">
      {/* 1. Header & Subtitle */}
      <div className="mx-auto max-w-3xl text-center">
        <p className="inline-flex items-center gap-2 rounded-full border border-[#e8d9c7] bg-white px-3.5 py-1.5 text-xs font-semibold text-[#8b5a2b] shadow-2xs">
          <Sparkles className="size-3.5" />
          {locale === 'hi' ? 'पारदर्शी रेंटल प्रॉपर्टी सॉफ्टवेयर मूल्य निर्धारण' : 'Transparent Rental Property Software Pricing'}
        </p>

        <h1 className="mt-4 text-3xl sm:text-5xl font-semibold tracking-[-0.04em] text-[#2c221e]">
          {locale === 'hi' ? 'सरल, पारदर्शी प्लान।' : 'Simple, transparent plans for every property scale.'}
        </h1>

        <p className="mt-3.5 text-sm sm:text-base text-[#776d62] max-w-2xl mx-auto leading-relaxed">
          {locale === 'hi'
            ? 'अपनी प्रॉपर्टी के अनुसार प्लान चुनें। हर प्लान में संपूर्ण कमरा प्रबंधन, किरायेदार रिकॉर्ड और बहीखाता ट्रैकिंग शामिल है।'
            : 'Choose the plan that fits your portfolio. All plans include automated rent collection, tenant records, and full ledger tracking with zero hidden fees.'}
        </p>

        {/* 2. Monthly / Yearly Billing Toggle */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <div className="inline-flex items-center rounded-2xl border border-[#e8dfd4] bg-white p-1 shadow-xs">
            <button
              type="button"
              onClick={() => setBillingCycle('monthly')}
              className={`rounded-xl px-4 py-2 text-xs font-semibold transition-all cursor-pointer ${
                billingCycle === 'monthly'
                  ? 'bg-[#8b5a2b] text-white shadow-xs'
                  : 'text-[#676b7d] hover:text-[#2c221e]'
              }`}
            >
              {t.landing.monthlyBilling}
            </button>
            <button
              type="button"
              onClick={() => setBillingCycle('yearly')}
              className={`rounded-xl px-4 py-2 text-xs font-semibold transition-all cursor-pointer ${
                billingCycle === 'yearly'
                  ? 'bg-[#8b5a2b] text-white shadow-xs'
                  : 'text-[#676b7d] hover:text-[#2c221e]'
              }`}
            >
              {t.landing.yearlyBilling}
            </button>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#d2e7d6] bg-[#f0f9f2] px-3 py-1 text-xs font-semibold text-[#1e7e34]">
            Save with yearly billing
          </span>
        </div>
      </div>

      {/* Error Message Banner */}
      {errorMessage && (
        <div className="mt-6 mx-auto max-w-xl rounded-2xl border border-[#f5c6cb] bg-[#fff5f5] p-4 text-xs text-[#a02020] text-center shadow-xs flex items-center justify-center gap-2">
          <AlertCircle className="size-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* 3. Four Balanced Pricing Cards */}
      <div className="mt-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">
        {PRICING_PLANS.map((plan) => {
          const isYearly = billingCycle === 'yearly'
          const price = isYearly ? plan.yearlyPrice : plan.monthlyPrice
          const formattedPrice = price !== null ? formatINR(price) : 'Custom pricing'
          const periodLabel = isYearly ? '/year' : '/month'

          return (
            <div
              key={plan.id}
              className={`flex flex-col justify-between rounded-3xl p-6 sm:p-7 transition-all ${
                plan.popular
                  ? 'border-2 border-[#8b5a2b] bg-[#fffdfa] shadow-md relative ring-1 ring-[#8b5a2b]/20'
                  : 'border border-[#e8dfd4] bg-white shadow-2xs hover:border-[#d9cbbe]'
              }`}
            >
              <div>
                {/* Popular Badge */}
                {plan.popular && (
                  <span className="absolute -top-3 right-6 rounded-full bg-[#8b5a2b] px-3.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-xs">
                    Most Popular
                  </span>
                )}

                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold text-[#2c221e]">{plan.name}</h3>
                </div>

                <p className="mt-1 text-xs font-semibold text-[#8b5a2b]">
                  {locale === 'hi' ? plan.propertyLimitHi : plan.propertyLimit}
                </p>

                {/* Price Display: Only selected billing price is shown */}
                <div className="mt-5 mb-2">
                  {price !== null ? (
                    <div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#2c221e]">
                          {formattedPrice}
                        </span>
                        <span className="text-xs text-[#776d62] font-medium">{periodLabel}</span>
                      </div>
                      {isYearly && plan.annualSavings ? (
                        <div className="mt-2">
                          <span className="inline-block rounded-md bg-[#eaf5ea] px-2 py-0.5 text-[11px] font-bold text-[#2e7d32]">
                            Save {formatINR(plan.annualSavings)}/year
                          </span>
                        </div>
                      ) : (
                        <div className="mt-2 h-5" aria-hidden="true" />
                      )}
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl sm:text-3xl font-bold tracking-tight text-[#2c221e]">
                          Custom pricing
                        </span>
                      </div>
                      <div className="mt-2">
                        <span className="inline-block text-[11px] font-medium text-[#776d62]">
                          Tailored portfolio quote
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <p className="mt-3 text-xs leading-5 text-[#676b7d]">
                  {locale === 'hi' ? plan.descriptionHi : plan.descriptionEn}
                </p>

                {/* Features list */}
                <div className="mt-6 pt-5 border-t border-[#f0e8dd]">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[#9c8e80]">
                    Included Features
                  </p>
                  <ul className="mt-3 flex flex-col gap-2.5 text-xs text-[#555a6c]">
                    {(locale === 'hi' ? plan.featuresHi : plan.featuresEn).map((feat, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <Check className="size-4 shrink-0 text-[#8b5a2b] mt-0.5" />
                        <span className="leading-5">{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Action Button */}
              <div className="mt-8 pt-4">
                {plan.id === 'enterprise' ? (
                  <Link
                    href="/contact?plan=enterprise"
                    className="block w-full rounded-xl border border-[#8b5a2b] bg-white py-2.5 text-center text-xs font-semibold text-[#8b5a2b] hover:bg-[#faf7f2] transition-colors"
                  >
                    Contact Us
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleSelectPlan(plan)}
                    disabled={loadingPlan !== null}
                    className={`block w-full rounded-xl py-2.5 text-center text-xs font-semibold transition-colors cursor-pointer ${
                      plan.popular
                        ? 'bg-[#8b5a2b] text-white shadow-xs hover:bg-[#784b20]'
                        : 'border border-[#d9c4aa] bg-[#faf7f2] text-[#784b20] hover:bg-[#ebdccb]'
                    }`}
                  >
                    {isSubscribed
                      ? (locale === 'hi' ? 'डैशबोर्ड पर जाएं' : 'Go to Dashboard')
                      : billingCycle === 'monthly'
                      ? 'Choose Monthly Plan'
                      : 'Choose Yearly Plan'}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* 4. Small Trust & Benefits Row */}
      <div className="mt-14 rounded-2xl border border-[#eee4d7] bg-white p-6 sm:p-8">
        <div className="grid gap-6 sm:grid-cols-3">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#f4ede3] text-[#8b5a2b]">
              <Sparkles className="size-5" />
            </span>
            <div>
              <h4 className="text-sm font-semibold text-[#2c221e]">7-Day Full Access Trial</h4>
              <p className="mt-1 text-xs text-[#776d62] leading-5">
                Start immediately with full feature access and live database isolation. Zero credit card needed upfront.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#f4ede3] text-[#8b5a2b]">
              <ShieldCheck className="size-5" />
            </span>
            <div>
              <h4 className="text-sm font-semibold text-[#2c221e]">Flexible Cancellation</h4>
              <p className="mt-1 text-xs text-[#776d62] leading-5">
                Switch between monthly and yearly billing anytime. Cancel auto-renewal with one click inside settings.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#f4ede3] text-[#8b5a2b]">
              <HelpCircle className="size-5" />
            </span>
            <div>
              <h4 className="text-sm font-semibold text-[#2c221e]">Zero Lock-in Data Export</h4>
              <p className="mt-1 text-xs text-[#776d62] leading-5">
                Export complete tenant rolls, room ledgers, and payment history in CSV and JSON formats anytime.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 5. Compact Closing CTA */}
      <div className="mt-8 rounded-2xl border border-[#e8dfd4] bg-[#faf7f2] p-5 sm:p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h4 className="text-sm font-bold text-[#2c221e]">Need multi-building setup or assisted migration?</h4>
          <p className="mt-0.5 text-xs text-[#776d62]">
            Our onboarding team can migrate your tenant spreadsheets and configure your buildings in 24 hours.
          </p>
        </div>
        <Link
          href="/contact?subject=migration_assistance"
          className="shrink-0 rounded-xl bg-[#8b5a2b] px-4 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-[#784b20] transition-colors"
        >
          Talk to Onboarding Team
        </Link>
      </div>

      {/* Pre-Payment Confirmation Modal (Satisfies: "Before payment, clearly show the selected plan, total amount, and billing period") */}
      {confirmingPlan && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-xs overflow-y-auto"
        >
          <div className="w-full max-w-md max-h-[92vh] overflow-y-auto overscroll-contain rounded-3xl border border-[#e8dfd4] bg-white p-5 sm:p-7 shadow-2xl animate-in fade-in zoom-in-95 my-auto">
            <div className="flex items-center justify-between pb-4 border-b border-[#f0e8dc]">
              <div>
                <h2 className="text-base font-bold text-[#2c221e]">Confirm Subscription Plan</h2>
                <p className="text-xs text-[#776d62] mt-0.5">Review before payment gateway checkout</p>
              </div>
              <button
                type="button"
                onClick={() => setConfirmingPlan(null)}
                className="rounded-full p-1 text-[#8b8277] hover:bg-[#faf7f2] hover:text-[#2c221e] transition-colors cursor-pointer"
                aria-label="Close modal"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="mt-5 rounded-2xl border border-[#e8dfd4] bg-[#fbf8f3] p-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-base font-bold text-[#2c221e]">{confirmingPlan.plan.name} Plan</span>
                  <p className="text-xs font-medium text-[#8b5a2b]">{confirmingPlan.plan.propertyLimit}</p>
                </div>
                <span className="rounded-full bg-[#f4ede3] px-2.5 py-1 text-[11px] font-semibold text-[#8b5a2b] capitalize">
                  {confirmingPlan.cycle} Billing
                </span>
              </div>

              <div className="mt-4 pt-3 border-t border-[#e8dfd4] flex items-baseline justify-between">
                <span className="text-xs text-[#776d62]">Total Amount:</span>
                <div className="text-right">
                  <span className="text-2xl font-bold text-[#2c221e]">
                    {formatINR(
                      confirmingPlan.cycle === 'yearly'
                        ? confirmingPlan.plan.yearlyPrice!
                        : confirmingPlan.plan.monthlyPrice!
                    )}
                  </span>
                  <span className="text-xs text-[#776d62]">
                    {confirmingPlan.cycle === 'yearly' ? ' / year' : ' / month'}
                  </span>
                </div>
              </div>

              {confirmingPlan.cycle === 'yearly' && confirmingPlan.plan.annualSavings && (
                <p className="mt-2 text-right text-xs font-semibold text-[#2e7d32]">
                  🎉 You save {formatINR(confirmingPlan.plan.annualSavings)} with annual billing
                </p>
              )}
            </div>

            {/* Trial Eligibility & Immediate Charge Disclosure */}
            {(() => {
              const isNewCustomer = !subState || !subState.activeRecord
              const isTrialActive = subState?.status === 'trialing' && !subState.isTrialExpired
              const isTrialEligible = isNewCustomer || isTrialActive
              const isTrialExpired = !isTrialEligible && !isSubscribed

              if (isTrialExpired) {
                return (
                  <div className="mt-4 rounded-xl bg-[#fff8ed] p-3 text-xs text-[#a35200] border border-[#f0c38a] flex items-start gap-2">
                    <AlertCircle className="size-4 shrink-0 mt-0.5 text-[#d97706]" />
                    <div>
                      <p className="font-bold text-[#b45309]">Trial Period Expired — Immediate Billing</p>
                      <p className="mt-0.5 text-[#92400e]">
                        Your 7-day free trial has expired. Selecting this plan will charge{' '}
                        <strong>
                          {formatINR(
                            confirmingPlan.cycle === 'yearly'
                              ? confirmingPlan.plan.yearlyPrice!
                              : confirmingPlan.plan.monthlyPrice!
                          )}
                        </strong>{' '}
                        immediately for 1 {confirmingPlan.cycle === 'yearly' ? 'year' : 'month'} of {confirmingPlan.plan.name} access.
                      </p>
                    </div>
                  </div>
                )
              }

              return (
                <div className="mt-4 rounded-xl bg-[#f0f9f2] p-3 text-xs text-[#1e7e34] border border-[#d2e7d6] flex items-start gap-2">
                  <ShieldCheck className="size-4 shrink-0 mt-0.5 text-[#1e7e34]" />
                  <div>
                    <p className="font-bold text-[#1e7e34]">7-Day Free Trial Included</p>
                    <p className="mt-0.5">
                      {isTrialActive && subState?.trialEnd
                        ? `Your active trial remains valid until ${new Date(subState.trialEnd).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}. Your first recurring charge of ${formatINR(confirmingPlan.cycle === 'yearly' ? confirmingPlan.plan.yearlyPrice! : confirmingPlan.plan.monthlyPrice!)} occurs only after your trial concludes.`
                        : `Eligible new accounts will not be charged today. Your first charge of ${formatINR(confirmingPlan.cycle === 'yearly' ? confirmingPlan.plan.yearlyPrice! : confirmingPlan.plan.monthlyPrice!)} occurs after 7 days. Cancel anytime with 1 click.`}
                    </p>
                  </div>
                </div>
              )
            })()}

            {/* Customer Contact Number (Verified or User Provided) */}
            <div className="mt-4 pt-1">
              <label className="block text-xs font-semibold text-[#57534e] mb-1">
                Contact Phone Number {customerPhone ? '(verified)' : '(for payment updates & receipts)'}
              </label>
              <input
                type="tel"
                value={customerPhoneInput}
                onChange={(e) => setCustomerPhoneInput(e.target.value)}
                placeholder="Enter 10-digit mobile number"
                className="w-full rounded-xl border border-[#e8dfd4] bg-white px-3 py-2 text-xs text-[#2c221e] placeholder:text-[#a8a29e] focus:border-[#8b5a2b] focus:outline-hidden"
              />
              <p className="mt-1 text-[11px] text-[#8b8277]">
                {customerPhoneInput
                  ? 'Payment receipts and subscription notifications will be sent to this mobile number.'
                  : 'If omitted, you can enter your contact number directly on the payment screen.'}
              </p>
            </div>

            <div className="mt-6 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => handleProceedToPayment(confirmingPlan.plan, confirmingPlan.cycle)}
                disabled={loadingPlan !== null}
                className="w-full rounded-xl bg-[#8b5a2b] py-3 text-center text-xs font-semibold text-white shadow-xs hover:bg-[#784b20] transition-colors disabled:opacity-60 cursor-pointer flex items-center justify-center gap-2"
              >
                {loadingPlan !== null ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    <span>Connecting to Payment Gateway...</span>
                  </>
                ) : (
                  <span>Proceed to Secure Payment</span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setConfirmingPlan(null)}
                disabled={loadingPlan !== null}
                className="w-full rounded-xl border border-[#e8dfd4] bg-white py-2.5 text-center text-xs font-semibold text-[#676b7d] hover:bg-[#faf7f2] transition-colors cursor-pointer"
              >
                Change Plan / Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
