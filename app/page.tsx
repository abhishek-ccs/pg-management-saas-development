'use client'

import Link from 'next/link'
import { ArrowRight, Building2, Check, CircleHelp, DoorOpen, Receipt, ShieldCheck, Sparkles, Users, Wallet } from 'lucide-react'

const features = [
  ['Property control', 'Keep your PG profile, rooms, beds, and availability in one calm workspace.', Building2],
  ['Tenant records', 'Store resident details, room assignments, joining dates, and rent information securely.', Users],
  ['Rent collection', 'Track due payments and keep a clear record of every collection.', Wallet],
  ['Daily operations', 'Organize electricity readings, expenses, complaints, and reports without spreadsheets.', Receipt],
]

export default function LandingPage() {
  return <main className="min-h-screen bg-[#fbf8f3] text-[#403a34]">
    <header className="sticky top-0 z-20 border-b border-[#eee4d7]/90 bg-[#fbf8f3]/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5"><span className="grid size-9 place-items-center rounded-xl bg-[#9a7651] text-white"><Building2 className="size-5" /></span><span><span className="block text-[15px] font-bold tracking-tight">StayNest</span><span className="block text-[9px] font-medium uppercase tracking-[0.18em] text-[#a08d79]">Property Management</span></span></Link>
        <nav className="hidden items-center gap-7 text-sm text-[#776d62] md:flex"><Link href="#features">Features</Link><Link href="#pricing">Pricing</Link><Link href="#faq">FAQ</Link><Link href="#contact">Contact</Link></nav>
        <div className="flex items-center gap-2"><Link href="/login" className="hidden rounded-xl px-3 py-2 text-sm font-semibold text-[#776d62] sm:block">Sign in</Link><Link href="/signup" className="rounded-xl bg-[#9a7651] px-4 py-2.5 text-sm font-semibold text-white shadow-sm">Start free trial</Link></div>
      </div>
    </header>
    <section className="mx-auto grid max-w-6xl gap-12 px-5 pb-20 pt-16 sm:px-8 lg:grid-cols-[1.08fr_.92fr] lg:items-center lg:pb-28 lg:pt-24">
      <div><p className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#e8d9c7] bg-white px-3 py-1.5 text-xs font-semibold text-[#9a7651]"><Sparkles className="size-3.5" />A calmer way to manage rental properties</p><h1 className="max-w-2xl text-5xl font-semibold leading-[1.04] tracking-[-0.055em] text-[#403a34] sm:text-6xl">Your property, <em className="font-serif font-normal text-[#9a7651]">beautifully</em> organized.</h1><p className="mt-6 max-w-xl text-base leading-7 text-[#776d62] sm:text-lg">StayNest brings property setup, rooms, beds, tenants, rent, and everyday operations into one thoughtful workspace for PGs, hostels, and rental properties.</p><div className="mt-8 flex flex-wrap items-center gap-3"><Link href="/signup" className="inline-flex items-center gap-2 rounded-xl bg-[#9a7651] px-5 py-3 text-sm font-semibold text-white shadow-sm">Start your 7-day free trial <ArrowRight className="size-4" /></Link><Link href="/login" className="rounded-xl border border-[#dfd1c0] bg-white px-5 py-3 text-sm font-semibold text-[#776d62]">Sign in</Link></div><p className="mt-4 text-xs text-[#a08d79]">No credit card required. Built for property owners and operators.</p></div>
      <div className="relative rounded-[2rem] border border-[#e8d9c7] bg-[#f3eadf] p-5 shadow-[0_24px_70px_rgba(112,82,48,.12)] sm:p-7"><div className="rounded-2xl border border-[#eee4d7] bg-white p-5"><div className="mb-7 flex items-center justify-between"><div><p className="text-xs text-[#a08d79]">Your workspace</p><p className="mt-1 text-lg font-bold">StayNest dashboard</p></div><span className="rounded-full bg-[#f4ede3] px-2.5 py-1 text-[10px] font-semibold text-[#9a7651]">7-day trial</span></div><div className="grid grid-cols-2 gap-3"><div className="rounded-xl bg-[#faf7f2] p-4"><DoorOpen className="mb-5 size-5 text-[#9a7651]" /><p className="text-xs text-[#a08d79]">Rooms</p><p className="mt-1 text-2xl font-bold">0</p></div><div className="rounded-xl bg-[#faf7f2] p-4"><Users className="mb-5 size-5 text-[#9a7651]" /><p className="text-xs text-[#a08d79]">Tenants</p><p className="mt-1 text-2xl font-bold">0</p></div></div><div className="mt-3 rounded-xl border border-dashed border-[#dfd1c0] p-5 text-center"><p className="text-sm font-semibold">Start with your property</p><p className="mt-1 text-xs text-[#a08d79]">Add rooms, beds, and tenants when you are ready.</p></div></div></div>
    </section>
    <section id="features" className="border-y border-[#eee4d7] bg-white"><div className="mx-auto max-w-6xl px-5 py-20 sm:px-8"><div className="max-w-xl"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9a7651]">Everything in one place</p><h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">The essentials, without the clutter.</h2></div><div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{features.map(([title, text, Icon]) => <article key={title as string} className="rounded-2xl border border-[#eee4d7] bg-[#fbf8f3] p-5"><span className="mb-8 grid size-10 place-items-center rounded-xl bg-[#f3eadf] text-[#9a7651]"><Icon className="size-5" /></span><h3 className="font-semibold">{title as string}</h3><p className="mt-2 text-sm leading-6 text-[#776d62]">{text as string}</p></article>)}</div></div></section>
    <section id="pricing" className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9a7651]">Simple, transparent pricing</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Start free. Choose what fits your property.</h2>
        <p className="mt-4 text-[#776d62]">Every new account begins with a 7-day full access trial. No credit card required upfront.</p>
      </div>
      <div className="mt-12 grid gap-6 md:grid-cols-3">
        <div className="flex flex-col justify-between rounded-3xl border border-[#e8dfd4] bg-white p-7 shadow-sm">
          <div>
            <span className="rounded-full bg-[#f4ede3] px-3 py-1 text-xs font-semibold text-[#9a7651]">Free trial</span>
            <div className="mt-5 flex items-baseline gap-1">
              <span className="text-4xl font-bold">₹0</span>
              <span className="text-xs text-[#85899a]">/ 7 days</span>
            </div>
            <p className="mt-3 text-xs leading-5 text-[#776d62]">Full access to all StayNest tools to configure your property and see how it works for you.</p>
            <ul className="mt-6 flex flex-col gap-2.5 text-xs text-[#555a6c]">
              <li className="flex items-center gap-2"><Check className="size-4 shrink-0 text-[#9a7651]" />Complete property, rooms & beds setup</li>
              <li className="flex items-center gap-2"><Check className="size-4 shrink-0 text-[#9a7651]" />Tenant records and room allocation</li>
              <li className="flex items-center gap-2"><Check className="size-4 shrink-0 text-[#9a7651]" />Rent collection & payment recording</li>
              <li className="flex items-center gap-2"><Check className="size-4 shrink-0 text-[#9a7651]" />Expenses, electricity & complaints tracking</li>
            </ul>
          </div>
          <Link href="/signup" className="mt-8 block rounded-xl border border-[#d9c4aa] bg-[#fbf8f3] py-2.5 text-center text-xs font-semibold text-[#866342] hover:bg-[#f3eadf]">Start free trial</Link>
        </div>

        <div className="relative flex flex-col justify-between rounded-3xl border-2 border-[#9a7651] bg-[#fbf8f3] p-7 shadow-md">
          <span className="absolute -top-3 right-6 rounded-full bg-[#9a7651] px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">Most flexible</span>
          <div>
            <span className="rounded-full bg-[#f3eadf] px-3 py-1 text-xs font-semibold text-[#9a7651]">Monthly</span>
            <div className="mt-5 flex items-baseline gap-1">
              <span className="text-4xl font-bold">₹1,699</span>
              <span className="text-xs text-[#85899a]">/ month</span>
            </div>
            <p className="mt-3 text-xs leading-5 text-[#776d62]">Flexible month-to-month plan with no long-term commitment. Cancel anytime.</p>
            <ul className="mt-6 flex flex-col gap-2.5 text-xs text-[#555a6c]">
              <li className="flex items-center gap-2"><Check className="size-4 shrink-0 text-[#9a7651]" />All core workspace features included</li>
              <li className="flex items-center gap-2"><Check className="size-4 shrink-0 text-[#9a7651]" />Unlimited tenants & room capacity</li>
              <li className="flex items-center gap-2"><Check className="size-4 shrink-0 text-[#9a7651]" />Payment receipts & financial ledger</li>
              <li className="flex items-center gap-2"><Check className="size-4 shrink-0 text-[#9a7651]" />Real-time occupancy & collection reports</li>
            </ul>
          </div>
          <Link href="/signup" className="mt-8 block rounded-xl bg-[#9a7651] py-2.5 text-center text-xs font-semibold text-white shadow-sm hover:bg-[#866342]">Start free trial</Link>
        </div>

        <div className="flex flex-col justify-between rounded-3xl border border-[#e8dfd4] bg-white p-7 shadow-sm">
          <div>
            <span className="rounded-full bg-[#f4ede3] px-3 py-1 text-xs font-semibold text-[#9a7651]">Yearly</span>
            <div className="mt-5 flex items-baseline gap-1">
              <span className="text-4xl font-bold">₹14,999</span>
              <span className="text-xs text-[#85899a]">/ year</span>
            </div>
            <p className="mt-3 text-xs leading-5 text-[#776d62]">Annual plan designed for established properties looking for long-term predictability.</p>
            <ul className="mt-6 flex flex-col gap-2.5 text-xs text-[#555a6c]">
              <li className="flex items-center gap-2"><Check className="size-4 shrink-0 text-[#9a7651]" />Everything in Monthly included</li>
              <li className="flex items-center gap-2"><Check className="size-4 shrink-0 text-[#9a7651]" />Annual billing with zero monthly disruption</li>
              <li className="flex items-center gap-2"><Check className="size-4 shrink-0 text-[#9a7651]" />Historical data export & year-end reports</li>
              <li className="flex items-center gap-2"><Check className="size-4 shrink-0 text-[#9a7651]" />Standard priority email support</li>
            </ul>
          </div>
          <Link href="/signup" className="mt-8 block rounded-xl border border-[#d9c4aa] bg-[#fbf8f3] py-2.5 text-center text-xs font-semibold text-[#866342] hover:bg-[#f3eadf]">Start free trial</Link>
        </div>
      </div>
    </section>
    <section id="faq" className="border-t border-[#eee4d7] bg-white"><div className="mx-auto max-w-3xl px-5 py-20 sm:px-8"><div className="text-center"><CircleHelp className="mx-auto size-7 text-[#9a7651]" /><h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">Questions, answered.</h2></div><div className="mt-10 flex flex-col gap-3">{[['What is StayNest?', 'StayNest is a management workspace for PGs, hostels, and rental property owners to organize property details, rooms, beds, tenants, rent, and daily operations.'], ['How does the trial work?', 'Every new account starts with a 7-day trial. You can set up your property, add rooms, and explore the workspace before choosing a plan.'], ['Can I add multiple rooms and tenants?', 'Yes. StayNest is designed to keep your records organized with room allocations, tenant details, and rent collection records.']].map(([q,a]) => <details key={q} className="rounded-2xl border border-[#eee4d7] p-5"><summary className="cursor-pointer font-semibold">{q}</summary><p className="mt-3 text-sm leading-6 text-[#776d62]">{a}</p></details>)}</div></div></section>
    <footer id="contact" className="bg-[#403a34] text-[#f8f0e5]"><div className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-12 sm:px-8 md:flex-row md:items-end md:justify-between"><div><div className="flex items-center gap-2.5"><span className="grid size-9 place-items-center rounded-xl bg-[#9a7651] text-white"><Building2 className="size-5" /></span><span className="text-lg font-bold">StayNest</span></div><p className="mt-4 max-w-sm text-sm leading-6 text-[#cbbfaf]">A thoughtful workspace for PGs, hostels, and rental property owners.</p></div><div className="text-sm text-[#cbbfaf]"><p className="mb-2 font-semibold text-white">Contact</p><a href="mailto:hello@staynest.in">hello@staynest.in</a></div></div></footer>
  </main>
}
