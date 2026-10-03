import { NextResponse } from 'next/server'
import { getPlatformCounts, requireSuperAdmin } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  try {
    const current = await requireSuperAdmin()
    if (!current || !current.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Super Admin credentials required.' },
        { status: 403, headers: { 'Cache-Control': 'no-store' } }
      )
    }

    const { profiles, audit, properties, tenants, subscriptions, payments, rooms, beds } =
      await getPlatformCounts()

    const owners = profiles.filter((profile: any) => profile.role === 'pg_owner')
    const activeOwners = owners.filter((profile: any) => profile.status === 'active')
    const suspendedOwners = owners.filter((profile: any) => profile.status === 'suspended')

    const totalRevenue = payments.reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0)
    const activeTenants = tenants.filter((t: any) => t.status !== 'Vacated')

    const sevenDaysAgo = Date.now() - 7 * 86400000
    const thirtyDaysAgo = Date.now() - 30 * 86400000
    const signups7d = owners.filter((o: any) => new Date(o.created_at).getTime() >= sevenDaysAgo).length
    const signups30d = owners.filter((o: any) => new Date(o.created_at).getTime() >= thirtyDaysAgo).length

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

    return NextResponse.json(
      {
        success: true,
        timestamp: new Date().toISOString(),
        stats: {
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
        },
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
          Pragma: 'no-cache',
        },
      }
    )
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to fetch platform statistics.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    )
  }
}
