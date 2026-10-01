import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  Activity,
  ArrowLeft,
  Building2,
  CreditCard,
  DoorOpen,
  ShieldCheck,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { getPlatformCounts, requireSuperAdmin } from '@/lib/supabase/server'
import { AdminCustomerControls } from '@/components/admin/AdminCustomerControls'

export const dynamic = 'force-dynamic'

interface AdminMetric {
  Icon: LucideIcon
  label: string
  value: string | number
  note: string
}

export default async function AdminPage() {
  const current = await requireSuperAdmin()
  if (!current || !current.user) {
    redirect('/admin/login?error=unauthenticated')
  }

  // Requirement 7: Forced first-login password change & MFA setup
  // Only redirect if explicitly flagged as requiring password change
  if (current.profile?.must_change_password === true) {
    redirect('/admin/setup-security')
  }

  const { profiles, audit, properties, tenants, subscriptions, payments } = await getPlatformCounts()

  const owners = profiles.filter((profile) => profile.role === 'pg_owner')
  const activeOwners = owners.filter((profile) => profile.status === 'active')
  const suspendedOwners = owners.filter((profile) => profile.status === 'suspended')

  // Calculate platform totals
  const totalRevenue = payments.reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0)
  const activeTenants = tenants.filter((t: any) => t.status !== 'Vacated')

  // Map properties and subscriptions to owners as plain objects for client component
  const propertyByOwner: Record<string, any> = {}
  for (const p of properties) {
    propertyByOwner[p.owner_id] = p
  }

  const tenantsCountByOwner: Record<string, number> = {}
  for (const t of tenants) {
    if (t.status !== 'Vacated') {
      tenantsCountByOwner[t.owner_id] = (tenantsCountByOwner[t.owner_id] || 0) + 1
    }
  }

  const subscriptionByOwner: Record<string, any> = {}
  for (const s of subscriptions) {
    subscriptionByOwner[s.owner_id] = s
  }

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
      label: 'Platform Residents',
      value: activeTenants.length,
      note: 'Total active bed occupants',
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
            <div className="grid size-10 place-items-center rounded-xl bg-[#9a7651] text-white">
              <ShieldCheck className="size-5" />
            </div>
            <div>
              <p className="text-sm font-bold">StayBook Platform</p>
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
              className="flex items-center gap-1.5 text-xs font-semibold text-[#9a7651] hover:underline"
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
            <span className="rounded-md bg-[#f4ede3] px-2.5 py-1 text-[11px] font-bold text-[#9a7651]">
              PLATFORM GOVERNANCE
            </span>
          </div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">Super Admin Platform Overview</h1>
          <p className="mt-1 text-sm text-[#85899a]">
            Live multi-tenant monitoring, customer management, plan overrides, and cryptographic audit logs.
          </p>
        </div>

        {/* Platform Overview Metrics */}
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map(({ Icon, label, value, note }) => (
            <div key={label} className="rounded-2xl border border-[#e9ebf0] bg-white p-5 shadow-xs">
              <div className="mb-4 grid size-10 place-items-center rounded-xl bg-[#faf7f2] text-[#9a7651]">
                <Icon className="size-5" />
              </div>
              <p className="text-xs font-medium text-[#9296a5]">{label}</p>
              <p className="mt-1 text-2xl font-bold text-[#202536]">{value}</p>
              <p className="mt-1 text-[11px] text-[#a4a7b2]">{note}</p>
            </div>
          ))}
        </section>

        <div className="mt-7 grid gap-6 xl:grid-cols-[1.55fr_1fr]">
          {/* Customer Accounts Management (Client Component with Search, Plans, Deletion, and CSV Export) */}
          <section className="space-y-4">
            <AdminCustomerControls
              owners={owners}
              propertyByOwner={propertyByOwner}
              tenantsCountByOwner={tenantsCountByOwner}
              subscriptionByOwner={subscriptionByOwner}
              auditLogs={audit}
            />
          </section>

          {/* Privileged Platform Audit Logs */}
          <section className="rounded-2xl border border-[#e9ebf0] bg-white shadow-xs self-start">
            <div className="border-b border-[#eef0f4] px-6 py-4">
              <div className="flex items-center gap-2">
                <Activity className="size-4 text-[#9a7651]" />
                <h2 className="text-base font-bold">Privileged Audit Logs</h2>
              </div>
              <p className="mt-0.5 text-xs text-[#9296a5]">
                Immutable server audit record of administrative events and security actions.
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
              <div className="divide-y divide-[#f0f1f4] max-h-[600px] overflow-y-auto">
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
                      Target: <span className="font-mono text-[#9a7651]">{entry.target_type}</span>
                      {entry.target_id && (
                        <span className="ml-1 text-[10px] text-[#a0a3af]">({entry.target_id.slice(0, 8)}...)</span>
                      )}
                    </p>
                    {entry.metadata && Object.keys(entry.metadata).length > 0 && (
                      <p className="mt-1 font-mono text-[10px] text-[#85899a] truncate">
                        {JSON.stringify(entry.metadata)}
                      </p>
                    )}
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
