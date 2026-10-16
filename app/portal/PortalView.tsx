'use client'

import React, { useEffect, useState } from 'react'
import {
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  AlertTriangle,
  Zap,
  Receipt,
  ShieldCheck,
  Phone,
  Printer,
  X,
  Loader2,
  LogOut,
  MapPin,
  DoorOpen,
  BedDouble,
} from 'lucide-react'

interface TenantData {
  tenant: {
    id: string
    name: string
    phone: string
    monthlyRent: number
    securityDeposit: number
    joiningDate: string
    rentDueDay: number
    status: 'Paid' | 'Pending' | 'Overdue' | 'Vacated'
  }
  property: {
    name: string
    address: string
    city: string
    contactNumber: string
  }
  roomNumber: string
  bedNumber: string
  payments: Array<{
    id: string
    receiptNumber: string
    amount: number
    paymentMethod: string
    paymentType: string
    monthCovered: string
    notes: string
    paidAt: string
  }>
  electricity: Array<{
    id: string
    previousReading: number
    currentReading: number
    ratePerUnit: number
    units: number
    totalAmount: number
    readingDate: string
  }>
  settlement?: {
    id: string
    original_deposit: number
    unpaid_rent: number
    unpaid_electricity: number
    total_deductions: number
    net_refund_amount: number
    balance_due_by_tenant: number
    move_out_date: string
    deductions: Array<{
      id: string
      category: string
      reason: string
      amount: number
    }>
  } | null
}

const currency = (val: number) => `₹${Number(val || 0).toLocaleString('en-IN')}`

export default function PortalView({ onLogout }: { onLogout: () => Promise<void> }) {
  const [data, setData] = useState<TenantData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedReceipt, setSelectedReceipt] = useState<any | null>(null)
  const [isReceiptLoading, setIsReceiptLoading] = useState(false)

  useEffect(() => {
    async function loadPortalData() {
      try {
        const res = await fetch('/api/portal/data')
        const json = await res.json()
        if (!res.ok || !json.success) {
          setError(json.error || 'Failed to load resident details.')
          return
        }
        setData(json.data)
      } catch (err: any) {
        setError(err?.message || 'Network error while loading resident portal.')
      } finally {
        setIsLoading(false)
      }
    }
    loadPortalData()
  }, [])

  async function handleOpenReceipt(paymentId: string) {
    setIsReceiptLoading(true)
    try {
      const res = await fetch(`/api/portal/receipt/${paymentId}`)
      const json = await res.json()
      if (res.ok && json.success) {
        setSelectedReceipt(json.receipt)
      } else {
        alert(json.error || 'Could not load receipt.')
      }
    } catch {
      alert('Network error loading receipt.')
    } finally {
      setIsReceiptLoading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#faf7f2] flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md rounded-3xl border border-[#ebe4da] bg-white p-8 text-center shadow-sm">
          <Loader2 className="mx-auto size-8 animate-spin text-[#8b5a2b]" />
          <h2 className="mt-4 text-base font-bold text-[#2c221e]">Loading Resident Portal...</h2>
          <p className="mt-1 text-xs text-[#85899a]">Verifying session and preparing account ledger.</p>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#faf7f2] flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md rounded-3xl border border-[#ebe4da] bg-white p-8 text-center shadow-sm">
          <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#fff5f5] text-[#b95c3c]">
            <AlertTriangle className="size-6" />
          </div>
          <h2 className="mt-4 text-lg font-bold text-[#2c221e]">Portal Access Expired or Unavailable</h2>
          <p className="mt-2 text-xs leading-relaxed text-[#676b7d]">
            {error || 'This self-service access link is no longer valid. Please contact your property manager for an updated link.'}
          </p>
        </div>
      </div>
    )
  }

  const { tenant, property, roomNumber, bedNumber, payments, electricity, settlement } = data

  return (
    <div className="min-h-screen bg-[#faf7f2] text-[#2c221e] antialiased selection:bg-[#8b5a2b]/20">
      {/* Top Navbar */}
      <header className="sticky top-0 z-30 border-b border-[#ebe4da] bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-xl bg-[#8b5a2b] text-white shadow-xs">
              <Building2 className="size-5" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight text-[#2c221e]">{property.name}</h1>
              <p className="text-[11px] text-[#85899a]">Resident Self-Service Portal</p>
            </div>
          </div>
          <button
            onClick={onLogout}
            title="Exit Session"
            className="flex items-center gap-1.5 rounded-xl border border-[#ebe4da] bg-white px-3 py-1.5 text-xs font-semibold text-[#676b7d] hover:bg-[#faf7f2] hover:text-[#2c221e] transition-colors"
          >
            <LogOut className="size-3.5" />
            <span className="hidden sm:inline">Exit</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 flex flex-col gap-5">
        {/* Resident Profile Card */}
        <div className="rounded-3xl border border-[#ebe4da] bg-white p-5 sm:p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#faf7f2] border border-[#e8dfd4] px-2.5 py-1 text-[11px] font-semibold text-[#8b5a2b]">
                <ShieldCheck className="size-3.5" /> Verified Resident
              </span>
              <h2 className="mt-2 text-xl font-bold tracking-tight text-[#2c221e]">{tenant.name}</h2>
              <div className="mt-2 flex flex-wrap items-center gap-y-1 gap-x-4 text-xs text-[#676b7d]">
                <span className="inline-flex items-center gap-1">
                  <DoorOpen className="size-3.5 text-[#8b5a2b]" /> Room {roomNumber}
                </span>
                <span className="inline-flex items-center gap-1">
                  <BedDouble className="size-3.5 text-[#8b5a2b]" /> Bed {bedNumber}
                </span>
                {property.city && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="size-3.5 text-[#8b5a2b]" /> {property.city}
                  </span>
                )}
              </div>
            </div>

            {/* Rent Status Badge */}
            <div className="flex flex-col sm:items-end">
              <span className="text-[11px] font-medium text-[#85899a]">Rent Status</span>
              <div className="mt-1">
                {tenant.status === 'Paid' && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f0fbf5] border border-[#a3e4be] px-3 py-1 text-xs font-bold text-[#236b4e]">
                    <CheckCircle2 className="size-3.5" /> Paid On Time
                  </span>
                )}
                {tenant.status === 'Pending' && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fef9ee] border border-[#fbd38d] px-3 py-1 text-xs font-bold text-[#b7791f]">
                    <Clock className="size-3.5" /> Due on the {tenant.rentDueDay}th
                  </span>
                )}
                {tenant.status === 'Overdue' && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fff5f5] border border-[#feb2b2] px-3 py-1 text-xs font-bold text-[#c53030]">
                    <AlertTriangle className="size-3.5" /> Rent Overdue
                  </span>
                )}
                {tenant.status === 'Vacated' && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f4f5f7] border border-[#d2d6dc] px-3 py-1 text-xs font-bold text-[#4b5563]">
                    Vacated
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 border-t border-[#f0ebe3] pt-4 text-xs">
            <div>
              <p className="text-[#85899a]">Monthly Rent</p>
              <p className="mt-0.5 text-base font-bold text-[#2c221e]">{currency(tenant.monthlyRent)}</p>
            </div>
            <div>
              <p className="text-[#85899a]">Security Deposit</p>
              <p className="mt-0.5 text-base font-bold text-[#2c221e]">{currency(tenant.securityDeposit)}</p>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <p className="text-[#85899a]">Move-in Date</p>
              <p className="mt-0.5 text-base font-semibold text-[#676b7d]">
                {new Date(tenant.joiningDate).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </p>
            </div>
          </div>
        </div>

        {/* Move-Out Settlement Section (If completed) */}
        {settlement && (
          <div className="rounded-3xl border border-[#ebe4da] bg-white p-5 sm:p-6 shadow-sm">
            <div className="flex items-center gap-2 border-b border-[#f0ebe3] pb-3">
              <ShieldCheck className="size-5 text-[#8b5a2b]" />
              <h3 className="text-base font-bold text-[#2c221e]">Final Move-Out Deposit Settlement</h3>
            </div>
            <p className="mt-2 text-xs text-[#85899a]">
              Final settlement recorded on{' '}
              {new Date(settlement.move_out_date).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
              .
            </p>

            <div className="mt-4 rounded-2xl bg-[#faf7f2] border border-[#e8dfd4] p-4 text-xs">
              <div className="flex justify-between py-1.5 border-b border-[#ede6dd]">
                <span className="text-[#676b7d]">Original Security Deposit</span>
                <span className="font-bold text-[#2c221e]">{currency(settlement.original_deposit)}</span>
              </div>
              {settlement.unpaid_rent > 0 && (
                <div className="flex justify-between py-1.5 border-b border-[#ede6dd] text-[#b95c3c]">
                  <span>Less: Unpaid Rent Dues</span>
                  <span className="font-semibold">- {currency(settlement.unpaid_rent)}</span>
                </div>
              )}
              {settlement.unpaid_electricity > 0 && (
                <div className="flex justify-between py-1.5 border-b border-[#ede6dd] text-[#b95c3c]">
                  <span>Less: Unpaid Electricity Charges</span>
                  <span className="font-semibold">- {currency(settlement.unpaid_electricity)}</span>
                </div>
              )}
              {settlement.deductions && settlement.deductions.length > 0 && (
                <div className="py-2 border-b border-[#ede6dd]">
                  <p className="font-semibold text-[#676b7d] mb-1">Itemized Deductions:</p>
                  {settlement.deductions.map((d: any) => (
                    <div key={d.id} className="flex justify-between py-1 pl-2 text-[11px] text-[#717585]">
                      <span>• {d.reason}</span>
                      <span className="font-medium text-[#b95c3c]">- {currency(d.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex justify-between pt-3 text-sm font-bold">
                <span className="text-[#2c221e]">
                  {settlement.net_refund_amount > 0 ? 'Net Refund Payable to You' : 'Balance Settled'}
                </span>
                <span className="text-[#328d68] text-base">{currency(settlement.net_refund_amount)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Electricity Consumption Breakdown */}
        {electricity.length > 0 && (
          <div className="rounded-3xl border border-[#ebe4da] bg-white p-5 sm:p-6 shadow-sm">
            <div className="flex items-center gap-2 border-b border-[#f0ebe3] pb-3">
              <Zap className="size-5 text-[#8b5a2b]" />
              <h3 className="text-base font-bold text-[#2c221e]">Room Electricity Consumption</h3>
            </div>
            <p className="mt-1 text-xs text-[#85899a]">Sub-meter readings and automated billing calculations for Room {roomNumber}.</p>

            <div className="mt-4 overflow-hidden rounded-2xl border border-[#eee6dc]">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[500px] text-left text-xs">
                  <thead className="bg-[#faf7f2] font-semibold text-[#85899a] border-b border-[#eee6dc]">
                    <tr>
                      <th className="px-4 py-3">Reading Date</th>
                      <th className="px-4 py-3">Previous</th>
                      <th className="px-4 py-3">Current</th>
                      <th className="px-4 py-3">Units</th>
                      <th className="px-4 py-3">Rate</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#eee6dc]">
                    {electricity.map((el) => (
                      <tr key={el.id} className="hover:bg-[#faf7f2]/50">
                        <td className="px-4 py-3 font-medium text-[#3d3934]">
                          {new Date(el.readingDate).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </td>
                        <td className="px-4 py-3 text-[#676b7d]">{el.previousReading}</td>
                        <td className="px-4 py-3 text-[#676b7d]">{el.currentReading}</td>
                        <td className="px-4 py-3 font-bold text-[#784b20]">{el.units} kWh</td>
                        <td className="px-4 py-3 text-[#676b7d]">{currency(el.ratePerUnit)}</td>
                        <td className="px-4 py-3 font-bold text-[#2c221e] text-right">{currency(el.totalAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Payment History & Receipts */}
        <div className="rounded-3xl border border-[#ebe4da] bg-white p-5 sm:p-6 shadow-sm">
          <div className="flex items-center justify-between border-b border-[#f0ebe3] pb-3">
            <div className="flex items-center gap-2">
              <Receipt className="size-5 text-[#8b5a2b]" />
              <h3 className="text-base font-bold text-[#2c221e]">Payment History & Official Receipts</h3>
            </div>
            <span className="text-xs font-semibold text-[#85899a]">{payments.length} Payments</span>
          </div>

          {payments.length === 0 ? (
            <div className="py-8 text-center text-xs text-[#85899a]">
              No confirmed payments recorded yet. Future rent and utility receipts will appear here.
            </div>
          ) : (
            <div className="mt-4 flex flex-col divide-y divide-[#f0ebe3]">
              {payments.map((p) => (
                <div key={p.id} className="flex flex-col sm:flex-row sm:items-center justify-between py-3.5 gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-[#676b7d]">{p.receiptNumber}</span>
                      <span className="uppercase text-[10px] font-bold text-[#8b5a2b] bg-[#faf7f2] px-2 py-0.5 rounded border border-[#e8dfd4]">
                        {p.paymentType}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-[#85899a]">
                      {new Date(p.paidAt).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}{' '}
                      • Paid via {p.paymentMethod.toUpperCase()}
                      {p.monthCovered && ` • Period: ${p.monthCovered}`}
                    </p>
                  </div>
                  <div className="flex items-center justify-between sm:justify-end gap-3">
                    <span className="text-sm font-bold text-[#236b4e]">{currency(p.amount)}</span>
                    <button
                      onClick={() => handleOpenReceipt(p.id)}
                      disabled={isReceiptLoading}
                      className="flex items-center gap-1.5 rounded-xl border border-[#ebe4da] bg-white px-3 py-1.5 text-xs font-semibold text-[#8b5a2b] hover:bg-[#faf7f2] hover:border-[#8b5a2b] transition-colors"
                    >
                      <Download className="size-3.5" /> Receipt
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Manager Contact Card */}
        {property.contactNumber && (
          <div className="rounded-3xl border border-[#ebe4da] bg-[#faf7f2] p-5 text-xs text-[#676b7d] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="font-bold text-[#2c221e]">Have questions about your bills or rent?</p>
              <p className="text-[11px] text-[#85899a]">Contact property management directly.</p>
            </div>
            <a
              href={`tel:${property.contactNumber}`}
              className="inline-flex items-center gap-2 rounded-xl bg-white border border-[#ebe4da] px-4 py-2 font-semibold text-[#2c221e] hover:border-[#8b5a2b] transition-colors self-start sm:self-auto"
            >
              <Phone className="size-3.5 text-[#8b5a2b]" /> {property.contactNumber}
            </a>
          </div>
        )}
      </main>

      {/* Official Receipt Modal */}
      {selectedReceipt && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[#202536]/40 p-4 backdrop-blur-xs overflow-y-auto">
          <div className="w-full max-w-md rounded-3xl border border-[#e8dfd4] bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95 my-auto">
            <div className="mb-4 flex items-center justify-between border-b border-[#f0f1f4] pb-3">
              <h3 className="text-base font-bold text-[#3d3934]">Payment Receipt</h3>
              <button
                onClick={() => setSelectedReceipt(null)}
                className="rounded-xl p-1.5 text-[#8b8fa0] hover:bg-[#f7f3ed] hover:text-[#3d3934] transition-colors"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="rounded-2xl border border-[#e8dfd4] bg-[#faf7f2] p-6 text-xs" id="printable-receipt">
              <div className="border-b border-[#eee6dc] pb-4 text-center">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#8b5a2b]">Official Receipt</span>
                <h4 className="mt-1 text-base font-bold text-[#2c221e]">{selectedReceipt.propertyName}</h4>
                <p className="mt-1 font-mono font-semibold text-[#676b7d]">{selectedReceipt.receiptNumber}</p>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 border-b border-[#eee6dc] pb-4">
                <div>
                  <p className="text-[#85899a]">Resident</p>
                  <p className="font-semibold text-[#2c221e]">{selectedReceipt.residentName}</p>
                  <p className="text-[#676b7d]">Room: {selectedReceipt.roomNumber}</p>
                </div>
                <div className="text-right">
                  <p className="text-[#85899a]">Date Paid</p>
                  <p className="font-semibold text-[#2c221e]">
                    {new Date(selectedReceipt.paidAt).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </p>
                  <p className="text-[#676b7d]">Mode: {selectedReceipt.paymentMethod}</p>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between py-2 text-sm font-bold text-[#2c221e]">
                <span>{selectedReceipt.paymentType} Payment</span>
                <span className="text-[#236b4e]">{currency(selectedReceipt.amount)}</span>
              </div>

              {selectedReceipt.notes && (
                <p className="mt-2 text-[11px] text-[#85899a] border-t border-[#eee6dc] pt-2">
                  Reference: {selectedReceipt.notes}
                </p>
              )}
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                onClick={() => window.print()}
                className="flex items-center gap-1.5 rounded-xl bg-[#8b5a2b] px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-[#784b20] transition-colors"
              >
                <Printer className="size-4" /> Print / Save PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
