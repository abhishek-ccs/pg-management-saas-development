'use client'

import { useState, useMemo } from 'react'
import {
  Search,
  Download,
  Trash2,
  Calendar,
  CreditCard,
  ShieldAlert,
  Loader2,
  X,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react'
import {
  toggleCustomerStatus,
  grantTrialExtension,
  changeCustomerPlan,
  deleteCustomerAccount,
} from '@/app/admin/actions'

interface AdminCustomerControlsProps {
  owners: any[]
  propertyByOwner: Record<string, any>
  tenantsCountByOwner: Record<string, number>
  subscriptionByOwner: Record<string, any>
  auditLogs: any[]
}

export function AdminCustomerControls({
  owners,
  propertyByOwner,
  tenantsCountByOwner,
  subscriptionByOwner,
  auditLogs,
}: AdminCustomerControlsProps) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended'>('all')
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null)
  const [deleteInput, setDeleteInput] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [planModalTarget, setPlanModalTarget] = useState<any | null>(null)
  const [selectedPlan, setSelectedPlan] = useState<'trial' | 'monthly' | 'yearly'>('monthly')

  // Filtered owners
  const filteredOwners = useMemo(() => {
    return owners.filter((owner) => {
      const matchesSearch =
        !search ||
        owner.email?.toLowerCase().includes(search.toLowerCase()) ||
        owner.full_name?.toLowerCase().includes(search.toLowerCase())
      const matchesStatus =
        statusFilter === 'all' || owner.status === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [owners, search, statusFilter])

  // CSV Export for Privileged Audit Logs
  const handleExportAuditCSV = () => {
    if (!auditLogs.length) return
    const headers = ['ID', 'Timestamp', 'Action', 'Target Type', 'Target ID', 'Actor ID', 'Metadata']
    const rows = auditLogs.map((log) => [
      log.id,
      log.created_at,
      log.action,
      log.target_type,
      log.target_id || '',
      log.actor_id || '',
      JSON.stringify(log.metadata || {}).replace(/"/g, '""'),
    ])

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => `"${e.join('","')}"`)].join('\n')

    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `staybook-audit-logs-${new Date().toISOString().split('T')[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Handle plan change
  const handleChangePlan = async () => {
    if (!planModalTarget) return
    setLoadingId(planModalTarget.id)
    try {
      await changeCustomerPlan(planModalTarget.id, selectedPlan)
      setPlanModalTarget(null)
    } finally {
      setLoadingId(null)
    }
  }

  // Handle delete
  const handleDeleteCustomer = async () => {
    if (!deleteTarget) return
    setDeleteError('')
    setLoadingId(deleteTarget.id)
    try {
      const res = await deleteCustomerAccount(deleteTarget.id, deleteInput, deleteTarget.email)
      if (!res.success) {
        setDeleteError(res.error || 'Failed to delete customer.')
        return
      }
      setDeleteTarget(null)
      setDeleteInput('')
    } finally {
      setLoadingId(null)
    }
  }

  return (
    <div className="space-y-4">
      {/* Top Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-[#faf7f2] p-3 rounded-2xl border border-[#e8dfd4]">
        <div className="flex items-center gap-2 flex-1 max-w-md bg-white px-3 py-2 rounded-xl border border-[#e8dfd4] text-xs">
          <Search className="size-3.5 text-[#9a7651]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by customer name or email..."
            className="w-full bg-transparent outline-none placeholder:text-[#a0a3b0]"
          />
          {search && (
            <button onClick={() => setSearch('')} className="text-[#a0a3b0] hover:text-[#3d3934]">
              <X className="size-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e: any) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-[#e8dfd4] bg-white px-3 py-2 text-xs font-semibold text-[#555a6c] outline-none"
          >
            <option value="all">All Statuses ({owners.length})</option>
            <option value="active">Active Only</option>
            <option value="suspended">Suspended Only</option>
          </select>

          <button
            onClick={handleExportAuditCSV}
            title="Download audit logs as CSV"
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#9a7651] bg-white px-3 py-2 text-xs font-semibold text-[#866342] shadow-2xs hover:bg-[#fbf8f3]"
          >
            <Download className="size-3.5" />
            Export Audit CSV
          </button>
        </div>
      </div>

      {/* Customer Accounts Table */}
      {filteredOwners.length === 0 ? (
        <div className="grid min-h-48 place-items-center rounded-2xl border border-[#eceff5] bg-white p-6 text-center text-xs text-[#85899a]">
          No matching customer accounts found.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[#e9ebf0] bg-white">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[#eee6dc] bg-[#faf7f2] font-semibold text-[#74798a]">
              <tr>
                <th className="px-5 py-3.5">Customer / Contact</th>
                <th className="px-5 py-3.5">Property</th>
                <th className="px-5 py-3.5">Residents</th>
                <th className="px-5 py-3.5">Plan / Trial</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5 text-right">Admin Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0f1f4]">
              {filteredOwners.map((owner) => {
                const prop = propertyByOwner[owner.id]
                const tenantCount = tenantsCountByOwner[owner.id] || 0
                const sub = subscriptionByOwner[owner.id]

                let trialBadge = sub?.plan ? sub.plan.toUpperCase() : '7-Day Trial'
                let trialClass = 'bg-[#f4ede3] text-[#9a7651]'

                if (sub?.status === 'active') {
                  trialBadge = `${sub.plan === 'yearly' ? 'Yearly' : 'Monthly'} Paid`
                  trialClass = 'bg-[#e7f7f0] text-[#328d68]'
                } else if (sub?.trial_end) {
                  const msLeft = new Date(sub.trial_end).getTime() - Date.now()
                  if (msLeft <= 0) {
                    trialBadge = 'Trial Concluded'
                    trialClass = 'bg-[#ffebe8] text-[#b95c3c]'
                  } else {
                    const days = Math.ceil(msLeft / 86400000)
                    trialBadge = `${days}d trial left`
                    trialClass = days <= 2 ? 'bg-[#fff4e5] text-[#b46b1a]' : 'bg-[#f4ede3] text-[#9a7651]'
                  }
                }

                const isLoading = loadingId === owner.id

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
                        {/* Change Plan Button */}
                        <button
                          onClick={() => {
                            setPlanModalTarget(owner)
                            setSelectedPlan(sub?.plan || 'monthly')
                          }}
                          title="Change subscription plan tier"
                          className="rounded-lg border border-[#e8dfd4] px-2 py-1 text-[11px] font-semibold text-[#555a6c] hover:bg-[#faf7f2]"
                        >
                          Plan
                        </button>

                        {/* Extend Trial */}
                        <button
                          onClick={async () => {
                            setLoadingId(owner.id)
                            try {
                              await grantTrialExtension(owner.id, 7)
                            } finally {
                              setLoadingId(null)
                            }
                          }}
                          disabled={isLoading}
                          title="Extend trial by 7 days"
                          className="rounded-lg border border-[#e8dfd4] px-2 py-1 text-[11px] font-semibold text-[#866342] hover:bg-[#fbf8f3] disabled:opacity-50"
                        >
                          +7d
                        </button>

                        {/* Suspend / Reactivate */}
                        <button
                          onClick={async () => {
                            setLoadingId(owner.id)
                            try {
                              await toggleCustomerStatus(
                                owner.id,
                                owner.status === 'active' ? 'suspended' : 'active'
                              )
                            } finally {
                              setLoadingId(null)
                            }
                          }}
                          disabled={isLoading}
                          className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold disabled:opacity-50 ${
                            owner.status === 'active'
                              ? 'border border-[#ffe0e0] text-[#b95c3c] hover:bg-[#fff5f5]'
                              : 'bg-[#328d68] text-white hover:bg-[#287355]'
                          }`}
                        >
                          {owner.status === 'active' ? 'Suspend' : 'Reactivate'}
                        </button>

                        {/* Delete Customer Button */}
                        <button
                          onClick={() => {
                            setDeleteTarget(owner)
                            setDeleteInput('')
                            setDeleteError('')
                          }}
                          title="Delete customer workspace"
                          className="rounded-lg p-1.5 text-[#b95c3c] hover:bg-[#fff5f5]"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Plan Change Modal */}
      {planModalTarget && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[#202536]/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-3xl border border-[#e8dfd4] bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#eee6dc] pb-3 mb-4">
              <h3 className="font-bold text-sm text-[#3d3934]">Update Customer Plan</h3>
              <button onClick={() => setPlanModalTarget(null)} className="text-[#a0a3b0]">
                <X className="size-4" />
              </button>
            </div>
            <p className="text-xs text-[#74798a]">
              Change subscription tier for <strong className="text-[#3d3934]">{planModalTarget.email}</strong>:
            </p>
            <div className="mt-4 space-y-2">
              {(['trial', 'monthly', 'yearly'] as const).map((tier) => (
                <label
                  key={tier}
                  className={`flex items-center justify-between p-3 rounded-xl border text-xs cursor-pointer ${
                    selectedPlan === tier ? 'border-[#9a7651] bg-[#fbf8f3] font-bold text-[#866342]' : 'border-[#e8dfd4]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="plan_choice"
                      checked={selectedPlan === tier}
                      onChange={() => setSelectedPlan(tier)}
                    />
                    <span className="capitalize">{tier} Plan</span>
                  </div>
                  <span className="text-[11px] text-[#85899a]">
                    {tier === 'trial' ? '₹0 / 7 days' : tier === 'monthly' ? '₹1,699 / mo' : '₹14,999 / yr'}
                  </span>
                </label>
              ))}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setPlanModalTarget(null)}
                className="rounded-xl border border-[#e8dfd4] px-4 py-2 text-xs font-semibold text-[#555a6c]"
              >
                Cancel
              </button>
              <button
                onClick={handleChangePlan}
                disabled={loadingId === planModalTarget.id}
                className="rounded-xl bg-[#9a7651] px-4 py-2 text-xs font-semibold text-white hover:bg-[#866342]"
              >
                Save Plan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Customer Confirmation Modal (Typed Phrase) */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[#202536]/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-3xl border border-[#ffe0e0] bg-white p-6 shadow-2xl">
            <div className="flex items-center gap-2 text-[#b95c3c] mb-3">
              <AlertTriangle className="size-5" />
              <h3 className="font-bold text-sm">Delete Customer Account</h3>
            </div>
            <p className="text-xs text-[#74798a] leading-5">
              This action is permanent and irreversible. All properties, rooms, beds, tenants, and payment ledgers associated with{' '}
              <strong className="text-[#3d3934]">{deleteTarget.email}</strong> will be permanently purged.
            </p>

            <div className="mt-4 rounded-xl border border-[#ffe0e0] bg-[#fffbfb] p-3 text-xs text-[#b95c3c]">
              To confirm, type <strong className="font-mono">delete {deleteTarget.email}</strong> below:
            </div>

            <input
              type="text"
              value={deleteInput}
              onChange={(e) => setDeleteInput(e.target.value)}
              placeholder={`delete ${deleteTarget.email}`}
              className="mt-3 w-full rounded-xl border border-[#e8dfd4] px-3.5 py-2.5 text-xs outline-none focus:border-[#b95c3c]"
            />

            {deleteError && (
              <p className="mt-2 text-xs text-[#dc2626] font-semibold">{deleteError}</p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="rounded-xl border border-[#e8dfd4] px-4 py-2 text-xs font-semibold text-[#555a6c]"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteCustomer}
                disabled={
                  deleteInput.trim().toLowerCase() !== `delete ${deleteTarget.email.toLowerCase()}` ||
                  loadingId === deleteTarget.id
                }
                className="rounded-xl bg-[#b95c3c] px-4 py-2 text-xs font-semibold text-white disabled:opacity-40 hover:bg-[#a04e32]"
              >
                {loadingId === deleteTarget.id ? 'Deleting...' : 'Permanently Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
