import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft, ShieldCheck, Activity } from 'lucide-react'
import { getPlatformCounts, requireSuperAdmin } from '@/lib/supabase/server'
import { AdminCustomerControls } from '@/components/admin/AdminCustomerControls'
import { AdminLiveOverview } from '@/components/admin/AdminLiveOverview'
import { AdminSignOutButton } from '@/components/admin/AdminSignOutButton'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const current = await requireSuperAdmin()
  if (!current || !current.user) {
    redirect('/console?error=unauthenticated')
  }

  // Requirement 7: Forced first-login password change & MFA setup
  // Only redirect if explicitly flagged as requiring password change
  if (current.profile?.must_change_password === true) {
    redirect('/admin/setup-security')
  }

  const { profiles, audit, properties, tenants, subscriptions, payments, rooms, beds } = await getPlatformCounts()

  const owners = profiles.filter((profile: any) => profile.role === 'pg_owner')
  const activeOwners = owners.filter((profile: any) => profile.status === 'active')
  const suspendedOwners = owners.filter((profile: any) => profile.status === 'suspended')

  // Calculate platform totals
  const totalRevenue = payments.reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0)
  const activeTenants = tenants.filter((t: any) => t.status !== 'Vacated')

  // Signups calculation
  const sevenDaysAgo = Date.now() - 7 * 86400000
  const thirtyDaysAgo = Date.now() - 30 * 86400000
  const signups7d = owners.filter((o: any) => new Date(o.created_at).getTime() >= sevenDaysAgo).length
  const signups30d = owners.filter((o: any) => new Date(o.created_at).getTime() >= thirtyDaysAgo).length

  // Map properties and subscriptions to owners as plain objects for client component
  const propertiesByOwner: Record<string, any[]> = {}
  const propertyByOwner: Record<string, any> = {}
  for (const p of properties) {
    if (!propertiesByOwner[p.owner_id]) propertiesByOwner[p.owner_id] = []
    propertiesByOwner[p.owner_id].push(p)
    if (!propertyByOwner[p.owner_id]) propertyByOwner[p.owner_id] = p
  }

  const roomsCountByOwner: Record<string, number> = {}
  for (const r of rooms) {
    roomsCountByOwner[r.owner_id] = (roomsCountByOwner[r.owner_id] || 0) + 1
  }

  const bedsCountByOwner: Record<string, number> = {}
  for (const b of beds) {
    bedsCountByOwner[b.owner_id] = (bedsCountByOwner[b.owner_id] || 0) + 1
  }

  const tenantsCountByOwner: Record<string, number> = {}
  for (const t of tenants) {
    if (t.status !== 'Vacated') {
      tenantsCountByOwner[t.owner_id] = (tenantsCountByOwner[t.owner_id] || 0) + 1
    }
  }

  const revenueByOwner: Record<string, number> = {}
  for (const p of payments) {
    revenueByOwner[p.owner_id] = (revenueByOwner[p.owner_id] || 0) + Number(p.amount || 0)
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
    } else if (s.status === 'expired') {
      expiredSubCount++
    }
  }

  const occupancyRate = beds.length > 0 ? Math.round((activeTenants.length / beds.length) * 100) : 0

  const initialStats = {
    ownersCount: owners.length,
    activeOwnersCount: activeOwners.length,
    suspendedOwnersCount: suspendedOwners.length,
    propertiesCount: properties.length,
    roomsCount: rooms.length,
    bedsCount: beds.length,
    tenantsCount: tenants.length,
    activeTenantsCount: activeTenants.length,
    occupancyRate,
    trialingCount,
    activeSubCount,
    expiredSubCount,
    totalRevenue,
    paymentsCount: payments.length,
    signups7d,
    signups30d,
  }

  return (
    <main className="min-h-screen bg-[#faf8f5] text-[#2c221e]">
      <header className="border-b border-[#e8dfd4] bg-white sticky top-0 z-30">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-[#8b5a2b] text-white shadow-xs">
              <ShieldCheck className="size-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-[#2c221e]">StayBook Platform</p>
              <p className="text-[11px] text-[#85899a]">Super Admin Console · {current.user.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="flex items-center gap-2 rounded-xl border border-[#e8dfd4] bg-white px-3.5 py-2 text-xs font-semibold text-[#676b7d] hover:bg-[#faf7f2] transition-colors"
            >
              Owner Dashboard
            </Link>
            <Link
              href="/"
              className="flex items-center gap-1.5 text-xs font-semibold text-[#8b5a2b] hover:underline"
            >
              <ArrowLeft className="size-4" />
              Public Home
            </Link>
            <AdminSignOutButton />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-8">
        {/* Real-time Dynamic Platform Overview with Polling & Live Database Refresh */}
        <AdminLiveOverview initialStats={initialStats} />

        <div className="mt-8 grid gap-6 xl:grid-cols-[1.55fr_1fr]">
          {/* Customer Accounts Management (Client Component with Search, Plans, Inventory, Deletion, and CSV Export) */}
          <section className="space-y-4">
            <AdminCustomerControls
              owners={owners}
              propertiesByOwner={propertiesByOwner}
              propertyByOwner={propertyByOwner}
              roomsCountByOwner={roomsCountByOwner}
              bedsCountByOwner={bedsCountByOwner}
              tenantsCountByOwner={tenantsCountByOwner}
              revenueByOwner={revenueByOwner}
              subscriptionByOwner={subscriptionByOwner}
              auditLogs={audit}
            />
          </section>

          {/* Privileged Platform Audit Logs */}
          <section className="rounded-2xl border border-[#e8dfd4] bg-white shadow-xs self-start">
            <div className="border-b border-[#eee6dc] px-6 py-4">
              <div className="flex items-center gap-2">
                <Activity className="size-4 text-[#8b5a2b]" />
                <h2 className="text-base font-bold text-[#2c221e]">Privileged Audit Logs & Events</h2>
              </div>
              <p className="mt-0.5 text-xs text-[#85899a]">
                Immutable server audit record of administrative events, soft-deletes, restores, and security actions.
              </p>
            </div>
            {audit.length === 0 ? (
              <div className="grid min-h-56 place-items-center px-6 text-center">
                <p className="text-sm font-semibold text-[#2c221e]">No audit records yet</p>
                <p className="mt-1 text-xs text-[#85899a]">
                  Platform administrative actions will appear here automatically.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-[#f0ede6] max-h-[600px] overflow-y-auto">
                {audit.map((entry: any) => (
                  <div key={entry.id} className="px-6 py-3.5 hover:bg-[#faf8f5] transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-xs text-[#2c221e]">
                        {entry.action.replaceAll('_', ' ').toUpperCase()}
                      </span>
                      <span className="text-[10px] text-[#85899a]">
                        {new Date(entry.created_at).toLocaleString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-[#74798a]">
                      Target: <span className="font-mono text-[#8b5a2b] font-semibold">{entry.target_type}</span>
                      {entry.target_id && (
                        <span className="ml-1 text-[10px] text-[#a4a7b2]">({entry.target_id.slice(0, 8)}...)</span>
                      )}
                    </p>
                    {entry.metadata && Object.keys(entry.metadata).length > 0 && (
                      <p className="mt-1 font-mono text-[10px] text-[#85899a] truncate bg-[#faf7f2] p-1.5 rounded-lg border border-[#eee6dc]">
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
