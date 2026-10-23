
import { redirect } from 'next/navigation'
import {
  getTenantSession,
  clearTenantSessionCookie,
} from '@/lib/tenant-access'
import PortalView from './PortalView'
import { Building2 } from 'lucide-react'

export const dynamic = 'force-dynamic'

interface PortalPageProps {
  searchParams: Promise<{ token?: string }>
}

export default async function TenantPortalPage({
  searchParams,
}: PortalPageProps) {
  const params = await searchParams
  const rawToken = params?.token?.trim()

  // Exchange the access link through the Route Handler.
  if (rawToken) {
    redirect(
      `/api/tenant-portal?token=${encodeURIComponent(rawToken)}`
    )
  }

  const session = await getTenantSession()

  if (!session) {
    return (
      <div className="min-h-screen bg-[#faf7f2] flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md rounded-3xl border border-[#ebe4da] bg-white p-8 text-center shadow-sm">
          <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#faf7f2] border border-[#e8dfd4] text-[#8b5a2b]">
            <Building2 className="size-6" />
          </div>
          <h2 className="mt-4 text-lg font-bold text-[#2c221e]">
            Resident Self-Service Portal
          </h2>
          <p className="mt-2 text-xs leading-relaxed text-[#676b7d]">
            To access your rent bills, payment receipts, and electricity calculations, please open the private link provided by your property manager.
          </p>
          <div className="mt-6 border-t border-[#f0ebe3] pt-4 text-[11px] text-[#85899a]">
            Protected by BaseraBook cryptographic link authorization
          </div>
        </div>
      </div>
    )
  }

  async function handleLogout() {
    'use server'
    await clearTenantSessionCookie()
    redirect('/portal')
  }

  return <PortalView onLogout={handleLogout} />
}
