'use client'

import { useState } from 'react'
import {
  Bell,
  Building2,
  CalendarDays,
  ChevronDown,
  CircleHelp,
  DoorOpen,
  FileText,
  Home,
  LayoutDashboard,
  Menu,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Receipt,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  Wallet,
  X,
  Zap,
} from 'lucide-react'

const navigation = [
  { label: 'Overview', icon: LayoutDashboard },
  { label: 'Property', icon: Building2 },
  { label: 'Rooms & Beds', icon: DoorOpen },
  { label: 'Tenants', icon: Users },
  { label: 'Rent & Payments', icon: Wallet },
  { label: 'Electricity', icon: Zap },
  { label: 'Expenses', icon: Receipt },
  { label: 'Complaints', icon: MessageSquare },
  { label: 'Reports', icon: FileText },
]

const metrics = [
  { label: 'Total rooms', value: '0', note: 'Add rooms to get started', icon: DoorOpen, tone: 'lavender' },
  { label: 'Available beds', value: '0', note: 'No beds configured', icon: Home, tone: 'mint' },
  { label: 'Total tenants', value: '0', note: 'No tenants yet', icon: Users, tone: 'peach' },
  { label: 'Rent collected', value: '₹0', note: 'This month', icon: Wallet, tone: 'sky' },
]

export default function Page() {
  const [active, setActive] = useState('Overview')
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="min-h-screen bg-[#f8f9fc] text-[#202536]">
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col border-r border-[#e8eaf0] bg-white transition-transform lg:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-[74px] items-center justify-between border-b border-[#eef0f4] px-6">
          <div className="flex items-center gap-2.5">
            <div className="grid size-9 place-items-center rounded-xl bg-[#5e5bd8] text-white shadow-sm"><Building2 className="size-5" /></div>
            <div><p className="text-[15px] font-bold tracking-tight">StayNest</p><p className="text-[10px] font-medium uppercase tracking-[0.16em] text-[#969baa]">PG management</p></div>
          </div>
          <button className="lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Close menu"><X className="size-5" /></button>
        </div>
        <div className="px-4 pt-7"><p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#9ca0ae]">Workspace</p><nav className="flex flex-col gap-1">{navigation.map((item) => { const Icon = item.icon; return <button key={item.label} onClick={() => { setActive(item.label); setMobileOpen(false) }} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] font-medium transition-colors ${active === item.label ? 'bg-[#eeefff] text-[#5652c9]' : 'text-[#74798a] hover:bg-[#f7f7fa] hover:text-[#303549]'}`}><Icon className="size-[17px]" />{item.label}{item.label === 'Complaints' && <span className="ml-auto rounded-full bg-[#f5f5f8] px-2 py-0.5 text-[10px] text-[#9a9dac]">0</span>}</button> })}</nav></div>
        <div className="mt-auto px-4 pb-5"><div className="mb-5 rounded-2xl bg-[#f6f5ff] p-4"><div className="mb-2 flex items-center gap-2 text-[#5a57cb]"><Sparkles className="size-4" /><span className="text-xs font-semibold">7-day free trial</span></div><p className="mb-3 text-[11px] leading-4 text-[#747895]">Explore StayNest with your own property data.</p><button className="w-full rounded-lg bg-[#5e5bd8] py-2 text-[11px] font-semibold text-white">View plans</button></div><button className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium text-[#74798a] hover:bg-[#f7f7fa]"><Settings className="size-[17px]" />Settings</button><button className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium text-[#74798a] hover:bg-[#f7f7fa]"><CircleHelp className="size-[17px]" />Help center</button></div>
      </aside>

      {mobileOpen && <button aria-label="Close navigation" className="fixed inset-0 z-30 bg-[#22263b]/20 lg:hidden" onClick={() => setMobileOpen(false)} />}
      <main className="lg:pl-[248px]">
        <header className="flex h-[74px] items-center justify-between border-b border-[#e8eaf0] bg-white px-5 sm:px-8"><div className="flex items-center gap-3"><button className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu"><Menu className="size-5" /></button><div className="hidden items-center gap-2 text-xs text-[#969baa] sm:flex"><span>Workspace</span><span>/</span><span className="font-medium text-[#44485a]">{active}</span></div><h1 className="text-base font-semibold lg:hidden">{active}</h1></div><div className="flex items-center gap-3"><div className="hidden items-center gap-2 rounded-lg border border-[#e8eaf0] px-3 py-2 text-xs text-[#a0a3b0] md:flex"><Search className="size-3.5" />Search anything <span className="ml-8 rounded bg-[#f5f6f8] px-1.5 py-0.5 text-[10px]">⌘ K</span></div><button className="relative rounded-lg p-2 text-[#85899a] hover:bg-[#f7f7fa]" aria-label="Notifications"><Bell className="size-[18px]" /><span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-[#e26c74]" /></button><div className="flex items-center gap-2 border-l border-[#eceef2] pl-3"><div className="grid size-8 place-items-center rounded-full bg-[#e3e4ff] text-xs font-semibold text-[#5e5bd8]">AK</div><div className="hidden sm:block"><p className="text-xs font-semibold">Aarav Kumar</p><p className="text-[10px] text-[#999daa]">PG Owner</p></div><ChevronDown className="hidden size-3.5 text-[#999daa] sm:block" /></div></div></header>
        <div className="mx-auto max-w-[1360px] px-5 py-7 sm:px-8 lg:px-10"><div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="mb-1 text-[12px] font-medium text-[#8b8fa0]">Friday, 26 September 2026</p><h2 className="text-[26px] font-bold tracking-[-0.04em] text-[#202536]">Good morning, Aarav</h2><p className="mt-1 text-sm text-[#85899a]">Here&apos;s what&apos;s happening with your property.</p></div><button className="flex items-center justify-center gap-2 rounded-xl bg-[#5e5bd8] px-4 py-2.5 text-xs font-semibold text-white shadow-[0_5px_14px_rgba(94,91,216,0.18)] hover:bg-[#514ec6]"><Plus className="size-4" />Add your property</button></div>
          <section className="mb-6 flex flex-col justify-between gap-4 rounded-2xl border border-[#dedfff] bg-[#f1f1ff] px-5 py-4 sm:flex-row sm:items-center sm:px-6"><div className="flex items-start gap-3"><div className="grid size-9 shrink-0 place-items-center rounded-xl bg-white text-[#5e5bd8] shadow-sm"><Sparkles className="size-[17px]" /></div><div><p className="text-sm font-semibold text-[#343579]">Your 7-day free trial is active</p><p className="mt-0.5 text-xs text-[#696c9b]">You have 7 days to explore StayNest. Add your property details to begin.</p></div></div><button className="whitespace-nowrap rounded-lg border border-[#c8c9f3] bg-white px-3 py-2 text-xs font-semibold text-[#5652c9]">Explore billing <span aria-hidden="true">→</span></button></section>
          <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{metrics.map((metric) => { const Icon = metric.icon; return <div key={metric.label} className="rounded-2xl border border-[#e9ebf0] bg-white p-5 shadow-[0_2px_8px_rgba(32,37,54,0.02)]"><div className="mb-5 flex items-start justify-between"><div className={`grid size-9 place-items-center rounded-xl ${metric.tone === 'lavender' ? 'bg-[#efefff] text-[#625fd1]' : metric.tone === 'mint' ? 'bg-[#e7f7f0] text-[#42a77d]' : metric.tone === 'peach' ? 'bg-[#fff0e9] text-[#dd8e68]' : 'bg-[#eaf4ff] text-[#5897d0]'}`}><Icon className="size-[17px]" /></div><button className="text-[#b0b3bd]" aria-label={`More options for ${metric.label}`}><MoreHorizontal className="size-4" /></button></div><p className="text-[12px] text-[#9296a5]">{metric.label}</p><p className="mt-1 text-[25px] font-bold tracking-[-0.04em]">{metric.value}</p><p className="mt-1 text-[11px] text-[#a4a7b2]">{metric.note}</p></div> })}</div>
          <div className="grid gap-5 xl:grid-cols-[1.35fr_1fr]"><section className="rounded-2xl border border-[#e9ebf0] bg-white p-6"><div className="mb-5 flex items-center justify-between"><div><h3 className="text-sm font-semibold">Rent overview</h3><p className="mt-1 text-xs text-[#999daa]">Your collection summary will appear here.</p></div><button className="flex items-center gap-2 rounded-lg border border-[#e8eaf0] px-3 py-2 text-xs font-medium text-[#676b7d]"><CalendarDays className="size-3.5" />This month<ChevronDown className="size-3" /></button></div><div className="flex min-h-[190px] flex-col items-center justify-center rounded-xl border border-dashed border-[#e2e4eb] bg-[#fcfcfd]"><div className="mb-3 grid size-11 place-items-center rounded-full bg-[#f1f1ff] text-[#6562d0]"><Wallet className="size-5" /></div><p className="text-sm font-semibold">No payment data yet</p><p className="mt-1 max-w-[260px] text-center text-xs leading-5 text-[#a0a3af]">Add rooms and tenants to start tracking your rent collection.</p></div></section><section className="rounded-2xl border border-[#e9ebf0] bg-white p-6"><div className="mb-5 flex items-center justify-between"><div><h3 className="text-sm font-semibold">Quick actions</h3><p className="mt-1 text-xs text-[#999daa]">Common tasks, right where you need them.</p></div><button aria-label="More quick actions" className="text-[#a6a9b4]"><MoreHorizontal className="size-4" /></button></div><div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-1">{[{label:'Set up your property',icon:Building2},{label:'Add rooms & beds',icon:DoorOpen},{label:'Add your first tenant',icon:Users},{label:'View reports',icon:FileText}].map((action) => { const Icon = action.icon; return <button key={action.label} className="flex items-center gap-3 rounded-xl border border-[#eef0f4] px-3.5 py-3 text-left text-xs font-medium text-[#555a6c] transition-colors hover:border-[#d9d9f7] hover:bg-[#fafaff]"><span className="grid size-8 place-items-center rounded-lg bg-[#f5f5ff] text-[#6461d1]"><Icon className="size-4" /></span>{action.label}<span className="ml-auto text-[#b4b6c0]">→</span></button> })}</div></section></div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#e9ebf0] bg-white px-5 py-4"><div className="flex items-center gap-3"><div className="grid size-8 place-items-center rounded-lg bg-[#eef8f4] text-[#55a783]"><ShieldCheck className="size-4" /></div><div><p className="text-xs font-semibold">Your data is secure</p><p className="text-[11px] text-[#999daa]">Encrypted, private, and only accessible to you.</p></div></div><button className="text-xs font-semibold text-[#5e5bd8]">Learn about security <span aria-hidden="true">→</span></button></div>
        </div>
      </main>
    </div>
  )
}
