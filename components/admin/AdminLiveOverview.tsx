'use client'

import { useEffect, useState, useTransition } from 'react'
import {
  Activity,
  BedDouble,
  Building2,
  Clock,
  CreditCard,
  DoorOpen,
  RefreshCw,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react'

export interface InitialAdminStats {
  ownersCount: number
  activeOwnersCount: number
  suspendedOwnersCount: number
  propertiesCount: number
  roomsCount: number
  bedsCount: number
  tenantsCount: number
  activeTenantsCount: number
  occupancyRate: number
  trialingCount: number
  activeSubCount: number
  expiredSubCount: number
  totalRevenue: number
  paymentsCount: number
  signups7d: number
  signups30d: number
}

interface AdminMetricItem {
  Icon: LucideIcon
  label: string
  value: string | number
  note: string
}

export function AdminLiveOverview({ initialStats }: { initialStats: InitialAdminStats }) {
  const [stats, setStats] = useState<InitialAdminStats>(initialStats)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<string>('Just now')
  const [, startTransition] = useTransition()

  async function fetchLiveStats() {
    setIsRefreshing(true)
    try {
      const res = await fetch('/api/admin/stats', { cache: 'no-store' })
      if (!res.ok) throw new Error('Stats fetch failed')
      const json = await res.json()
      if (json.success && json.stats) {
        startTransition(() => {
          setStats(json.stats)
          const now = new Date()
          setLastUpdated(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
        })
      }
    } catch {
      // Graceful fallback to retain current stats if network hiccup occurs
    } finally {
      setIsRefreshing(false)
    }
  }

  // Automatic real-time polling every 20 seconds to reflect platform activity
  useEffect(() => {
    const timer = setInterval(() => {
      void fetchLiveStats()
    }, 20000)

    return () => clearInterval(timer)
  }, [])

  const metrics: AdminMetricItem[] = [
    {
      Icon: Users,
      label: 'Property Owners',
      value: stats.ownersCount,
      note: `${stats.activeOwnersCount} Active · ${stats.suspendedOwnersCount} Suspended`,
    },
    {
      Icon: Building2,
      label: 'Properties',
      value: stats.propertiesCount,
      note: 'Total onboarded properties',
    },
    {
      Icon: DoorOpen,
      label: 'Rooms / Units',
      value: stats.roomsCount,
      note: `${stats.bedsCount} Total beds configured`,
    },
    {
      Icon: BedDouble,
      label: 'Tenants / Residents',
      value: stats.tenantsCount,
      note: `${stats.activeTenantsCount} Active (${stats.occupancyRate}% occupancy)`,
    },
    {
      Icon: Clock,
      label: 'Active Trials',
      value: stats.trialingCount,
      note: '7-Day evaluation window',
    },
    {
      Icon: CreditCard,
      label: 'Active Subscriptions',
      value: stats.activeSubCount,
      note: 'Paid monthly / annual plans',
    },
    {
      Icon: Activity,
      label: 'Expired Subscriptions',
      value: stats.expiredSubCount,
      note: 'Trial or billing concluded',
    },
    {
      Icon: CreditCard,
      label: 'Platform Revenue',
      value: `₹${stats.totalRevenue.toLocaleString('en-IN')}`,
      note: `${stats.paymentsCount} Payments recorded`,
    },
  ]

  return (
    <div className="space-y-6">
      {/* Platform Header with Live Indicator & Auto-refresh */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-[#faf3ea] border border-[#e8dfd4] px-2.5 py-1 text-[11px] font-bold text-[#8b5a2b]">
              PLATFORM GOVERNANCE
            </span>
            <div className="flex items-center gap-1.5 rounded-full bg-[#f0f9f1] border border-[#cbe8ce] px-2.5 py-1 text-[11px] font-medium text-[#2d7d38]">
              <span className="relative flex size-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#34d399] opacity-75"></span>
                <span className="relative inline-flex rounded-full size-2 bg-[#2d7d38]"></span>
              </span>
              <span>Live Database Stats</span>
            </div>
          </div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-[#2c221e]">Super Admin Platform Overview</h1>
          <p className="mt-1 text-sm text-[#85899a]">
            Real-time multi-tenant monitoring, customer management, inventory usage, and cryptographic audit logs.
          </p>
        </div>

        {/* Live Controls and Signups Highlight */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-2xl border border-[#e8dfd4] bg-white px-3.5 py-2.5 shadow-2xs">
            <button
              onClick={() => void fetchLiveStats()}
              disabled={isRefreshing}
              className="flex items-center gap-1.5 text-xs font-semibold text-[#8b5a2b] hover:text-[#6f421b] transition-colors disabled:opacity-60"
              title="Refresh live platform statistics"
            >
              <RefreshCw className={`size-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>{isRefreshing ? 'Refreshing...' : 'Refresh Stats'}</span>
            </button>
            <span className="text-[11px] text-[#9a9fb1]">· {lastUpdated}</span>
          </div>

          {/* New Signups Highlights Pill */}
          <div className="flex items-center gap-3 rounded-2xl border border-[#e8dfd4] bg-white p-2.5 px-3.5 shadow-2xs">
            <div className="grid size-8 place-items-center rounded-xl bg-[#faf3ea] text-[#8b5a2b]">
              <UserPlus className="size-4" />
            </div>
            <div className="text-xs">
              <p className="font-bold text-[#2c221e]">New Signups</p>
              <p className="text-[11px] text-[#74798a]">
                <strong className="text-[#8b5a2b]">{stats.signups7d}</strong> in last 7d · <strong className="text-[#8b5a2b]">{stats.signups30d}</strong> in 30d
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Platform Overview Metrics Grid */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map(({ Icon, label, value, note }) => (
          <div
            key={label}
            className="rounded-2xl border border-[#e8dfd4] bg-white p-5 shadow-xs hover:border-[#8b5a2b]/30 transition-all"
          >
            <div className="mb-4 grid size-10 place-items-center rounded-xl bg-[#faf3ea] text-[#8b5a2b]">
              <Icon className="size-5" />
            </div>
            <p className="text-xs font-medium text-[#85899a]">{label}</p>
            <p className="mt-1 text-2xl font-bold text-[#2c221e]">{value}</p>
            <p className="mt-1 text-[11px] text-[#74798a]">{note}</p>
          </div>
        ))}
      </section>
    </div>
  )
}
