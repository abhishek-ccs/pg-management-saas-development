'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { LogOut, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export function AdminSignOutButton() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)

  async function handleSignOut() {
    if (loading) return
    setLoading(true)

    try {
      await supabase.auth.signOut()
      // Force navigation to discreet console with explicit logout parameter to invalidate local and server state
      window.location.href = '/console?logout=true'
    } catch {
      window.location.href = '/console?logout=true'
    }
  }

  return (
    <button
      onClick={handleSignOut}
      disabled={loading}
      title="Sign out of Super Admin Console"
      className="flex items-center gap-1.5 rounded-xl border border-[#e8dfd4] bg-white px-3.5 py-2 text-xs font-semibold text-[#8b3d31] hover:bg-[#ffebe8] hover:border-[#ffc9c1] active:scale-[0.98] transition-all disabled:opacity-60 shadow-2xs"
    >
      {loading ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <LogOut className="size-3.5" />
      )}
      <span>Sign Out</span>
    </button>
  )
}
