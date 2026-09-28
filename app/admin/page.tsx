import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  Activity,
  ArrowLeft,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  DoorOpen,
  PauseCircle,
  PlayCircle,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { getPlatformCounts, requireSuperAdmin } from '@/lib/supabase/server'
import { toggleCustomerStatus, grantTrialExtension } from './actions'

export const dynamic = 'force-dynamic'

interface AdminMetric {
  Icon: LucideIcon
  label: string
  value: string | number
  note: string
}

export default async function AdminPage() {
  const current = await requireSuperAdmin()
  if (!current || !current.user) redirect('/admin/login')

  const { profiles, audit, properties, tenants, subscriptions, payments } = await getPlatformCounts()

  const owners = profiles.filter((profile) => profile.role === 'pg_owner')
  const activeOwners = owners.filter((profile) => profile.status === 'active')
  const suspendedOwners = owners.filter((profile) => profile.status === 'suspended')

  // Calculate platform totals
  const totalRevenue = payments.reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0)
  const activeTenants = tenants.filter((t: any) => t.status !== 'Vacated')

  // Map properties and subscriptions to owners
  const propertyByOwner = new Map(properties.map((p: any) => [p.owner_id, p]))
  const tenantsCountByOwner = new Map<string, number>()
  for (const t of tenants) {
    if (t.status !== 'Vacated') {
      tenantsCountByOwner.set(t.owner_id, (tenantsCountByOwner.get(t.owner_id) || 0) + 1)
    }
  }

  const subscriptionByOwner = new Map(subscriptions.map((s: any) => [s.owner_id, s]))

  // Active / trialing / expired subscriptions breakdown
  let trialingCount = 0
  let activeSubCount = 0
  let expiredSubCount = 0

  for (const s of subscriptions) {
    if (s.status === 'active') {
      activeSubCount++
    } else if (s.trial_end) {
      const remainingMs = new Date(s.trial_end).getTime() - Date.now()
      if (remainingMs > 0) {
        trialingCount++
      } else {
        expiredSubCount++
      }
    }
  }

  const metrics: AdminMetric[] = [
    {
      Icon: Users,
      label: 'PG Owners',
      value: owners.length,
      note: `${activeOwners.length} active · ${suspendedOwners.length} suspended`,
    },
    {
      Icon: Building2,
      label: 'Configured Properties',
      value: properties.length,
      note: 'Total properties onboarded',
    },
    {
      Icon: DoorOpen,
      label: 'Platform Tenants',
      value: activeTenants.length,
      note: 'Total active residents',
    },
    {
      Icon: CreditCard,
      label: 'Subscriptions',
      value: `${trialingCount} Trial / ${activeSubCount} Paid`,
      note: `${expiredSubCount} expired trials`,
    },
  ]

  return (
    <main className="min-h-screen bg-[#f8f9fc] text-[#202536]">
      <header className="border-b border-[#e8eaf0] bg-white sticky top-0 z-30">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-[#5e5bd8] text-white">
              <ShieldCheck className="size-5" />
            </div>
            <div>
              <p className="text-sm font-bold">StayNest Platform</p>
              <p className="text-[11px] text-[#9296a5]">Super Admin Console · {current.user.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="flex items-center gap-2 rounded-xl border border-[#e8eaf0] bg-white px-3.5 py-2 text-xs font-semibold text-[#555a6c] hover:bg-[#f4f5f8]"
            >
              Owner Dashboard
            </Link>
            <Link
              href="/"
              className="flex items-center gap-1.5 text-xs font-semibold text-[#5e5bd8] hover:underline"
            >
              <ArrowLeft className="size-4" />
              Public Home
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-8">
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-[#efefff] px-2.5 py-1 text-[11px] font-bold text-[#5e5bd8]">
              PLATFORM OVERSIGHT
            </span>
          </div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">Super Admin Platform Overview</h1>
          <p className="mt-1 text-sm text-[#85899a]">
            Real-time multi-tenant monitoring, property owner accounts, trial governance, and audit trails.
          </p>
        </div>

        {/* Platform Overview Metrics */}
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map(({ Icon, label, value, note }) => (
            <div key={label} className="rounded-2xl border border-[#e9ebf0] bg-white p-5 shadow-xs">
              <div className="mb-4 grid size-10 place-items-center rounded-xl bg-[#efefff] text-[#625fd1]">
                <Icon className="size-5" />
              </div>
              <p className="text-xs font-medium text-[#9296a5]">{label}</p>
              <p className="mt-1 text-2xl font-bold text-[#202536]">{value}</p>
              <p className="mt-1 text-[11px] text-[#a4a7b2]">{note}</p>
            </div>
          ))}
        </section>

        <div className="mt-7 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
          {/* Customers / Property Owners Table */}
          <section className="rounded-2xl border border-[#e9ebf0] bg-white shadow-xs">
            <div className="flex items-center justify-between border-b border-[#eef0f4] px-6 py-4">
              <div>
                <h2 className="text-base font-bold">Property Owners & Customers</h2>
                <p className="mt-0.5 text-xs text-[#9296a5]">
                  Isolated customer accounts, subscription health, and administrative controls.
                </p>
              </div>
              <span className="rounded-full bg-[#f5f5f8] px-3 py-1 text-xs font-semibold text-[#74798a]">
                {owners.length} total customer{owners.length === 1 ? '' : 's'}
              </span>
            </div>

            {owners.length === 0 ? (
              <div className="grid min-h-56 place-items-center px-6 text-center">
                <Users className="mb-3 size-10 text-[#c7c9d4]" />
                <p className="text-sm font-semibold">No customer accounts registered yet</p>
                <p className="mt-1 text-xs text-[#9296a5]">
                  New PG owner accounts will appear here automatically after signup.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-[#eee6dc] bg-[#faf7f2] font-semibold text-[#74798a]">
                    <tr>
                      <th className="px-5 py-3.5">Customer / Contact</th>
                      <th className="px-5 py-3.5">Property</th>
                      <th className="px-5 py-3.5">Tenants</th>
                      <th className="px-5 py-3.5">Trial / Subscription</th>
                      <th className="px-5 py-3.5">Status</th>
                      <th className="px-5 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f0f1f4]">
                    {owners.map((owner) => {
                      const prop = propertyByOwner.get(owner.id)
                      const tenantCount = tenantsCountByOwner.get(owner.id) || 0
                      const sub = subscriptionByOwner.get(owner.id)

                      let trialBadge = '7-Day Trial'
                      let trialClass = 'bg-[#f4ede3] text-[#9a7651]'

                      if (sub?.status === 'active') {
                        trialBadge = 'Active Paid'
                        trialClass = 'bg-[#e7f7f0] text-[#328d68]'
                      } else if (sub?.trial_end) {
                        const msLeft = new Date(sub.trial_end).getTime() - Date.now()
                        if (msLeft <= 0) {
                          trialBadge = 'Trial Expired'
                          trialClass = 'bg-[#ffebe8] text-[#b95c3c]'
                        } else {
                          const days = Math.ceil(msLeft / 86400000)
                          trialBadge = `${days}d trial left`
                          trialClass = days <= 2 ? 'bg-[#fff4e5] text-[#b46b1a]' : 'bg-[#f4ede3] text-[#9a7651]'
                        }
                      }

                      return (
                        <tr key={owner.id} className="hover:bg-[#fafafc]">
                          <td className="px-5 py-4">
                            <p className="font-bold text-[#202536]">{owner.full_name || 'PG Owner'}</p>
                            <p className="mt-0.5 text-[11px] text-[#85899a]">{owner.email}</p>
                          </td>
                          <td className="px-5 py-4">
                            {prop ? (
                              <div>
                                <p className="font-semibold text-[#44485a]">{prop.name}</p>
                                <p className="text-[11px] text-[#969baa]">{prop.city || 'Location unconfigured'}</p>
                              </div>
                            ) : (
                              <span className="text-[#a0a3af] italic">Setup Pending</span>
                            )}
                          </td>
                          <td className="px-5 py-4 font-semibold text-[#555a6c]">
                            {tenantCount} resident{tenantCount === 1 ? '' : 's'}
                          </td>
                          <td className="px-5 py-4">
                            <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${trialClass}`}>
                              {trialBadge}
                            </span>
                          </td>
                          <td className="px-5 py-4">
                            <span
                              className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
                                owner.status === 'active'
                                  ? 'bg-[#e7f7f0] text-[#328d68]'
                                  : 'bg-[#fff0e9] text-[#b95c3c]'
                              }`}
                            >
                              {owner.status.toUpperCase()}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Extend Trial */}
                              <form
                                action={async () => {
                                  'use server'
                                  await grantTrialExtension(owner.id, 7)
                                }}
                              >
                                <button
                                  type="submit"
                                  title="Extend trial by 7 days"
                                  className="rounded-lg border border-[#e8dfd4] px-2.5 py-1 text-[11px] font-semibold text-[#866342] hover:bg-[#fbf8f3]"
                                >
                                  +7d Trial
                                </button>
                              </form>

                              {/* Toggle Suspend / Reactivate */}
                              <form
                                action={async () => {
                                  'use server'
                                  await toggleCustomerStatus(
                                    owner.id,
                                    owner.status === 'active' ? 'suspended' : 'active'
                                  )
                                }}
                              >
                                <button
                                  type="submit"
                                  className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold ${
                                    owner.status === 'active'
                                      ? 'border border-[#ffe0e0] text-[#b95c3c] hover:bg-[#fff5f5]'
                                      : 'bg-[#328d68] text-white hover:bg-[#287355]'
                                  }`}
                                >
                                  {owner.status === 'active' ? 'Suspend' : 'Reactivate'}
                                </button>
                              </form>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Audit Logs */}
          <section className="rounded-2xl border border-[#e9ebf0] bg-white shadow-xs">
            <div className="border-b border-[#eef0f4] px-6 py-4">
              <div className="flex items-center gap-2">
                <Activity className="size-4 text-[#5e5bd8]" />
                <h2 className="text-base font-bold">Privileged Audit Logs</h2>
              </div>
              <p className="mt-0.5 text-xs text-[#9296a5]">
                Immutable server audit record of platform events and security actions.
              </p>
            </div>
            {audit.length === 0 ? (
              <div className="grid min-h-56 place-items-center px-6 text-center">
                <p className="text-sm font-semibold">No audit records yet</p>
                <p className="mt-1 text-xs text-[#9296a5]">
                  Platform administrative actions will appear here automatically.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-[#f0f1f4] max-h-[500px] overflow-y-auto">
                {audit.map((entry: any) => (
                  <div key={entry.id} className="px-6 py-3.5 hover:bg-[#fafafc]">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-xs text-[#3d3934]">
                        {entry.action.replaceAll('_', ' ')}
                      </span>
                      <span className="text-[10px] text-[#9296a5]">
                        {new Date(entry.created_at).toLocaleString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-[#74798a]">
                      Target: <span className="font-mono">{entry.target_type}</span>
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  )
}
