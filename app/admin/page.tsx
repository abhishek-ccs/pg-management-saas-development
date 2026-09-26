import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Activity, ArrowLeft, Building2, CreditCard, ShieldCheck, Users, Wallet, type LucideIcon } from 'lucide-react'
import { getPlatformCounts, requireSuperAdmin } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

interface AdminMetric {
  Icon: LucideIcon
  label: string
  value: string | number
  note: string
}

export default async function AdminPage() {
  const current = await requireSuperAdmin()
  if (!current) redirect('/admin/login')
  const { profiles, audit } = await getPlatformCounts()
  const owners = profiles.filter((profile) => profile.role === 'pg_owner')
  const active = owners.filter((profile) => profile.status === 'active')
  const suspended = owners.filter((profile) => profile.status === 'suspended')

  const metrics: AdminMetric[] = [
    { Icon: Users, label: 'Customers', value: owners.length, note: 'Registered PG owners' },
    { Icon: Building2, label: 'Active PGs', value: active.length, note: 'Active customer accounts' },
    { Icon: CreditCard, label: 'Subscriptions', value: 0, note: 'No billing records yet' },
    { Icon: Wallet, label: 'Platform revenue', value: '₹0', note: 'No revenue records yet' },
  ]

  return (
    <main className="min-h-screen bg-[#f8f9fc] text-[#202536]">
      <header className="border-b border-[#e8eaf0] bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-[#5e5bd8] text-white">
              <ShieldCheck className="size-5" />
            </div>
            <div>
              <p className="text-sm font-bold">StayNest Platform</p>
              <p className="text-[11px] text-[#9296a5]">Super Admin Console</p>
            </div>
          </div>
          <Link href="/" className="flex items-center gap-2 text-xs font-semibold text-[#5e5bd8]">
            <ArrowLeft className="size-4" />
            Back to app
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-8">
          <p className="text-xs font-medium text-[#9296a5]">Platform / Administration</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Good morning, Super Admin</h1>
          <p className="mt-2 text-sm text-[#85899a]">
            Manage customers, subscriptions, and platform activity from one secure place.
          </p>
        </div>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map(({ Icon, label, value, note }) => (
            <div key={label} className="rounded-2xl border border-[#e9ebf0] bg-white p-5">
              <div className="mb-5 grid size-9 place-items-center rounded-xl bg-[#efefff] text-[#625fd1]">
                <Icon className="size-[17px]" />
              </div>
              <p className="text-xs text-[#9296a5]">{label}</p>
              <p className="mt-1 text-2xl font-bold">{value}</p>
              <p className="mt-1 text-[11px] text-[#a4a7b2]">{note}</p>
            </div>
          ))}
        </section>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
          <section className="rounded-2xl border border-[#e9ebf0] bg-white">
            <div className="flex items-center justify-between border-b border-[#eef0f4] px-5 py-4">
              <div>
                <h2 className="text-sm font-bold">Customers</h2>
                <p className="mt-1 text-xs text-[#9296a5]">Real accounts only. No demo data.</p>
              </div>
              <span className="rounded-full bg-[#f5f5f8] px-2.5 py-1 text-[11px] font-semibold text-[#74798a]">
                {suspended.length} suspended
              </span>
            </div>
            {owners.length === 0 ? (
              <div className="grid min-h-48 place-items-center px-6 text-center">
                <Users className="mb-3 size-8 text-[#c7c9d4]" />
                <p className="text-sm font-semibold">No customers yet</p>
                <p className="mt-1 text-xs text-[#9296a5]">New PG owner accounts will appear here after signup.</p>
              </div>
            ) : (
              <div className="divide-y divide-[#f0f1f4]">
                {owners.map((owner) => (
                  <div key={owner.id} className="flex items-center justify-between px-5 py-4">
                    <div>
                      <p className="text-sm font-semibold">{owner.full_name || 'Unnamed customer'}</p>
                      <p className="mt-1 text-xs text-[#9296a5]">
                        {owner.email || 'No email'} · Joined {new Date(owner.created_at).toLocaleDateString('en-IN')}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                        owner.status === 'active'
                          ? 'bg-[#e7f7f0] text-[#328d68]'
                          : 'bg-[#fff0e9] text-[#c46e4d]'
                      }`}
                    >
                      {owner.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-[#e9ebf0] bg-white">
            <div className="border-b border-[#eef0f4] px-5 py-4">
              <div className="flex items-center gap-2">
                <Activity className="size-4 text-[#5e5bd8]" />
                <h2 className="text-sm font-bold">Audit logs</h2>
              </div>
              <p className="mt-1 text-xs text-[#9296a5]">Privileged platform actions.</p>
            </div>
            {audit.length === 0 ? (
              <div className="grid min-h-48 place-items-center px-6 text-center">
                <p className="text-sm font-semibold">No audit activity yet</p>
                <p className="mt-1 text-xs text-[#9296a5]">Admin actions will be recorded here.</p>
              </div>
            ) : (
              <div className="divide-y divide-[#f0f1f4]">
                {audit.map((entry) => (
                  <div key={entry.id} className="px-5 py-4">
                    <p className="text-sm font-semibold">{entry.action.replaceAll('_', ' ')}</p>
                    <p className="mt-1 text-xs text-[#9296a5]">
                      {entry.target_type} · {new Date(entry.created_at).toLocaleString('en-IN')}
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
