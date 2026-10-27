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
  Copy,
  Check,
  ExternalLink,
  QrCode,
  CreditCard,
  Split,
  Mail,
  UserCheck,
  FileText,
  MessageSquare,
  PlusCircle,
  History,
  AlertCircle,
  Edit3,
  Layers,
  ChevronRight,
  Info,
} from 'lucide-react'
import { parseLocalDate } from '@/lib/due-dates'

interface TenantData {
  tenant: {
    id: string
    name: string
    phone: string
    email?: string | null
    emergencyContact?: string | null
    idProofType?: string | null
    idProofNumber?: string | null
    monthlyRent: number
    securityDeposit: number
    joiningDate: string
    rentDueDay: number
    status: 'Paid' | 'Pending' | 'Overdue' | 'Vacated'
    dueStatus?: 'paid' | 'due_today' | 'due_soon' | 'overdue' | 'vacated'
    dueInfo?: {
      status: 'paid' | 'due_today' | 'due_soon' | 'overdue' | 'vacated'
      days: number
      labelEn: string
      labelHi: string
      badgeColor: string
    }
    nextDueDate?: string | null
    nextDueDateFormatted?: string | null
    outstandingBalance?: number
    overdueBalance?: number
  }
  property: {
    name: string
    address: string
    city: string
    state?: string
    pincode?: string
    contactNumber: string
    rules?: string[]
  }
  room?: {
    number: string
    floor: number | null
    type: string
  }
  roomNumber: string
  bedNumber: string
  paymentOptions?: {
    upiId?: string | null
    paymentLink?: string | null
    qrCodeUrl?: string | null
  }
  complaints?: Array<{
    id: string
    title: string
    description: string
    priority: 'High' | 'Medium' | 'Low'
    status: 'Open' | 'In progress' | 'Resolved'
    resolvedAt: string | null
    createdAt: string
    updatedAt?: string | null
  }>
  timeline?: Array<{
    id: string
    date: string
    type: 'move_in' | 'payment' | 'complaint' | 'electricity'
    title: string
    description: string
  }>
  electricityShares?: Array<{
    id: string
    periodStart: string
    periodEnd: string
    occupiedDays: number
    totalPeriodDays: number
    sharePercentage: number
    unitsConsumed?: number | null
    amountDue: number
    calculationMethod: string
    calculationExplanation: string
    isPaid: boolean
  }>
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
    periodStart?: string | null
    periodEnd?: string | null
    calculationType?: string | null
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

function maskIdNumber(val?: string | null): string {
  if (!val) return ''
  const trimmed = val.trim()
  if (trimmed.length <= 4) return trimmed
  return '•••• ' + trimmed.slice(-4)
}

export default function PortalView({ onLogout }: { onLogout: () => Promise<void> }) {
  const [data, setData] = useState<TenantData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedReceipt, setSelectedReceipt] = useState<any | null>(null)
  const [loadingReceiptId, setLoadingReceiptId] = useState<string | null>(null)
  const [copiedUpi, setCopiedUpi] = useState(false)
  const [showQrModal, setShowQrModal] = useState(false)

  // Edit Contact Information State
  const [showEditContactModal, setShowEditContactModal] = useState(false)
  const [isSavingContact, setIsSavingContact] = useState(false)
  const [contactFormError, setContactFormError] = useState<string | null>(null)
  const [contactPhone, setContactPhone] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactEmergency, setContactEmergency] = useState('')

  // New Complaint Modal State
  const [showComplaintModal, setShowComplaintModal] = useState(false)
  const [isSubmittingComplaint, setIsSubmittingComplaint] = useState(false)
  const [complaintFormError, setComplaintFormError] = useState<string | null>(null)
  const [complaintTitle, setComplaintTitle] = useState('')
  const [complaintPriority, setComplaintPriority] = useState<'High' | 'Medium' | 'Low'>('Medium')
  const [complaintDescription, setComplaintDescription] = useState('')

  // Resolving complaint state
  const [resolvingComplaintId, setResolvingComplaintId] = useState<string | null>(null)

  // Floating Toast State
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  function showToast(message: string, type: 'success' | 'error' = 'success') {
    setToast({ message, type })
    setTimeout(() => {
      setToast((curr) => (curr?.message === message ? null : curr))
    }, 4000)
  }

  async function loadPortalData() {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/portal/data')
      const json = await res.json()
      if (!res.ok || !json.success) {
        setError(json.error || 'Failed to load resident details.')
        return
      }
      setData(json.data)
      setContactPhone(json.data.tenant.phone || '')
      setContactEmail(json.data.tenant.email || '')
      setContactEmergency(json.data.tenant.emergencyContact || '')
    } catch (err: any) {
      setError(err?.message || 'Network error while loading resident portal.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadPortalData()
  }, [])

  async function handleOpenReceipt(paymentId: string) {
    setLoadingReceiptId(paymentId)
    try {
      const res = await fetch(`/api/portal/receipt/${paymentId}`)
      const json = await res.json()
      if (res.ok && json.success) {
        setSelectedReceipt(json.receipt)
      } else {
        showToast(json.error || 'Could not load receipt.', 'error')
      }
    } catch {
      showToast('Network error loading receipt.', 'error')
    } finally {
      setLoadingReceiptId(null)
    }
  }

  function handleCopyUpi(upiId: string) {
    navigator.clipboard.writeText(upiId)
    setCopiedUpi(true)
    showToast('UPI ID copied to clipboard.')
    setTimeout(() => setCopiedUpi(false), 2500)
  }

  function openEditContact() {
    if (data?.tenant) {
      setContactPhone(data.tenant.phone || '')
      setContactEmail(data.tenant.email || '')
      setContactEmergency(data.tenant.emergencyContact || '')
    }
    setContactFormError(null)
    setShowEditContactModal(true)
  }

  async function handleSaveContact(e: React.FormEvent) {
    e.preventDefault()
    if (isSavingContact) return

    setContactFormError(null)
    setIsSavingContact(true)

    try {
      const res = await fetch('/api/portal/data', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: contactPhone.trim(),
          email: contactEmail.trim(),
          emergencyContact: contactEmergency.trim(),
        }),
      })

      const json = await res.json()
      if (!res.ok || !json.success) {
        setContactFormError(json.error || 'Could not update contact details.')
        return
      }

      // Update local state confirmed by database
      if (data) {
        setData({
          ...data,
          tenant: {
            ...data.tenant,
            phone: json.tenant?.phone || contactPhone.trim(),
            email: json.tenant?.email || contactEmail.trim(),
            emergencyContact: json.tenant?.emergencyContact || contactEmergency.trim(),
          },
        })
      }

      setShowEditContactModal(false)
      showToast('Contact details successfully saved and updated in database.')
    } catch (err: any) {
      setContactFormError(err?.message || 'Network error saving changes.')
    } finally {
      setIsSavingContact(false)
    }
  }

  async function handleLodgeComplaint(e: React.FormEvent) {
    e.preventDefault()
    if (isSubmittingComplaint) return

    if (!complaintTitle.trim() || complaintTitle.trim().length < 3) {
      setComplaintFormError('Please enter an issue summary (minimum 3 characters).')
      return
    }

    setComplaintFormError(null)
    setIsSubmittingComplaint(true)

    try {
      const res = await fetch('/api/portal/complaints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: complaintTitle.trim(),
          priority: complaintPriority,
          description: complaintDescription.trim(),
        }),
      })

      const json = await res.json()
      if (!res.ok || !json.success) {
        setComplaintFormError(json.error || 'Failed to submit complaint ticket.')
        return
      }

      // Prepend confirmed complaint to local list
      if (data && json.complaint) {
        const updatedComplaints = [json.complaint, ...(data.complaints || [])]
        const newEvent = {
          id: `event-comp-${json.complaint.id}`,
          date: json.complaint.createdAt || new Date().toISOString(),
          type: 'complaint' as const,
          title: `Maintenance Ticket: ${json.complaint.title}`,
          description: `Status: ${json.complaint.status} · Priority: ${json.complaint.priority}`,
        }
        setData({
          ...data,
          complaints: updatedComplaints,
          timeline: [newEvent, ...(data.timeline || [])],
        })
      }

      setShowComplaintModal(false)
      setComplaintTitle('')
      setComplaintDescription('')
      setComplaintPriority('Medium')
      showToast('Maintenance ticket successfully submitted.')
    } catch (err: any) {
      setComplaintFormError(err?.message || 'Network error submitting complaint.')
    } finally {
      setIsSubmittingComplaint(false)
    }
  }

  async function handleResolveComplaint(complaintId: string) {
    setResolvingComplaintId(complaintId)
    try {
      const res = await fetch('/api/portal/complaints', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: complaintId,
          status: 'Resolved',
        }),
      })

      const json = await res.json()
      if (!res.ok || !json.success) {
        showToast(json.error || 'Failed to update ticket status.', 'error')
        return
      }

      if (data && json.complaint) {
        setData({
          ...data,
          complaints: (data.complaints || []).map((c) =>
            c.id === complaintId
              ? { ...c, status: 'Resolved', resolvedAt: json.complaint.resolvedAt || new Date().toISOString() }
              : c
          ),
        })
      }

      showToast('Maintenance ticket marked as resolved.')
    } catch {
      showToast('Network error updating ticket status.', 'error')
    } finally {
      setResolvingComplaintId(null)
    }
  }

  // Loading Skeleton State
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#faf7f2] p-4 sm:p-6 text-[#2c221e]">
        <div className="mx-auto max-w-3xl space-y-4">
          {/* Header Skeleton */}
          <div className="flex items-center justify-between rounded-3xl border border-[#ebe4da] bg-white p-4 shadow-xs animate-pulse">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-2xl bg-[#f0e9df]" />
              <div className="space-y-2">
                <div className="h-4 w-36 rounded bg-[#f0e9df]" />
                <div className="h-3 w-24 rounded bg-[#f5ede3]" />
              </div>
            </div>
            <div className="h-8 w-16 rounded-xl bg-[#f0e9df]" />
          </div>

          {/* Resident Profile Skeleton */}
          <div className="rounded-3xl border border-[#ebe4da] bg-white p-6 shadow-xs animate-pulse space-y-4">
            <div className="flex justify-between items-center">
              <div className="space-y-2">
                <div className="h-4 w-28 rounded bg-[#f0e9df]" />
                <div className="h-6 w-48 rounded bg-[#f0e9df]" />
                <div className="h-4 w-60 rounded bg-[#f5ede3]" />
              </div>
              <div className="h-8 w-24 rounded-full bg-[#f0e9df]" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 border-t border-[#f0ebe3] pt-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="space-y-1.5">
                  <div className="h-3 w-16 rounded bg-[#f5ede3]" />
                  <div className="h-5 w-20 rounded bg-[#f0e9df]" />
                </div>
              ))}
            </div>
          </div>

          {/* Cards Skeleton */}
          <div className="rounded-3xl border border-[#ebe4da] bg-white p-6 shadow-xs animate-pulse space-y-3">
            <div className="h-5 w-40 rounded bg-[#f0e9df]" />
            <div className="h-16 w-full rounded-2xl bg-[#faf7f2]" />
          </div>
        </div>
      </div>
    )
  }

  // Error State
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
          <div className="mt-6 flex justify-center gap-3">
            <button
              onClick={() => loadPortalData()}
              className="rounded-xl bg-[#8b5a2b] px-4 py-2 text-xs font-semibold text-white hover:bg-[#784b20] transition-colors"
            >
              Retry Loading
            </button>
          </div>
        </div>
      </div>
    )
  }

  const {
    tenant,
    property,
    room,
    roomNumber,
    bedNumber,
    payments = [],
    electricity = [],
    settlement,
    paymentOptions,
    electricityShares = [],
    complaints = [],
    timeline = [],
  } = data

  const hasPaymentOptions = !!(paymentOptions?.upiId || paymentOptions?.paymentLink || paymentOptions?.qrCodeUrl)
  const roomFloorDisplay = room?.floor !== null && room?.floor !== undefined
    ? room.floor === 0 ? 'Ground Floor' : `Floor ${room.floor}`
    : null
  const roomTypeDisplay = room?.type || null
  const rulesList = property.rules || []

  return (
    <div className="min-h-screen bg-[#faf7f2] text-[#2c221e] antialiased selection:bg-[#8b5a2b]/20 pb-16">
      {/* Toast Alert */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 rounded-2xl border px-4 py-3 text-xs font-semibold shadow-lg backdrop-blur-md animate-in fade-in slide-in-from-top-2">
          {toast.type === 'success' ? (
            <div className="flex items-center gap-2 border-[#a3e4be] bg-[#f0fbf5] text-[#236b4e]">
              <CheckCircle2 className="size-4" />
              <span>{toast.message}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 border-[#feb2b2] bg-[#fff5f5] text-[#c53030]">
              <AlertCircle className="size-4" />
              <span>{toast.message}</span>
            </div>
          )}
          <button onClick={() => setToast(null)} className="ml-2 text-gray-400 hover:text-gray-600">
            <X className="size-3.5" />
          </button>
        </div>
      )}

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
        {/* 1. Resident Profile Card */}
        <div className="rounded-3xl border border-[#ebe4da] bg-white p-5 sm:p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#faf7f2] border border-[#e8dfd4] px-2.5 py-1 text-[11px] font-semibold text-[#8b5a2b]">
                <ShieldCheck className="size-3.5" /> Verified Resident
              </span>
              <h2 className="mt-2 text-xl font-bold tracking-tight text-[#2c221e]">{tenant.name}</h2>
              <div className="mt-2 flex flex-wrap items-center gap-y-1.5 gap-x-4 text-xs text-[#676b7d]">
                <span className="inline-flex items-center gap-1">
                  <DoorOpen className="size-3.5 text-[#8b5a2b]" /> Room {roomNumber}
                  {roomFloorDisplay && <span className="text-[#85899a]">({roomFloorDisplay})</span>}
                </span>
                <span className="inline-flex items-center gap-1">
                  <BedDouble className="size-3.5 text-[#8b5a2b]" /> Bed {bedNumber}
                </span>
                {roomTypeDisplay && (
                  <span className="inline-flex items-center gap-1">
                    <Layers className="size-3.5 text-[#8b5a2b]" /> {roomTypeDisplay}
                  </span>
                )}
                {property.city && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="size-3.5 text-[#8b5a2b]" /> {property.city}
                    {property.state ? `, ${property.state}` : ''}
                  </span>
                )}
              </div>
            </div>

            {/* Rent Status Badge */}
            <div className="flex flex-col sm:items-end">
              <span className="text-[11px] font-medium text-[#85899a]">Rent Status</span>
              <div className="mt-1">
                {tenant.dueInfo ? (
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${tenant.dueInfo.badgeColor}`}
                  >
                    {tenant.dueInfo.status === 'overdue' && <AlertTriangle className="size-3.5" />}
                    {tenant.dueInfo.status === 'paid' && <CheckCircle2 className="size-3.5" />}
                    {(tenant.dueInfo.status === 'due_soon' || tenant.dueInfo.status === 'due_today') && (
                      <Clock className="size-3.5" />
                    )}
                    {tenant.dueInfo.labelEn}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#faf7f2] border border-[#e8dfd4] px-3 py-1 text-xs font-bold text-[#9a7651]">
                    <Clock className="size-3.5" /> Due on the {tenant.rentDueDay}th
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Financial Key Metrics */}
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5 border-t border-[#f0ebe3] pt-4 text-xs">
            <div>
              <p className="text-[#85899a]">Monthly Rent</p>
              <p className="mt-0.5 text-base font-bold text-[#2c221e]">{currency(tenant.monthlyRent)}</p>
            </div>
            <div>
              <p className="text-[#85899a]">Next Due Date</p>
              <p className="mt-0.5 text-base font-semibold text-[#8b5a2b]">
                {tenant.nextDueDateFormatted || (tenant.rentDueDay ? `${tenant.rentDueDay}th of month` : '—')}
              </p>
            </div>
            <div>
              <p className="text-[#85899a]">Outstanding Rent</p>
              <p
                className={`mt-0.5 text-base font-bold ${
                  (tenant.outstandingBalance ?? 0) > 0
                    ? tenant.dueInfo?.status === 'overdue' || tenant.status === 'Overdue'
                      ? 'text-[#b95c3c]'
                      : 'text-[#784b20]'
                    : 'text-[#2e7d32]'
                }`}
              >
                {(tenant.outstandingBalance ?? 0) > 0
                  ? currency(tenant.outstandingBalance!)
                  : '₹0 (Clear)'}
              </p>
            </div>
            <div>
              <p className="text-[#85899a]">Security Deposit</p>
              <p className="mt-0.5 text-base font-bold text-[#2c221e]">{currency(tenant.securityDeposit)}</p>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <p className="text-[#85899a]">Move-in Date</p>
              <p className="mt-0.5 text-base font-semibold text-[#676b7d]">
                {tenant.joiningDate
                  ? parseLocalDate(tenant.joiningDate).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })
                  : '—'}
              </p>
            </div>
          </div>
        </div>

        {/* 2. Personal Contact Details & Editable Information */}
        <div className="rounded-3xl border border-[#ebe4da] bg-white p-5 sm:p-6 shadow-sm">
          <div className="flex items-center justify-between border-b border-[#f0ebe3] pb-3">
            <div className="flex items-center gap-2">
              <UserCheck className="size-5 text-[#8b5a2b]" />
              <h3 className="text-base font-bold text-[#2c221e]">Personal Details & Contacts</h3>
            </div>
            <button
              onClick={openEditContact}
              className="flex items-center gap-1.5 rounded-xl border border-[#ebe4da] bg-[#faf7f2] px-3 py-1.5 text-xs font-semibold text-[#8b5a2b] hover:border-[#8b5a2b] hover:bg-white transition-colors"
            >
              <Edit3 className="size-3.5" />
              <span>Edit Contact Info</span>
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="rounded-2xl border border-[#e8dfd4] bg-[#faf7f2]/60 p-3.5">
              <span className="text-[10px] font-bold uppercase text-[#85899a] flex items-center gap-1">
                <Phone className="size-3 text-[#8b5a2b]" /> Primary Phone
              </span>
              <p className="mt-1 text-sm font-semibold text-[#2c221e]">
                {tenant.phone || <span className="text-[#85899a] italic">Not provided</span>}
              </p>
            </div>

            <div className="rounded-2xl border border-[#e8dfd4] bg-[#faf7f2]/60 p-3.5">
              <span className="text-[10px] font-bold uppercase text-[#85899a] flex items-center gap-1">
                <Mail className="size-3 text-[#8b5a2b]" /> Email Address
              </span>
              <p className="mt-1 text-sm font-semibold text-[#2c221e]">
                {tenant.email || <span className="text-[#85899a] italic">Not provided</span>}
              </p>
            </div>

            <div className="rounded-2xl border border-[#e8dfd4] bg-[#faf7f2]/60 p-3.5">
              <span className="text-[10px] font-bold uppercase text-[#85899a] flex items-center gap-1">
                <AlertCircle className="size-3 text-[#8b5a2b]" /> Emergency Contact
              </span>
              <p className="mt-1 text-sm font-semibold text-[#2c221e]">
                {tenant.emergencyContact || <span className="text-[#85899a] italic">Not provided</span>}
              </p>
            </div>

            <div className="rounded-2xl border border-[#e8dfd4] bg-[#faf7f2]/60 p-3.5">
              <span className="text-[10px] font-bold uppercase text-[#85899a] flex items-center gap-1">
                <FileText className="size-3 text-[#8b5a2b]" /> Identification Record
              </span>
              <div className="mt-1 flex items-center justify-between">
                <p className="text-sm font-semibold text-[#2c221e]">
                  {tenant.idProofType ? `${tenant.idProofType} verified` : 'ID Record'}
                </p>
                {tenant.idProofNumber ? (
                  <span className="font-mono text-xs text-[#676b7d]">
                    {maskIdNumber(tenant.idProofNumber)}
                  </span>
                ) : (
                  <span className="text-[11px] text-[#85899a] italic">Verified on File</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 3. Quick Payment Options Card */}
        {hasPaymentOptions && (
          <div className="rounded-3xl border border-[#d9ccbe] bg-gradient-to-br from-[#fdfbf9] to-[#faf5ee] p-5 sm:p-6 shadow-sm">
            <div className="flex items-center justify-between border-b border-[#ebdcd0] pb-3">
              <div className="flex items-center gap-2">
                <CreditCard className="size-5 text-[#8b5a2b]" />
                <h3 className="text-base font-bold text-[#2c221e]">Payment Options</h3>
              </div>
              <span className="rounded-full bg-[#8b5a2b]/10 px-2.5 py-0.5 text-[10px] font-bold text-[#784b20]">
                Verified Details
              </span>
            </div>
            <p className="mt-2 text-xs text-[#676b7d]">
              Pay your monthly rent and utility dues directly to property management using the options below:
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              {paymentOptions?.upiId && (
                <div className="flex items-center gap-2 rounded-2xl border border-[#e8dfd4] bg-white px-3.5 py-2 shadow-2xs">
                  <div className="flex flex-col text-left">
                    <span className="text-[10px] font-bold uppercase text-[#999daa]">UPI ID</span>
                    <span className="font-mono text-xs font-semibold text-[#2c221e]">{paymentOptions.upiId}</span>
                  </div>
                  <button
                    onClick={() => handleCopyUpi(paymentOptions.upiId!)}
                    className="ml-2 flex items-center gap-1 rounded-lg border border-[#e8dfd4] bg-[#faf7f2] px-2 py-1 text-[11px] font-semibold text-[#784b20] hover:bg-[#ebdcd0] transition-colors"
                  >
                    {copiedUpi ? <Check className="size-3 text-[#236b4e]" /> : <Copy className="size-3" />}
                    <span>{copiedUpi ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              )}

              {paymentOptions?.paymentLink && (
                <a
                  href={paymentOptions.paymentLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 rounded-2xl bg-[#8b5a2b] px-4 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-[#784b20] transition-colors"
                >
                  <span>Pay Online via Link</span>
                  <ExternalLink className="size-3.5" />
                </a>
              )}

              {paymentOptions?.qrCodeUrl && (
                <button
                  onClick={() => setShowQrModal(true)}
                  className="flex items-center gap-1.5 rounded-2xl border border-[#8b5a2b] bg-white px-3.5 py-2 text-xs font-semibold text-[#784b20] shadow-2xs hover:bg-[#faf7f2] transition-colors"
                >
                  <QrCode className="size-4 text-[#8b5a2b]" />
                  <span>Scan UPI QR Code</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* 4. Complaints & Maintenance Requests Section */}
        <div className="rounded-3xl border border-[#ebe4da] bg-white p-5 sm:p-6 shadow-sm">
          <div className="flex items-center justify-between border-b border-[#f0ebe3] pb-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="size-5 text-[#8b5a2b]" />
              <h3 className="text-base font-bold text-[#2c221e]">Maintenance & Complaints</h3>
            </div>
            <button
              onClick={() => {
                setComplaintFormError(null)
                setShowComplaintModal(true)
              }}
              className="flex items-center gap-1.5 rounded-xl bg-[#8b5a2b] px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-[#784b20] transition-colors"
            >
              <PlusCircle className="size-3.5" />
              <span>Log Complaint</span>
            </button>
          </div>

          <p className="mt-2 text-xs text-[#85899a]">
            Submit maintenance issues, appliance repairs, or inquiries directly to your property manager.
          </p>

          {complaints.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-[#ebe4da] p-6 text-center text-xs text-[#85899a]">
              No complaints or maintenance tickets logged yet. Need assistance? Click "Log Complaint" above.
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {complaints.map((c) => (
                <div
                  key={c.id}
                  className="rounded-2xl border border-[#e8dfd4] bg-[#faf7f2] p-4 text-xs transition-colors hover:border-[#8b5a2b]/40"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#ede6dd] pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-[#2c221e]">{c.title}</span>
                      <span
                        className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${
                          c.priority === 'High'
                            ? 'bg-[#fff5f5] text-[#b95c3c] border border-[#feb2b2]'
                            : c.priority === 'Medium'
                            ? 'bg-[#fffaf0] text-[#c05621] border border-[#fbd38d]'
                            : 'bg-[#f0f4f8] text-[#4a5568] border border-[#cbd5e0]'
                        }`}
                      >
                        {c.priority} Priority
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                          c.status === 'Resolved'
                            ? 'bg-[#f0fbf5] text-[#236b4e] border border-[#a3e4be]'
                            : c.status === 'In progress'
                            ? 'bg-[#eff6ff] text-[#2563eb] border border-[#bfdbfe]'
                            : 'bg-[#faf7f2] text-[#9a7651] border border-[#e8dfd4]'
                        }`}
                      >
                        {c.status === 'Resolved' && <CheckCircle2 className="size-3" />}
                        {c.status === 'In progress' && <Clock className="size-3" />}
                        {c.status === 'Open' && <AlertTriangle className="size-3" />}
                        {c.status}
                      </span>

                      {c.status !== 'Resolved' && (
                        <button
                          onClick={() => handleResolveComplaint(c.id)}
                          disabled={resolvingComplaintId === c.id}
                          className="flex items-center gap-1 rounded-lg border border-[#a3e4be] bg-[#f0fbf5] px-2 py-1 text-[11px] font-semibold text-[#236b4e] hover:bg-[#e2f7eb] transition-colors disabled:opacity-50"
                        >
                          {resolvingComplaintId === c.id ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            <Check className="size-3" />
                          )}
                          <span>Mark Resolved</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {c.description && (
                    <p className="mt-2.5 text-xs text-[#676b7d] leading-relaxed whitespace-pre-wrap">
                      {c.description}
                    </p>
                  )}

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#ede6dd] pt-2 text-[11px] text-[#85899a]">
                    <span>
                      Submitted on{' '}
                      {new Date(c.createdAt).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                    {c.resolvedAt && (
                      <span className="text-[#236b4e] font-medium flex items-center gap-1">
                        <CheckCircle2 className="size-3" /> Resolved on{' '}
                        {new Date(c.resolvedAt).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 5. Property Rules & Community Notices Card */}
        {rulesList.length > 0 && (
          <div className="rounded-3xl border border-[#ebe4da] bg-white p-5 sm:p-6 shadow-sm">
            <div className="flex items-center gap-2 border-b border-[#f0ebe3] pb-3">
              <Info className="size-5 text-[#8b5a2b]" />
              <h3 className="text-base font-bold text-[#2c221e]">Property Rules & Resident Guidelines</h3>
            </div>
            <p className="mt-1 text-xs text-[#85899a]">
              Guidelines established by property management for safety and comfortable shared living.
            </p>

            <ul className="mt-4 space-y-2 text-xs text-[#676b7d]">
              {rulesList.map((rule, idx) => (
                <li key={idx} className="flex items-start gap-2 rounded-xl bg-[#faf7f2] p-3 border border-[#e8dfd4]">
                  <ChevronRight className="size-4 shrink-0 text-[#8b5a2b] mt-0.5" />
                  <span className="leading-relaxed">{rule}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 6. Mid-Cycle Shared Electricity Bills Section */}
        {electricityShares.length > 0 && (
          <div className="rounded-3xl border border-[#ebe4da] bg-white p-5 sm:p-6 shadow-sm">
            <div className="flex items-center gap-2 border-b border-[#f0ebe3] pb-3">
              <Split className="size-5 text-[#8b5a2b]" />
              <h3 className="text-base font-bold text-[#2c221e]">Mid-Cycle Electricity Shares</h3>
            </div>
            <p className="mt-1 text-xs text-[#85899a]">
              Transparent proportional billing for periods during which residents moved in or vacated.
            </p>

            <div className="mt-4 space-y-3">
              {electricityShares.map((share) => (
                <div
                  key={share.id}
                  className="rounded-2xl border border-[#e8dfd4] bg-[#faf7f2] p-4 text-xs transition-colors hover:border-[#8b5a2b]/40"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#ede6dd] pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-[#2c221e]">
                          {parseLocalDate(share.periodStart).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} –{' '}
                          {parseLocalDate(share.periodEnd).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </span>
                        <span className="rounded-md bg-white border border-[#e8dfd4] px-2 py-0.5 text-[10px] font-bold text-[#8b5a2b]">
                          {share.occupiedDays} of {share.totalPeriodDays} days
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] font-medium text-[#236b4e] flex items-center gap-1">
                        <CheckCircle2 className="size-3 text-[#236b4e]" />
                        You are not charged for days prior to your move-in date
                      </p>
                    </div>

                    <div className="flex items-center sm:flex-col sm:items-end justify-between">
                      <span className="text-[11px] text-[#85899a]">Your Calculated Share</span>
                      <span className="text-base font-bold text-[#784b20]">{currency(share.amountDue)}</span>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-[#676b7d]">
                    <p className="leading-relaxed">{share.calculationExplanation}</p>
                    <span className="shrink-0 font-semibold text-[#8b5a2b]">
                      Share: {share.sharePercentage}%
                      {share.unitsConsumed !== null && ` • ${share.unitsConsumed} kWh`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 7. Move-Out Settlement Section */}
        {settlement && (
          <div className="rounded-3xl border border-[#ebe4da] bg-white p-5 sm:p-6 shadow-sm">
            <div className="flex items-center gap-2 border-b border-[#f0ebe3] pb-3">
              <ShieldCheck className="size-5 text-[#8b5a2b]" />
              <h3 className="text-base font-bold text-[#2c221e]">Final Move-Out Deposit Settlement</h3>
            </div>
            <p className="mt-2 text-xs text-[#85899a]">
              Final settlement recorded on{' '}
              {parseLocalDate(settlement.move_out_date).toLocaleDateString('en-IN', {
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
              {settlement.deductions?.map((d: any) => (
                <div key={d.id} className="flex justify-between py-1.5 border-b border-[#ede6dd] text-[#b95c3c]">
                  <span>Less: {d.reason || d.category}</span>
                  <span className="font-semibold">- {currency(d.amount)}</span>
                </div>
              ))}
              <div className="flex justify-between pt-3 text-sm font-bold">
                <span className="text-[#2c221e]">
                  {settlement.net_refund_amount > 0 ? 'Net Refund Payable to You' : 'Balance Settled'}
                </span>
                <span className="text-[#328d68] text-base">{currency(settlement.net_refund_amount)}</span>
              </div>
            </div>
          </div>
        )}

        {/* 8. Electricity Consumption Breakdown */}
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

        {/* 9. Payment History & Official Receipts */}
        <div className="rounded-3xl border border-[#ebe4da] bg-white p-5 sm:p-6 shadow-sm">
          <div className="flex items-center justify-between border-b border-[#f0ebe3] pb-3">
            <div className="flex items-center gap-2">
              <Receipt className="size-5 text-[#8b5a2b]" />
              <h3 className="text-base font-bold text-[#2c221e]">Payment History & Receipts</h3>
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
                      disabled={loadingReceiptId === p.id}
                      className="flex items-center gap-1.5 rounded-xl border border-[#ebe4da] bg-white px-3 py-1.5 text-xs font-semibold text-[#8b5a2b] hover:bg-[#faf7f2] hover:border-[#8b5a2b] transition-colors disabled:opacity-50"
                    >
                      {loadingReceiptId === p.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Download className="size-3.5" />
                      )}
                      <span>Receipt</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 10. Resident Activity History Timeline */}
        {timeline.length > 0 && (
          <div className="rounded-3xl border border-[#ebe4da] bg-white p-5 sm:p-6 shadow-sm">
            <div className="flex items-center gap-2 border-b border-[#f0ebe3] pb-3">
              <History className="size-5 text-[#8b5a2b]" />
              <h3 className="text-base font-bold text-[#2c221e]">Resident Account Activity</h3>
            </div>
            <p className="mt-1 text-xs text-[#85899a]">
              Complete chronological audit history of payments, tenancy milestones, and service requests.
            </p>

            <div className="mt-5 relative pl-6 border-l-2 border-[#eee6dc] space-y-4 text-xs">
              {timeline.map((event) => (
                <div key={event.id} className="relative">
                  <div className="absolute -left-[31px] top-1 size-3.5 rounded-full border-2 border-white bg-[#8b5a2b]" />
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <span className="font-bold text-[#2c221e]">{event.title}</span>
                    <span className="text-[11px] text-[#85899a]">
                      {new Date(event.date).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-[#676b7d]">{event.description}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 11. Manager Contact Card */}
        {property.contactNumber && (
          <div className="rounded-3xl border border-[#ebe4da] bg-[#faf7f2] p-5 text-xs text-[#676b7d] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="font-bold text-[#2c221e]">Have questions about your bills or residence?</p>
              <p className="text-[11px] text-[#85899a]">
                Contact property management directly at {property.name}.
              </p>
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

      {/* MODAL 1: Edit Contact Info Modal */}
      {showEditContactModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Edit Contact Information"
          className="fixed inset-0 z-50 grid place-items-center bg-[#202536]/40 p-3 sm:p-4 backdrop-blur-xs overflow-y-auto"
        >
          <div className="w-full max-w-md rounded-3xl border border-[#e8dfd4] bg-white p-5 sm:p-6 shadow-2xl animate-in fade-in zoom-in-95 my-auto">
            <div className="flex items-center justify-between border-b border-[#f0f1f4] pb-3">
              <h3 className="text-base font-bold text-[#2c221e]">Edit Contact Information</h3>
              <button
                onClick={() => !isSavingContact && setShowEditContactModal(false)}
                className="rounded-xl p-1.5 text-[#8b8fa0] hover:bg-[#f7f3ed] hover:text-[#2c221e] transition-colors"
              >
                <X className="size-4" />
              </button>
            </div>

            {contactFormError && (
              <div className="mt-4 rounded-xl bg-[#fff5f5] border border-[#feb2b2] p-3 text-xs text-[#c53030] flex items-start gap-2">
                <AlertCircle className="size-4 shrink-0 mt-0.5" />
                <span>{contactFormError}</span>
              </div>
            )}

            <form onSubmit={handleSaveContact} className="mt-4 space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-[#555a6c]">Full Name</label>
                <input
                  type="text"
                  disabled
                  value={tenant.name}
                  className="mt-1 w-full rounded-xl border border-[#e8dfd4] bg-[#faf7f2] px-3.5 py-2.5 text-xs text-[#85899a] cursor-not-allowed outline-none"
                />
                <span className="text-[10px] text-[#85899a]">Name is verified by property manager.</span>
              </div>

              <div>
                <label className="block font-semibold text-[#555a6c]">Phone Number</label>
                <input
                  type="tel"
                  required
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="e.g. 9876543210"
                  className="mt-1 w-full rounded-xl border border-[#e8dfd4] bg-white px-3.5 py-2.5 text-xs text-[#2c221e] outline-none focus:border-[#8b5a2b]"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#555a6c]">Email Address</label>
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="e.g. resident@example.com"
                  className="mt-1 w-full rounded-xl border border-[#e8dfd4] bg-white px-3.5 py-2.5 text-xs text-[#2c221e] outline-none focus:border-[#8b5a2b]"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#555a6c]">Emergency Contact (Parent / Guardian)</label>
                <input
                  type="text"
                  value={contactEmergency}
                  onChange={(e) => setContactEmergency(e.target.value)}
                  placeholder="e.g. Rajesh Sharma - 9811223344"
                  className="mt-1 w-full rounded-xl border border-[#e8dfd4] bg-white px-3.5 py-2.5 text-xs text-[#2c221e] outline-none focus:border-[#8b5a2b]"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowEditContactModal(false)}
                  disabled={isSavingContact}
                  className="rounded-xl border border-[#e8dfd4] px-4 py-2 text-xs font-semibold text-[#676b7d] hover:bg-[#faf7f2] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingContact}
                  className="flex items-center gap-1.5 rounded-xl bg-[#8b5a2b] px-4 py-2 text-xs font-semibold text-white hover:bg-[#784b20] transition-colors disabled:opacity-50"
                >
                  {isSavingContact && <Loader2 className="size-3.5 animate-spin" />}
                  <span>{isSavingContact ? 'Saving...' : 'Save Changes'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Lodge New Complaint Modal */}
      {showComplaintModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Log Maintenance Ticket"
          className="fixed inset-0 z-50 grid place-items-center bg-[#202536]/40 p-3 sm:p-4 backdrop-blur-xs overflow-y-auto"
        >
          <div className="w-full max-w-md rounded-3xl border border-[#e8dfd4] bg-white p-5 sm:p-6 shadow-2xl animate-in fade-in zoom-in-95 my-auto">
            <div className="flex items-center justify-between border-b border-[#f0f1f4] pb-3">
              <h3 className="text-base font-bold text-[#2c221e]">Log Maintenance Ticket</h3>
              <button
                onClick={() => !isSubmittingComplaint && setShowComplaintModal(false)}
                className="rounded-xl p-1.5 text-[#8b8fa0] hover:bg-[#f7f3ed] hover:text-[#2c221e] transition-colors"
              >
                <X className="size-4" />
              </button>
            </div>

            {complaintFormError && (
              <div className="mt-4 rounded-xl bg-[#fff5f5] border border-[#feb2b2] p-3 text-xs text-[#c53030] flex items-start gap-2">
                <AlertCircle className="size-4 shrink-0 mt-0.5" />
                <span>{complaintFormError}</span>
              </div>
            )}

            <form onSubmit={handleLodgeComplaint} className="mt-4 space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-[#555a6c]">
                  Issue Summary <span className="text-[#b95c3c]">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={complaintTitle}
                  onChange={(e) => setComplaintTitle(e.target.value)}
                  placeholder="e.g. Geyser not heating, Leaking bathroom tap"
                  className="mt-1 w-full rounded-xl border border-[#e8dfd4] bg-white px-3.5 py-2.5 text-xs text-[#2c221e] outline-none focus:border-[#8b5a2b]"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#555a6c]">Priority</label>
                <select
                  value={complaintPriority}
                  onChange={(e) => setComplaintPriority(e.target.value as any)}
                  className="mt-1 w-full rounded-xl border border-[#e8dfd4] bg-white px-3.5 py-2.5 text-xs text-[#2c221e] outline-none focus:border-[#8b5a2b]"
                >
                  <option value="Medium">Medium Priority (Standard maintenance)</option>
                  <option value="High">High Priority (Urgent repair needed)</option>
                  <option value="Low">Low Priority (Minor feedback / inquiry)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-[#555a6c]">Details & Remarks (Optional)</label>
                <textarea
                  rows={3}
                  value={complaintDescription}
                  onChange={(e) => setComplaintDescription(e.target.value)}
                  placeholder="Provide any technician details or best time for inspection"
                  className="mt-1 w-full rounded-xl border border-[#e8dfd4] bg-white px-3.5 py-2 text-xs text-[#2c221e] outline-none focus:border-[#8b5a2b]"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowComplaintModal(false)}
                  disabled={isSubmittingComplaint}
                  className="rounded-xl border border-[#e8dfd4] px-4 py-2 text-xs font-semibold text-[#676b7d] hover:bg-[#faf7f2] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingComplaint}
                  className="flex items-center gap-1.5 rounded-xl bg-[#8b5a2b] px-4 py-2 text-xs font-semibold text-white hover:bg-[#784b20] transition-colors disabled:opacity-50"
                >
                  {isSubmittingComplaint && <Loader2 className="size-3.5 animate-spin" />}
                  <span>{isSubmittingComplaint ? 'Submitting...' : 'Submit Ticket'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Official Receipt Modal */}
      {selectedReceipt && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Payment Receipt"
          className="fixed inset-0 z-50 grid place-items-center bg-[#202536]/40 p-3 sm:p-4 backdrop-blur-xs overflow-y-auto"
        >
          <div className="w-full max-w-md max-h-[92vh] overflow-y-auto overscroll-contain rounded-3xl border border-[#e8dfd4] bg-white p-5 sm:p-6 shadow-2xl animate-in fade-in zoom-in-95 my-auto">
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

      {/* MODAL 4: QR Code Modal for Resident */}
      {showQrModal && paymentOptions?.qrCodeUrl && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Scan UPI QR Code"
          className="fixed inset-0 z-50 grid place-items-center bg-[#202536]/40 p-3 sm:p-4 backdrop-blur-xs overflow-y-auto"
        >
          <div className="w-full max-w-sm max-h-[92vh] overflow-y-auto overscroll-contain rounded-3xl border border-[#e8dfd4] bg-white p-5 sm:p-6 shadow-2xl animate-in fade-in zoom-in-95 my-auto text-center">
            <div className="flex items-center justify-between border-b border-[#f0f1f4] pb-3">
              <h3 className="text-base font-bold text-[#3d3934]">Scan UPI QR Code</h3>
              <button
                onClick={() => setShowQrModal(false)}
                className="rounded-xl p-1.5 text-[#8b8fa0] hover:bg-[#f7f3ed] hover:text-[#3d3934] transition-colors"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="mt-4 flex flex-col items-center">
              <div className="p-3 bg-white border border-[#e8dfd4] rounded-2xl shadow-sm">
                <img
                  src={paymentOptions.qrCodeUrl}
                  alt="UPI QR Code"
                  className="size-56 object-contain rounded-xl"
                />
              </div>

              {paymentOptions.upiId && (
                <p className="mt-3 font-mono text-xs font-semibold text-[#676b7d]">
                  UPI ID: {paymentOptions.upiId}
                </p>
              )}
              <p className="mt-1 text-[11px] text-[#85899a]">
                Scan with any UPI app (GPay, PhonePe, Paytm) to pay dues directly.
              </p>
            </div>

            <div className="mt-5">
              <button
                onClick={() => setShowQrModal(false)}
                className="w-full rounded-xl bg-[#8b5a2b] py-2.5 text-xs font-semibold text-white hover:bg-[#784b20] transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
