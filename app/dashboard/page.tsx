'use client'

import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient, ensureFreshSession } from '@/lib/supabase/client'
import { resolveAuthoritativeSubscription, resolveCustomerEntitlements, type CustomerEntitlement } from '@/lib/subscription'
import {
  createPropertyAction,
  updatePropertyAction,
  createTenantAction,
  updateTenantAction,
  deleteTenantAction,
  deleteExpenseAction,
  deletePaymentAction,
  moveToTrashAction,
  getTrashRecordsAction,
  restoreTrashRecordAction,
  permanentlyDeleteTrashAction,
  type TrashRecord,
  type TrashEntityType,
} from './actions'
import {
  generateTenantLinkAction,
  revokeTenantLinkAction,
  getTenantLinkStatusAction,
} from './tenant-link-actions'
import { isValidPhone } from '@/lib/validation'
import { SUPPORT_EMAIL, getMailtoSupport } from '@/lib/constants'
import { useI18n } from '@/lib/i18n'
import {
  PRICING_CONFIG,
  PRICING_PLANS,
  type PricingPlan,
  formatINR,
  getSavingsLabel,
  ANNUAL_SAVINGS_PERCENT,
  YEARLY_MONTHLY_EQUIVALENT,
  ANNUAL_SAVINGS_AMOUNT,
} from '@/lib/pricing'
import {
  calculateRentDueStatus,
  calculateNextRentDueDate,
  generateMonthlyRentSchedules,
  calculateTenantRentStatus,
  isDuplicateRentPayment,
  formatPaymentTimestamp,
  generateWhatsAppReminder,
  generateSmsReminder,
  type MonthlyRentSchedule,
  type ReminderPaymentDetails,
} from '@/lib/due-dates'
import {
  validatePaymentDetailsForm,
  validateQrImageFile,
  decodeAndValidateQrImage,
  validateUpiId,
  validatePaymentLink,
} from '@/lib/payment-validation'
import {
  calculateMidCycleElectricitySplit,
  suggestPreviousBillingCycle,
  getSuggestedRate,
  validateMidCycleInputs,
  type MidCycleSplitResult,
} from '@/lib/electricity-split'
import { BaseraBookLogo, BaseraBookIcon } from '@/components/ui/BaseraBookLogo'
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BedDouble,
  Bell,
  Building2,
  Calculator,
  Calendar,
  CalendarRange,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleHelp,
  Clock,
  Copy,
  CreditCard,
  DoorOpen,
  Download,
  Edit2,
  FileText,
  Home,
  LayoutDashboard,
  Link2,
  Loader2,
  LogOut,
  Menu,
  MessageCircle,
  MessageSquare,
  Pencil,
  Percent,
  PieChart,
  Plus,
  Printer,
  QrCode,
  Receipt,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Save,
  Search,
  Settings,
  Share2,
  ShieldAlert,
  ShieldBan,
  ShieldCheck,
  Sparkles,
  Split,
  Trash2,
  Undo2,
  Upload,
  User,
  UserCheck,
  UserMinus,
  Users,
  Wallet,
  X,
  Zap,
} from 'lucide-react'

// ------------------------------------------------------------------------------
// Data Types
// ------------------------------------------------------------------------------
export type Property = {
  id: string
  name: string
  address: string
  contact: string
  city: string
  rules?: string | null
  upi_id?: string | null
  payment_link?: string | null
  upi_qr_url?: string | null
}

type Tenant = {
  id: string
  property_id?: string | null
  name: string
  phone?: string
  room_id?: string | null
  bed_id?: string | null
  bed_number?: string
  room: string
  rent: number
  deposit?: number
  joiningDate?: string
  rent_due_day?: number
  deleted_at?: string | null
  updated_at?: string | null
  status: 'Paid' | 'Pending' | 'Overdue' | 'Vacated'
}

type Bed = {
  id: string
  property_id?: string
  room_id: string
  bed_number: string
  status: 'available' | 'occupied' | 'maintenance'
  monthly_rate: number
}

type Room = {
  id: string
  property_id?: string | null
  room_number: string
  floor: number
  room_type: string
  base_rent: number
  beds_count?: number
}

type PaymentRecord = {
  id: string
  property_id?: string | null
  tenant_id: string
  tenant_name: string
  room_number: string
  amount: number
  payment_method: string
  payment_type: string
  paid_at: string
  month_covered?: string
  deleted_at?: string | null
  notes?: string
}

type Complaint = {
  id: string
  property_id?: string | null
  tenant_id?: string | null
  title: string
  tenant: string
  priority: 'High' | 'Medium' | 'Low'
  status: 'Open' | 'In progress' | 'Resolved'
  description?: string
  resolved_at?: string | null
  created_at: string
  updated_at?: string | null
}

type Expense = {
  id: string
  property_id?: string | null
  title: string
  category: string
  amount: number
  expense_date: string
  notes?: string
}

type ElectricityRecord = {
  id: string
  property_id?: string | null
  room_id?: string | null
  room: string
  previous_reading: number
  current_reading: number
  rate_per_unit: number
  reading_date: string
  period_start?: string | null
  period_end?: string | null
  calculation_type?: string | null
  split_breakdown?: any[] | null
}

function getYearMonthFromDate(dateStr: string | null | undefined): { year: number; month: number } {
  if (!dateStr) {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  }
  const cleanStr = String(dateStr).split('T')[0]
  const parts = cleanStr.split('-').map(Number)
  if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return { year: parts[0], month: parts[1] - 1 }
  }
  const d = new Date(dateStr)
  return { year: d.getFullYear(), month: d.getMonth() }
}

const navigation = [
  { label: 'Overview', icon: LayoutDashboard },
  { label: 'Property', icon: Building2 },
  { label: 'Rooms & Beds', icon: BedDouble },
  { label: 'Tenants', icon: Users },
  { label: 'Rent & Payments', icon: Wallet },
  { label: 'Electricity', icon: Zap },
  { label: 'Expenses', icon: Receipt },
  { label: 'Complaints', icon: MessageSquare },
  { label: 'Reports', icon: FileText },
  { label: 'Deleted Records', icon: Trash2 },
  { label: 'Settings', icon: Settings },
]

const currency = (val: number) => `₹${Number(val || 0).toLocaleString('en-IN')}`

export type PropertyType = 'pg_hostel' | 'apartment' | 'house' | 'other'

export function getPropertyType(prop?: { rules?: string | null } | null): PropertyType {
  if (!prop?.rules) return 'pg_hostel'
  try {
    const parsed = JSON.parse(prop.rules)
    if (parsed && typeof parsed === 'object' && parsed.property_type) {
      return parsed.property_type as PropertyType
    }
  } catch {
    if (['apartment', 'house', 'other', 'pg_hostel'].includes(prop.rules.trim())) {
      return prop.rules.trim() as PropertyType
    }
  }
  return 'pg_hostel'
}

// Room Capacity Calculation: Single = 1, Double = 2, Triple = 3, Four = 4
export function getRoomMaxCapacity(roomType: string, fallbackBeds?: number): number {
  const lower = (roomType || '').toLowerCase()
  if (lower.includes('single')) return 1
  if (lower.includes('double')) return 2
  if (lower.includes('triple')) return 3
  if (lower.includes('four')) return 4
  return fallbackBeds && fallbackBeds > 0 ? fallbackBeds : 2
}

export interface BedStatusInfo {
  isAvailable: boolean
  label: string
}

/**
 * Calculates the real-time operational availability of a bed.
 * A bed is ONLY available if:
 * 1. It is not currently occupied by another active tenant.
 * 2. Its parent room is NOT at full capacity (Single=1, Double=2, Triple=3, Four=4).
 * 3. Its status is not set to maintenance or unavailable.
 */
export function getEffectiveBedStatus(
  bed: Bed,
  rooms: Room[],
  tenants: Tenant[],
  currentTenantId?: string | null
): BedStatusInfo {
  // 1. Bed occupied by another active resident
  const occupant = tenants.find(
    (t) => t.bed_id === bed.id && t.status !== 'Vacated' && t.id !== currentTenantId
  )
  if (occupant) {
    return { isAvailable: false, label: 'OCCUPIED' }
  }

  // 2. Parent room capacity invariant
  const parentRoom = rooms.find((r) => r.id === bed.room_id)
  if (parentRoom) {
    const cap = getRoomMaxCapacity(parentRoom.room_type)
    const activeInRoom = tenants.filter(
      (t) => t.room_id === parentRoom.id && t.status !== 'Vacated' && t.id !== currentTenantId
    ).length
    if (activeInRoom >= cap) {
      return { isAvailable: false, label: 'ROOM FULL' }
    }
  }

  // 3. Database status check
  if (bed.status && bed.status !== 'available') {
    return { isAvailable: false, label: bed.status.toUpperCase() }
  }

  return { isAvailable: true, label: 'AVAILABLE' }
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" aria-label="Loading dashboard records">
      {/* Overview Top Bar Skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-2">
          <div className="h-7 w-48 rounded-xl bg-[#ebe4da]" />
          <div className="h-4 w-72 rounded-lg bg-[#f0e9df]" />
        </div>
        <div className="flex gap-2.5">
          <div className="h-10 w-28 rounded-xl bg-[#ebe4da]" />
          <div className="h-10 w-32 rounded-xl bg-[#dccfbf]" />
        </div>
      </div>

      {/* 4 Stat Cards Skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-5">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-2xl border border-[#ebe4da] bg-white p-4 sm:p-5 lg:p-6 shadow-sm space-y-3 min-w-0">
            <div className="flex items-center justify-between">
              <div className="h-4 w-24 rounded bg-[#f0e9df]" />
              <div className="size-8 rounded-xl bg-[#ebe4da]" />
            </div>
            <div className="h-8 w-36 rounded-lg bg-[#ebe4da]" />
            <div className="h-3 w-28 rounded bg-[#f5ede3]" />
          </div>
        ))}
      </div>

      {/* Main Content Area Skeleton */}
      <div className="rounded-2xl border border-[#ebe4da] bg-white p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-[#f2ede4] pb-4">
          <div className="h-5 w-44 rounded-lg bg-[#ebe4da]" />
          <div className="h-8 w-24 rounded-lg bg-[#f0e9df]" />
        </div>
        <div className="space-y-3 pt-2">
          {[1, 2, 3, 4, 5].map((row) => (
            <div key={row} className="flex items-center justify-between py-2.5 border-b border-[#faf7f2]">
              <div className="flex items-center gap-3">
                <div className="size-9 rounded-xl bg-[#f0e9df]" />
                <div className="space-y-1.5">
                  <div className="h-4 w-36 rounded bg-[#ebe4da]" />
                  <div className="h-3 w-24 rounded bg-[#f5ede3]" />
                </div>
              </div>
              <div className="h-5 w-20 rounded bg-[#f0e9df]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const router = useRouter()
  const supabase = createClient()

  // Navigation & UI state with localStorage persistence
  const { t, locale } = useI18n()
  const [active, setActive] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('baserabook_active_tab') || 'Overview'
    }
    return 'Overview'
  })
  const [mobileOpen, setMobileOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  // Persist tab selection across page refreshes
  useEffect(() => {
    if (typeof window !== 'undefined' && active) {
      localStorage.setItem('baserabook_active_tab', active)
    }
  }, [active])

  // User & Subscription state
  const [userId, setUserId] = useState<string | null>(null)
  const [userName, setUserName] = useState('')
  const [userEmail, setUserEmail] = useState('')
  const [userPhone, setUserPhone] = useState('')
  const [phoneInput, setPhoneInput] = useState('')
  const [confirmingPlanUpgrade, setConfirmingPlanUpgrade] = useState<{
    plan: PricingPlan
    cycle: 'yearly' | 'monthly'
  } | null>(null)
  const [trialStart, setTrialStart] = useState<string | null>(null)
  const [trialEnd, setTrialEnd] = useState<string | null>(null)
  const [subscriptionPlan, setSubscriptionPlan] = useState<string>('trial')
  const [subscriptionStatus, setSubscriptionStatus] = useState<string>('trialing')
  const [isTrialExpired, setIsTrialExpired] = useState(false)
  const [dashboardBillingCycle, setDashboardBillingCycle] = useState<'yearly' | 'monthly'>('yearly')

  // Real Database Business State (Multi-property support with strict property isolation & refresh persistence)
  const [properties, setProperties] = useState<Property[]>([])
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('baserabook_active_property_id') || ''
    }
    return ''
  })
  const [editingPropertyId, setEditingPropertyId] = useState<string | null>(null)

  // Persist property selection across page refreshes
  useEffect(() => {
    if (typeof window !== 'undefined' && selectedPropertyId) {
      localStorage.setItem('baserabook_active_property_id', selectedPropertyId)
    }
  }, [selectedPropertyId])

  // Centralized Entitlement State
  const entitlement: CustomerEntitlement = useMemo(() => {
    return resolveCustomerEntitlements(
      {
        hasPaidAccess: subscriptionStatus === 'active' || (subscriptionStatus === 'trialing' && !isTrialExpired),
        isTrialExpired,
        status: subscriptionStatus as any,
        plan: subscriptionPlan,
        trialStart,
        trialEnd,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        razorpaySubscriptionId: null,
        razorpayPaymentId: null,
        activeRecord: null,
      },
      properties.length
    )
  }, [subscriptionStatus, isTrialExpired, subscriptionPlan, trialStart, trialEnd, properties.length])

  // Active property derived helper
  const property: Property = useMemo(() => {
    return (
      properties.find((p) => p.id === selectedPropertyId) ||
      properties[0] || {
        id: '',
        name: '',
        address: '',
        contact: '',
        city: '',
        rules: null,
        upi_id: null,
        payment_link: null,
        upi_qr_url: null,
      }
    )
  }, [properties, selectedPropertyId])

  const propertyType = useMemo(() => getPropertyType(property), [property])
  const isPgHostel = propertyType === 'pg_hostel'

  const [rooms, setRooms] = useState<Room[]>([])
  const [beds, setBeds] = useState<Bed[]>([])
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [payments, setPayments] = useState<PaymentRecord[]>([])
  const [deletedPayments, setDeletedPayments] = useState<PaymentRecord[]>([])
  const [deletedTenants, setDeletedTenants] = useState<Tenant[]>([])
  const [trashRecords, setTrashRecords] = useState<TrashRecord[]>([])
  const [isLoadingTrash, setIsLoadingTrash] = useState(false)
  const [isRestoringTrashId, setIsRestoringTrashId] = useState<string | null>(null)
  const [purgeTarget, setPurgeTarget] = useState<TrashRecord | null>(null)
  const [isPurgingTrashId, setIsPurgingTrashId] = useState<string | null>(null)
  const [complaints, setComplaints] = useState<Complaint[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [electricity, setElectricity] = useState<ElectricityRecord[]>([])

  // Scoped views for the currently selected property (ensures strict isolation between multiple properties)
  const isSingleProperty = properties.length <= 1
  const currentPropId = property.id

  const currentPropertyRooms = useMemo(() => {
    if (!currentPropId) return rooms
    return rooms.filter((r) => {
      if (r.property_id) return r.property_id === currentPropId
      return isSingleProperty || properties[0]?.id === currentPropId
    })
  }, [rooms, currentPropId, isSingleProperty, properties])

  const currentPropertyRoomIds = useMemo(() => {
    return new Set(currentPropertyRooms.map((r) => r.id))
  }, [currentPropertyRooms])

  const currentPropertyBeds = useMemo(() => {
    if (!currentPropId) return beds
    return beds.filter((b) => {
      if (b.property_id) return b.property_id === currentPropId
      if (b.room_id && currentPropertyRoomIds.has(b.room_id)) return true
      return isSingleProperty || properties[0]?.id === currentPropId
    })
  }, [beds, currentPropId, currentPropertyRoomIds, isSingleProperty, properties])

  const currentPropertyTenants = useMemo(() => {
    if (!currentPropId) return tenants
    return tenants.filter((t) => {
      if (t.property_id) return t.property_id === currentPropId
      if (t.room_id && currentPropertyRoomIds.has(t.room_id)) return true
      return isSingleProperty || properties[0]?.id === currentPropId
    })
  }, [tenants, currentPropId, currentPropertyRoomIds, isSingleProperty, properties])

  const currentPropertyTenantIds = useMemo(() => {
    return new Set(currentPropertyTenants.map((t) => t.id))
  }, [currentPropertyTenants])

  const currentPropertyPayments = useMemo(() => {
    if (!currentPropId) return payments
    return payments.filter((p) => {
      if (p.property_id) return p.property_id === currentPropId
      if (p.tenant_id && currentPropertyTenantIds.has(p.tenant_id)) return true
      return isSingleProperty || properties[0]?.id === currentPropId
    })
  }, [payments, currentPropId, currentPropertyTenantIds, isSingleProperty, properties])

  const currentPropertyExpenses = useMemo(() => {
    if (!currentPropId) return expenses
    return expenses.filter((e) => {
      if (e.property_id) return e.property_id === currentPropId
      return isSingleProperty || properties[0]?.id === currentPropId
    })
  }, [expenses, currentPropId, isSingleProperty, properties])

  const currentPropertyElectricity = useMemo(() => {
    if (!currentPropId) return electricity
    return electricity.filter((el) => {
      if (el.property_id) return el.property_id === currentPropId
      if (el.room_id && currentPropertyRoomIds.has(el.room_id)) return true
      return isSingleProperty || properties[0]?.id === currentPropId
    })
  }, [electricity, currentPropId, currentPropertyRoomIds, isSingleProperty, properties])

  const currentPropertyComplaints = useMemo(() => {
    if (!currentPropId) return complaints
    return complaints.filter((c) => {
      if (c.property_id) return c.property_id === currentPropId
      return isSingleProperty || properties[0]?.id === currentPropId
    })
  }, [complaints, currentPropId, isSingleProperty, properties])

  // Due Dates & Undo State
  const [tenantDueFilter, setTenantDueFilter] = useState<'all' | 'paid' | 'due' | 'overdue'>('all')
  const [undoItem, setUndoItem] = useState<{
    id: string
    type: 'payment' | 'tenant'
    name: string
    secondsLeft: number
    intervalId?: any
  } | null>(null)

  // Modal Visibility States
  const [isSavingProperty, setIsSavingProperty] = useState(false)
  const [showPropertyModal, setShowPropertyModal] = useState(false)
  const [showDeletePropertyModal, setShowDeletePropertyModal] = useState(false)
  const [deletePropertyInput, setDeletePropertyInput] = useState('')
  const [isDeletingProperty, setIsDeletingProperty] = useState(false)

  // Loading & Double-Click Protection States for Modals
  const [isSavingRoom, setIsSavingRoom] = useState(false)
  const [isSavingBed, setIsSavingBed] = useState(false)
  const [isSavingTenant, setIsSavingTenant] = useState(false)
  const [isSavingPayment, setIsSavingPayment] = useState(false)
  const [isSavingExpense, setIsSavingExpense] = useState(false)
  const [isSavingElectricity, setIsSavingElectricity] = useState(false)
  const [isSavingComplaint, setIsSavingComplaint] = useState(false)

  const [showRoomModal, setShowRoomModal] = useState(false)
  const [editingRoom, setEditingRoom] = useState<Room | null>(null)
  const [showAddBedModal, setShowAddBedModal] = useState<{ open: boolean; roomId: string; roomNumber: string }>({
    open: false,
    roomId: '',
    roomNumber: '',
  })
  const [editingBed, setEditingBed] = useState<Bed | null>(null)

  const [showTenantModal, setShowTenantModal] = useState(false)
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null)

  // Auto-prefill dynamic state for Tenant Modal
  const [tenantFormRoomId, setTenantFormRoomId] = useState<string>('unassigned')
  const [tenantFormRent, setTenantFormRent] = useState<number>(0)
  const [tenantFormBedId, setTenantFormBedId] = useState<string>('unassigned')

  // Auto-prefill dynamic state for Electricity Modal
  const [elecFormRoomId, setElecFormRoomId] = useState<string>('general')
  const [elecFormPrevReading, setElecFormPrevReading] = useState<number>(0)

  // Auto-prefill dynamic state for Payment Modal
  const [paymentFormTenantId, setPaymentFormTenantId] = useState<string>('')
  const [paymentFormAmount, setPaymentFormAmount] = useState<number>(0)
  const [paymentFormType, setPaymentFormType] = useState<string>('rent')
  const [paymentFormNotes, setPaymentFormNotes] = useState<string>('')

  const [tenantFormDueDay, setTenantFormDueDay] = useState<number>(5)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [selectedTenantForSchedule, setSelectedTenantForSchedule] = useState<Tenant | null>(null)
  const [editingPayment, setEditingPayment] = useState<PaymentRecord | null>(null)
  const [showExpenseModal, setShowExpenseModal] = useState(false)
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null)
  const [showElectricityModal, setShowElectricityModal] = useState(false)
  const [editingElectricity, setEditingElectricity] = useState<ElectricityRecord | null>(null)

  // Owner Payment Options (UPI ID, Link, QR Code)
  const [ownerPaymentDetails, setOwnerPaymentDetails] = useState<{
    upiId: string
    paymentLink: string
    qrCodeUrl: string
  }>({ upiId: '', paymentLink: '', qrCodeUrl: '' })
  const [isSavingPaymentDetails, setIsSavingPaymentDetails] = useState(false)
  const [isDecodingQr, setIsDecodingQr] = useState(false)
  const [paymentValidationErrors, setPaymentValidationErrors] = useState<{
    upiId?: string
    paymentLink?: string
    qrCode?: string
    general?: string
  }>({})
  const [paymentSuccessMessage, setPaymentSuccessMessage] = useState<string>('')

  // Prevent background scrolling when mobile navigation drawer is active
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [mobileOpen])

  // Sync payment options with selected property if configured specifically for this property
  useEffect(() => {
    if (!property?.id) return
    if (property.upi_id || property.payment_link || property.upi_qr_url) {
      setOwnerPaymentDetails({
        upiId: property.upi_id || '',
        paymentLink: property.payment_link || '',
        qrCodeUrl: property.upi_qr_url || '',
      })
    }
  }, [property?.id, property?.upi_id, property?.payment_link, property?.upi_qr_url])

  // Mid-Cycle Electricity Split Modal State
  const [showMidCycleModal, setShowMidCycleModal] = useState(false)
  const [midCycleRoomId, setMidCycleRoomId] = useState<string>('all')
  const [midCyclePeriodStart, setMidCyclePeriodStart] = useState<string>('')
  const [midCyclePeriodEnd, setMidCyclePeriodEnd] = useState<string>('')
  const [midCycleBillAmount, setMidCycleBillAmount] = useState<number>(0)
  const [midCycleRatePerUnit, setMidCycleRatePerUnit] = useState<number>(10)
  const [midCycleTotalUnits, setMidCycleTotalUnits] = useState<number>(0)
  const [midCycleUseMeterReadings, setMidCycleUseMeterReadings] = useState<boolean>(false)
  const [midCycleResidentReadings, setMidCycleResidentReadings] = useState<Record<string, { opening: number; closing: number }>>({})
  const [midCycleResidentDates, setMidCycleResidentDates] = useState<Record<string, { joiningDate: string; vacatedDate: string | null }>>({})
  const [midCycleCalculatedSplit, setMidCycleCalculatedSplit] = useState<MidCycleSplitResult | null>(null)
  const [isCalculatingMidCycle, setIsCalculatingMidCycle] = useState(false)
  const [midCycleError, setMidCycleError] = useState<string | null>(null)
  const [midCycleSuccessMessage, setMidCycleSuccessMessage] = useState<string | null>(null)
  const [midCycleShowAdvanced, setMidCycleShowAdvanced] = useState(false)
  const [isSavingMidCycleSplit, setIsSavingMidCycleSplit] = useState(false)
  const [viewingSplitRecord, setViewingSplitRecord] = useState<ElectricityRecord | null>(null)

  const [showComplaintModal, setShowComplaintModal] = useState(false)
  const [editingComplaint, setEditingComplaint] = useState<Complaint | null>(null)
  const [showPricingModal, setShowPricingModal] = useState(false)
  const [showLogoutModal, setShowLogoutModal] = useState(false)
  const [selectedReceipt, setSelectedReceipt] = useState<PaymentRecord | null>(null)

  // Tenant Self-Service Portal Modal State
  const [portalTenant, setPortalTenant] = useState<Tenant | null>(null)
  const [portalLinkData, setPortalLinkData] = useState<{
    status: string
    url?: string
    tokenPreview?: string
    expiresAt?: string
    lastAccessedAt?: string | null
    accessCount?: number
  } | null>(null)
  const [isLoadingPortalStatus, setIsLoadingPortalStatus] = useState(false)
  const [isGeneratingPortalLink, setIsGeneratingPortalLink] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)

  // High-Impact Confirmation Modal
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    title: string
    description: string
    actionLabel: string
    isDestructive: boolean
    onConfirm: () => Promise<void>
  }>({
    open: false,
    title: '',
    description: '',
    actionLabel: 'Confirm',
    isDestructive: false,
    onConfirm: async () => {},
  })
  const [isConfirming, setIsConfirming] = useState(false)

  const flash = (text: string) => {
    setNotice(text)
    window.setTimeout(() => setNotice(''), 3500)
  }

  const [isUpgradingSubscription, setIsUpgradingSubscription] = useState(false)

  const loadRazorpayScript = () => {
    return new Promise<boolean>((resolve) => {
      if (typeof window !== 'undefined' && (window as any).Razorpay) {
        resolve(true)
        return
      }
      const existing = document.getElementById('razorpay-checkout-script')
      if (existing) {
        existing.addEventListener('load', () => resolve(true))
        existing.addEventListener('error', () => resolve(false))
        return
      }
      const script = document.createElement('script')
      script.id = 'razorpay-checkout-script'
      script.src = 'https://checkout.razorpay.com/v1/checkout.js'
      script.async = true
      script.onload = () => resolve(true)
      script.onerror = () => resolve(false)
      document.body.appendChild(script)
    })
  }

  const handleUpgradePlan = async (targetPlanId: string = 'growth', customerPhoneOverride?: string) => {
    // Step 1: Open plan confirmation modal before launching payment gateway
    if (!customerPhoneOverride && !confirmingPlanUpgrade) {
      const selected = PRICING_PLANS.find((p) => p.id === targetPlanId)
      if (selected) {
        setPhoneInput(userPhone)
        setConfirmingPlanUpgrade({ plan: selected, cycle: dashboardBillingCycle })
        return
      }
    }

    if (isUpgradingSubscription) return
    setIsUpgradingSubscription(true)

    try {
      const selectedPlanObj =
        PRICING_PLANS.find((p) => p.id === targetPlanId) ||
        PRICING_PLANS.find((p) => p.id === 'growth')!
      const amount =
        dashboardBillingCycle === 'yearly'
          ? selectedPlanObj.yearlyPrice
          : selectedPlanObj.monthlyPrice

      const phoneToSend = (customerPhoneOverride || phoneInput || userPhone || '').trim()

      const res = await fetch('/api/razorpay/create-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planType: dashboardBillingCycle,
          plan: selectedPlanObj.id,
          amount,
          phone: phoneToSend,
        }),
      })

      const data = await res.json()

      if (!res.ok || !data.subscriptionId) {
        flash(data.error || 'Failed to initialize payment gateway. Please verify Razorpay keys in environment.')
        setIsUpgradingSubscription(false)
        return
      }

      const scriptReady = await loadRazorpayScript()
      if (!scriptReady) {
        flash('Unable to load payment gateway checkout. Please check internet connection.')
        setIsUpgradingSubscription(false)
        return
      }

      // Close confirmation dialog before launching checkout
      setConfirmingPlanUpgrade(null)

      // Only pass contact if customer has provided or verified a phone number.
      // NEVER use any developer or website owner fallback.
      const effectivePhone = (phoneToSend || data.user?.phone || userPhone || '').trim()

      const options = {
        key: data.keyId,
        subscription_id: data.subscriptionId,
        name: 'BaseraBook',
        description: `${selectedPlanObj.name} (${dashboardBillingCycle === 'yearly' ? 'Yearly' : 'Monthly'}) — ${formatINR(amount || 0)}`,
        image: '/favicon.ico',
        prefill: {
          name: userName || data.user?.name || '',
          email: userEmail || data.user?.email || '',
          ...(effectivePhone ? { contact: effectivePhone } : {}),
        },
        theme: {
          color: '#8b5a2b',
        },
        handler: async (paymentResponse: {
          razorpay_payment_id: string
          razorpay_subscription_id: string
          razorpay_signature: string
        }) => {
          try {
            const verifyRes = await fetch('/api/razorpay/verify-subscription', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpay_payment_id: paymentResponse.razorpay_payment_id,
                razorpay_subscription_id: paymentResponse.razorpay_subscription_id,
                razorpay_signature: paymentResponse.razorpay_signature,
                planType: dashboardBillingCycle,
                plan: selectedPlanObj.id,
              }),
            })

            const verifyData = await verifyRes.json()
            if (verifyRes.ok && verifyData.success) {
              if (verifyData.status === 'active') {
                setSubscriptionStatus('active')
                setSubscriptionPlan(verifyData.plan || selectedPlanObj.id)
                setIsTrialExpired(false)
                setTrialEnd(null)
                setShowPricingModal(false)
                flash(`🎉 ${selectedPlanObj.name} plan activated successfully!`)
                void fetchDashboardData()
              } else if (verifyData.status === 'trialing') {
                setSubscriptionStatus('trialing')
                setSubscriptionPlan(verifyData.plan || selectedPlanObj.id)
                setIsTrialExpired(false)
                setShowPricingModal(false)
                flash('✔ Subscription mandate authorized! Your first payment will start when your trial concludes.')
                void fetchDashboardData()
              } else {
                flash(verifyData.error || `Subscription status is ${verifyData.status}.`)
              }
            } else {
              flash(verifyData.error || 'Payment received, but server verification could not be confirmed.')
            }
          } catch (err: any) {
            flash(err?.message || 'Error communicating with verification server.')
          } finally {
            setIsUpgradingSubscription(false)
          }
        },
        modal: {
          ondismiss: () => {
            setIsUpgradingSubscription(false)
          },
        },
      }

      const rzp = new (window as any).Razorpay(options)
      rzp.on('payment.failed', (failResp: any) => {
        if (typeof window !== 'undefined') {
          console.warn('[Razorpay Checkout Mandate Failure]', {
            code: failResp.error?.code,
            description: failResp.error?.description,
            source: failResp.error?.source,
            step: failResp.error?.step,
            reason: failResp.error?.reason,
          })
        }
        flash(failResp.error?.description || 'Payment mandate authorization failed or was declined.')
        setIsUpgradingSubscription(false)
      })
      rzp.open()
    } catch (err: any) {
      console.error('Subscription checkout error:', err)
      flash(err?.message || 'Unable to open payment modal. Please try again.')
      setIsUpgradingSubscription(false)
    }
  }

  // ----------------------------------------------------------------------------
  // Real Database Fetching from Supabase
  // ----------------------------------------------------------------------------
  async function fetchDashboardData() {
    try {
      setLoading(true)
      const sessionCheck = await ensureFreshSession(supabase)
      const { data: authData } = await supabase.auth.getUser()
      const user = authData?.user || sessionCheck?.session?.user
      if (!user) {
        router.push('/login?next=/dashboard')
        return
      }

      setUserId(user.id)
      setUserEmail(user.email ?? '')
      setUserName(user.user_metadata?.full_name || user.email?.split('@')[0] || 'Property Owner')

      // Parallel fetch for all real customer records
      const [
        subRes,
        propRes,
        roomRes,
        bedRes,
        tenantRes,
        paymentRes,
        expenseRes,
        elecRes,
        complaintRes,
        profileRes,
      ] = await Promise.all([
        supabase.from('subscriptions').select('*').eq('owner_id', user.id).order('updated_at', { ascending: false }),
        supabase.from('properties').select('id,name,address,contact_number,city,rules,upi_id,payment_link,upi_qr_url').eq('owner_id', user.id).order('created_at', { ascending: true }),
        supabase.from('rooms').select('id,property_id,room_number,floor,room_type,base_rent').eq('owner_id', user.id).order('room_number', { ascending: true }),
        supabase.from('beds').select('id,property_id,room_id,bed_number,status,monthly_rate').eq('owner_id', user.id).order('bed_number', { ascending: true }),
        supabase.from('tenants').select('id,property_id,full_name,phone,email,emergency_contact,id_proof_type,id_proof_number,monthly_rent,security_deposit,joining_date,rent_due_day,status,room_id,bed_id,deleted_at,updated_at').eq('owner_id', user.id).order('created_at', { ascending: false }),
        supabase.from('payments').select('id,property_id,tenant_id,amount,payment_method,payment_type,paid_at,month_covered,deleted_at,notes').eq('owner_id', user.id).order('paid_at', { ascending: false }),
        supabase.from('expenses').select('id,property_id,title,category,amount,expense_date,notes').eq('owner_id', user.id).order('expense_date', { ascending: false }),
        supabase.from('electricity_readings').select('id,property_id,previous_reading,current_reading,rate_per_unit,reading_date,room_id,meter_number').eq('owner_id', user.id).order('reading_date', { ascending: false }),
        supabase.from('complaints').select('id,property_id,tenant_id,title,tenant,priority,status,description,resolved_at,created_at,updated_at').eq('owner_id', user.id).order('created_at', { ascending: false }),
        supabase.from('profiles').select('phone,upi_id,payment_link,upi_qr_url').eq('id', user.id).maybeSingle(),
      ])

      if (propRes.error) console.error('Failed to load properties:', propRes.error)
      if (roomRes.error) console.error('Failed to load rooms:', roomRes.error)
      if (bedRes.error) console.error('Failed to load beds:', bedRes.error)
      if (tenantRes.error) console.error('Failed to load tenants:', tenantRes.error)
      if (paymentRes.error) console.error('Failed to load payments:', paymentRes.error)
      if (expenseRes.error) console.error('Failed to load expenses:', expenseRes.error)
      if (elecRes.error) console.error('Failed to load electricity:', elecRes.error)
      if (complaintRes.error) console.error('Failed to load complaints:', complaintRes.error)

      const loadedPhone = (user.phone || user.user_metadata?.phone || profileRes?.data?.phone || '').trim()
      setUserPhone(loadedPhone)
      setPhoneInput(loadedPhone)

      // Multiple properties handling
      const propList = (propRes.data || []).map((p: any) => ({
        id: p.id,
        name: p.name || '',
        address: p.address || '',
        contact: p.contact_number || '',
        city: p.city || '',
        rules: p.rules || null,
        upi_id: p.upi_id || null,
        payment_link: p.payment_link || null,
        upi_qr_url: p.upi_qr_url || null,
      }))
      setProperties(propList)
      setSelectedPropertyId((curr) => {
        const savedPropId = typeof window !== 'undefined' ? localStorage.getItem('baserabook_active_property_id') : null
        const candidate = curr || savedPropId
        if (candidate && propList.some((p: any) => p.id === candidate)) {
          if (typeof window !== 'undefined') localStorage.setItem('baserabook_active_property_id', candidate)
          return candidate
        }
        const fallback = propList[0]?.id || ''
        if (typeof window !== 'undefined' && fallback) {
          localStorage.setItem('baserabook_active_property_id', fallback)
        }
        return fallback
      })

      // Saved Payment Options (UPI ID, payment link, QR Code image) - prefer active property then profile
      const activePropCandidate = propList.find((p: any) => p.id === (typeof window !== 'undefined' ? localStorage.getItem('baserabook_active_property_id') : null)) || propList[0]
      const loadedUpi = activePropCandidate?.upi_id || profileRes?.data?.upi_id || ''
      const loadedLink = activePropCandidate?.payment_link || profileRes?.data?.payment_link || ''
      const loadedQr = activePropCandidate?.upi_qr_url || profileRes?.data?.upi_qr_url || ''

      setOwnerPaymentDetails({
        upiId: loadedUpi,
        paymentLink: loadedLink,
        qrCodeUrl: loadedQr,
      })

      // Authoritative Subscription & Paid Access Resolution
      const subRecords = Array.isArray(subRes?.data) ? subRes.data : subRes?.data ? [subRes.data] : []
      const authSub = resolveAuthoritativeSubscription(subRecords)

      setTrialStart(authSub.trialStart)
      setTrialEnd(authSub.trialEnd)
      setSubscriptionStatus(authSub.status)
      setSubscriptionPlan(authSub.plan)
      setIsTrialExpired(authSub.isTrialExpired)

      // Database self-healing queue for records with missing property_id
      const missingPropertyUpdates: Promise<any>[] = []

      // Rooms
      const roomList: Room[] = (roomRes.data || []).map((r: any) => {
        const resolvedRoomProp = r.property_id || propList[0]?.id || null
        if (!r.property_id && resolvedRoomProp) {
          missingPropertyUpdates.push(
            supabase.from('rooms').update({ property_id: resolvedRoomProp }).eq('id', r.id)
          )
        }
        return {
          ...r,
          property_id: resolvedRoomProp,
        }
      })
      setRooms(roomList)

      // Beds
      const bedList: Bed[] = (bedRes.data || []).map((b: any) => {
        const roomObj = roomList.find((r) => r.id === b.room_id)
        const resolvedBedProp = b.property_id || roomObj?.property_id || propList[0]?.id || null
        if (!b.property_id && resolvedBedProp) {
          missingPropertyUpdates.push(
            supabase.from('beds').update({ property_id: resolvedBedProp }).eq('id', b.id)
          )
        }
        return {
          id: b.id,
          property_id: resolvedBedProp,
          room_id: b.room_id,
          bed_number: b.bed_number,
          status: b.status || 'available',
          monthly_rate: Number(b.monthly_rate || 0),
        }
      })
      setBeds(bedList)

      // Map helpers
      const roomMap = new Map(roomList.map((r) => [r.id, r.room_number]))
      const bedMap = new Map(bedList.map((b) => [b.id, b.bed_number]))

      // Process payments first to identify current-month rent payers
      const currentMonth = new Date().getMonth()
      const currentYear = new Date().getFullYear()
      const currentMonthStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`

      const rawPayments = paymentRes.data || []
      const rentPaidTenantIds = new Set<string>()
      for (const p of rawPayments) {
        if (!p.tenant_id || p.deleted_at) continue
        if (!p.payment_type || p.payment_type === 'rent') {
          const pDate = new Date(p.paid_at)
          const isSameMonth = pDate.getMonth() === currentMonth && pDate.getFullYear() === currentYear
          const isCoveredMonth = p.month_covered && p.month_covered.includes(currentMonthStr)
          const daysSincePayment = (Date.now() - pDate.getTime()) / (1000 * 60 * 60 * 24)
          if (isSameMonth || isCoveredMonth || (daysSincePayment >= 0 && daysSincePayment <= 28)) {
            rentPaidTenantIds.add(p.tenant_id)
          }
        }
      }

      const staleStatusUpdates: { id: string; status: 'Paid' | 'Pending' | 'Overdue' }[] = []

      // Tenants (Synchronize live rent status against actual payment records and due dates using single source of truth)
      const allTenants: Tenant[] = (tenantRes.data || []).map((t: any) => {
        const dueDay = Math.min(Math.max(Number(t.rent_due_day) || 5, 1), 31)
        let accurateStatus: 'Paid' | 'Pending' | 'Overdue' | 'Vacated' = t.status || 'Pending'

        if (t.status === 'Vacated') {
          accurateStatus = 'Vacated'
        } else {
          const rentStatus = calculateTenantRentStatus({
            tenant: t,
            payments: paymentRes.data || [],
            referenceDate: new Date(),
          })

          if (rentStatus.status === 'paid') {
            accurateStatus = 'Paid'
          } else if (rentStatus.status === 'overdue') {
            accurateStatus = 'Overdue'
          } else {
            // 'due_soon' or 'due_today'
            accurateStatus = 'Pending'
          }
        }

        if (t.status !== accurateStatus && !t.deleted_at) {
          staleStatusUpdates.push({ id: t.id, status: accurateStatus as any })
        }

        const roomObj = roomList.find((r) => r.id === t.room_id)
        const resolvedTenantProp = t.property_id || roomObj?.property_id || propList[0]?.id || null
        if (!t.property_id && resolvedTenantProp) {
          missingPropertyUpdates.push(
            supabase.from('tenants').update({ property_id: resolvedTenantProp }).eq('id', t.id)
          )
        }

        return {
          id: t.id,
          property_id: resolvedTenantProp,
          name: t.full_name,
          phone: t.phone || '',
          room_id: t.room_id,
          bed_id: t.bed_id,
          bed_number: t.bed_id ? bedMap.get(t.bed_id) || '' : '',
          room: t.room_id ? roomMap.get(t.room_id) || 'Unassigned' : 'Unassigned',
          rent: Number(t.monthly_rent || 0),
          deposit: Number(t.security_deposit || 0),
          joiningDate: t.joining_date,
          rent_due_day: dueDay,
          deleted_at: t.deleted_at || null,
          updated_at: t.updated_at || null,
          status: accurateStatus,
        }
      })
      setTenants(allTenants.filter((t) => !t.deleted_at))
      setDeletedTenants(allTenants.filter((t) => !!t.deleted_at))

      // Populate Payments with accurate tenant names and rooms
      const tenantNameMap = new Map(allTenants.map((t) => [t.id, t.name]))
      const tenantRoomMap = new Map(allTenants.map((t) => [t.id, t.room]))
      const allPayments: PaymentRecord[] = rawPayments.map((p: any) => {
        const tenantObj = allTenants.find((t) => t.id === p.tenant_id)
        const resolvedPayProp = p.property_id || tenantObj?.property_id || propList[0]?.id || null
        if (!p.property_id && resolvedPayProp) {
          missingPropertyUpdates.push(
            supabase.from('payments').update({ property_id: resolvedPayProp }).eq('id', p.id)
          )
        }
        return {
          id: p.id,
          property_id: resolvedPayProp,
          tenant_id: p.tenant_id,
          tenant_name: tenantNameMap.get(p.tenant_id) || 'Unknown Resident',
          room_number: tenantRoomMap.get(p.tenant_id) || 'N/A',
          amount: Number(p.amount || 0),
          payment_method: p.payment_method || 'upi',
          payment_type: p.payment_type || 'rent',
          paid_at: p.paid_at,
          month_covered: p.month_covered || undefined,
          deleted_at: p.deleted_at || null,
          notes: p.notes,
        }
      })
      setPayments(allPayments.filter((p) => !p.deleted_at))
      setDeletedPayments(allPayments.filter((p) => !!p.deleted_at))

      // Background synchronization to keep database status in sync with calculated due dates
      if (staleStatusUpdates.length > 0) {
        Promise.all(
          staleStatusUpdates.map((item) =>
            supabase.from('tenants').update({ status: item.status, updated_at: new Date().toISOString() }).eq('id', item.id)
          )
        ).catch(() => {})
      }

      // Expenses, Electricity, Complaints with self-healing property links
      setExpenses((expenseRes.data || []).map((e: any) => {
        const resolvedExpProp = e.property_id || propList[0]?.id || null
        if (!e.property_id && resolvedExpProp) {
          missingPropertyUpdates.push(
            supabase.from('expenses').update({ property_id: resolvedExpProp }).eq('id', e.id)
          )
        }
        return {
          ...e,
          property_id: resolvedExpProp,
          amount: Number(e.amount),
        }
      }))

      let rawElecData = elecRes.data
      if (elecRes.error || !rawElecData) {
        console.warn('Initial electricity query encountered error, falling back to base columns:', elecRes.error)
        const { data: fallbackElec, error: fbErr } = await supabase
          .from('electricity_readings')
          .select('id,property_id,previous_reading,current_reading,rate_per_unit,reading_date,room_id,meter_number')
          .eq('owner_id', user.id)
          .order('reading_date', { ascending: false })
        if (!fbErr && fallbackElec) {
          rawElecData = fallbackElec
        }
      }

      setElectricity((rawElecData || []).map((el: any) => {
        const roomObj = roomList.find((r) => r.id === el.room_id)
        const resolvedElecProp = el.property_id || roomObj?.property_id || propList[0]?.id || null
        if (!el.property_id && resolvedElecProp) {
          missingPropertyUpdates.push(
            supabase.from('electricity_readings').update({ property_id: resolvedElecProp }).eq('id', el.id)
          )
        }

        let parsedBreakdown = el.split_breakdown || null
        let pStart = el.period_start || null
        let pEnd = el.period_end || null
        let calcType = el.calculation_type || 'standard'

        if (el.meter_number && typeof el.meter_number === 'string') {
          try {
            if (el.meter_number.startsWith('{') && el.meter_number.includes('"split_breakdown"')) {
              const meta = JSON.parse(el.meter_number)
              parsedBreakdown = meta.split_breakdown || parsedBreakdown
              pStart = meta.period_start || pStart
              pEnd = meta.period_end || pEnd
              calcType = meta.calculation_type || calcType
            }
          } catch {
            // non-json meter number
          }
        }

        return {
          ...el,
          property_id: resolvedElecProp,
          room_id: el.room_id,
          room: el.room_id ? roomMap.get(el.room_id) || 'General' : 'General',
          previous_reading: Number(el.previous_reading),
          current_reading: Number(el.current_reading),
          rate_per_unit: Number(el.rate_per_unit),
          period_start: pStart,
          period_end: pEnd,
          calculation_type: calcType,
          split_breakdown: parsedBreakdown,
        }
      }))

      setComplaints((complaintRes.data || []).map((c: any) => {
        const resolvedCompProp = c.property_id || propList[0]?.id || null
        if (!c.property_id && resolvedCompProp) {
          missingPropertyUpdates.push(
            supabase.from('complaints').update({ property_id: resolvedCompProp }).eq('id', c.id)
          )
        }
        return {
          ...c,
          property_id: resolvedCompProp,
        }
      }))

      // Execute background self-healing updates if any were detected
      if (missingPropertyUpdates.length > 0) {
        Promise.all(missingPropertyUpdates).catch(() => {})
      }

      // Load trash records asynchronously in background so initial dashboard render is never blocked
      void getTrashRecordsAction().then((trashRes) => {
        if (trashRes.success && trashRes.records) {
          setTrashRecords(trashRes.records)
        }
      }).catch((e) => {
        console.error('Failed to load trash records:', e)
      })
    } catch (err) {
      console.error('Failed to load dashboard records:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchDashboardData()
  }, [])

  // Lazy-load trash records if owner navigates to Deleted Records tab before background fetch finished
  useEffect(() => {
    if (active === 'Deleted Records' && trashRecords.length === 0 && !isLoadingTrash) {
      void loadTrashRecords()
    }
  }, [active])

  const loadTrashRecords = async () => {
    setIsLoadingTrash(true)
    try {
      const res = await getTrashRecordsAction()
      if (res.success && res.records) {
        setTrashRecords(res.records)
      }
    } catch (err) {
      console.error('Failed to reload trash records:', err)
    } finally {
      setIsLoadingTrash(false)
    }
  }

  // Fast optimistic trash insertion to avoid blocking delete operations with heavy audit queries
  const addOptimisticTrash = (entityType: TrashEntityType, targetId: string, entityName: string, details: string) => {
    setTrashRecords((prev) => [
      {
        id: `trash_${Date.now()}`,
        target_id: String(targetId),
        entity_type: entityType,
        entity_name: entityName,
        details,
        deleted_at: new Date().toISOString(),
        deleted_by: userEmail || 'PG Owner',
        snapshot: {},
      },
      ...prev,
    ])
  }

  // ----------------------------------------------------------------------------
  // Calculations for Real Metrics (No Fake Data) - Scoped Strictly to Selected Property
  // ----------------------------------------------------------------------------
  const totalCollectedMonth = useMemo(() => {
    const currentMonth = new Date().getMonth()
    const currentYear = new Date().getFullYear()
    return currentPropertyPayments
      .filter((p) => {
        const d = new Date(p.paid_at)
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear
      })
      .reduce((sum, p) => sum + p.amount, 0)
  }, [currentPropertyPayments])

  const totalRentPending = useMemo(() => {
    return currentPropertyTenants
      .filter((t) => t.status !== 'Paid' && t.status !== 'Vacated')
      .reduce((sum, t) => sum + t.rent, 0)
  }, [currentPropertyTenants])

  const totalExpensesMonth = useMemo(() => {
    const currentMonth = new Date().getMonth()
    const currentYear = new Date().getFullYear()
    return currentPropertyExpenses
      .filter((e) => {
        const d = new Date(e.expense_date)
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear
      })
      .reduce((sum, e) => sum + e.amount, 0)
  }, [currentPropertyExpenses])

  const totalElectricityPending = useMemo(() => {
    return currentPropertyElectricity.reduce((sum, el) => {
      const units = Math.max(0, el.current_reading - el.previous_reading)
      return sum + units * el.rate_per_unit
    }, 0)
  }, [currentPropertyElectricity])

  const activeTenantsCount = useMemo(() => {
    return currentPropertyTenants.filter((t) => t.status !== 'Vacated').length
  }, [currentPropertyTenants])

  const availableBedsCount = useMemo(() => {
    return currentPropertyBeds.filter((b) => b.status === 'available').length
  }, [currentPropertyBeds])

  const occupiedBedsCount = useMemo(() => {
    return currentPropertyBeds.filter((b) => b.status === 'occupied').length
  }, [currentPropertyBeds])

  const { daysRemaining, hoursRemaining, isEndingSoon } = useMemo(() => {
    if (!trialEnd) return { daysRemaining: null, hoursRemaining: null, isEndingSoon: false }
    const remainingMs = new Date(trialEnd).getTime() - Date.now()
    if (remainingMs <= 0) {
      return { daysRemaining: 0, hoursRemaining: 0, isEndingSoon: false }
    }
    const days = Math.floor(remainingMs / (1000 * 60 * 60 * 24))
    const hours = Math.floor(remainingMs / (1000 * 60 * 60))
    const isEndingSoon = remainingMs <= 48 * 60 * 60 * 1000 // 48 hours or less
    return { daysRemaining: days, hoursRemaining: hours, isEndingSoon }
  }, [trialEnd])

  // ----------------------------------------------------------------------------
  // Multi-Module Search Filtering (Real Data Search - Scoped to Selected Property)
  // ----------------------------------------------------------------------------
  const q = search.trim().toLowerCase()

  const filteredTenants = useMemo(() => {
    if (!q) return currentPropertyTenants
    return currentPropertyTenants.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.room.toLowerCase().includes(q) ||
        (t.bed_number && t.bed_number.toLowerCase().includes(q)) ||
        (t.phone && t.phone.includes(q)) ||
        t.status.toLowerCase().includes(q)
    )
  }, [currentPropertyTenants, q])

  const filteredRooms = useMemo(() => {
    if (!q) return currentPropertyRooms
    return currentPropertyRooms.filter(
      (r) =>
        r.room_number.toLowerCase().includes(q) ||
        r.room_type.toLowerCase().includes(q) ||
        String(r.floor).includes(q) ||
        currentPropertyTenants.some(
          (t) => t.room_id === r.id && t.status !== 'Vacated' && t.name.toLowerCase().includes(q)
        )
    )
  }, [currentPropertyRooms, currentPropertyTenants, q])

  const filteredPayments = useMemo(() => {
    if (!q) return currentPropertyPayments
    return currentPropertyPayments.filter(
      (p) =>
        p.tenant_name.toLowerCase().includes(q) ||
        p.room_number.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        p.payment_method.toLowerCase().includes(q) ||
        p.payment_type.toLowerCase().includes(q) ||
        (p.notes && p.notes.toLowerCase().includes(q))
    )
  }, [currentPropertyPayments, q])

  const filteredElectricity = useMemo(() => {
    if (!q) return currentPropertyElectricity
    return currentPropertyElectricity.filter(
      (el) => el.room.toLowerCase().includes(q) || el.reading_date.includes(q)
    )
  }, [currentPropertyElectricity, q])

  const filteredExpenses = useMemo(() => {
    if (!q) return currentPropertyExpenses
    return currentPropertyExpenses.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        e.category.toLowerCase().includes(q) ||
        (e.notes && e.notes.toLowerCase().includes(q)) ||
        String(e.amount).includes(q)
    )
  }, [currentPropertyExpenses, q])

  const filteredComplaints = useMemo(() => {
    if (!q) return currentPropertyComplaints
    return currentPropertyComplaints.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.tenant.toLowerCase().includes(q) ||
        c.priority.toLowerCase().includes(q) ||
        c.status.toLowerCase().includes(q) ||
        (c.description && c.description.toLowerCase().includes(q))
    )
  }, [currentPropertyComplaints, q])

  const currentSearchCount = useMemo(() => {
    if (!q) return 0
    switch (active) {
      case 'Tenants':
        return filteredTenants.length
      case 'Rooms & Beds':
        return filteredRooms.length
      case 'Rent & Payments':
        return filteredPayments.length
      case 'Electricity':
        return filteredElectricity.length
      case 'Expenses':
        return filteredExpenses.length
      case 'Complaints':
        return filteredComplaints.length
      default:
        return filteredTenants.length + filteredRooms.length
    }
  }, [active, q, filteredTenants, filteredRooms, filteredPayments, filteredElectricity, filteredExpenses, filteredComplaints])

  // ----------------------------------------------------------------------------
  // REAL CRUD ACTIONS & HIGH-IMPACT DIALOGS
  // ----------------------------------------------------------------------------

  // Save / Update Property (Supports Multiple Properties)
  async function handleSaveProperty(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!userId) {
      flash('User session not found. Please log in again.')
      return
    }
    const fd = new FormData(e.currentTarget)
    const name = String(fd.get('name') || '').trim()
    const address = String(fd.get('address') || '').trim()
    const contact = String(fd.get('contact') || '').trim()
    const city = String(fd.get('city') || '').trim()
    const propertyType = (String(fd.get('property_type') || 'pg_hostel').trim()) as PropertyType

    if (!name) {
      flash('Property Name is required.')
      return
    }

    if (!address) {
      flash('Property Address is required.')
      return
    }

    if (contact && !isValidPhone(contact)) {
      flash('Please enter a valid 10-15 digit contact phone number.')
      return
    }

    let existingRulesObj: Record<string, any> = {}
    if (editingPropertyId) {
      const currentTarget = properties.find((p) => p.id === editingPropertyId)
      if (currentTarget?.rules) {
        try {
          existingRulesObj = JSON.parse(currentTarget.rules)
        } catch {}
      }
    }
    const packedRules = JSON.stringify({
      ...existingRulesObj,
      property_type: propertyType,
      updated_at: new Date().toISOString(),
    })

    if (!editingPropertyId && !entitlement.canCreateProperty) {
      flash(entitlement.reason || 'Cannot add property: subscription property limit reached. Please visit Subscription or Settings to upgrade your plan.')
      setShowPropertyModal(false)
      setShowPricingModal(true)
      return
    }

    setIsSavingProperty(true)
    try {
      let targetId = editingPropertyId
      let res

      if (targetId) {
        res = await updatePropertyAction(targetId, {
          name,
          address,
          contact,
          city,
          rules: packedRules,
          upiId: ownerPaymentDetails?.upiId,
          paymentLink: ownerPaymentDetails?.paymentLink,
          qrCodeUrl: ownerPaymentDetails?.qrCodeUrl,
        })
      } else {
        res = await createPropertyAction({
          name,
          address,
          contact,
          city,
          rules: packedRules,
          upiId: ownerPaymentDetails?.upiId,
          paymentLink: ownerPaymentDetails?.paymentLink,
          qrCodeUrl: ownerPaymentDetails?.qrCodeUrl,
        })
      }

      if (!res.success) {
        if (res.code === 'PROPERTY_LIMIT_REACHED') {
          flash(res.error || 'Property limit reached. Please visit Subscription or Settings to upgrade your plan.')
          setShowPropertyModal(false)
          setShowPricingModal(true)
        } else {
          flash(res.error || 'Could not save property.')
        }
        return
      }

      if (res.property) {
        const savedProp = {
          id: res.property.id,
          name: res.property.name,
          address: res.property.address || '',
          contact: res.property.contact_number || '',
          city: res.property.city || '',
          rules: res.property.rules || packedRules,
          upi_id: res.property.upi_id || null,
          payment_link: res.property.payment_link || null,
          upi_qr_url: res.property.upi_qr_url || null,
        }
        if (targetId) {
          setProperties((prev) => prev.map((p) => (p.id === targetId ? savedProp : p)))
          flash(`Property "${name}" updated successfully.`)
        } else {
          setProperties((prev) => [...prev, savedProp])
          setSelectedPropertyId(savedProp.id)
          flash(`New property "${name}" added successfully.`)
        }
        setShowPropertyModal(false)
        setEditingPropertyId(null)
      }
    } catch (err: any) {
      flash('An unexpected error occurred while saving property.')
    } finally {
      setIsSavingProperty(false)
    }
  }

  // Delete Property (Requires Typing "DELETE" Safeguard)
  async function handleDeleteProperty() {
    if (deletePropertyInput.trim() !== 'DELETE' || !property.id || !userId) return
    setIsDeletingProperty(true)
    try {
      const res = await moveToTrashAction({
        entityType: 'property',
        entityId: property.id,
        entityName: property.name,
        details: `${property.city || 'Property'} · ${rooms.filter((r) => r.property_id === property.id).length} rooms`,
      })

      if (!res.success) {
        flash(res.error || 'Could not move property to Deleted Records.')
        return
      }

      const deletedId = property.id
      const remainingProps = properties.filter((p) => p.id !== deletedId)
      setProperties(remainingProps)
      setSelectedPropertyId(remainingProps[0]?.id || '')

      // Remove items scoped to deleted property
      setRooms((prev) => prev.filter((r) => r.property_id !== deletedId))
      setBeds((prev) => prev.filter((b) => b.property_id !== deletedId))
      setTenants((prev) => prev.filter((t) => t.property_id !== deletedId))
      setElectricity((prev) => prev.filter((el) => el.property_id !== deletedId))

      setShowDeletePropertyModal(false)
      setDeletePropertyInput('')
      flash('Property moved to Deleted Records.')
      addOptimisticTrash('property', deletedId, property.name, `${property.city || 'Property'} · ${rooms.filter((r) => r.property_id === deletedId).length} rooms`)
    } catch (err) {
      flash('Failed to delete property.')
    } finally {
      setIsDeletingProperty(false)
    }
  }

  // Add Room
  async function handleAddRoom(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (isSavingRoom) return
    const targetPropId = property.id || selectedPropertyId || properties[0]?.id
    if (!userId || !targetPropId) {
      flash('Please set up your property before adding rooms.')
      setShowPropertyModal(true)
      return
    }

    const fd = new FormData(e.currentTarget)
    const roomNumber = String(fd.get('room_number')).trim()
    const floor = Number(fd.get('floor') || 0)
    const roomType = String(fd.get('room_type') || 'Single')
    const baseRent = Number(fd.get('base_rent') || 0)
    const maxCap = getRoomMaxCapacity(roomType)
    const bedsCount = Math.max(1, Number(fd.get('beds_count') || maxCap))

    if (!roomNumber) return

    setIsSavingRoom(true)
    try {
      const { data: newRoom, error: roomErr } = await supabase
        .from('rooms')
        .insert({
          owner_id: userId,
          property_id: targetPropId,
          room_number: roomNumber,
          floor,
          room_type: roomType,
          base_rent: baseRent,
        })
        .select('id,property_id,room_number,floor,room_type,base_rent')
        .single()

      if (roomErr) {
        flash(roomErr.message.includes('unique') ? 'A room with this number already exists.' : 'Could not add room.')
        return
      }

      // Auto-create associated beds matching capacity
      const bedsToInsert = Array.from({ length: bedsCount }, (_, i) => ({
        owner_id: userId,
        property_id: targetPropId,
        room_id: newRoom.id,
        bed_number: `${roomNumber}-${String.fromCharCode(65 + i)}`,
        status: 'available',
        monthly_rate: baseRent,
      }))

      const { data: insertedBeds } = await supabase.from('beds').insert(bedsToInsert).select('id,property_id,room_id,bed_number,status,monthly_rate')

      const createdRoom: Room = {
        ...newRoom,
        property_id: newRoom.property_id || targetPropId,
      }
      setRooms((prev) => [...prev, createdRoom])
      if (insertedBeds) {
        setBeds((prev) => [...prev, ...insertedBeds.map((b: any) => ({ ...b, property_id: b.property_id || targetPropId, monthly_rate: Number(b.monthly_rate) }))])
      }
      setShowRoomModal(false)
      flash(`Room ${roomNumber} added with ${bedsCount} bed${bedsCount > 1 ? 's' : ''}.`)
    } catch {
      flash('An error occurred while creating the room.')
    } finally {
      setIsSavingRoom(false)
    }
  }

  // Edit Room
  async function handleUpdateRoom(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (isSavingRoom) return
    if (!userId || !editingRoom) return

    const fd = new FormData(e.currentTarget)
    const roomNumber = String(fd.get('room_number')).trim()
    const floor = Number(fd.get('floor') || 0)
    const roomType = String(fd.get('room_type') || 'Single')
    const baseRent = Number(fd.get('base_rent') || 0)
    const targetPropId = editingRoom.property_id || property.id || selectedPropertyId || properties[0]?.id

    if (!roomNumber) return

    setIsSavingRoom(true)
    try {
      const { data: updated, error } = await supabase
        .from('rooms')
        .update({
          room_number: roomNumber,
          floor,
          room_type: roomType,
          base_rent: baseRent,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingRoom.id)
        .eq('owner_id', userId)
        .select('id,property_id,room_number,floor,room_type,base_rent')
        .single()

      if (error) {
        flash('Could not update room details.')
        return
      }

      const updatedRoom: Room = {
        ...editingRoom,
        ...updated,
        property_id: updated?.property_id || targetPropId,
      }
      setRooms((prev) => prev.map((r) => (r.id === editingRoom.id ? updatedRoom : r)))
      setEditingRoom(null)
      flash(`Room ${roomNumber} updated successfully.`)
    } catch {
      flash('An error occurred while updating the room.')
    } finally {
      setIsSavingRoom(false)
    }
  }

  // Delete Room
  async function handleDeleteRoom(roomId: string, roomNumber: string) {
    const targetRoom = rooms.find((r) => r.id === roomId)
    setConfirmDialog({
      open: true,
      title: `Move Room ${roomNumber} to Deleted Records?`,
      description: 'The room and its associated beds will be moved to Deleted Records. You can restore them anytime from the Deleted Records tab.',
      actionLabel: 'Move to Trash',
      isDestructive: true,
      onConfirm: async () => {
        const res = await moveToTrashAction({
          entityType: 'room',
          entityId: roomId,
          entityName: `Room ${roomNumber}`,
          details: `${targetRoom?.room_type || 'Room'} · Floor ${targetRoom?.floor || 0}`,
        })
        if (!res.success) {
          flash(res.error || 'Could not move room to Deleted Records.')
          return
        }
        setRooms((prev) => prev.filter((r) => r.id !== roomId))
        setBeds((prev) => prev.filter((b) => b.room_id !== roomId))
        setTenants((prev) => prev.map((t) => (t.room_id === roomId ? { ...t, room: 'Unassigned', room_id: null, bed_id: null, bed_number: '' } : t)))
        flash('Room moved to Deleted Records.')
        addOptimisticTrash('room', roomId, `Room ${roomNumber}`, `${targetRoom?.room_type || 'Room'} · Floor ${targetRoom?.floor || 0}`)
      },
    })
  }

  // Add Bed to Room
  async function handleAddBed(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (isSavingBed) return
    const targetRoom = rooms.find((r) => r.id === showAddBedModal.roomId)
    const targetPropId = targetRoom?.property_id || property.id || selectedPropertyId || properties[0]?.id
    if (!userId || !targetPropId || !showAddBedModal.roomId) {
      flash('Could not determine property for room.')
      return
    }

    const fd = new FormData(e.currentTarget)
    const bedNumber = String(fd.get('bed_number')).trim()
    const rate = Number(fd.get('monthly_rate') || 0)

    if (!bedNumber) return

    setIsSavingBed(true)
    try {
      const { data, error } = await supabase
        .from('beds')
        .insert({
          owner_id: userId,
          property_id: targetPropId,
          room_id: showAddBedModal.roomId,
          bed_number: bedNumber,
          status: 'available',
          monthly_rate: rate,
        })
        .select('id,property_id,room_id,bed_number,status,monthly_rate')
        .single()

      if (error) {
        flash('Could not add bed. Bed number might already exist in this room.')
        return
      }

      setBeds((prev) => [...prev, { ...data, property_id: data.property_id || targetPropId, monthly_rate: Number(data.monthly_rate) }])
      setShowAddBedModal({ open: false, roomId: '', roomNumber: '' })
      flash(`Bed ${bedNumber} added.`)
    } catch {
      flash('An error occurred while adding the bed.')
    } finally {
      setIsSavingBed(false)
    }
  }

  // Update / Edit Bed Details
  async function handleUpdateBed(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (isSavingBed) return
    if (!userId || !editingBed) return

    const fd = new FormData(e.currentTarget)
    const bedNumber = String(fd.get('bed_number')).trim()
    const rate = Number(fd.get('monthly_rate') || 0)
    const status = String(fd.get('status') || editingBed.status)

    if (!bedNumber) {
      flash('Bed number is required.')
      return
    }

    setIsSavingBed(true)
    try {
      const { error } = await supabase
        .from('beds')
        .update({
          bed_number: bedNumber,
          monthly_rate: rate,
          status: status as any,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingBed.id)
        .eq('owner_id', userId)

      if (error) {
        flash('Could not update bed. Bed number might already exist.')
        return
      }

      setBeds((prev) =>
        prev.map((b) =>
          b.id === editingBed.id
            ? { ...b, bed_number: bedNumber, monthly_rate: rate, status: status as any }
            : b
        )
      )
      setEditingBed(null)
      flash(`Bed ${bedNumber} updated.`)
    } catch {
      flash('An error occurred while updating the bed.')
    } finally {
      setIsSavingBed(false)
    }
  }

  // Toggle Bed Status
  async function handleToggleBedStatus(bedId: string, currentStatus: string) {
    if (!userId) return
    const nextStatus = currentStatus === 'available' ? 'maintenance' : currentStatus === 'maintenance' ? 'available' : 'available'
    const { error } = await supabase
      .from('beds')
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq('id', bedId)
      .eq('owner_id', userId)

    if (!error) {
      setBeds((prev) => prev.map((b) => (b.id === bedId ? { ...b, status: nextStatus as any } : b)))
      flash(`Bed status updated to ${nextStatus}.`)
    }
  }

  // Delete Bed
  async function handleDeleteBed(bedId: string, bedNumber: string) {
    const isOccupied = tenants.some((t) => t.bed_id === bedId && t.status !== 'Vacated')
    if (isOccupied) {
      flash(`Cannot delete Bed ${bedNumber} because it is currently assigned to an active resident.`)
      return
    }

    setConfirmDialog({
      open: true,
      title: `Move Bed ${bedNumber} to Deleted Records?`,
      description: 'Move this bed to Deleted Records? You can restore it anytime.',
      actionLabel: 'Move to Trash',
      isDestructive: true,
      onConfirm: async () => {
        const res = await moveToTrashAction({
          entityType: 'bed',
          entityId: bedId,
          entityName: `Bed ${bedNumber}`,
          details: 'Bed Inventory Unit',
        })
        if (!res.success) {
          flash(res.error || 'Could not move bed to Deleted Records.')
          return
        }
        setBeds((prev) => prev.filter((b) => b.id !== bedId))
        flash('Bed moved to Deleted Records.')
        addOptimisticTrash('bed', bedId, `Bed ${bedNumber}`, 'Bed Inventory Unit')
      },
    })
  }

  // Add Tenant (Enforces Room Capacity + Bed Validation + Proactive Session Freshness)
  async function handleAddTenant(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (isSavingTenant) return
    if (!userId) return

    // CRITICAL: Extract HTMLFormElement and FormData synchronously before any asynchronous await!
    const form = e.currentTarget
    const fd = new FormData(form)

    const name = String(fd.get('name') || '').trim()
    const phone = String(fd.get('phone') || '').trim()
    const roomId = String(fd.get('room_id') || '') || null
    const bedId = String(fd.get('bed_id') || '') || null
    const rent = Number(fd.get('rent') || 0)
    const deposit = Number(fd.get('deposit') || 0)
    const dueDay = Math.min(Math.max(Number(fd.get('rent_due_day') || 5), 1), 31)
    const joiningDate = String(fd.get('joining_date') || '') || new Date().toISOString().slice(0, 10)

    if (!name || rent <= 0) {
      flash('Please provide a valid tenant name and monthly rent.')
      return
    }

    if (!phone || !isValidPhone(phone)) {
      flash('Please enter a valid 10-15 digit tenant contact phone number.')
      return
    }

    setIsSavingTenant(true)
    try {
      const sessionCheck = await ensureFreshSession(supabase)
      if (!sessionCheck.valid) {
        flash('Your session has expired. Please sign in again.')
        router.push('/login?next=/dashboard')
        return
      }

      // 1. Room Capacity Validation
      if (roomId && roomId !== 'unassigned') {
        const targetRoom = rooms.find((r) => r.id === roomId)
        if (targetRoom) {
          const roomBeds = beds.filter((b) => b.room_id === targetRoom.id)
          const maxCapacity = getRoomMaxCapacity(targetRoom.room_type, roomBeds.length)
          const currentActiveTenants = tenants.filter(
            (t) => t.room_id === targetRoom.id && t.status !== 'Vacated'
          )

          if (currentActiveTenants.length >= maxCapacity) {
            flash(
              `Capacity exceeded: Room ${targetRoom.room_number} (${targetRoom.room_type}) only accommodates ${maxCapacity} resident(s).`
            )
            return
          }
        }
      }

      // 2. Bed Assignment Validation
      if (bedId && bedId !== 'unassigned') {
        const isBedOccupied = tenants.some(
          (t) => t.bed_id === bedId && t.status !== 'Vacated'
        )
        if (isBedOccupied) {
          flash('The selected bed is already occupied by another active resident.')
          return
        }
      }

      // 3. Server Action Execution (with resilient client fallback)
      let createdTenant: any = null
      const targetRoomObj = rooms.find((r) => r.id === roomId)
      const targetPropId = property.id || selectedPropertyId || targetRoomObj?.property_id || properties[0]?.id || null

      const actionRes = await createTenantAction({
        name,
        phone,
        roomId,
        bedId,
        propertyId: targetPropId,
        rent,
        deposit,
        joiningDate,
        dueDay,
      })

      if (actionRes.success && actionRes.tenant) {
        createdTenant = actionRes.tenant
      } else {
        if (actionRes.error?.includes('session has expired')) {
          flash('Your session has expired. Please sign in again.')
          router.push('/login?next=/dashboard')
          return
        }

        const today = new Date().getDate()
        const initialStatus = today > dueDay ? 'Overdue' : 'Pending'

        // Direct client fallback using guaranteed columns
        const { data: newTenant, error } = await supabase
          .from('tenants')
          .insert({
            owner_id: userId,
            property_id: targetPropId,
            room_id: roomId && roomId !== 'unassigned' ? roomId : null,
            bed_id: bedId && bedId !== 'unassigned' ? bedId : null,
            full_name: name,
            phone,
            monthly_rent: rent,
            security_deposit: deposit,
            joining_date: joiningDate,
            rent_due_day: dueDay,
            status: initialStatus,
          })
          .select('id,property_id,full_name,phone,monthly_rent,security_deposit,joining_date,status,room_id,bed_id,rent_due_day')
          .single()

        if (error) {
          if (error.code === 'PGRST303' || error.message?.includes('JWT') || error.message?.includes('expired')) {
            flash('Your session has expired. Please sign in again.')
            router.push('/login?next=/dashboard')
            return
          }
          flash(actionRes.error || error.message || 'Could not register resident record.')
          return
        }
        createdTenant = newTenant
      }

      // If bed was assigned, set bed status to 'occupied' (skip redundant DB update if server action already handled it)
      if (createdTenant.bed_id) {
        if (!actionRes?.success) {
          await supabase.from('beds').update({ status: 'occupied' }).eq('id', createdTenant.bed_id)
        }
        setBeds((prev) => prev.map((b) => (b.id === createdTenant.bed_id ? { ...b, status: 'occupied' } : b)))
      }

      const roomName = rooms.find((r) => r.id === createdTenant.room_id)?.room_number || 'Unassigned'
      const bedName = beds.find((b) => b.id === createdTenant.bed_id)?.bed_number || ''
      const tenantStatus = createdTenant.status || (new Date().getDate() > dueDay ? 'Overdue' : 'Pending')

      setTenants((prev) => [
        {
          id: createdTenant.id,
          property_id: createdTenant.property_id || targetPropId || property.id,
          name: createdTenant.full_name,
          phone: createdTenant.phone,
          room_id: createdTenant.room_id,
          bed_id: createdTenant.bed_id,
          bed_number: bedName,
          room: roomName,
          rent: Number(createdTenant.monthly_rent),
          deposit: Number(createdTenant.security_deposit || 0),
          joiningDate: createdTenant.joining_date,
          rent_due_day: Number(createdTenant.rent_due_day || dueDay),
          status: tenantStatus,
        },
        ...prev,
      ])

      setShowTenantModal(false)
      flash(`Resident ${name} registered successfully.`)
    } catch {
      flash('An error occurred while registering the resident.')
    } finally {
      setIsSavingTenant(false)
    }
  }

  // Edit Tenant Details
  async function handleUpdateTenant(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (isSavingTenant) return
    if (!userId || !editingTenant) return

    // CRITICAL: Extract HTMLFormElement and FormData synchronously before any asynchronous await!
    const form = e.currentTarget
    const fd = new FormData(form)

    const name = String(fd.get('name') || '').trim()
    const phone = String(fd.get('phone') || '').trim()
    const roomId = String(fd.get('room_id') || '') || null
    const bedId = String(fd.get('bed_id') || '') || null
    const rent = Number(fd.get('rent') || 0)
    const deposit = Number(fd.get('deposit') || 0)
    const dueDay = Math.min(Math.max(Number(fd.get('rent_due_day') || editingTenant.rent_due_day || 5), 1), 31)
    const joiningDate = String(fd.get('joining_date') || '') || editingTenant.joiningDate || new Date().toISOString().slice(0, 10)
    const status = String(fd.get('status') || editingTenant.status) as Tenant['status']

    if (!name || rent <= 0) {
      flash('Please provide a valid name and monthly rent.')
      return
    }

    if (phone && !isValidPhone(phone)) {
      flash('Please enter a valid 10-15 digit phone number.')
      return
    }

    setIsSavingTenant(true)
    try {
      const sessionCheck = await ensureFreshSession(supabase)
      if (!sessionCheck.valid) {
        flash('Your session has expired. Please sign in again.')
        router.push('/login?next=/dashboard')
        return
      }

      // Validate room capacity on reassignment
      if (roomId && roomId !== 'unassigned' && roomId !== editingTenant.room_id && status !== 'Vacated') {
        const targetRoom = rooms.find((r) => r.id === roomId)
        if (targetRoom) {
          const roomBeds = beds.filter((b) => b.room_id === targetRoom.id)
          const maxCapacity = getRoomMaxCapacity(targetRoom.room_type, roomBeds.length)
          const currentActiveTenants = tenants.filter(
            (t) => t.room_id === targetRoom.id && t.status !== 'Vacated' && t.id !== editingTenant.id
          )

          if (currentActiveTenants.length >= maxCapacity) {
            flash(`Cannot reassign: Room ${targetRoom.room_number} (${targetRoom.room_type}) is at full capacity (${maxCapacity} residents).`)
            return
          }
        }
      }

      // Validate bed assignment
      if (bedId && bedId !== 'unassigned' && bedId !== editingTenant.bed_id && status !== 'Vacated') {
        const isBedOccupied = tenants.some(
          (t) => t.bed_id === bedId && t.status !== 'Vacated' && t.id !== editingTenant.id
        )
        if (isBedOccupied) {
          flash('The selected bed is already occupied by another active resident.')
          return
        }
      }

      const finalRoomId = roomId && roomId !== 'unassigned' ? roomId : null
      const finalBedId = bedId && bedId !== 'unassigned' ? bedId : null

      // Automatically recalculate status based on current payments and due date if not explicitly vacated
      const currentMonth = new Date().getMonth()
      const currentYear = new Date().getFullYear()
      const currentMonthStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`
      const hasActivePayment = payments.some((p) => {
        if (p.tenant_id !== editingTenant.id || p.deleted_at) return false
        if (p.payment_type && p.payment_type !== 'rent') return false
        const pDate = new Date(p.paid_at)
        const isSameMonth = pDate.getMonth() === currentMonth && pDate.getFullYear() === currentYear
        const isCoveredMonth = p.month_covered && p.month_covered.includes(currentMonthStr)
        const daysSincePayment = (Date.now() - pDate.getTime()) / (1000 * 60 * 60 * 24)
        return isSameMonth || isCoveredMonth || (daysSincePayment >= 0 && daysSincePayment <= 28)
      })

      let finalStatus: Tenant['status'] = status
      if (status !== 'Vacated') {
        if (hasActivePayment) {
          finalStatus = 'Paid'
        } else if (status === editingTenant.status) {
          const today = new Date().getDate()
          finalStatus = today > dueDay ? 'Overdue' : 'Pending'
        }
      }

      const targetRoomObj = rooms.find((r) => r.id === finalRoomId)
      const targetPropId = editingTenant.property_id || property.id || selectedPropertyId || targetRoomObj?.property_id || properties[0]?.id || null

      // Server action execution with client fallback
      const updateRes = await updateTenantAction(editingTenant.id, {
        name,
        phone,
        roomId: finalRoomId,
        bedId: finalBedId,
        propertyId: targetPropId,
        rent,
        deposit,
        joiningDate,
        dueDay,
        status: finalStatus,
      })

      if (!updateRes.success) {
        if (updateRes.error?.includes('session has expired')) {
          flash('Your session has expired. Please sign in again.')
          router.push('/login?next=/dashboard')
          return
        }

        const updateData: Record<string, any> = {
          full_name: name,
          phone,
          room_id: finalRoomId,
          bed_id: finalBedId,
          monthly_rent: rent,
          security_deposit: deposit,
          joining_date: joiningDate,
          rent_due_day: dueDay,
          status: finalStatus,
          updated_at: new Date().toISOString(),
        }
        if (targetPropId) {
          updateData.property_id = targetPropId
        }

        const { error: clientUpdateErr } = await supabase
          .from('tenants')
          .update(updateData)
          .eq('id', editingTenant.id)
          .eq('owner_id', userId)

        if (clientUpdateErr) {
          if (clientUpdateErr.code === 'PGRST303' || clientUpdateErr.message?.includes('JWT') || clientUpdateErr.message?.includes('expired')) {
            flash('Your session has expired. Please sign in again.')
            router.push('/login?next=/dashboard')
            return
          }
          flash(`Could not update tenant: ${clientUpdateErr.message}`)
          return
        }
      }

      // Sync Bed Statuses (skip redundant DB update if server action already handled it)
      if (!updateRes?.success) {
        if (editingTenant.bed_id && editingTenant.bed_id !== finalBedId) {
          await supabase.from('beds').update({ status: 'available' }).eq('id', editingTenant.bed_id)
        }
        if (finalBedId && finalStatus !== 'Vacated') {
          await supabase.from('beds').update({ status: 'occupied' }).eq('id', finalBedId)
        } else if (finalBedId && finalStatus === 'Vacated') {
          await supabase.from('beds').update({ status: 'available' }).eq('id', finalBedId)
        }
      }
      if (editingTenant.bed_id && editingTenant.bed_id !== finalBedId) {
        setBeds((prev) => prev.map((b) => (b.id === editingTenant.bed_id ? { ...b, status: 'available' } : b)))
      }
      if (finalBedId && finalStatus !== 'Vacated') {
        setBeds((prev) => prev.map((b) => (b.id === finalBedId ? { ...b, status: 'occupied' } : b)))
      } else if (finalBedId && finalStatus === 'Vacated') {
        setBeds((prev) => prev.map((b) => (b.id === finalBedId ? { ...b, status: 'available' } : b)))
      }

      const roomName = rooms.find((r) => r.id === finalRoomId)?.room_number || 'Unassigned'
      const bedName = beds.find((b) => b.id === finalBedId)?.bed_number || ''

      setTenants((prev) =>
        prev.map((t) =>
          t.id === editingTenant.id
            ? {
                ...t,
                property_id: targetPropId || t.property_id,
                name,
                phone,
                room_id: finalRoomId,
                bed_id: finalBedId,
                room: roomName,
                bed_number: bedName,
                rent,
                deposit,
                joiningDate,
                rent_due_day: dueDay,
                status: finalStatus,
              }
            : t
        )
      )

      setEditingTenant(null)
      flash(`Resident ${name} updated successfully.`)
    } catch {
      flash('An error occurred while updating the resident.')
    } finally {
      setIsSavingTenant(false)
    }
  }

  // Vacate Tenant (Frees capacity and bed)
  async function handleVacateTenant(tenantId: string, tenantName: string) {
    const target = tenants.find((t) => t.id === tenantId)
    setConfirmDialog({
      open: true,
      title: `Vacate Resident ${tenantName}?`,
      description: 'This will mark the tenant as Vacated, release their bed to available inventory, and free room capacity.',
      actionLabel: 'Confirm Vacate',
      isDestructive: false,
      onConfirm: async () => {
        await supabase
          .from('tenants')
          .update({ status: 'Vacated', updated_at: new Date().toISOString() })
          .eq('id', tenantId)
          .eq('owner_id', userId)

        if (target?.bed_id) {
          await supabase.from('beds').update({ status: 'available' }).eq('id', target.bed_id)
          setBeds((prev) => prev.map((b) => (b.id === target.bed_id ? { ...b, status: 'available' } : b)))
        }

        setTenants((prev) => prev.map((t) => (t.id === tenantId ? { ...t, status: 'Vacated' } : t)))
        flash(`${tenantName} marked as vacated. Bed is now available.`)
      },
    })
  }

  // Delete Resident (Moves to Deleted Records / Trash)
  async function handleDeleteTenant(tenantId: string, tenantName: string) {
    const target = tenants.find((t) => t.id === tenantId)
    if (!target || !userId) return

    setConfirmDialog({
      open: true,
      title: `Move Resident ${tenantName} to Deleted Records?`,
      description: 'The resident record will be moved to Deleted Records. Any assigned bed will be released back to inventory. You can restore them anytime.',
      actionLabel: 'Move to Trash',
      isDestructive: true,
      onConfirm: async () => {
        const res = await moveToTrashAction({
          entityType: 'tenant',
          entityId: tenantId,
          entityName: tenantName,
          details: `Room ${target.room || 'Unassigned'} · Rent: ₹${target.rent || 0}`,
        })
        if (!res.success) {
          flash(res.error || 'Could not move resident to Deleted Records.')
          return
        }

        // Release bed in local state if occupied
        if (target.bed_id) {
          setBeds((prev) => prev.map((b) => (b.id === target.bed_id ? { ...b, status: 'available' } : b)))
        }

        setTenants((prev) => prev.filter((t) => t.id !== tenantId))
        flash('Resident moved to Deleted Records.')
        addOptimisticTrash('tenant', tenantId, tenantName, `Room ${target.room || 'Unassigned'} · Rent: ₹${target.rent || 0}`)
      },
    })
  }

  // Tenant Self-Service Portal Handlers
  async function handleOpenPortalModal(t: Tenant) {
    setPortalTenant(t)
    setPortalLinkData(null)
    setIsLoadingPortalStatus(true)
    try {
      const res = await getTenantLinkStatusAction(t.id)
      if (res.success) {
        setPortalLinkData(res as any)
      }
    } finally {
      setIsLoadingPortalStatus(false)
    }
  }

  async function handleGeneratePortalLink(tenantId: string) {
    setIsGeneratingPortalLink(true)
    try {
      const res = await generateTenantLinkAction(tenantId)
      if (res.success && res.url) {
        setPortalLinkData({
          status: 'active',
          url: res.url,
          tokenPreview: res.tokenPreview,
          expiresAt: res.expiresAt,
          accessCount: 0,
        })
        flash('Private portal link generated.')
      } else {
        flash(res.error || 'Failed to generate link.')
      }
    } finally {
      setIsGeneratingPortalLink(false)
    }
  }

  async function handleRegeneratePortalLink(tenantId: string) {
    await handleGeneratePortalLink(tenantId)
  }

  async function handleRevokePortalLink(tenantId: string) {
    setIsGeneratingPortalLink(true)
    try {
      const res = await revokeTenantLinkAction(tenantId)
      if (res.success) {
        setPortalLinkData({ status: 'revoked' })
        flash('Access link revoked.')
      } else {
        flash(res.error || 'Failed to revoke link.')
      }
    } finally {
      setIsGeneratingPortalLink(false)
    }
  }

  // Restore Record from Trash
  async function handleRestoreTrashRecord(record: TrashRecord) {
    if (isRestoringTrashId) return
    setIsRestoringTrashId(record.id)
    try {
      const res = await restoreTrashRecordAction(record.id)
      if (!res.success) {
        flash(res.error || 'Could not restore record.')
        return
      }

      flash(res.message || 'Record restored successfully.')
      setTrashRecords((prev) => prev.filter((r) => r.id !== record.id))

      // Refresh active state depending on entity type
      if (record.entity_type === 'tenant') {
        const { data: refreshedTenants } = await supabase.from('tenants').select('*').eq('owner_id', userId)
        if (refreshedTenants) {
          const roomMap = new Map(rooms.map((r) => [r.id, r.room_number]))
          const bedMap = new Map(beds.map((b) => [b.id, b.bed_number]))
          setTenants(
            refreshedTenants.map((t: any) => ({
              id: t.id,
              property_id: t.property_id || property.id || selectedPropertyId || properties[0]?.id || null,
              name: t.full_name,
              phone: t.phone || '',
              room_id: t.room_id,
              bed_id: t.bed_id,
              bed_number: t.bed_id ? bedMap.get(t.bed_id) || '' : '',
              room: t.room_id ? roomMap.get(t.room_id) || 'Unassigned' : 'Unassigned',
              rent: Number(t.monthly_rent || 0),
              deposit: Number(t.security_deposit || 0),
              joiningDate: t.joining_date,
              rent_due_day: Number(t.rent_due_day || 5),
              status: t.status || 'Pending',
            }))
          )
        }
        const { data: refreshedBeds } = await supabase.from('beds').select('*').eq('owner_id', userId)
        if (refreshedBeds) {
          setBeds(refreshedBeds.map((b: any) => ({ ...b, property_id: b.property_id || property.id || properties[0]?.id, monthly_rate: Number(b.monthly_rate || 0) })))
        }
      } else if (record.entity_type === 'property') {
        const { data: refreshedProps } = await supabase.from('properties').select('*').eq('owner_id', userId)
        if (refreshedProps) {
          setProperties(
            refreshedProps.map((p: any) => ({
              id: p.id,
              name: p.name,
              address: p.address || '',
              contact: p.contact_number || '',
              city: p.city || '',
              rules: p.rules || null,
              upi_id: p.upi_id || null,
              payment_link: p.payment_link || null,
              upi_qr_url: p.upi_qr_url || null,
            }))
          )
        }
      } else if (record.entity_type === 'room') {
        const { data: refreshedRooms } = await supabase.from('rooms').select('*').eq('owner_id', userId)
        if (refreshedRooms) setRooms(refreshedRooms.map((r: any) => ({ ...r, property_id: r.property_id || property.id || properties[0]?.id })))
        const { data: refreshedBeds } = await supabase.from('beds').select('*').eq('owner_id', userId)
        if (refreshedBeds) setBeds(refreshedBeds.map((b: any) => ({ ...b, property_id: b.property_id || property.id || properties[0]?.id, monthly_rate: Number(b.monthly_rate || 0) })))
      } else if (record.entity_type === 'bed') {
        const { data: refreshedBeds } = await supabase.from('beds').select('*').eq('owner_id', userId)
        if (refreshedBeds) setBeds(refreshedBeds.map((b: any) => ({ ...b, property_id: b.property_id || property.id || properties[0]?.id, monthly_rate: Number(b.monthly_rate || 0) })))
      } else if (record.entity_type === 'expense') {
        const { data: refreshedExp } = await supabase.from('expenses').select('*').eq('owner_id', userId)
        if (refreshedExp) setExpenses(refreshedExp.map((e: any) => ({ ...e, property_id: e.property_id || property.id || properties[0]?.id || null, amount: Number(e.amount) })))
      } else if (record.entity_type === 'complaint') {
        const { data: refreshedComp } = await supabase.from('complaints').select('*').eq('owner_id', userId)
        if (refreshedComp) setComplaints(refreshedComp.map((c: any) => ({ ...c, property_id: c.property_id || property.id || properties[0]?.id || null })))
      } else if (record.entity_type === 'payment') {
        const { data: refreshedPay } = await supabase.from('payments').select('*').eq('owner_id', userId)
        if (refreshedPay) {
          const tenantNameMap = new Map(tenants.map((t) => [t.id, t.name]))
          const tenantRoomMap = new Map(tenants.map((t) => [t.id, t.room]))
          setPayments(
            refreshedPay.map((p: any) => ({
              id: p.id,
              property_id: p.property_id || property.id || selectedPropertyId || properties[0]?.id || null,
              tenant_id: p.tenant_id,
              tenant_name: tenantNameMap.get(p.tenant_id) || 'Unknown Resident',
              room_number: tenantRoomMap.get(p.tenant_id) || 'N/A',
              amount: Number(p.amount || 0),
              payment_method: p.payment_method || 'upi',
              payment_type: p.payment_type || 'rent',
              paid_at: p.paid_at,
              month_covered: p.month_covered || undefined,
              notes: p.notes,
            }))
          )

          // If a restored payment covers rent, mark the tenant Paid
          const restoredPayment = refreshedPay.find((p: any) => p.id === record.target_id)
          if (restoredPayment?.tenant_id) {
            await supabase
              .from('tenants')
              .update({ status: 'Paid', updated_at: new Date().toISOString() })
              .eq('id', restoredPayment.tenant_id)
              .eq('owner_id', userId)

            setTenants((prev) =>
              prev.map((t) => (t.id === restoredPayment.tenant_id ? { ...t, status: 'Paid' } : t))
            )
          }
        }
      }
    } catch {
      flash('Failed to restore record.')
    } finally {
      setIsRestoringTrashId(null)
    }
  }

  // Permanently Delete Trash Record
  async function handleConfirmPermanentDelete() {
    if (!purgeTarget || isPurgingTrashId) return
    setIsPurgingTrashId(purgeTarget.id)
    try {
      const res = await permanentlyDeleteTrashAction(purgeTarget.id)
      if (!res.success) {
        flash(res.error || 'Could not permanently delete record.')
        return
      }
      flash('Record permanently deleted.')
      setTrashRecords((prev) => prev.filter((r) => r.id !== purgeTarget.id))
      setPurgeTarget(null)
    } catch {
      flash('Failed to permanently delete record.')
    } finally {
      setIsPurgingTrashId(null)
    }
  }

  // Record Payment
  async function handleRecordPayment(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (isSavingPayment) return
    if (!userId) return

    const fd = new FormData(e.currentTarget)
    const tenantId = String(fd.get('tenant_id'))
    const amount = Number(fd.get('amount') || 0)
    const method = String(fd.get('payment_method') || 'upi')
    const type = String(fd.get('payment_type') || 'rent')
    const monthCovered = String(fd.get('month_covered') || '').trim()
    const notes = String(fd.get('notes') || '').trim()

    const targetTenant = tenants.find((t) => t.id === tenantId)
    if (!targetTenant || amount <= 0) {
      flash('Please select a valid tenant and specify the payment amount.')
      return
    }

    // Preserve previous payment history and prevent duplicate monthly bills
    if (type === 'rent' && monthCovered) {
      const dupCheck = isDuplicateRentPayment({
        tenantId,
        monthCovered,
        payments,
      })
      if (dupCheck.isDuplicate) {
        const paidWhen = dupCheck.existingPayment?.paid_at
          ? ` on ${formatPaymentTimestamp(dupCheck.existingPayment.paid_at, 'Asia/Kolkata', locale)}`
          : ''
        flash(`Rent for ${monthCovered} has already been recorded for ${targetTenant.name}${paidWhen}. Duplicate monthly bill prevented.`)
        return
      }
    }

    setConfirmDialog({
      open: true,
      title: 'Confirm Payment Entry',
      description: `Record payment of ${currency(amount)} from ${targetTenant.name} via ${method.toUpperCase()} for ${monthCovered || 'rent'}? This will update your accounting ledger and generate a formal receipt.`,
      actionLabel: 'Confirm Payment',
      isDestructive: false,
      onConfirm: async () => {
        if (isSavingPayment) return
        setIsSavingPayment(true)
        try {
          const now = new Date().toISOString()
          const combinedNotes = monthCovered ? `[Month: ${monthCovered}] ${notes}`.trim() : notes
          const sessionCheck = await ensureFreshSession(supabase)
          if (!sessionCheck.valid) {
            flash('Your session has expired. Please sign in again.')
            router.push('/login?next=/dashboard')
            return
          }

          const targetPaymentPropId = property.id || selectedPropertyId || targetTenant.property_id || properties[0]?.id || null

          const [{ data: newPayment, error: payError }, { error: tenantErr }] = await Promise.all([
            supabase
              .from('payments')
              .insert({
                owner_id: userId,
                property_id: targetPaymentPropId,
                tenant_id: tenantId,
                amount,
                payment_method: method,
                payment_type: type,
                month_covered: monthCovered || null,
                paid_at: now,
                notes: combinedNotes || null,
              })
              .select('id,property_id,tenant_id,amount,payment_method,payment_type,month_covered,paid_at,notes')
              .single(),
            supabase.from('tenants').update({ status: 'Paid', updated_at: now }).eq('id', tenantId),
          ])

          if (payError || !newPayment) {
            if (payError?.code === 'PGRST303' || payError?.message?.includes('JWT') || payError?.message?.includes('expired')) {
              flash('Your session has expired. Please sign in again.')
              router.push('/login?next=/dashboard')
              return
            }
            flash(`Could not save payment to ledger: ${payError?.message || 'Database error'}`)
            return
          }

          const recordedPayment: PaymentRecord = {
            id: newPayment.id,
            property_id: newPayment.property_id || targetPaymentPropId || property.id,
            tenant_id: newPayment.tenant_id,
            tenant_name: targetTenant.name,
            room_number: targetTenant.room,
            amount: newPayment.amount,
            payment_method: newPayment.payment_method,
            payment_type: newPayment.payment_type,
            month_covered: monthCovered || undefined,
            paid_at: newPayment.paid_at,
            notes: newPayment.notes,
          }

          setPayments((prev) => [recordedPayment, ...prev])
          setTenants((prev) => prev.map((t) => (t.id === tenantId ? { ...t, status: 'Paid' } : t)))
          setShowPaymentModal(false)
          flash(`Payment of ${currency(amount)} recorded for ${targetTenant.name}.`)
          setSelectedReceipt(recordedPayment)
        } catch (err) {
          console.error('Record payment error:', err)
          flash('An unexpected error occurred while saving payment.')
        } finally {
          setIsSavingPayment(false)
        }
      },
    })
  }

  // Update / Edit Existing Payment
  async function handleUpdatePayment(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (isSavingPayment) return
    if (!userId || !editingPayment) return

    const fd = new FormData(e.currentTarget)
    const amount = Number(fd.get('amount') || 0)
    const method = String(fd.get('payment_method') || 'upi')
    const type = String(fd.get('payment_type') || 'rent')
    const paidAt = String(fd.get('paid_at')) || editingPayment.paid_at
    const monthCovered = String(fd.get('month_covered') || '').trim()
    const notes = String(fd.get('notes') || '').trim()

    if (amount <= 0) {
      flash('Please enter a valid payment amount.')
      return
    }

    setIsSavingPayment(true)
    try {
      const { error } = await supabase
        .from('payments')
        .update({
          amount,
          payment_method: method,
          payment_type: type,
          paid_at: paidAt,
          month_covered: monthCovered || null,
          notes: notes || null,
        })
        .eq('id', editingPayment.id)
        .eq('owner_id', userId)

      if (error) {
        flash(`Could not update payment: ${error.message}`)
        return
      }

      setPayments((prev) =>
        prev.map((p) =>
          p.id === editingPayment.id
            ? {
                ...p,
                amount,
                payment_method: method,
                payment_type: type,
                paid_at: paidAt,
                month_covered: monthCovered || undefined,
                notes,
              }
            : p
        )
      )
      setEditingPayment(null)
      flash('Payment record updated successfully.')
    } catch {
      flash('An error occurred while updating payment record.')
    } finally {
      setIsSavingPayment(false)
    }
  }

  // Delete / Reverse Payment (Financial Audit Compliance)
  async function handleDeletePayment(paymentId: string, amount: number, tenantName: string) {
    if (!userId) return
    const target = payments.find((p) => p.id === paymentId)
    if (!target) return

    const tenantDisplayName = tenantName?.trim() ? tenantName : 'Unknown Resident'
    setConfirmDialog({
      open: true,
      title: `Reverse Payment #${paymentId.slice(0, 8).toUpperCase()}?`,
      description: `For accounting compliance, historical payment records are not silently deleted. This payment of ${currency(amount)} for ${tenantDisplayName} will be reversed and moved to Deleted Records.`,
      actionLabel: 'Reverse Payment',
      isDestructive: true,
      onConfirm: async () => {
        const res = await moveToTrashAction({
          entityType: 'payment',
          entityId: paymentId,
          entityName: `Payment Receipt REC-${paymentId.slice(0, 8).toUpperCase()}`,
          details: `₹${amount} for ${tenantDisplayName} (Reversed)`,
        })
        if (!res.success) {
          flash(res.error || 'Could not reverse payment.')
          return
        }

        setPayments((prev) => prev.filter((p) => p.id !== paymentId))

        // Check if tenant has any other active payments for the current cycle
        if (target.tenant_id) {
          const remainingPayments = payments.filter(
            (p) => p.tenant_id === target.tenant_id && p.id !== paymentId && !p.deleted_at && (!p.payment_type || p.payment_type === 'rent')
          )
          if (remainingPayments.length === 0) {
            const tenantObj = tenants.find((t) => t.id === target.tenant_id)
            if (tenantObj && tenantObj.status !== 'Vacated') {
              const dueDay = Math.min(Math.max(Number(tenantObj.rent_due_day) || 5, 1), 31)
              const today = new Date().getDate()
              const newStatus: Tenant['status'] = today > dueDay ? 'Overdue' : 'Pending'

              await supabase
                .from('tenants')
                .update({ status: newStatus, updated_at: new Date().toISOString() })
                .eq('id', target.tenant_id)
                .eq('owner_id', userId)

              setTenants((prev) =>
                prev.map((t) => (t.id === target.tenant_id ? { ...t, status: newStatus } : t))
              )
            }
          }
        }

        flash(`Payment #${paymentId.slice(0, 8).toUpperCase()} reversed and moved to Deleted Records.`)
        addOptimisticTrash('payment', paymentId, `Payment Receipt REC-${paymentId.slice(0, 8).toUpperCase()}`, `₹${amount} for ${tenantDisplayName} (Reversed)`)
      },
    })
  }

  // Restore Payment
  async function handleRestorePayment(paymentId: string) {
    if (!userId) return
    const target = deletedPayments.find((p) => p.id === paymentId)
    if (!target) return

    const { error } = await supabase
      .from('payments')
      .update({ deleted_at: null })
      .eq('id', paymentId)
      .eq('owner_id', userId)

    if (error) {
      flash(`Could not restore payment: ${error.message}`)
      return
    }

    const restored = { ...target, deleted_at: null }
    setDeletedPayments((prev) => prev.filter((p) => p.id !== paymentId))
    setPayments((prev) => [restored, ...prev])

    // Update tenant to Paid
    if (target.tenant_id && (!target.payment_type || target.payment_type === 'rent')) {
      await supabase
        .from('tenants')
        .update({ status: 'Paid', updated_at: new Date().toISOString() })
        .eq('id', target.tenant_id)
        .eq('owner_id', userId)

      setTenants((prev) =>
        prev.map((t) => (t.id === target.tenant_id ? { ...t, status: 'Paid' } : t))
      )
    }

    flash(`Payment of ${currency(target.amount)} restored successfully.`)
  }

  // Execute Immediate Undo
  function handleExecuteUndo() {
    if (!undoItem) return
    if (undoItem.intervalId) clearInterval(undoItem.intervalId)
    const rec = trashRecords.find((r) => r.target_id === undoItem.id)
    if (rec) {
      void handleRestoreTrashRecord(rec)
    } else if (undoItem.type === 'payment') {
      void handleRestorePayment(undoItem.id)
    }
    setUndoItem(null)
  }

  // Add Expense
  async function handleAddExpense(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (isSavingExpense) return
    if (!userId) return

    const fd = new FormData(e.currentTarget)
    const title = String(fd.get('title')).trim()
    const category = String(fd.get('category') || 'maintenance')
    const amount = Number(fd.get('amount') || 0)
    const date = String(fd.get('expense_date')) || new Date().toISOString().slice(0, 10)
    const notes = String(fd.get('notes') || '').trim()

    if (!title || amount <= 0) {
      flash('Please provide an expense title and positive amount.')
      return
    }

    const targetExpensePropId = property.id || selectedPropertyId || properties[0]?.id || null

    setIsSavingExpense(true)
    try {
      const { data: newExp, error } = await supabase
        .from('expenses')
        .insert({
          owner_id: userId,
          property_id: targetExpensePropId,
          title,
          category,
          amount,
          expense_date: date,
          notes,
        })
        .select('id,property_id,title,category,amount,expense_date,notes')
        .single()

      if (error) {
        flash('Could not record expense.')
        return
      }

      setExpenses((prev) => [{ ...newExp, property_id: newExp.property_id || targetExpensePropId || property.id, amount: Number(newExp.amount) }, ...prev])
      setShowExpenseModal(false)
      flash('Expense logged successfully.')
    } catch {
      flash('An error occurred while logging the expense.')
    } finally {
      setIsSavingExpense(false)
    }
  }

  // Edit Expense
  async function handleUpdateExpense(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (isSavingExpense) return
    if (!userId || !editingExpense) return

    const fd = new FormData(e.currentTarget)
    const title = String(fd.get('title')).trim()
    const category = String(fd.get('category') || 'maintenance')
    const amount = Number(fd.get('amount') || 0)
    const date = String(fd.get('expense_date')) || editingExpense.expense_date
    const notes = String(fd.get('notes') || '').trim()

    if (!title || amount <= 0) return

    setIsSavingExpense(true)
    try {
      const { error } = await supabase
        .from('expenses')
        .update({
          title,
          category,
          amount,
          expense_date: date,
          notes,
        })
        .eq('id', editingExpense.id)
        .eq('owner_id', userId)

      if (error) {
        flash('Could not update expense.')
        return
      }

      setExpenses((prev) =>
        prev.map((ex) => (ex.id === editingExpense.id ? { ...ex, title, category, amount, expense_date: date, notes } : ex))
      )
      setEditingExpense(null)
      flash('Expense entry updated.')
    } catch {
      flash('An error occurred while updating the expense.')
    } finally {
      setIsSavingExpense(false)
    }
  }

  // Delete Expense (Moves to Deleted Records / Trash)
  async function handleDeleteExpense(id: string, title: string) {
    const target = expenses.find((e) => e.id === id)
    setConfirmDialog({
      open: true,
      title: `Move Expense "${title}" to Deleted Records?`,
      description: 'Move this expense entry to Deleted Records? It will be excluded from monthly totals and can be restored anytime.',
      actionLabel: 'Move to Trash',
      isDestructive: true,
      onConfirm: async () => {
        const res = await moveToTrashAction({
          entityType: 'expense',
          entityId: id,
          entityName: title,
          details: `${target?.category || 'Expense'} · ₹${target?.amount || 0}`,
        })
        if (!res.success) {
          flash(res.error || 'Could not move expense to Deleted Records.')
          return
        }
        setExpenses((prev) => prev.filter((e) => e.id !== id))
        flash('Expense moved to Deleted Records.')
        addOptimisticTrash('expense', id, title, `${target?.category || 'Expense'} · ₹${target?.amount || 0}`)
      },
    })
  }

  // Add Electricity Reading (Auto-prefills previous reading)
  async function handleAddElectricity(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (isSavingElectricity) return
    if (!userId) return

    const fd = new FormData(e.currentTarget)
    const roomId = String(fd.get('room_id'))
    const prevReading = Number(fd.get('previous_reading') || 0)
    const currReading = Number(fd.get('current_reading') || 0)
    const rate = Number(fd.get('rate_per_unit') || 10)
    const date = String(fd.get('reading_date')) || new Date().toISOString().slice(0, 10)

    if (currReading < prevReading) {
      flash('Current meter reading cannot be lower than the previous reading.')
      return
    }

    const targetRoomObj = rooms.find((r) => r.id === roomId)
    const targetElecPropId = property.id || selectedPropertyId || targetRoomObj?.property_id || properties[0]?.id || null

    setIsSavingElectricity(true)
    try {
      const { data, error } = await supabase
        .from('electricity_readings')
        .insert({
          owner_id: userId,
          property_id: targetElecPropId,
          room_id: roomId && roomId !== 'general' ? roomId : null,
          previous_reading: prevReading,
          current_reading: currReading,
          rate_per_unit: rate,
          reading_date: date,
        })
        .select('id,property_id,previous_reading,current_reading,rate_per_unit,reading_date,room_id')
        .single()

      if (error) {
        flash('Could not record meter reading.')
        return
      }

      const roomName = rooms.find((r) => r.id === data.room_id)?.room_number || 'General'

      setElectricity((prev) => [
        {
          id: data.id,
          property_id: data.property_id || targetElecPropId || property.id,
          room_id: data.room_id,
          room: roomName,
          previous_reading: Number(data.previous_reading),
          current_reading: Number(data.current_reading),
          rate_per_unit: Number(data.rate_per_unit),
          reading_date: data.reading_date,
        },
        ...prev,
      ])

      setShowElectricityModal(false)
      flash('Meter reading recorded successfully.')
    } catch {
      flash('An error occurred while recording meter reading.')
    } finally {
      setIsSavingElectricity(false)
    }
  }

  // Delete Electricity Reading
  async function handleDeleteElectricity(id: string, room: string) {
    const target = electricity.find((el) => el.id === id)
    setConfirmDialog({
      open: true,
      title: `Delete Reading for Room ${room}?`,
      description: 'Remove this electricity consumption record? It will be moved to Deleted Records and can be restored anytime.',
      actionLabel: 'Delete Reading',
      isDestructive: true,
      onConfirm: async () => {
        const res = await moveToTrashAction({
          entityType: 'electricity',
          entityId: id,
          entityName: `Meter Reading for Room ${room}`,
          details: `Date: ${target?.reading_date || 'N/A'} · Rate: ₹${target?.rate_per_unit || 10}/unit`,
        })
        if (!res.success) {
          flash(res.error || 'Could not delete meter reading.')
          return
        }
        setElectricity((prev) => prev.filter((el) => el.id !== id))
        flash('Meter reading moved to Deleted Records.')
        addOptimisticTrash('electricity', id, `Meter Reading for Room ${room}`, `Date: ${target?.reading_date || 'N/A'} · Rate: ₹${target?.rate_per_unit || 10}/unit`)
      },
    })
  }

  // Update / Edit Electricity Reading
  async function handleUpdateElectricity(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (isSavingElectricity) return
    if (!userId || !editingElectricity) return

    const fd = new FormData(e.currentTarget)
    const roomId = String(fd.get('room_id'))
    const prevReading = Number(fd.get('previous_reading') || 0)
    const currReading = Number(fd.get('current_reading') || 0)
    const rate = Number(fd.get('rate_per_unit') || 10)
    const date = String(fd.get('reading_date')) || editingElectricity.reading_date

    if (currReading < prevReading) {
      flash('Current meter reading cannot be lower than the previous reading.')
      return
    }

    const finalRoomId = roomId && roomId !== 'general' ? roomId : null
    const targetRoomObj = finalRoomId ? rooms.find((r) => r.id === finalRoomId) : null
    const targetElecPropId = editingElectricity.property_id || property.id || selectedPropertyId || targetRoomObj?.property_id || properties[0]?.id || null

    setIsSavingElectricity(true)
    try {
      const { error } = await supabase
        .from('electricity_readings')
        .update({
          property_id: targetElecPropId,
          room_id: finalRoomId,
          previous_reading: prevReading,
          current_reading: currReading,
          rate_per_unit: rate,
          reading_date: date,
        })
        .eq('id', editingElectricity.id)
        .eq('owner_id', userId)

      if (error) {
        flash('Could not update meter reading.')
        return
      }

      const roomName = rooms.find((r) => r.id === finalRoomId)?.room_number || 'General'

      setElectricity((prev) =>
        prev.map((el) =>
          el.id === editingElectricity.id
            ? {
                ...el,
                property_id: targetElecPropId || el.property_id,
                room_id: finalRoomId,
                room: roomName,
                previous_reading: prevReading,
                current_reading: currReading,
                rate_per_unit: rate,
                reading_date: date,
              }
            : el
        )
      )
      setEditingElectricity(null)
      flash('Meter reading updated successfully.')
    } catch {
      flash('An error occurred while updating meter reading.')
    } finally {
      setIsSavingElectricity(false)
    }
  }

  // Save / Update PG Owner Payment Options (UPI QR Code, Payment Link)
  async function handleSavePaymentDetails(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!userId) return

    setPaymentSuccessMessage('')
    const validation = validatePaymentDetailsForm(ownerPaymentDetails)
    if (!validation.isValid) {
      setPaymentValidationErrors(validation.errors)
      const firstErr =
        validation.errors.upiId ||
        validation.errors.paymentLink ||
        validation.errors.qrCode ||
        validation.errors.general ||
        'Please correct the invalid payment options.'
      flash(firstErr)
      return
    }

    setPaymentValidationErrors({})
    setIsSavingPaymentDetails(true)
    try {
      const upiId = validation.cleanData.upiId
      const paymentLink = validation.cleanData.paymentLink
      const qrCodeUrl = validation.cleanData.qrCodeUrl

      const { error } = await supabase
        .from('profiles')
        .update({
          upi_id: upiId,
          payment_link: paymentLink,
          upi_qr_url: qrCodeUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId)

      if (error) {
        flash('Could not save payment options: ' + error.message)
        return
      }

      // Also update property if selected
      if (property?.id) {
        await supabase
          .from('properties')
          .update({
            upi_id: upiId,
            payment_link: paymentLink,
            upi_qr_url: qrCodeUrl,
            updated_at: new Date().toISOString(),
          })
          .eq('id', property.id)

        // Keep local properties state updated
        setProperties((prev) =>
          prev.map((p) =>
            p.id === property.id
              ? { ...p, upi_id: upiId, payment_link: paymentLink, upi_qr_url: qrCodeUrl }
              : p
          )
        )
      }

      setOwnerPaymentDetails({
        upiId: upiId || '',
        paymentLink: paymentLink || '',
        qrCodeUrl: qrCodeUrl || '',
      })
      const successMsg = 'Payment options saved successfully. Future reminders and resident self-service portal will include them.'
      setPaymentSuccessMessage(successMsg)
      flash(successMsg)
    } catch (err: any) {
      flash(err?.message || 'Error saving payment options.')
    } finally {
      setIsSavingPaymentDetails(false)
    }
  }

  async function handleQrImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setPaymentSuccessMessage('')
    const fileCheck = validateQrImageFile(file)
    if (!fileCheck.isValid) {
      const errMsg = fileCheck.error || 'Invalid QR code image file.'
      flash(errMsg)
      setPaymentValidationErrors((prev) => ({ ...prev, qrCode: errMsg }))
      e.target.value = ''
      return
    }

    setIsDecodingQr(true)
    try {
      const reader = new FileReader()
      reader.onload = async (ev) => {
        const dataUrl = ev.target?.result as string
        if (!dataUrl) {
          setIsDecodingQr(false)
          return
        }

        const decodeRes = await decodeAndValidateQrImage(dataUrl)
        if (!decodeRes.isValid) {
          const errMsg = decodeRes.error || 'Could not verify a valid UPI payment QR code from the image.'
          flash(errMsg)
          setPaymentValidationErrors((prev) => ({ ...prev, qrCode: errMsg }))
          setIsDecodingQr(false)
          e.target.value = ''
          return
        }

        // Auto-extract UPI ID from QR uri if owner hasn't typed one yet
        let detectedUpiId = ''
        if (decodeRes.data?.uri.startsWith('upi://pay')) {
          try {
            const qStart = decodeRes.data.uri.indexOf('?')
            if (qStart !== -1) {
              const sp = new URLSearchParams(decodeRes.data.uri.slice(qStart + 1))
              detectedUpiId = sp.get('pa') || ''
            }
          } catch {}
        }

        setOwnerPaymentDetails((prev) => ({
          ...prev,
          qrCodeUrl: dataUrl,
          upiId: !prev.upiId && detectedUpiId ? detectedUpiId : prev.upiId,
        }))
        setPaymentValidationErrors((prev) => ({ ...prev, qrCode: undefined }))
        flash('UPI QR code verified successfully! Click "Save Payment Details" to persist.')
        setIsDecodingQr(false)
      }
      reader.onerror = () => {
        flash('Error reading the uploaded file.')
        setIsDecodingQr(false)
      }
      reader.readAsDataURL(file)
    } catch (err: any) {
      flash('Error processing QR image: ' + err?.message)
      setIsDecodingQr(false)
    }
  }

  // Calculate Mid-Cycle Electricity Split
  function handleCalculateMidCycleSplit() {
    setMidCycleError(null)
    setMidCycleSuccessMessage(null)
    setIsCalculatingMidCycle(true)

    try {
      const candidateTenants = currentPropertyTenants.filter((t) => {
        if (midCycleRoomId !== 'all' && t.room_id !== midCycleRoomId) return false
        return true
      })

      if (candidateTenants.length === 0) {
        setMidCycleError('No residents found for the selected room or property. Please assign residents first.')
        setMidCycleCalculatedSplit(null)
        setIsCalculatingMidCycle(false)
        return
      }

      if (!midCyclePeriodStart || !midCyclePeriodEnd) {
        setMidCycleError('Please specify both billing period start and end dates.')
        setMidCycleCalculatedSplit(null)
        setIsCalculatingMidCycle(false)
        return
      }

      if (midCyclePeriodEnd < midCyclePeriodStart) {
        setMidCycleError('Billing period end date cannot be earlier than start date.')
        setMidCycleCalculatedSplit(null)
        setIsCalculatingMidCycle(false)
        return
      }

      if (midCycleRatePerUnit <= 0) {
        setMidCycleError('Rate per unit must be greater than zero.')
        setMidCycleCalculatedSplit(null)
        setIsCalculatingMidCycle(false)
        return
      }

      const billUnits = Number(midCycleTotalUnits) || 0
      const billAmt = Number(midCycleBillAmount) || (billUnits * Number(midCycleRatePerUnit))

      if (billUnits <= 0 && billAmt <= 0 && !midCycleUseMeterReadings) {
        setMidCycleError('Please enter total units consumed or a valid bill amount.')
        setMidCycleCalculatedSplit(null)
        setIsCalculatingMidCycle(false)
        return
      }

      // Check for duplicate bill in same property, room, and period
      const finalRoomId = midCycleRoomId !== 'all' ? midCycleRoomId : null
      const targetRoomObj = finalRoomId ? rooms.find((r) => r.id === finalRoomId) : null
      const scopeLabel = finalRoomId ? `Room ${targetRoomObj?.room_number || ''}` : 'Property General Meter'
      const duplicate = currentPropertyElectricity.find((el) => {
        if (el.room_id !== finalRoomId) return false
        if (el.period_start && el.period_end && el.period_start === midCyclePeriodStart && el.period_end === midCyclePeriodEnd) return true
        if (el.reading_date === midCyclePeriodEnd && (!el.period_start || el.period_start === midCyclePeriodStart)) return true
        return false
      })

      const residentsForCalculation = candidateTenants.map((t) => {
        const readings = midCycleResidentReadings[t.id]
        const customDates = midCycleResidentDates[t.id]
        const joinDate = customDates?.joiningDate || t.joiningDate || midCyclePeriodStart
        let vacDate: string | null = null
        if (customDates?.vacatedDate !== undefined) {
          vacDate = customDates.vacatedDate
        } else if (t.status === 'Vacated') {
          vacDate = t.updated_at ? t.updated_at.slice(0, 10) : new Date().toISOString().slice(0, 10)
        }

        return {
          id: t.id,
          name: t.name,
          room: t.room,
          joiningDate: joinDate,
          vacatedDate: vacDate,
          moveInReading: readings?.opening !== undefined ? readings.opening : null,
          closingReading: readings?.closing !== undefined ? readings.closing : null,
        }
      })

      const splitResult = calculateMidCycleElectricitySplit({
        periodStart: midCyclePeriodStart,
        periodEnd: midCyclePeriodEnd,
        totalAmount: billAmt,
        totalUnits: billUnits,
        ratePerUnit: Number(midCycleRatePerUnit),
        useMeterReadings: midCycleUseMeterReadings,
        residents: residentsForCalculation,
      })

      // Sync computed units and bill amount in state
      if (splitResult.totalUnits > 0 && billUnits <= 0) {
        setMidCycleTotalUnits(splitResult.totalUnits)
      }
      if (splitResult.totalAmount > 0 && billAmt <= 0) {
        setMidCycleBillAmount(splitResult.totalAmount)
      }

      setMidCycleCalculatedSplit(splitResult)
      if (duplicate) {
        setMidCycleError(`Notice: An electricity bill for ${scopeLabel} covering ${midCyclePeriodStart} to ${midCyclePeriodEnd} is already recorded. Confirm the details below before saving.`)
      } else {
        setMidCycleSuccessMessage(`Split calculated successfully across ${splitResult.residentShares.length} resident(s). Review breakdown below and click "Save Bill" to record.`)
      }
    } catch (err: any) {
      setMidCycleError(err?.message || 'Error calculating electricity split.')
      setMidCycleCalculatedSplit(null)
    } finally {
      setIsCalculatingMidCycle(false)
    }
  }

  // Save Mid-Cycle Electricity Bill & Individual Tenant Shares
  async function handleSaveMidCycleSplit(e?: React.FormEvent) {
    if (e) e.preventDefault()
    if (isSavingMidCycleSplit) return
    if (!userId) return

    if (!midCycleCalculatedSplit) {
      setMidCycleError('Please calculate the bill first by clicking "Calculate Bill".')
      return
    }

    const finalRoomId = midCycleRoomId !== 'all' ? midCycleRoomId : null
    const targetRoomObj = finalRoomId ? rooms.find((r) => r.id === finalRoomId) : null
    const roomName = finalRoomId ? targetRoomObj?.room_number || 'Room' : 'General'
    const targetSplitPropId = property.id || selectedPropertyId || targetRoomObj?.property_id || properties[0]?.id || null

    setIsSavingMidCycleSplit(true)
    setMidCycleError(null)

    try {
      const splitMetadata = JSON.stringify({
        type: 'mid_cycle_split',
        period_start: midCyclePeriodStart,
        period_end: midCyclePeriodEnd,
        calculation_type: midCycleCalculatedSplit.calculationMethod,
        split_breakdown: midCycleCalculatedSplit.residentShares,
      })

      // 1. Direct clean insert for master electricity reading (eliminates failed round-trips)
      const baseReadingPayload = {
        owner_id: userId,
        property_id: targetSplitPropId,
        room_id: finalRoomId,
        meter_number: splitMetadata,
        previous_reading: 0,
        current_reading: midCycleCalculatedSplit.totalUnits,
        rate_per_unit: midCycleCalculatedSplit.ratePerUnit,
        reading_date: midCyclePeriodEnd,
      }
      const { data: readingData, error: baseErr } = await supabase
        .from('electricity_readings')
        .insert(baseReadingPayload)
        .select('id,property_id,room_id,previous_reading,current_reading,rate_per_unit,reading_date,meter_number')
        .single()

      if (baseErr || !readingData) {
        throw new Error('Failed to record electricity bill: ' + (baseErr?.message || 'Database insert error'))
      }

      // 2. Direct clean insert for individual tenant shares
      const baseShares = midCycleCalculatedSplit.residentShares.map((s) => ({
        owner_id: userId,
        reading_id: readingData.id,
        tenant_id: s.residentId,
        property_id: targetSplitPropId,
        room_id: finalRoomId,
        allocated_units: s.unitsConsumed ?? Math.round((s.sharePercentage / 100) * midCycleCalculatedSplit.totalUnits * 100) / 100,
        rate_per_unit: midCycleCalculatedSplit.ratePerUnit,
        amount_due: s.amountDue,
        amount_paid: 0,
        is_settled: false,
        billing_month: midCyclePeriodStart.slice(0, 7),
      }))

      if (baseShares.length > 0) {
        const { error: shareErr } = await supabase.from('tenant_electricity_shares').insert(baseShares)
        if (shareErr) {
          console.warn('Could not insert tenant shares:', shareErr.message)
        }
      }

      // 3. Update local state
      setElectricity((prev) => [
        {
          id: readingData.id,
          property_id: readingData.property_id || targetSplitPropId || property.id,
          room_id: readingData.room_id,
          room: roomName,
          previous_reading: 0,
          current_reading: Number(readingData.current_reading),
          rate_per_unit: Number(readingData.rate_per_unit),
          reading_date: readingData.reading_date,
          period_start: midCyclePeriodStart,
          period_end: midCyclePeriodEnd,
          calculation_type: midCycleCalculatedSplit.calculationMethod,
          split_breakdown: midCycleCalculatedSplit.residentShares,
        },
        ...prev,
      ])

      // Remember rate for property
      if (typeof window !== 'undefined' && targetSplitPropId) {
        localStorage.setItem(`baserabook_elec_rate_${targetSplitPropId}`, String(midCycleCalculatedSplit.ratePerUnit))
      }

      setShowMidCycleModal(false)
      flash(`Electricity split bill saved for ${midCycleCalculatedSplit.residentShares.length} resident(s).`)
    } catch (err: any) {
      setMidCycleError(err?.message || 'Failed to save electricity split.')
    } finally {
      setIsSavingMidCycleSplit(false)
    }
  }

  // Add Complaint
  async function handleAddComplaint(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (isSavingComplaint) return
    if (!userId) return

    const fd = new FormData(e.currentTarget)
    const title = String(fd.get('title')).trim()
    const tenantName = String(fd.get('tenant') || 'Resident').trim()
    const priority = String(fd.get('priority') || 'Medium') as 'High' | 'Medium' | 'Low'
    const desc = String(fd.get('description') || '').trim()

    if (!title) return

    const matchedTenant = tenants.find((t) => t.name.toLowerCase() === tenantName.toLowerCase())
    const targetCompPropId = property.id || selectedPropertyId || properties[0]?.id || matchedTenant?.property_id || null
    const targetTenantId = matchedTenant?.id || null

    setIsSavingComplaint(true)
    try {
      const { data, error } = await supabase
        .from('complaints')
        .insert({
          owner_id: userId,
          property_id: targetCompPropId,
          tenant_id: targetTenantId,
          tenant: tenantName,
          title,
          priority,
          status: 'Open',
          description: desc,
        })
        .select('id,property_id,tenant_id,title,tenant,priority,status,description,created_at')
        .single()

      if (error) {
        flash('Could not register complaint.')
        return
      }

      setComplaints((prev) => [{ ...data, property_id: data.property_id || targetCompPropId || property.id }, ...prev])
      setShowComplaintModal(false)
      flash('Complaint ticket logged.')
    } catch {
      flash('An error occurred while registering the complaint.')
    } finally {
      setIsSavingComplaint(false)
    }
  }

  // Resolve Complaint
  async function handleResolveComplaint(id: string) {
    const { error } = await supabase
      .from('complaints')
      .update({ status: 'Resolved', resolved_at: new Date().toISOString() })
      .eq('id', id)
      .eq('owner_id', userId)

    if (error) {
      flash('Could not update complaint.')
      return
    }

    setComplaints((prev) => prev.map((c) => (c.id === id ? { ...c, status: 'Resolved' } : c)))
    flash('Complaint marked as resolved.')
  }

  // Update / Edit Complaint
  async function handleUpdateComplaint(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (isSavingComplaint) return
    if (!userId || !editingComplaint) return

    const fd = new FormData(e.currentTarget)
    const title = String(fd.get('title')).trim()
    const tenantName = String(fd.get('tenant') || 'Resident').trim()
    const priority = String(fd.get('priority') || 'Medium') as 'High' | 'Medium' | 'Low'
    const status = String(fd.get('status') || editingComplaint.status) as 'Open' | 'In progress' | 'Resolved'
    const desc = String(fd.get('description') || '').trim()

    if (!title) {
      flash('Complaint title is required.')
      return
    }

    const matchedTenant = tenants.find((t) => t.name.toLowerCase() === tenantName.toLowerCase())
    const targetTenantId = matchedTenant?.id || editingComplaint.tenant_id || null

    setIsSavingComplaint(true)
    try {
      const { error } = await supabase
        .from('complaints')
        .update({
          title,
          tenant: tenantName,
          tenant_id: targetTenantId,
          priority,
          status,
          description: desc,
          resolved_at: status === 'Resolved' ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingComplaint.id)
        .eq('owner_id', userId)

      if (error) {
        flash('Could not update complaint.')
        return
      }

      setComplaints((prev) =>
        prev.map((c) =>
          c.id === editingComplaint.id
            ? {
                ...c,
                title,
                tenant: tenantName,
                priority,
                status,
                description: desc,
              }
            : c
        )
      )
      setEditingComplaint(null)
      flash('Complaint updated successfully.')
    } catch {
      flash('An error occurred while updating the complaint.')
    } finally {
      setIsSavingComplaint(false)
    }
  }

  // Delete Complaint (Moves to Deleted Records / Trash)
  async function handleDeleteComplaint(id: string, title: string) {
    const target = complaints.find((c) => c.id === id)
    setConfirmDialog({
      open: true,
      title: `Move Ticket "${title}" to Deleted Records?`,
      description: 'Move this complaint ticket to Deleted Records? You can restore it anytime.',
      actionLabel: 'Move to Trash',
      isDestructive: true,
      onConfirm: async () => {
        const res = await moveToTrashAction({
          entityType: 'complaint',
          entityId: id,
          entityName: title,
          details: `Resident: ${target?.tenant || 'General'} · Priority: ${target?.priority || 'Medium'}`,
        })
        if (!res.success) {
          flash(res.error || 'Could not move ticket to Deleted Records.')
          return
        }
        setComplaints((prev) => prev.filter((c) => c.id !== id))
        flash('Ticket moved to Deleted Records.')
        void loadTrashRecords()
      },
    })
  }

  // Sign out (Triggers Confirmation Modal)
  async function executeSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#faf8f5] text-[#2c221e] font-sans">
      {/* Toast Notification */}
      {notice && (
        <div className="fixed right-5 top-5 z-50 flex items-center gap-2 rounded-xl bg-[#202536] px-4 py-3 text-xs font-semibold text-white shadow-xl transition-all animate-in fade-in slide-in-from-top-2">
          <Check className="size-4 text-[#8bd8b4]" />
          {notice}
        </div>
      )}

      {/* Sidebar Navigation */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col border-r border-[#ebe4da] bg-white transition-transform lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-[76px] items-center justify-between border-b border-[#ebe4da] px-5 sm:px-6 bg-white">
          <BaseraBookLogo iconSize={36} />
          <button className="lg:hidden p-1.5 rounded-lg hover:bg-[#faf7f2] text-[#6c635a]" onClick={() => setMobileOpen(false)} aria-label="Close menu">
            <X className="size-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3.5 pt-5">
          <p className="mb-2.5 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-[#9c8e80]">Workspace</p>
          <nav className="flex flex-col gap-1">
            {navigation.map((item) => {
              const Icon = item.icon
              const isActive = active === item.label
              const openCount = item.label === 'Complaints' ? complaints.filter((c) => c.status !== 'Resolved').length : 0
              const displayLabel =
                item.label === 'Overview'
                  ? 'Dashboard'
                  : item.label === 'Property'
                  ? 'Properties'
                  : item.label === 'Rooms & Beds'
                  ? isPgHostel ? 'Rooms & Beds' : 'Rooms & Units'
                  : item.label === 'Tenants'
                  ? isPgHostel ? 'Residents' : 'Residents / Tenants'
                  : item.label === 'Settings'
                  ? 'Subscription & Settings'
                  : item.label
              return (
                <button
                  key={item.label}
                  onClick={() => {
                    setActive(item.label)
                    setMobileOpen(false)
                  }}
                  className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-[13px] font-medium transition-all ${
                    isActive
                      ? 'bg-[#f4ebe1] text-[#784d28] font-semibold shadow-2xs'
                      : 'text-[#6a635b] hover:bg-[#faf7f2] hover:text-[#2c221e]'
                  }`}
                >
                  <Icon className={`size-[17px] shrink-0 ${isActive ? 'text-[#784d28]' : 'text-[#8c7e72]'}`} />
                  <span className="truncate">{displayLabel}</span>
                  {openCount > 0 && (
                    <span className="ml-auto rounded-full bg-[#faefe4] px-2 py-0.5 text-[10px] font-bold text-[#8b5a2b]">
                      {openCount}
                    </span>
                  )}
                </button>
              )
            })}
          </nav>
        </div>
      </aside>

      {mobileOpen && (
        <button
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-[#22263b]/20 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Main Content Area */}
      <main className="lg:pl-[248px]">
        {/* Top Header */}
        <header className="sticky top-0 z-20 border-b border-[#ebe4da] bg-white/95 backdrop-blur px-3 sm:px-6 lg:px-8 py-2.5">
          <div className="flex items-center justify-between gap-2 sm:gap-4 min-w-0">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <button className="lg:hidden p-1.5 rounded-lg hover:bg-[#faf7f2] text-[#6c635a] shrink-0" onClick={() => setMobileOpen(true)} aria-label="Open menu">
                <Menu className="size-5" />
              </button>
              <div className="hidden items-center gap-2 text-xs text-[#9c8e80] md:flex shrink-0">
                <span>Workspace</span>
                <span>/</span>
                <span className="font-semibold text-[#2c221e]">
                  {active === 'Overview' ? 'Dashboard' : active}
                </span>
              </div>
              <h1 className="text-sm sm:text-base font-semibold text-[#2c221e] md:hidden truncate">
                {active === 'Overview' ? 'Dashboard' : active}
              </h1>

              {/* Multiple Properties Switcher Dropdown in Header */}
              {properties.length > 0 && (
                <div className="flex items-center gap-1 rounded-xl border border-[#ebe4da] bg-[#faf8f5] px-2 py-1 text-xs shadow-2xs hover:border-[#d9cbbe] transition-colors shrink-1 min-w-0">
                  <Building2 className="size-3.5 text-[#8b5a2b] shrink-0" />
                  <select
                    value={selectedPropertyId || property.id}
                    onChange={(e) => {
                      if (e.target.value === '__add_new__') {
                        if (!entitlement.canCreateProperty) {
                          flash(entitlement.reason || 'Cannot add property: subscription property limit reached. Please visit Subscription or Settings to upgrade your plan.')
                          setShowPricingModal(true)
                        } else {
                          setEditingPropertyId(null)
                          setShowPropertyModal(true)
                        }
                      } else {
                        setSelectedPropertyId(e.target.value)
                      }
                    }}
                    className="bg-transparent font-semibold text-[#2c221e] outline-none cursor-pointer text-xs max-w-[90px] xs:max-w-[120px] sm:max-w-[150px] md:max-w-[170px] truncate"
                  >
                    {properties.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                    <option value="__add_new__">
                      + Add Property...
                    </option>
                  </select>
                </div>
              )}
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">

              {/* Dynamic Multi-Module Search Input (Desktop only to prevent tablet overlap) */}
              <div className="hidden lg:flex relative items-center gap-2 rounded-xl border border-[#ebe4da] bg-[#faf8f5] px-2.5 sm:px-3 py-1.5 text-xs text-[#74798a] focus-within:border-[#8b5a2b] transition-colors">
                <Search className="size-3.5 text-[#8b5a2b] shrink-0" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={`Search ${active === 'Overview' ? 'Dashboard' : active}...`}
                  className="w-28 xl:w-40 bg-transparent outline-none placeholder:text-[#a09488] text-xs text-[#2c221e]"
                />
                {search && (
                  <div className="flex items-center gap-1.5">
                    <span className="rounded bg-[#f4ebe1] px-1.5 py-0.5 text-[10px] font-bold text-[#8b5a2b]">
                      {currentSearchCount}
                    </span>
                    <button onClick={() => setSearch('')} title="Clear search" className="hover:text-[#2c221e]">
                      <X className="size-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Notification Bell */}
              <button
                onClick={() => setActive('Complaints')}
                title="Tickets & Notifications"
                className="relative grid size-9 place-items-center rounded-full text-[#766e65] hover:bg-[#faf7f2] hover:text-[#2c221e] transition-colors"
                aria-label="View notifications"
              >
                <Bell className="size-4" />
                {complaints.filter((c) => c.status !== 'Resolved').length > 0 && (
                  <span className="absolute top-2 right-2 size-2 rounded-full bg-[#b95c3c] ring-2 ring-white" />
                )}
              </button>

              {/* Owner Profile & Sign Out Icon (Matches Reference Image) */}
              <div className="flex items-center gap-1.5 sm:gap-2.5 border-l border-[#ebe4da] pl-2 sm:pl-3">
                <div className="grid size-9 place-items-center rounded-full bg-[#8b5a2b] text-white text-xs font-bold shadow-2xs ring-2 ring-[#f4ebe1] shrink-0">
                  {userName ? userName.slice(0, 1).toUpperCase() : 'O'}
                </div>
                <div className="hidden sm:block leading-tight">
                  <div className="flex items-center gap-1">
                    <p className="max-w-[90px] md:max-w-[110px] xl:max-w-[130px] truncate text-xs font-bold text-[#2c221e]">
                      {userName || 'Owner'}
                    </p>
                    <ChevronDown className="size-3 text-[#9c8e80]" />
                  </div>
                  <p className="text-[10px] font-medium text-[#8c7e72] truncate max-w-[110px] sm:max-w-[130px]">
                    Property Owner
                  </p>
                </div>
                <button
                  onClick={() => setShowLogoutModal(true)}
                  title="Sign out"
                  className="rounded-xl p-2 text-[#9296a5] hover:bg-[#faf7f2] hover:text-[#b95c3c] transition-colors shrink-0"
                >
                  <LogOut className="size-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Full-width Search Bar on Mobile */}
          <div className="mt-2 sm:hidden">
            <div className="relative flex items-center gap-2 rounded-xl border border-[#ebe4da] bg-[#faf8f5] px-3 py-1.5 text-xs text-[#74798a] focus-within:border-[#8b5a2b] transition-colors w-full">
              <Search className="size-3.5 text-[#8b5a2b] shrink-0" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Search ${active === 'Overview' ? 'Dashboard' : active}...`}
                className="flex-1 bg-transparent outline-none placeholder:text-[#a09488] text-xs text-[#2c221e]"
              />
              {search && (
                <div className="flex items-center gap-1.5">
                  <span className="rounded bg-[#f4ebe1] px-1.5 py-0.5 text-[10px] font-bold text-[#8b5a2b]">
                    {currentSearchCount}
                  </span>
                  <button onClick={() => setSearch('')} title="Clear search" className="hover:text-[#2c221e] p-1">
                    <X className="size-3.5" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* View Router */}
        <div className="mx-auto max-w-[1360px] px-3 sm:px-8 py-5 sm:py-7 lg:px-10">
          {isTrialExpired && (
            <div className="mb-6 rounded-2xl border border-[#e8cbb0] bg-gradient-to-r from-[#fff7f0] to-[#fbf0e4] p-4 sm:p-5 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div className="rounded-xl bg-[#b95c3c]/10 p-2 text-[#b95c3c] mt-0.5 shrink-0">
                  <AlertCircle className="size-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#2c221e]">Free Trial Period Expired</h3>
                  <p className="text-xs text-[#6e5849] mt-0.5 max-w-2xl leading-relaxed">
                    Your 7-day free trial has concluded. Property management actions (adding rooms, onboarding residents, and recording payments) require an active subscription.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPricingModal(true)}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#8b5a2b] px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#784b20] transition-colors shrink-0 cursor-pointer"
              >
                <Sparkles className="size-4" /> Upgrade Plan
              </button>
            </div>
          )}

          {loading ? (
            <DashboardSkeleton />
          ) : (
            <>
              {active === 'Overview' && (
                <OverviewTab
                  property={property}
                  properties={properties}
                  rooms={currentPropertyRooms}
                  beds={currentPropertyBeds}
                  tenants={currentPropertyTenants}
                  payments={currentPropertyPayments}
                  expenses={currentPropertyExpenses}
                  electricity={currentPropertyElectricity}
                  complaints={currentPropertyComplaints}
                  collectedMonth={totalCollectedMonth}
                  rentPending={totalRentPending}
                  expensesMonth={totalExpensesMonth}
                  electricityPending={totalElectricityPending}
                  activeTenantsCount={activeTenantsCount}
                  availableBedsCount={availableBedsCount}
                  occupiedBedsCount={occupiedBedsCount}
                  daysRemaining={daysRemaining}
                  hoursRemaining={hoursRemaining}
                  isEndingSoon={isEndingSoon}
                  isTrialExpired={isTrialExpired}
                  trialStart={trialStart}
                  trialEnd={trialEnd}
                  userName={userName}
                  entitlement={entitlement}
                  onAddProperty={() => {
                    if (isTrialExpired) {
                      flash('Your free trial has expired. Please upgrade your subscription to add properties.')
                      setShowPricingModal(true)
                      return
                    }
                    if (!entitlement.canCreateProperty) {
                      flash(entitlement.reason || 'Cannot add property: subscription property limit reached. Please visit Subscription or Settings to upgrade your plan.')
                      setShowPricingModal(true)
                      return
                    }
                    setEditingPropertyId(null)
                    setShowPropertyModal(true)
                  }}
                  onAddRoom={() => {
                    if (isTrialExpired) {
                      flash('Your 7-day free trial has expired. Please upgrade your subscription to add rooms.')
                      setShowPricingModal(true)
                      return
                    }
                    setShowRoomModal(true)
                  }}
                  onAddTenant={() => {
                    if (isTrialExpired) {
                      flash('Your 7-day free trial has expired. Please upgrade your subscription to onboard residents.')
                      setShowPricingModal(true)
                      return
                    }
                    const availableRoom = currentPropertyRooms.find((r) => {
                      const cap = getRoomMaxCapacity(r.room_type)
                      const cur = currentPropertyTenants.filter((t) => t.room_id === r.id && t.status !== 'Vacated').length
                      return cur < cap
                    })
                    const rId = availableRoom?.id || 'unassigned'
                    setTenantFormRoomId(rId)
                    setTenantFormRent(availableRoom?.base_rent || 0)

                    if (rId !== 'unassigned') {
                      const availBed = currentPropertyBeds.find((b) => {
                        if (b.room_id !== rId) return false
                        const eff = getEffectiveBedStatus(b, currentPropertyRooms, currentPropertyTenants)
                        return eff.isAvailable
                      })
                      setTenantFormBedId(availBed?.id || 'unassigned')
                    } else {
                      setTenantFormBedId('unassigned')
                    }
                    setShowTenantModal(true)
                  }}
                  onRecordPayment={() => {
                    if (isTrialExpired) {
                      flash('Your 7-day free trial has expired. Please upgrade your subscription to record payments.')
                      setShowPricingModal(true)
                      return
                    }
                    if (currentPropertyTenants.length) {
                      setPaymentFormTenantId(currentPropertyTenants[0].id)
                      setPaymentFormAmount(currentPropertyTenants[0].rent)
                    }
                    setShowPaymentModal(true)
                  }}
                  onViewPlans={() => setShowPricingModal(true)}
                  onNavigate={setActive}
                />
              )}

              {active === 'Property' && (
                <PropertyTab
                  property={property}
                  properties={properties}
                  selectedPropertyId={selectedPropertyId}
                  onSelectProperty={(id: string) => setSelectedPropertyId(id)}
                  onAddProperty={() => {
                    if (isTrialExpired) {
                      flash('Your free trial has expired. Please upgrade your subscription to add properties.')
                      setShowPricingModal(true)
                      return
                    }
                    if (!entitlement.canCreateProperty) {
                      flash(entitlement.reason || 'Cannot add property: subscription property limit reached. Please visit Subscription or Settings to upgrade your plan.')
                      setShowPricingModal(true)
                      return
                    }
                    setEditingPropertyId(null)
                    setShowPropertyModal(true)
                  }}
                  onEdit={(p?: any) => {
                    setEditingPropertyId(p?.id || property.id)
                    setShowPropertyModal(true)
                  }}
                  onDelete={() => setShowDeletePropertyModal(true)}
                  roomsCount={currentPropertyRooms.length}
                  tenantsCount={currentPropertyTenants.filter((t) => t.status !== 'Vacated').length}
                  bedsCount={currentPropertyBeds.length}
                  entitlement={entitlement}
                  subscriptionPlan={subscriptionPlan}
                  subscriptionStatus={subscriptionStatus}
                  onViewPlans={() => setShowPricingModal(true)}
                />
              )}

              {active === 'Rooms & Beds' && (
                <RoomsTab
                  rooms={filteredRooms.filter((r) => !property.id || !r.property_id || r.property_id === property.id)}
                  beds={currentPropertyBeds}
                  tenants={currentPropertyTenants}
                  onAddRoom={() => {
                    if (isTrialExpired) {
                      flash('Your 7-day free trial has expired. Please upgrade your plan in Settings to add rooms.')
                      setShowPricingModal(true)
                      return
                    }
                    setShowRoomModal(true)
                  }}
                  onEditRoom={(r: Room) => setEditingRoom(r)}
                  onDeleteRoom={handleDeleteRoom}
                  onAddBed={(roomId: string, roomNumber: string) => {
                    if (isTrialExpired) {
                      flash('Your 7-day free trial has expired. Please upgrade your plan in Settings to add beds.')
                      setShowPricingModal(true)
                      return
                    }
                    setShowAddBedModal({ open: true, roomId, roomNumber })
                  }}
                  onEditBed={(b: Bed) => setEditingBed(b)}
                  onToggleBedStatus={handleToggleBedStatus}
                  onDeleteBed={handleDeleteBed}
                  searchQuery={q}
                  onClearSearch={() => setSearch('')}
                  onViewRentSchedule={(t: Tenant) => setSelectedTenantForSchedule(t)}
                  onOnboardTenantForRoom={(roomId: string, bedId?: string) => {
                    if (isTrialExpired) {
                      flash('Your 7-day free trial has expired. Please upgrade your plan in Settings to onboard residents.')
                      setShowPricingModal(true)
                      return
                    }
                    const targetRoom = currentPropertyRooms.find((r) => r.id === roomId)
                    setTenantFormRoomId(roomId)
                    setTenantFormRent(targetRoom?.base_rent || 0)
                    if (bedId) {
                      setTenantFormBedId(bedId)
                    }
                    setShowTenantModal(true)
                  }}
                />
              )}

              {active === 'Tenants' && (
                <TenantsTab
                  tenants={filteredTenants.filter((t) => !property.id || !t.property_id || t.property_id === property.id)}
                  rooms={currentPropertyRooms}
                  property={property}
                  locale={locale}
                  payments={payments}
                  onViewRentSchedule={(t: Tenant) => setSelectedTenantForSchedule(t)}
                  onAddTenant={() => {
                    if (isTrialExpired) {
                      flash('Your 7-day free trial has expired. Please upgrade your plan in Settings to onboard residents.')
                      setShowPricingModal(true)
                      return
                    }
                    const availableRoom = currentPropertyRooms.find((r) => {
                      const cap = getRoomMaxCapacity(r.room_type)
                      const cur = currentPropertyTenants.filter((t) => t.room_id === r.id && t.status !== 'Vacated').length
                      return cur < cap
                    })
                    const rId = availableRoom?.id || 'unassigned'
                    setTenantFormRoomId(rId)
                    setTenantFormRent(availableRoom?.base_rent || 0)

                    if (rId !== 'unassigned') {
                      const availBed = currentPropertyBeds.find((b) => {
                        if (b.room_id !== rId) return false
                        const eff = getEffectiveBedStatus(b, currentPropertyRooms, currentPropertyTenants)
                        return eff.isAvailable
                      })
                      setTenantFormBedId(availBed?.id || 'unassigned')
                    } else {
                      setTenantFormBedId('unassigned')
                    }
                    setShowTenantModal(true)
                  }}
                  onEditTenant={(t: Tenant) => setEditingTenant(t)}
                  onVacateTenant={handleVacateTenant}
                  onDeleteTenant={handleDeleteTenant}
                  onSharePortalLink={handleOpenPortalModal}
                  onRecordPayment={(t: Tenant) => {
                    if (isTrialExpired) {
                      flash('Your 7-day free trial has expired. Please upgrade your plan in Settings to record payments.')
                      setShowPricingModal(true)
                      return
                    }
                    setPaymentFormTenantId(t.id)
                    setPaymentFormAmount(t.rent)
                    setShowPaymentModal(true)
                  }}
                  ownerPaymentDetails={ownerPaymentDetails}
                  onOpenPaymentSettings={() => setActive('Settings')}
                  searchQuery={q}
                  onClearSearch={() => setSearch('')}
                />
              )}

              {active === 'Rent & Payments' && (
                <PaymentsTab
                  payments={filteredPayments.filter((p) => !property.id || !p.property_id || p.property_id === property.id)}
                  tenants={currentPropertyTenants}
                  locale={locale}
                  onRecordPayment={() => {
                    if (isTrialExpired) {
                      flash('Your 7-day free trial has expired. Please upgrade your plan in Settings to record payments.')
                      setShowPricingModal(true)
                      return
                    }
                    if (currentPropertyTenants.length) {
                      setPaymentFormTenantId(currentPropertyTenants[0].id)
                      setPaymentFormAmount(currentPropertyTenants[0].rent)
                    }
                    setShowPaymentModal(true)
                  }}
                  onViewReceipt={(p: any) => setSelectedReceipt(p)}
                  onEditPayment={(p: PaymentRecord) => setEditingPayment(p)}
                  onDeletePayment={handleDeletePayment}
                  searchQuery={q}
                  onClearSearch={() => setSearch('')}
                />
              )}

              {active === 'Electricity' && (
                <ElectricityTab
                  records={filteredElectricity.filter((el) => !property.id || !el.property_id || el.property_id === property.id)}
                  rooms={currentPropertyRooms}
                  onAddReading={() => {
                    if (isTrialExpired) {
                      flash('Your 7-day free trial has expired. Please upgrade your plan in Settings to log electricity readings.')
                      setShowPricingModal(true)
                      return
                    }
                    const firstRoom = currentPropertyRooms[0]
                    if (firstRoom) {
                      const lastReading = currentPropertyElectricity.find((el) => el.room_id === firstRoom.id)?.current_reading || 0
                      setElecFormRoomId(firstRoom.id)
                      setElecFormPrevReading(lastReading)
                    }
                    setShowElectricityModal(true)
                  }}
                  onAddMidCycle={() => {
                    if (isTrialExpired) {
                      flash('Your 7-day free trial has expired. Please upgrade your plan in Settings to split electricity bills.')
                      setShowPricingModal(true)
                      return
                    }
                    const suggestedCycle = suggestPreviousBillingCycle(currentPropertyElectricity)
                    const activePropId = property.id || selectedPropertyId
                    const rememberedRate = typeof window !== 'undefined' && activePropId ? localStorage.getItem(`baserabook_elec_rate_${activePropId}`) : null
                    const suggestedRate = rememberedRate ? Number(rememberedRate) : getSuggestedRate(currentPropertyElectricity, activePropId)

                    setMidCycleRoomId('all')
                    setMidCyclePeriodStart(suggestedCycle.periodStart)
                    setMidCyclePeriodEnd(suggestedCycle.periodEnd)
                    setMidCycleRatePerUnit(suggestedRate || 10)
                    setMidCycleTotalUnits(0)
                    setMidCycleBillAmount(0)
                    setMidCycleUseMeterReadings(false)
                    setMidCycleResidentReadings({})
                    setMidCycleResidentDates({})
                    setMidCycleCalculatedSplit(null)
                    setMidCycleError(null)
                    setMidCycleSuccessMessage(null)
                    setMidCycleShowAdvanced(false)
                    setShowMidCycleModal(true)
                  }}
                  onViewSplitBreakdown={(el: ElectricityRecord) => setViewingSplitRecord(el)}
                  onEditReading={(el: ElectricityRecord) => setEditingElectricity(el)}
                  onDeleteReading={handleDeleteElectricity}
                  searchQuery={q}
                  onClearSearch={() => setSearch('')}
                />
              )}

              {active === 'Expenses' && (
                <ExpensesTab
                  expenses={filteredExpenses.filter((e) => !property.id || !e.property_id || e.property_id === property.id)}
                  totalMonth={totalExpensesMonth}
                  onAddExpense={() => {
                    if (isTrialExpired) {
                      flash('Your 7-day free trial has expired. Please upgrade your plan in Settings to log expenses.')
                      setShowPricingModal(true)
                      return
                    }
                    setShowExpenseModal(true)
                  }}
                  onEditExpense={(e: Expense) => setEditingExpense(e)}
                  onDeleteExpense={handleDeleteExpense}
                  searchQuery={q}
                  onClearSearch={() => setSearch('')}
                />
              )}

              {active === 'Complaints' && (
                <ComplaintsTab
                  complaints={filteredComplaints.filter((c) => !property.id || !c.property_id || c.property_id === property.id)}
                  onAddComplaint={() => setShowComplaintModal(true)}
                  onEditComplaint={(c: Complaint) => setEditingComplaint(c)}
                  onResolve={handleResolveComplaint}
                  onDelete={handleDeleteComplaint}
                  searchQuery={q}
                  onClearSearch={() => setSearch('')}
                />
              )}

              {active === 'Reports' && (
                <ReportsTab
                  property={property}
                  rooms={currentPropertyRooms}
                  beds={currentPropertyBeds}
                  tenants={currentPropertyTenants}
                  payments={currentPropertyPayments}
                  expenses={currentPropertyExpenses}
                  electricity={currentPropertyElectricity}
                  revenueMonth={totalCollectedMonth}
                  expensesMonth={totalExpensesMonth}
                  rentPending={totalRentPending}
                  electricityPending={totalElectricityPending}
                  locale={locale}
                />
              )}

              {active === 'Deleted Records' && (
                <DeletedRecordsTab
                  trashRecords={trashRecords}
                  isLoading={isLoadingTrash}
                  isRestoringId={isRestoringTrashId}
                  locale={locale}
                  onRestore={handleRestoreTrashRecord}
                  onPermanentDelete={(record: TrashRecord) => setPurgeTarget(record)}
                  onRefresh={loadTrashRecords}
                />
              )}

              {active === 'Settings' && (
                <SettingsTab
                  userName={userName}
                  userEmail={userEmail}
                  property={property}
                  properties={properties}
                  selectedPropertyId={selectedPropertyId || property.id}
                  onSelectProperty={(id: string) => setSelectedPropertyId(id)}
                  onAddProperty={() => {
                    if (isTrialExpired) {
                      flash('Your free trial has expired. Please upgrade your subscription to add properties.')
                      setShowPricingModal(true)
                      return
                    }
                    if (!entitlement.canCreateProperty) {
                      flash(entitlement.reason || 'Cannot add property: subscription property limit reached. Please visit Subscription or Settings to upgrade your plan.')
                      setShowPricingModal(true)
                      return
                    }
                    setEditingPropertyId(null)
                    setShowPropertyModal(true)
                  }}
                  entitlement={entitlement}
                  trialStart={trialStart}
                  trialEnd={trialEnd}
                  daysRemaining={daysRemaining}
                  hoursRemaining={hoursRemaining}
                  isEndingSoon={isEndingSoon}
                  isTrialExpired={isTrialExpired}
                  subscriptionPlan={subscriptionPlan}
                  subscriptionStatus={subscriptionStatus}
                  onEditProperty={() => {
                    setEditingPropertyId(property.id)
                    setShowPropertyModal(true)
                  }}
                  onEditSpecificProperty={(id: string) => {
                    setEditingPropertyId(id)
                    setShowPropertyModal(true)
                  }}
                  ownerPaymentDetails={ownerPaymentDetails}
                  setOwnerPaymentDetails={setOwnerPaymentDetails}
                  onSavePaymentDetails={handleSavePaymentDetails}
                  onQrImageUpload={handleQrImageUpload}
                  isSavingPaymentDetails={isSavingPaymentDetails}
                  isDecodingQr={isDecodingQr}
                  paymentValidationErrors={paymentValidationErrors}
                  setPaymentValidationErrors={setPaymentValidationErrors}
                  paymentSuccessMessage={paymentSuccessMessage}
                  onDeleteProperty={() => setShowDeletePropertyModal(true)}
                  onViewPlans={() => setShowPricingModal(true)}
                  onSignOut={() => setShowLogoutModal(true)}
                />
              )}
            </>
          )}
        </div>
      </main>

      {/* ---------------------------------------------------------------------- */}
      {/* MODALS & DIALOGS */}
      {/* ---------------------------------------------------------------------- */}

      {/* 0. Monthly Rent Schedule Ledger Modal */}
      {selectedTenantForSchedule && (
        <MonthlyRentScheduleModal
          tenant={selectedTenantForSchedule}
          payments={payments}
          locale={locale}
          onClose={() => setSelectedTenantForSchedule(null)}
          onRecordPaymentForMonth={(tenantTarget: Tenant, monthCovered: string, amount: number) => {
            setPaymentFormTenantId(tenantTarget.id)
            setPaymentFormAmount(amount)
            setPaymentFormNotes(`[Month: ${monthCovered}]`)
            setSelectedTenantForSchedule(null)
            setShowPaymentModal(true)
          }}
        />
      )}

      {/* 1. Property Setup / Edit Modal */}
      {showPropertyModal && (() => {
        const editTarget = editingPropertyId
          ? properties.find((p) => p.id === editingPropertyId) || property
          : null
        return (
          <Modal
            title={
              editTarget
                ? 'Edit Property Details'
                : properties.length > 0
                ? 'Add New Rental Property'
                : 'Set Up Your Rental Property'
            }
            onClose={() => !isSavingProperty && setShowPropertyModal(false)}
          >
            <form onSubmit={handleSaveProperty} className="flex flex-col gap-4">
              <p className="text-xs text-[#74798a]">
                Please fill in your rental property details. Required fields are marked (<span className="text-[#8b5a2b] font-bold">*</span>).
              </p>
              <Field
                label="Property Name"
                name="name"
                defaultValue={editTarget?.name || ''}
                placeholder="e.g. Green Valley Residency"
                required
              />
              <label className="flex flex-col gap-1.5 text-xs font-semibold text-[#555a6c]">
                Property Type
                <select
                  name="property_type"
                  defaultValue={getPropertyType(editTarget)}
                  className="rounded-xl border border-[#e4e6ec] bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-[#8b5a2b] focus:ring-1 focus:ring-[#8b5a2b] transition-all"
                >
                  <option value="pg_hostel">PG / Hostel (Room & Bed Sharing)</option>
                  <option value="apartment">Apartment / Society Flat (Whole Unit)</option>
                  <option value="house">Rental House / Independent Floor</option>
                  <option value="other">Other Managed Rental Property</option>
                </select>
              </label>
              <Field
                label="Property Address"
                name="address"
                defaultValue={editTarget?.address || ''}
                placeholder="Street, Locality, Area"
                required
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field
                  label="City"
                  name="city"
                  defaultValue={editTarget?.city || ''}
                  placeholder="e.g. Bengaluru"
                />
                <Field
                  label="Contact Phone"
                  name="contact"
                  defaultValue={editTarget?.contact || ''}
                  placeholder="e.g. 9876543210"
                />
              </div>
              <button
                disabled={isSavingProperty}
                className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-[#8b5a2b] py-3 text-sm font-semibold text-white shadow-xs hover:bg-[#784b20] disabled:opacity-60 transition-colors"
              >
                {isSavingProperty && <Loader2 className="size-4 animate-spin" />}
                {isSavingProperty
                  ? 'Saving Details...'
                  : editTarget
                  ? 'Save Property Details'
                  : 'Create Property'}
              </button>
            </form>
          </Modal>
        )
      })()}

      {/* 2. Delete Property Confirmation Modal (Requires typing "DELETE") */}
      {showDeletePropertyModal && (
        <Modal title="Delete Entire Property Workspace" onClose={() => !isDeletingProperty && setShowDeletePropertyModal(false)}>
          <div className="flex flex-col gap-4">
            <div className="rounded-xl border border-[#ffe0e0] bg-[#fff5f5] p-3 text-xs text-[#b95c3c]">
              <div className="flex items-center gap-2 font-bold mb-1">
                <ShieldAlert className="size-4" />
                Destructive High-Impact Operation
              </div>
              Deleting this property will permanently remove all configured rooms, beds, and tenant relationships. This action is irreversible.
            </div>

            <p className="text-xs text-[#555a6c]">
              To confirm, type <strong className="font-mono text-[#b95c3c]">DELETE</strong> in the box below:
            </p>

            <input
              value={deletePropertyInput}
              onChange={(e) => setDeletePropertyInput(e.target.value)}
              placeholder="Type DELETE"
              className="rounded-xl border border-[#e4d9cc] px-3 py-2 text-sm font-mono tracking-widest outline-none focus:border-[#b95c3c]"
            />

            <div className="mt-2 flex justify-end gap-3">
              <button
                type="button"
                disabled={isDeletingProperty}
                onClick={() => {
                  setShowDeletePropertyModal(false)
                  setDeletePropertyInput('')
                }}
                className="rounded-xl border border-[#e8dfd4] px-4 py-2.5 text-xs font-semibold text-[#676b7d] hover:bg-[#f7f3ed] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deletePropertyInput.trim() !== 'DELETE' || isDeletingProperty}
                onClick={handleDeleteProperty}
                className="flex items-center gap-2 rounded-xl bg-[#b95c3c] px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-[#a04e32] disabled:opacity-40 transition-colors"
              >
                {isDeletingProperty && <Loader2 className="size-4 animate-spin" />}
                Permanently Delete Property
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* 3. Add Room Modal */}
      {showRoomModal && (
        <Modal title={isPgHostel ? 'Add Room & Beds' : 'Add Unit / Room'} onClose={() => !isSavingRoom && setShowRoomModal(false)}>
          <form onSubmit={handleAddRoom} className="flex flex-col gap-4">
            <Field
              label={isPgHostel ? 'Room Number / Name' : 'Unit / Flat / Room Number'}
              name="room_number"
              placeholder={isPgHostel ? 'e.g. 101, A-2' : 'e.g. Flat 301, Unit 4B, Room 12'}
              required
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Floor Number" name="floor" type="number" defaultValue="1" required />
              <label className="flex flex-col gap-1.5 text-xs font-semibold text-[#555a6c]">
                {isPgHostel ? 'Room Type' : 'Unit Type'}
                <select name="room_type" className="rounded-xl border border-[#e8dfd4] bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-[#8b5a2b]">
                  {isPgHostel ? (
                    <>
                      <option value="Single">Single Occupancy (1 Bed)</option>
                      <option value="Double Sharing">Double Sharing (2 Beds)</option>
                      <option value="Triple Sharing">Triple Sharing (3 Beds)</option>
                      <option value="Four Sharing">Four Sharing (4 Beds)</option>
                    </>
                  ) : (
                    <>
                      <option value="Full Unit">Full Unit / Apartment</option>
                      <option value="1 BHK">1 BHK Flat</option>
                      <option value="2 BHK">2 BHK Flat</option>
                      <option value="3 BHK">3 BHK Flat</option>
                      <option value="Studio">Studio / Private Room</option>
                    </>
                  )}
                </select>
              </label>
            </div>
            <div className={isPgHostel ? 'grid grid-cols-1 sm:grid-cols-2 gap-3' : 'block'}>
              {isPgHostel ? (
                <Field label="Initial Bed Count" name="beds_count" type="number" defaultValue="2" min="1" required />
              ) : (
                <input type="hidden" name="beds_count" value="1" />
              )}
              <Field
                label={isPgHostel ? 'Monthly Base Rent (₹)' : 'Monthly Rent (₹)'}
                name="base_rent"
                type="number"
                placeholder="8500"
                required
              />
            </div>
            <button
              type="submit"
              disabled={isSavingRoom}
              className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-[#8b5a2b] py-3 text-sm font-semibold text-white shadow-xs hover:bg-[#784b20] disabled:opacity-60 transition-colors"
            >
              {isSavingRoom && <Loader2 className="size-4 animate-spin" />}
              {isSavingRoom ? 'Configuring Room...' : (isPgHostel ? 'Configure Room & Beds' : 'Create Unit / Room')}
            </button>
          </form>
        </Modal>
      )}

      {/* 4. Edit Room Modal */}
      {editingRoom && (
        <Modal title={isPgHostel ? `Edit Room ${editingRoom.room_number}` : `Edit Unit ${editingRoom.room_number}`} onClose={() => !isSavingRoom && setEditingRoom(null)}>
          <form onSubmit={handleUpdateRoom} className="flex flex-col gap-4">
            <Field
              label={isPgHostel ? 'Room Number / Name' : 'Unit / Flat / Room Number'}
              name="room_number"
              defaultValue={editingRoom.room_number}
              required
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Floor Number" name="floor" type="number" defaultValue={editingRoom.floor} required />
              <label className="flex flex-col gap-1.5 text-xs font-semibold text-[#555a6c]">
                {isPgHostel ? 'Room Type' : 'Unit Type'}
                <select name="room_type" defaultValue={editingRoom.room_type} className="rounded-xl border border-[#e8dfd4] bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-[#8b5a2b]">
                  {isPgHostel ? (
                    <>
                      <option value="Single">Single Occupancy (1 Bed)</option>
                      <option value="Double Sharing">Double Sharing (2 Beds)</option>
                      <option value="Triple Sharing">Triple Sharing (3 Beds)</option>
                      <option value="Four Sharing">Four Sharing (4 Beds)</option>
                    </>
                  ) : (
                    <>
                      <option value="Full Unit">Full Unit / Apartment</option>
                      <option value="1 BHK">1 BHK Flat</option>
                      <option value="2 BHK">2 BHK Flat</option>
                      <option value="3 BHK">3 BHK Flat</option>
                      <option value="Studio">Studio / Private Room</option>
                    </>
                  )}
                </select>
              </label>
            </div>
            <Field
              label={isPgHostel ? 'Monthly Base Rent (₹)' : 'Monthly Rent (₹)'}
              name="base_rent"
              type="number"
              defaultValue={editingRoom.base_rent}
              required
            />
            <button
              type="submit"
              disabled={isSavingRoom}
              className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-[#8b5a2b] py-3 text-sm font-semibold text-white shadow-xs hover:bg-[#784b20] disabled:opacity-60 transition-colors"
            >
              {isSavingRoom && <Loader2 className="size-4 animate-spin" />}
              {isSavingRoom ? 'Saving Changes...' : 'Save Changes'}
            </button>
          </form>
        </Modal>
      )}

      {/* 5. Add Bed to Room Modal */}
      {showAddBedModal.open && (
        <Modal title={`Add Bed to Room ${showAddBedModal.roomNumber}`} onClose={() => !isSavingBed && setShowAddBedModal({ open: false, roomId: '', roomNumber: '' })}>
          <form onSubmit={handleAddBed} className="flex flex-col gap-4">
            <Field
              label="Bed Label"
              name="bed_number"
              defaultValue={`${showAddBedModal.roomNumber}-${String.fromCharCode(65 + beds.filter((b) => b.room_id === showAddBedModal.roomId).length)}`}
              placeholder="e.g. 101-C"
              required
            />
            <Field
              label="Monthly Rate (₹)"
              name="monthly_rate"
              type="number"
              defaultValue={rooms.find((r) => r.id === showAddBedModal.roomId)?.base_rent || 0}
              required
            />
            <button
              type="submit"
              disabled={isSavingBed}
              className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-[#8b5a2b] py-3 text-sm font-semibold text-white shadow-xs hover:bg-[#784b20] disabled:opacity-60 transition-colors"
            >
              {isSavingBed && <Loader2 className="size-4 animate-spin" />}
              {isSavingBed ? 'Adding Bed...' : 'Add Bed to Room'}
            </button>
          </form>
        </Modal>
      )}

      {/* 5b. Edit Bed Details Modal */}
      {editingBed && (
        <Modal title={`Edit Bed ${editingBed.bed_number}`} onClose={() => !isSavingBed && setEditingBed(null)}>
          <form onSubmit={handleUpdateBed} className="flex flex-col gap-4">
            <Field
              label="Bed Label"
              name="bed_number"
              defaultValue={editingBed.bed_number}
              placeholder="e.g. 101-A"
              required
            />
            <Field
              label="Monthly Rate (₹)"
              name="monthly_rate"
              type="number"
              defaultValue={editingBed.monthly_rate}
              required
            />
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-[#555a6c]">
              Status
              <select
                name="status"
                defaultValue={editingBed.status}
                className="rounded-xl border border-[#e8dfd4] bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-[#8b5a2b]"
              >
                <option value="available">Available</option>
                <option value="occupied">Occupied</option>
                <option value="maintenance">Maintenance</option>
              </select>
            </label>
            <button
              type="submit"
              disabled={isSavingBed}
              className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-[#8b5a2b] py-3 text-sm font-semibold text-white shadow-xs hover:bg-[#784b20] disabled:opacity-60 transition-colors"
            >
              {isSavingBed && <Loader2 className="size-4 animate-spin" />}
              {isSavingBed ? 'Updating Bed...' : 'Save Bed Details'}
            </button>
          </form>
        </Modal>
      )}

      {/* 6. Onboard New Tenant Modal (with Auto-Prefill + Capacity Check) */}
      {showTenantModal && (
        <Modal title="Onboard New Resident" onClose={() => !isSavingTenant && setShowTenantModal(false)}>
          <form onSubmit={handleAddTenant} className="flex flex-col gap-4">
            <Field label="Full Name" name="name" placeholder="Resident full name" required />
            <Field label="Contact Phone" name="phone" placeholder="10-15 digit mobile number" required />

            <div className={isPgHostel ? 'grid grid-cols-1 sm:grid-cols-2 gap-3' : 'block'}>
              <label className="flex flex-col gap-1.5 text-xs font-semibold text-[#555a6c]">
                {isPgHostel ? 'Assign Room' : 'Assign Unit / Flat / Room'}
                <select
                  name="room_id"
                  value={tenantFormRoomId}
                  onChange={(e) => {
                    const selId = e.target.value
                    setTenantFormRoomId(selId)
                    const selRoom = rooms.find((r) => r.id === selId)
                    if (selRoom) {
                      setTenantFormRent(selRoom.base_rent)
                      // Auto select first truly available bed
                      const avail = beds.find((b) => {
                        if (b.room_id !== selId) return false
                        const eff = getEffectiveBedStatus(b, rooms, tenants)
                        return eff.isAvailable
                      })
                      setTenantFormBedId(avail ? avail.id : 'unassigned')
                    } else {
                      setTenantFormBedId('unassigned')
                    }
                  }}
                  className="rounded-xl border border-[#e8dfd4] bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-[#8b5a2b]"
                >
                  <option value="unassigned">Unassigned</option>
                  {rooms.map((r) => {
                    const cap = getRoomMaxCapacity(r.room_type, 1)
                    const cur = tenants.filter((t) => t.room_id === r.id && t.status !== 'Vacated').length
                    const isFull = cur >= cap
                    return (
                      <option key={r.id} value={r.id} disabled={isFull}>
                        {isPgHostel
                          ? `Room ${r.room_number} (${r.room_type}) ${isFull ? '— FULL' : `— ${cur}/${cap}`}`
                          : `Unit ${r.room_number} (${r.room_type}) ${isFull ? '— OCCUPIED' : '— Available'}`}
                      </option>
                    )
                  })}
                </select>
              </label>

              {isPgHostel ? (
                <label className="flex flex-col gap-1.5 text-xs font-semibold text-[#555a6c]">
                  Assign Bed
                  <select
                    name="bed_id"
                    value={tenantFormBedId}
                    onChange={(e) => setTenantFormBedId(e.target.value)}
                    className="rounded-xl border border-[#e8dfd4] bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-[#8b5a2b]"
                  >
                    <option value="unassigned">Unassigned</option>
                    {beds
                      .filter((b) => tenantFormRoomId === 'unassigned' || b.room_id === tenantFormRoomId)
                      .map((b) => {
                        const eff = getEffectiveBedStatus(b, rooms, tenants)
                        return (
                          <option key={b.id} value={b.id} disabled={!eff.isAvailable}>
                            Bed {b.bed_number} ({eff.label})
                          </option>
                        )
                      })}
                  </select>
                </label>
              ) : (
                <input type="hidden" name="bed_id" value={tenantFormBedId} />
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field
                label="Monthly Rent (₹)"
                name="rent"
                type="number"
                value={tenantFormRent}
                onChange={(e: any) => setTenantFormRent(Number(e.target.value))}
                required
              />
              <Field label="Security Deposit (₹)" name="deposit" type="number" placeholder="10000" />
              <Field
                label="Rent Due Day (1-31)"
                name="rent_due_day"
                type="number"
                defaultValue={5}
                required
              />
            </div>

            <Field
              label="Joining Date"
              name="joining_date"
              type="date"
              defaultValue={new Date().toISOString().slice(0, 10)}
              required
            />

            <button
              type="submit"
              disabled={isSavingTenant}
              className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-[#8b5a2b] py-3 text-sm font-semibold text-white shadow-xs hover:bg-[#784b20] disabled:opacity-60 transition-colors"
            >
              {isSavingTenant && <Loader2 className="size-4 animate-spin" />}
              {isSavingTenant ? 'Onboarding Resident...' : 'Create Resident Record'}
            </button>
          </form>
        </Modal>
      )}

      {/* 7. Edit Tenant Modal */}
      {editingTenant && (
        <Modal title={`Edit Resident: ${editingTenant.name}`} onClose={() => !isSavingTenant && setEditingTenant(null)}>
          <form onSubmit={handleUpdateTenant} className="flex flex-col gap-4">
            <Field label="Full Name" name="name" defaultValue={editingTenant.name} required />
            <Field label="Contact Phone" name="phone" defaultValue={editingTenant.phone} required />

            <div className={isPgHostel ? 'grid grid-cols-1 sm:grid-cols-2 gap-3' : 'block'}>
              <label className="flex flex-col gap-1.5 text-xs font-semibold text-[#555a6c]">
                {isPgHostel ? 'Room Assignment' : 'Unit Assignment'}
                <select
                  name="room_id"
                  defaultValue={editingTenant.room_id || 'unassigned'}
                  className="rounded-xl border border-[#e8dfd4] bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-[#8b5a2b]"
                >
                  <option value="unassigned">Unassigned</option>
                  {rooms.map((r) => {
                    const cap = getRoomMaxCapacity(r.room_type, 1)
                    const cur = tenants.filter((t) => t.room_id === r.id && t.status !== 'Vacated' && t.id !== editingTenant.id).length
                    const isFull = cur >= cap && r.id !== editingTenant.room_id
                    return (
                      <option key={r.id} value={r.id} disabled={isFull}>
                        {isPgHostel
                          ? `Room ${r.room_number} (${r.room_type}) ${isFull ? '— FULL' : `— ${cur}/${cap}`}`
                          : `Unit ${r.room_number} (${r.room_type}) ${isFull ? '— OCCUPIED' : '— Available'}`}
                      </option>
                    )
                  })}
                </select>
              </label>

              {isPgHostel ? (
                <label className="flex flex-col gap-1.5 text-xs font-semibold text-[#555a6c]">
                  Bed Assignment
                  <select
                    name="bed_id"
                    defaultValue={editingTenant.bed_id || 'unassigned'}
                    className="rounded-xl border border-[#e8dfd4] bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-[#8b5a2b]"
                  >
                    <option value="unassigned">Unassigned</option>
                    {beds.map((b) => {
                      const isCurrent = b.id === editingTenant.bed_id
                      const eff = getEffectiveBedStatus(b, rooms, tenants, editingTenant.id)
                      const canSelect = eff.isAvailable || isCurrent
                      const label = isCurrent ? 'CURRENT BED' : eff.label
                      return (
                        <option
                          key={b.id}
                          value={b.id}
                          disabled={!canSelect}
                        >
                          Bed {b.bed_number} ({label})
                        </option>
                      )
                    })}
                  </select>
                </label>
              ) : (
                <input type="hidden" name="bed_id" value={editingTenant.bed_id || 'unassigned'} />
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Monthly Rent (₹)" name="rent" type="number" defaultValue={editingTenant.rent} required />
              <Field label="Security Deposit (₹)" name="deposit" type="number" defaultValue={editingTenant.deposit} />
              <Field
                label="Rent Due Day (1-31)"
                name="rent_due_day"
                type="number"
                defaultValue={editingTenant.rent_due_day || 5}
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Joining Date" name="joining_date" type="date" defaultValue={editingTenant.joiningDate} required />
              <label className="flex flex-col gap-1.5 text-xs font-semibold text-[#555a6c]">
                Status
                <select
                  name="status"
                  defaultValue={editingTenant.status}
                  className="rounded-xl border border-[#e8dfd4] bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-[#8b5a2b]"
                >
                  <option value="Paid">Paid</option>
                  <option value="Pending">Pending</option>
                  <option value="Overdue">Overdue</option>
                  <option value="Vacated">Vacated</option>
                </select>
              </label>
            </div>

            <button
              type="submit"
              disabled={isSavingTenant}
              className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-[#8b5a2b] py-3 text-sm font-semibold text-white shadow-xs hover:bg-[#784b20] disabled:opacity-60 transition-colors"
            >
              {isSavingTenant && <Loader2 className="size-4 animate-spin" />}
              {isSavingTenant ? 'Updating Resident...' : 'Update Resident Details'}
            </button>
          </form>
        </Modal>
      )}

      {/* 8. Record Payment Modal (with Auto-Prefill) */}
      {showPaymentModal && (
        <Modal title="Record Rent / Utility Payment" onClose={() => setShowPaymentModal(false)}>
          <form onSubmit={handleRecordPayment} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-[#555a6c]">
              Select Resident
              <select
                name="tenant_id"
                value={paymentFormTenantId}
                onChange={(e) => {
                  const selId = e.target.value
                  setPaymentFormTenantId(selId)
                  const target = tenants.find((t) => t.id === selId)
                  if (target) {
                    setPaymentFormAmount(target.rent)
                    setPaymentFormNotes(`Rent for ${new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(new Date())}`)
                  }
                }}
                required
                className="rounded-xl border border-[#e8dfd4] bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-[#8b5a2b]"
              >
                <option value="">Choose resident...</option>
                {tenants
                  .filter((t) => t.status !== 'Vacated')
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} (Room {t.room}) — Due: {currency(t.rent)} (Due Day: {t.rent_due_day || 5}th)
                    </option>
                  ))}
              </select>
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field
                label="Amount Paid (₹)"
                name="amount"
                type="number"
                value={paymentFormAmount}
                onChange={(e: any) => setPaymentFormAmount(Number(e.target.value))}
                required
              />
              <label className="flex flex-col gap-1.5 text-xs font-semibold text-[#555a6c]">
                Payment Method
                <select name="payment_method" className="rounded-xl border border-[#e8dfd4] bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-[#8b5a2b]">
                  <option value="upi">UPI / GPay / PhonePe</option>
                  <option value="cash">Cash</option>
                  <option value="bank_transfer">Bank Transfer / NEFT</option>
                  <option value="card">Debit / Credit Card</option>
                </select>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5 text-xs font-semibold text-[#555a6c]">
                Payment Type
                <select
                  name="payment_type"
                  value={paymentFormType}
                  onChange={(e) => setPaymentFormType(e.target.value)}
                  className="rounded-xl border border-[#e8dfd4] bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-[#8b5a2b]"
                >
                  <option value="rent">Monthly Rent</option>
                  <option value="deposit">Security Deposit</option>
                  <option value="electricity">Electricity Charges</option>
                  <option value="maintenance">Maintenance</option>
                </select>
              </label>

              <Field
                label="Month Covered"
                name="month_covered"
                defaultValue={new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(new Date())}
                placeholder="e.g. October 2026"
              />
            </div>

            <Field
              label="Notes / Reference"
              name="notes"
              value={paymentFormNotes}
              onChange={(e: any) => setPaymentFormNotes(e.target.value)}
              placeholder="e.g. UTR #12345678"
            />

            <button
              type="submit"
              className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-[#8b5a2b] py-3 text-sm font-semibold text-white shadow-xs hover:bg-[#784b20] transition-colors"
            >
              Record Payment & Issue Receipt
            </button>
          </form>
        </Modal>
      )}

      {/* 9. Add Expense Modal */}
      {showExpenseModal && (
        <Modal title="Log Operating Expense" onClose={() => !isSavingExpense && setShowExpenseModal(false)}>
          <form onSubmit={handleAddExpense} className="flex flex-col gap-4">
            <Field label="Description" name="title" placeholder="e.g. Water Tanker Refill, Wi-Fi Bill" required />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5 text-xs font-semibold text-[#555a6c]">
                Category
                <select name="category" className="rounded-xl border border-[#e8dfd4] bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-[#8b5a2b]">
                  <option value="maintenance">Repairs & Maintenance</option>
                  <option value="electricity">Electricity Bill</option>
                  <option value="water">Water Supply</option>
                  <option value="wifi">Internet / Wi-Fi</option>
                  <option value="salary">Staff Salary</option>
                  <option value="groceries">Food & Groceries</option>
                  <option value="cleaning">Housekeeping</option>
                  <option value="other">Other Operating Cost</option>
                </select>
              </label>
              <Field label="Amount (₹)" name="amount" type="number" placeholder="2500" required />
            </div>
            <Field label="Date" name="expense_date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required />
            <Field label="Vendor / Notes" name="notes" placeholder="Vendor name or remarks" />
            <button
              type="submit"
              disabled={isSavingExpense}
              className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-[#8b5a2b] py-3 text-sm font-semibold text-white shadow-xs hover:bg-[#784b20] disabled:opacity-60 transition-colors"
            >
              {isSavingExpense && <Loader2 className="size-4 animate-spin" />}
              {isSavingExpense ? 'Logging Expense...' : 'Save Expense Entry'}
            </button>
          </form>
        </Modal>
      )}

      {/* 10. Edit Expense Modal */}
      {editingExpense && (
        <Modal title="Edit Expense" onClose={() => !isSavingExpense && setEditingExpense(null)}>
          <form onSubmit={handleUpdateExpense} className="flex flex-col gap-4">
            <Field label="Description" name="title" defaultValue={editingExpense.title} required />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5 text-xs font-semibold text-[#555a6c]">
                Category
                <select name="category" defaultValue={editingExpense.category} className="rounded-xl border border-[#e8dfd4] bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-[#8b5a2b]">
                  <option value="maintenance">Repairs & Maintenance</option>
                  <option value="electricity">Electricity Bill</option>
                  <option value="water">Water Supply</option>
                  <option value="wifi">Internet / Wi-Fi</option>
                  <option value="salary">Staff Salary</option>
                  <option value="groceries">Food & Groceries</option>
                  <option value="cleaning">Housekeeping</option>
                  <option value="other">Other Operating Cost</option>
                </select>
              </label>
              <Field label="Amount (₹)" name="amount" type="number" defaultValue={editingExpense.amount} required />
            </div>
            <Field label="Date" name="expense_date" type="date" defaultValue={editingExpense.expense_date} required />
            <Field label="Vendor / Notes" name="notes" defaultValue={editingExpense.notes} />
            <button
              type="submit"
              disabled={isSavingExpense}
              className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-[#8b5a2b] py-3 text-sm font-semibold text-white shadow-xs hover:bg-[#784b20] disabled:opacity-60 transition-colors"
            >
              {isSavingExpense && <Loader2 className="size-4 animate-spin" />}
              {isSavingExpense ? 'Saving Changes...' : 'Save Changes'}
            </button>
          </form>
        </Modal>
      )}

      {/* 11. Add Electricity Modal (Auto-prefills previous reading) */}
      {showElectricityModal && (
        <Modal title="Record Electricity Meter Reading" onClose={() => !isSavingElectricity && setShowElectricityModal(false)}>
          <form onSubmit={handleAddElectricity} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-[#555a6c]">
              Select Meter / Room
              <select
                name="room_id"
                value={elecFormRoomId}
                onChange={(e) => {
                  const selId = e.target.value
                  setElecFormRoomId(selId)
                  // Find previous reading for this room
                  const lastReading = electricity.find((el) => el.room_id === selId)?.current_reading || 0
                  setElecFormPrevReading(lastReading)
                }}
                className="rounded-xl border border-[#e8dfd4] bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-[#8b5a2b]"
              >
                <option value="general">Building General Meter</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    Room {r.room_number} Meter
                  </option>
                ))}
              </select>
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field
                label="Previous Reading (kWh)"
                name="previous_reading"
                type="number"
                value={elecFormPrevReading}
                onChange={(e: any) => setElecFormPrevReading(Number(e.target.value))}
                required
              />
              <Field label="Current Reading (kWh)" name="current_reading" type="number" placeholder="150" required />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Rate per Unit (₹)" name="rate_per_unit" type="number" defaultValue="10" required />
              <Field label="Reading Date" name="reading_date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required />
            </div>

            <button
              type="submit"
              disabled={isSavingElectricity}
              className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-[#8b5a2b] py-3 text-sm font-semibold text-white shadow-xs hover:bg-[#784b20] disabled:opacity-60 transition-colors"
            >
              {isSavingElectricity && <Loader2 className="size-4 animate-spin" />}
              {isSavingElectricity ? 'Recording Reading...' : 'Record Reading'}
            </button>
          </form>
        </Modal>
      )}

      {/* 12. Add Complaint Modal */}
      {showComplaintModal && (
        <Modal title="Log Maintenance Ticket / Complaint" onClose={() => !isSavingComplaint && setShowComplaintModal(false)}>
          <form onSubmit={handleAddComplaint} className="flex flex-col gap-4">
            <Field label="Issue Summary" name="title" placeholder="e.g. Geyser not heating in Room 201" required />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5 text-xs font-semibold text-[#555a6c]">
                Reported by Resident
                <select name="tenant" className="rounded-xl border border-[#e8dfd4] bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-[#8b5a2b]">
                  {tenants
                    .filter((t) => t.status !== 'Vacated')
                    .map((t) => (
                      <option key={t.id} value={t.name}>
                        {t.name} (Room {t.room})
                      </option>
                    ))}
                  <option value="General Property">General Property Issue</option>
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-semibold text-[#555a6c]">
                Priority
                <select name="priority" className="rounded-xl border border-[#e8dfd4] bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-[#8b5a2b]">
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                  <option value="Low">Low</option>
                </select>
              </label>
            </div>
            <Field label="Details / Remarks" name="description" placeholder="Additional repair technician context" />
            <button
              type="submit"
              disabled={isSavingComplaint}
              className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-[#8b5a2b] py-3 text-sm font-semibold text-white shadow-xs hover:bg-[#784b20] disabled:opacity-60 transition-colors"
            >
              {isSavingComplaint && <Loader2 className="size-4 animate-spin" />}
              {isSavingComplaint ? 'Logging Ticket...' : 'Register Complaint Ticket'}
            </button>
          </form>
        </Modal>
      )}

      {/* 11b. Edit Electricity Reading Modal */}
      {editingElectricity && (
        <Modal title="Edit Meter Reading" onClose={() => !isSavingElectricity && setEditingElectricity(null)}>
          <form onSubmit={handleUpdateElectricity} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-[#555a6c]">
              Select Meter / Room
              <select
                name="room_id"
                defaultValue={editingElectricity.room_id || 'general'}
                className="rounded-xl border border-[#e8dfd4] bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-[#8b5a2b]"
              >
                <option value="general">Building General Meter</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    Room {r.room_number} Meter
                  </option>
                ))}
              </select>
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field
                label="Previous Reading (kWh)"
                name="previous_reading"
                type="number"
                defaultValue={editingElectricity.previous_reading}
                required
              />
              <Field
                label="Current Reading (kWh)"
                name="current_reading"
                type="number"
                defaultValue={editingElectricity.current_reading}
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field
                label="Rate per Unit (₹)"
                name="rate_per_unit"
                type="number"
                defaultValue={editingElectricity.rate_per_unit}
                required
              />
              <Field
                label="Reading Date"
                name="reading_date"
                type="date"
                defaultValue={editingElectricity.reading_date}
                required
              />
            </div>

            <button
              type="submit"
              disabled={isSavingElectricity}
              className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-[#8b5a2b] py-3 text-sm font-semibold text-white shadow-xs hover:bg-[#784b20] disabled:opacity-60 transition-colors"
            >
              {isSavingElectricity && <Loader2 className="size-4 animate-spin" />}
              {isSavingElectricity ? 'Updating Reading...' : 'Save Meter Reading'}
            </button>
          </form>
        </Modal>
      )}

      {/* 12b. Edit Complaint Modal */}
      {editingComplaint && (
        <Modal title="Edit Complaint / Ticket" onClose={() => !isSavingComplaint && setEditingComplaint(null)}>
          <form onSubmit={handleUpdateComplaint} className="flex flex-col gap-4">
            <Field label="Issue Summary" name="title" defaultValue={editingComplaint.title} required />
            <div className="grid grid-cols-3 gap-3">
              <label className="flex flex-col gap-1.5 text-xs font-semibold text-[#555a6c]">
                Reported by
                <select
                  name="tenant"
                  defaultValue={editingComplaint.tenant}
                  className="rounded-xl border border-[#e8dfd4] bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-[#8b5a2b]"
                >
                  {tenants
                    .filter((t) => t.status !== 'Vacated')
                    .map((t) => (
                      <option key={t.id} value={t.name}>
                        {t.name} (Room {t.room})
                      </option>
                    ))}
                  <option value="General Property">General Property</option>
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-semibold text-[#555a6c]">
                Priority
                <select
                  name="priority"
                  defaultValue={editingComplaint.priority}
                  className="rounded-xl border border-[#e8dfd4] bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-[#8b5a2b]"
                >
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                  <option value="Low">Low</option>
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-semibold text-[#555a6c]">
                Status
                <select
                  name="status"
                  defaultValue={editingComplaint.status}
                  className="rounded-xl border border-[#e8dfd4] bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-[#8b5a2b]"
                >
                  <option value="Open">Open</option>
                  <option value="In progress">In progress</option>
                  <option value="Resolved">Resolved</option>
                </select>
              </label>
            </div>
            <Field
              label="Details / Remarks"
              name="description"
              defaultValue={editingComplaint.description || ''}
              placeholder="Additional repair technician context"
            />
            <button
              type="submit"
              disabled={isSavingComplaint}
              className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-[#8b5a2b] py-3 text-sm font-semibold text-white shadow-xs hover:bg-[#784b20] disabled:opacity-60 transition-colors"
            >
              {isSavingComplaint && <Loader2 className="size-4 animate-spin" />}
              {isSavingComplaint ? 'Updating Ticket...' : 'Save Ticket Details'}
            </button>
          </form>
        </Modal>
      )}

      {/* 13. Logout Confirmation Modal */}
      {showLogoutModal && (
        <Modal title="Sign Out" onClose={() => setShowLogoutModal(false)}>
          <div className="flex flex-col gap-4">
            <p className="text-sm text-[#74798a]">Are you sure you want to logout?</p>
            <div className="mt-3 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowLogoutModal(false)}
                className="rounded-xl border border-[#e8dfd4] px-4 py-2.5 text-xs font-semibold text-[#676b7d] hover:bg-[#f7f3ed]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeSignOut}
                className="rounded-xl bg-[#b95c3c] px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-[#a04e32]"
              >
                Logout
              </button>
            </div>
          </div>
        </Modal>
      )}


      {/* 15. Formal Receipt Preview & Print Modal */}
      {selectedReceipt && (
        <Modal title="Payment Receipt" onClose={() => setSelectedReceipt(null)}>
          <div className="rounded-2xl border border-[#e8dfd4] bg-[#faf7f2] p-6 text-sm" id="printable-receipt">
            <div className="flex items-start justify-between border-b border-[#e4d9cc] pb-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#8b5a2b]">BaseraBook Official Receipt</span>
                <h4 className="mt-1 text-base font-bold text-[#3d3934]">{property.name || 'Rental Property'}</h4>
                <p className="text-xs text-[#85899a]">{property.address || 'Address on file'}</p>
              </div>
              <div className="text-right">
                <span className="rounded-full bg-[#e7f7f0] px-2.5 py-1 text-[10px] font-bold text-[#328d68]">PAID</span>
                <p className="mt-2 text-xs font-mono font-semibold text-[#676b7d]">REC-{selectedReceipt.id.slice(0, 8).toUpperCase()}</p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <p className="text-[#999daa]">Resident</p>
                <p className="font-semibold text-[#44485a]">{selectedReceipt.tenant_name}</p>
                <p className="text-[#74798a]">Room: {selectedReceipt.room_number}</p>
                {selectedReceipt.month_covered && (
                  <p className="text-[11px] text-[#8b5a2b] font-medium mt-1">Period: {selectedReceipt.month_covered}</p>
                )}
              </div>
              <div>
                <p className="text-[#999daa]">Payment Date & Time</p>
                <p className="font-semibold text-[#44485a]">{formatPaymentTimestamp(selectedReceipt.paid_at, 'Asia/Kolkata', locale)}</p>
                <p className="text-[#74798a]">Mode: {selectedReceipt.payment_method.toUpperCase()}</p>
                {(() => {
                  const rTenant = tenants.find((t) => t.id === selectedReceipt.tenant_id)
                  return rTenant ? (
                    <p className="text-[11px] text-[#74798a] mt-1">Due Day: {rTenant.rent_due_day || 5}th of month</p>
                  ) : null
                })()}
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-[#e8dfd4] bg-white p-4">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-[#74798a] capitalize">{selectedReceipt.payment_type} Fee</span>
                <span className="font-bold text-[#3d3934]">{currency(selectedReceipt.amount)}</span>
              </div>
              {selectedReceipt.notes && (
                <p className="mt-2 text-[11px] text-[#999daa]">Ref: {selectedReceipt.notes}</p>
              )}
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-2 pt-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 rounded-lg border border-[#e8dfd4] bg-white px-3 py-1.5 text-xs font-semibold text-[#676b7d] hover:bg-[#fbf8f3]"
                >
                  <Printer className="size-3.5" />
                  Print Receipt
                </button>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(
                    `*BaseraBook Official Rent Receipt*\nReceipt: REC-${selectedReceipt.id.slice(0, 8).toUpperCase()}\nProperty: ${property.name || 'BaseraBook'}\nResident: ${selectedReceipt.tenant_name} (Room ${selectedReceipt.room_number})\nAmount: ${currency(selectedReceipt.amount)}\nType: ${selectedReceipt.payment_type.toUpperCase()}\nMethod: ${selectedReceipt.payment_method.toUpperCase()}\nPaid At: ${formatPaymentTimestamp(selectedReceipt.paid_at, 'Asia/Kolkata', locale)}\n${selectedReceipt.month_covered ? `Period: ${selectedReceipt.month_covered}\n` : ''}Status: CONFIRMED & PAID`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 rounded-lg border border-[#25D366]/40 bg-[#25D366]/10 px-3 py-1.5 text-xs font-semibold text-[#1e7e34] hover:bg-[#25D366]/20"
                >
                  <MessageCircle className="size-3.5 text-[#25D366]" />
                  Share WhatsApp
                </a>
              </div>
              <button
                onClick={() => setSelectedReceipt(null)}
                className="rounded-lg bg-[#8b5a2b] px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-[#784b20] transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* 16. Tenant Self-Service Portal Modal */}
      {portalTenant && (
        <Modal
          title="Resident Self-Service Portal Link"
          onClose={() => {
            setPortalTenant(null)
            setPortalLinkData(null)
          }}
        >
          <div className="flex flex-col gap-4 text-xs">
            <div className="rounded-2xl border border-[#ebe4da] bg-[#faf7f2] p-4">
              <p className="text-[11px] font-semibold text-[#85899a]">Resident Profile</p>
              <p className="mt-0.5 text-base font-bold text-[#2c221e]">{portalTenant.name}</p>
              <p className="text-[#676b7d]">Room: {portalTenant.room} • Contact: {portalTenant.phone || 'N/A'}</p>
            </div>

            <p className="text-xs text-[#676b7d] leading-relaxed">
              Private links allow your resident to view their outstanding dues, electricity calculations, and download verified receipts securely without needing an account or password.
            </p>

            {/* Link Status Box */}
            {isLoadingPortalStatus ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="size-5 animate-spin text-[#8b5a2b]" />
              </div>
            ) : portalLinkData?.url ? (
              <div className="flex flex-col gap-3 rounded-2xl border border-[#ebe4da] bg-white p-4">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f0fbf5] border border-[#a3e4be] px-2.5 py-0.5 text-[10px] font-bold text-[#236b4e]">
                    <Check className="size-3" /> Active Link
                  </span>
                  {portalLinkData.expiresAt && (
                    <span className="text-[10px] text-[#85899a]">
                      Expires: {new Date(portalLinkData.expiresAt).toLocaleDateString('en-IN')}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={`${typeof window !== 'undefined' ? window.location.origin : ''}${portalLinkData.url}`}
                    className="flex-1 rounded-xl border border-[#e8dfd4] bg-[#faf7f2] px-3 py-2 text-xs font-mono text-[#3d3934] select-all outline-none"
                  />
                  <button
                    onClick={() => {
                      const fullUrl = `${window.location.origin}${portalLinkData.url}`
                      navigator.clipboard.writeText(fullUrl)
                      setCopiedLink(true)
                      setTimeout(() => setCopiedLink(false), 2000)
                    }}
                    className="flex items-center gap-1 rounded-xl bg-[#8b5a2b] px-3 py-2 text-xs font-semibold text-white hover:bg-[#784b20] transition-colors"
                  >
                    {copiedLink ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                    {copiedLink ? 'Copied' : 'Copy'}
                  </button>
                </div>

                {/* Action Row */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#f0ebe3] pt-3">
                  <a
                    href={`https://wa.me/${(portalTenant.phone || '').replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                      `Hello ${portalTenant.name}, here is your private link to view your rent status, payment receipts, and electricity usage for Room ${portalTenant.room}: ${typeof window !== 'undefined' ? window.location.origin : ''}${portalLinkData.url}`
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[#25D366]/40 bg-[#25D366]/10 px-3 py-1.5 text-xs font-semibold text-[#1e7e34] hover:bg-[#25D366]/20 transition-colors"
                  >
                    <MessageCircle className="size-3.5 text-[#25D366]" /> Share on WhatsApp
                  </a>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleRegeneratePortalLink(portalTenant.id)}
                      disabled={isGeneratingPortalLink}
                      className="inline-flex items-center gap-1 rounded-xl border border-[#e8dfd4] px-2.5 py-1.5 text-[11px] font-semibold text-[#676b7d] hover:bg-[#faf7f2] hover:text-[#2c221e] transition-colors"
                      title="Invalidate current link and issue a fresh one"
                    >
                      <RefreshCw className="size-3" /> Regenerate
                    </button>
                    <button
                      onClick={() => handleRevokePortalLink(portalTenant.id)}
                      disabled={isGeneratingPortalLink}
                      className="inline-flex items-center gap-1 rounded-xl border border-[#feb2b2] bg-[#fff5f5] px-2.5 py-1.5 text-[11px] font-semibold text-[#c53030] hover:bg-[#fed7d7] transition-colors"
                      title="Immediately block access to this link"
                    >
                      <ShieldBan className="size-3" /> Revoke
                    </button>
                  </div>
                </div>

                {/* Access Metrics */}
                {portalLinkData.accessCount !== undefined && (
                  <p className="text-[10px] text-[#999daa]">
                    Opened {portalLinkData.accessCount} time(s)
                    {portalLinkData.lastAccessedAt && ` • Last accessed ${new Date(portalLinkData.lastAccessedAt).toLocaleDateString('en-IN')}`}
                  </p>
                )}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-[#d5cfc7] bg-[#faf7f2] p-6 text-center">
                <p className="text-xs text-[#676b7d]">
                  {portalLinkData?.status === 'revoked'
                    ? 'The previous link for this resident was revoked.'
                    : portalLinkData?.status === 'expired'
                    ? 'The previous link for this resident has expired.'
                    : 'No active self-service link exists for this resident.'}
                </p>
                <button
                  onClick={() => handleGeneratePortalLink(portalTenant.id)}
                  disabled={isGeneratingPortalLink}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#8b5a2b] px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-[#784b20] transition-colors"
                >
                  {isGeneratingPortalLink ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />}
                  {isGeneratingPortalLink ? 'Generating Secure Token...' : 'Generate Private Link'}
                </button>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Edit Payment Modal */}
      {editingPayment && (
        <Modal title={`Edit Payment REC-${editingPayment.id.slice(0, 8).toUpperCase()}`} onClose={() => !isSavingPayment && setEditingPayment(null)}>
          <form onSubmit={handleUpdatePayment} className="flex flex-col gap-4">
            <div className="rounded-xl bg-[#faf7f2] p-3 text-xs text-[#555a6c]">
              <span className="font-semibold text-[#3d3934]">Resident:</span> {editingPayment.tenant_name} (Room {editingPayment.room_number})
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field
                label="Amount (₹)"
                name="amount"
                type="number"
                defaultValue={editingPayment.amount}
                required
              />
              <label className="flex flex-col gap-1.5 text-xs font-semibold text-[#555a6c]">
                Payment Method
                <select
                  name="payment_method"
                  defaultValue={editingPayment.payment_method}
                  className="rounded-xl border border-[#e4e6ec] bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-[#8b5a2b] focus:ring-1 focus:ring-[#8b5a2b] transition-all"
                >
                  <option value="upi">UPI / GPay / PhonePe</option>
                  <option value="cash">Cash</option>
                  <option value="bank_transfer">Bank Transfer / NEFT</option>
                  <option value="card">Debit / Credit Card</option>
                </select>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5 text-xs font-semibold text-[#555a6c]">
                Payment Type
                <select
                  name="payment_type"
                  defaultValue={editingPayment.payment_type}
                  className="rounded-xl border border-[#e4e6ec] bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-[#8b5a2b] focus:ring-1 focus:ring-[#8b5a2b] transition-all"
                >
                  <option value="rent">Monthly Rent</option>
                  <option value="deposit">Security Deposit</option>
                  <option value="electricity">Electricity Charges</option>
                  <option value="maintenance">Maintenance</option>
                </select>
              </label>

              <Field
                label="Month Covered"
                name="month_covered"
                defaultValue={editingPayment.month_covered || ''}
                placeholder="e.g. October 2026"
              />
            </div>

            <Field
              label="Payment Date & Time (ISO or YYYY-MM-DDTHH:MM)"
              name="paid_at"
              defaultValue={editingPayment.paid_at ? new Date(editingPayment.paid_at).toISOString().slice(0, 16) : ''}
              required
            />

            <Field
              label="Notes / Reference"
              name="notes"
              defaultValue={editingPayment.notes || ''}
              placeholder="e.g. UTR / Transaction ID"
            />

            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                disabled={isSavingPayment}
                onClick={() => setEditingPayment(null)}
                className="rounded-xl border border-[#e4e6ec] px-4 py-2.5 text-xs font-semibold text-[#676b7d] hover:bg-[#faf7f2] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSavingPayment}
                className="flex items-center gap-1.5 rounded-xl bg-[#8b5a2b] px-5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-[#784b20] disabled:opacity-50 transition-colors"
              >
                {isSavingPayment && <Loader2 className="size-3.5 animate-spin" />}
                {isSavingPayment ? 'Saving Changes...' : 'Save Payment Changes'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* 16. Subscription / Pricing Modal */}
      {showPricingModal && (
        <Modal
          title="BaseraBook Subscription Plans"
          maxWidth="max-w-5xl"
          onClose={() => setShowPricingModal(false)}
        >
          <div className="space-y-5">
            {/* Active Subscription & Property Allowance Central Hub */}
            <div className="rounded-2xl border border-[#e8dfd4] bg-[#faf7f2] p-4 sm:p-5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#8b5a2b]">Active Subscription</span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                        subscriptionStatus === 'active'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : isTrialExpired
                          ? 'bg-[#ffebe8] text-[#b95c3c] border border-[#ffcfc7]'
                          : 'bg-[#faf3ea] text-[#8b5a2b] border border-[#e8dfd4]'
                      }`}
                    >
                      {subscriptionStatus === 'active' ? 'Active Paid Plan' : isTrialExpired ? 'Trial Expired' : '7-Day Free Trial'}
                    </span>
                  </div>
                  <h3 className="mt-1 text-base sm:text-lg font-extrabold text-[#2c221e] capitalize">
                    {subscriptionPlan || 'Starter'} Plan
                  </h3>
                  <p className="mt-0.5 text-xs text-[#74798a]">
                    Total Property Allowance:{' '}
                    <strong className="text-[#2c221e]">
                      {entitlement?.maxProperties ?? 2} {entitlement?.maxProperties === 1 ? 'Property' : 'Properties'}
                    </strong>
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <div className="rounded-xl border border-[#ebe4da] bg-white px-3.5 py-2 text-center shadow-2xs min-w-[110px]">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[#9c8e80]">Properties Used</p>
                    <p className="text-base font-bold text-[#2c221e]">
                      {entitlement?.activePropertyCount ?? properties.length} / {entitlement?.maxProperties ?? 2}
                    </p>
                  </div>

                  <div className="rounded-xl border border-[#ebe4da] bg-white px-3.5 py-2 text-center shadow-2xs min-w-[110px]">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[#9c8e80]">Remaining Slots</p>
                    <p className={`text-base font-bold ${
                      (entitlement?.remainingPropertySlots ?? 0) <= 0 ? 'text-[#b95c3c]' : 'text-emerald-700'
                    }`}>
                      {entitlement?.remainingPropertySlots ?? 0}
                    </p>
                  </div>
                </div>
              </div>

              {/* Progress Bar & Real-time Slots Breakdown */}
              <div className="mt-3.5">
                <div className="h-2 w-full overflow-hidden rounded-full bg-[#eee5db]">
                  <div
                    className={`h-full transition-all duration-300 ${
                      !entitlement?.canCreateProperty ? 'bg-[#b95c3c]' : 'bg-[#8b5a2b]'
                    }`}
                    style={{
                      width: `${Math.min(
                        100,
                        Math.round(
                          ((entitlement?.activePropertyCount ?? properties.length) /
                            Math.max(1, entitlement?.maxProperties ?? 2)) *
                            100
                        )
                      )}%`,
                    }}
                  />
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[11px] text-[#85899a]">
                  <span>
                    {entitlement?.activePropertyCount ?? properties.length} of {entitlement?.maxProperties ?? 2} property slots used
                  </span>
                  <span>
                    {!entitlement?.canCreateProperty
                      ? 'Quota limit reached · Choose a higher capacity plan below to expand'
                      : `${entitlement?.remainingPropertySlots ?? 0} additional property slot(s) available`}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#f0ebe3] pb-4">
              <div>
                <p className="text-xs sm:text-sm text-[#74798a]">
                  Select the plan that matches your property scale. Upgrade or switch billing anytime.
                </p>
              </div>

              {/* Monthly / Yearly Toggle */}
              <div className="inline-flex items-center self-start sm:self-auto rounded-xl border border-[#e8dfd4] bg-[#faf7f2] p-1 text-xs shrink-0">
                <button
                  type="button"
                  onClick={() => setDashboardBillingCycle('monthly')}
                  className={`rounded-lg px-3.5 py-1.5 font-bold transition-all cursor-pointer ${
                    dashboardBillingCycle === 'monthly'
                      ? 'bg-[#8b5a2b] text-white shadow-xs'
                      : 'text-[#676b7d] hover:text-[#3d3934]'
                  }`}
                >
                  Monthly
                </button>
                <button
                  type="button"
                  onClick={() => setDashboardBillingCycle('yearly')}
                  className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 font-bold transition-all cursor-pointer ${
                    dashboardBillingCycle === 'yearly'
                      ? 'bg-[#8b5a2b] text-white shadow-xs'
                      : 'text-[#676b7d] hover:text-[#3d3934]'
                  }`}
                >
                  Yearly
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[9px] font-black ${
                      dashboardBillingCycle === 'yearly'
                        ? 'bg-[#5f442b] text-[#f7d8ba]'
                        : 'bg-[#eaf5ea] text-[#2e7d32]'
                    }`}
                  >
                    Save up to ₹5,598/yr
                  </span>
                </button>
              </div>
            </div>

            {/* 4 Cards Grid - Fully mobile responsive: 1 col on mobile, 2 on tablet, 4 on desktop */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-stretch">
              {PRICING_PLANS.map((plan) => {
                const isYearly = dashboardBillingCycle === 'yearly'
                const price = isYearly ? plan.yearlyPrice : plan.monthlyPrice
                const formattedPrice = price !== null ? formatINR(price) : 'Custom'
                const periodLabel = isYearly ? '/year' : '/month'
                const isCurrentPlan =
                  subscriptionStatus === 'active' &&
                  (subscriptionPlan === plan.id ||
                    (plan.id === 'growth' &&
                      (subscriptionPlan === 'yearly' || subscriptionPlan === 'pro')))

                return (
                  <div
                    key={plan.id}
                    className={`flex flex-col justify-between rounded-2xl p-4 sm:p-5 transition-all ${
                      plan.popular
                        ? 'border-2 border-[#8b5a2b] bg-[#fffdfa] shadow-md relative'
                        : 'border border-[#e8dfd4] bg-[#faf7f2] hover:border-[#d8c2aa]'
                    }`}
                  >
                    <div>
                      {plan.popular && (
                        <div className="mb-2">
                          <span className="inline-block rounded-full bg-[#8b5a2b] px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
                            Most Popular
                          </span>
                        </div>
                      )}

                      <div className="flex items-center justify-between">
                        <h4 className="font-bold text-base text-[#2c221e]">{plan.name}</h4>
                      </div>

                      <p className="text-xs font-semibold text-[#8b5a2b] mt-0.5">
                        {plan.propertyLimit}
                      </p>

                      <div className="mt-3 mb-2">
                        {price !== null ? (
                          <div>
                            <p className="text-2xl font-extrabold text-[#2c221e] tracking-tight">
                              {formattedPrice}
                              <span className="text-xs font-normal text-[#85899a]"> {periodLabel}</span>
                            </p>
                            {isYearly && plan.annualSavings ? (
                              <p className="text-[11px] font-semibold text-[#2e7d32] mt-0.5">
                                Save {formatINR(plan.annualSavings)}/yr
                              </p>
                            ) : (
                              <p className="text-[11px] text-[#85899a] mt-0.5">Billed monthly</p>
                            )}
                          </div>
                        ) : (
                          <div>
                            <p className="text-2xl font-extrabold text-[#2c221e] tracking-tight">
                              Custom pricing
                            </p>
                            <p className="text-[11px] text-[#85899a] mt-0.5">Tailored quote</p>
                          </div>
                        )}
                      </div>

                      <ul className="mt-3 space-y-1.5 text-xs text-[#676b7d] border-t border-[#eee5db] pt-3">
                        {plan.featuresEn.slice(0, 4).map((f) => (
                          <li key={f} className="flex items-start gap-1.5">
                            <span className="text-[#8b5a2b] font-bold shrink-0">✓</span>
                            <span>{f}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="mt-4 pt-3 border-t border-[#eee5db]">
                      {plan.id === 'enterprise' ? (
                        <a
                          href={getMailtoSupport(
                            'Enterprise Plan Inquiry',
                            'Hello BaseraBook Team, I would like to inquire about the Enterprise tier for 9+ properties.'
                          )}
                          className="w-full block text-center rounded-xl border border-[#8b5a2b] bg-white px-4 py-2.5 text-xs font-bold text-[#8b5a2b] hover:bg-[#faf7f2] transition-colors"
                        >
                          Contact Us
                        </a>
                      ) : isCurrentPlan ? (
                        <button
                          type="button"
                          disabled
                          className="w-full rounded-xl bg-[#e5dfd8] px-4 py-2.5 text-xs font-bold text-[#7d756d] cursor-default"
                        >
                          Current Plan
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={isUpgradingSubscription}
                          onClick={() => handleUpgradePlan(plan.id)}
                          className="w-full rounded-xl bg-[#8b5a2b] px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-[#784b20] transition-colors disabled:opacity-60 cursor-pointer"
                        >
                          {isUpgradingSubscription ? 'Connecting...' : `Choose ${plan.name}`}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-[#74798a] border-t border-[#f0ebe3]">
              <span>
                Questions or need assistance? Email{' '}
                <a
                  href={getMailtoSupport('Subscription Help')}
                  className="font-semibold text-[#8b5a2b] hover:underline"
                >
                  {SUPPORT_EMAIL}
                </a>
              </span>
              <button
                type="button"
                onClick={() => setShowPricingModal(false)}
                className="self-end sm:self-auto rounded-lg px-3 py-1.5 font-medium text-[#74798a] hover:text-[#3d3934] cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Plan Upgrade & Checkout Confirmation Modal */}
      {confirmingPlanUpgrade && (
        <Modal
          title="Confirm Subscription Plan"
          maxWidth="max-w-md"
          onClose={() => !isUpgradingSubscription && setConfirmingPlanUpgrade(null)}
        >
          <div className="space-y-4">
            <div className="rounded-2xl border border-[#e8dfd4] bg-[#faf7f2] p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-base text-[#2c221e]">
                    {confirmingPlanUpgrade.plan.name} Plan
                  </h4>
                  <p className="text-xs font-semibold text-[#8b5a2b]">
                    {confirmingPlanUpgrade.plan.propertyLimit}
                  </p>
                </div>
                <span className="rounded-full bg-[#f4ede3] px-2.5 py-1 text-[11px] font-semibold text-[#8b5a2b] capitalize">
                  {confirmingPlanUpgrade.cycle} Billing
                </span>
              </div>

              <div className="mt-4 pt-3 border-t border-[#e8dfd4] flex items-baseline justify-between">
                <span className="text-xs text-[#776d62]">Total Amount:</span>
                <div className="text-right">
                  <span className="text-2xl font-bold text-[#2c221e]">
                    {formatINR(
                      confirmingPlanUpgrade.cycle === 'yearly'
                        ? confirmingPlanUpgrade.plan.yearlyPrice!
                        : confirmingPlanUpgrade.plan.monthlyPrice!
                    )}
                  </span>
                  <span className="text-xs text-[#776d62]">
                    {confirmingPlanUpgrade.cycle === 'yearly' ? ' / year' : ' / month'}
                  </span>
                </div>
              </div>
            </div>

            {/* Trial Eligibility & Immediate Charge Disclosure */}
            {isTrialExpired ? (
              <div className="rounded-xl bg-[#fff8ed] p-3 text-xs text-[#a35200] border border-[#f0c38a] flex items-start gap-2">
                <AlertCircle className="size-4 shrink-0 mt-0.5 text-[#d97706]" />
                <div>
                  <p className="font-bold text-[#b45309]">Trial Period Expired — Immediate Billing</p>
                  <p className="mt-0.5 text-[#92400e]">
                    Your 7-day free trial has expired. You will be charged{' '}
                    <strong>
                      {formatINR(
                        confirmingPlanUpgrade.cycle === 'yearly'
                          ? confirmingPlanUpgrade.plan.yearlyPrice!
                          : confirmingPlanUpgrade.plan.monthlyPrice!
                      )}
                    </strong>{' '}
                    immediately upon authorization for 1 {confirmingPlanUpgrade.cycle === 'yearly' ? 'year' : 'month'} of access.
                  </p>
                </div>
              </div>
            ) : subscriptionStatus === 'trialing' && trialEnd ? (
              <div className="rounded-xl bg-[#f0f9f2] p-3 text-xs text-[#1e7e34] border border-[#d2e7d6] flex items-start gap-2">
                <ShieldCheck className="size-4 shrink-0 mt-0.5 text-[#1e7e34]" />
                <div>
                  <p className="font-bold text-[#1e7e34]">7-Day Free Trial Active</p>
                  <p className="mt-0.5">
                    Your trial remains active until{' '}
                    {new Date(trialEnd).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                    . You will only be charged after your trial concludes.
                  </p>
                </div>
              </div>
            ) : (
              <div className="rounded-xl bg-[#f0f9f2] p-3 text-xs text-[#1e7e34] border border-[#d2e7d6] flex items-start gap-2">
                <ShieldCheck className="size-4 shrink-0 mt-0.5 text-[#1e7e34]" />
                <div>
                  <p className="font-bold text-[#1e7e34]">7-Day Free Trial Included</p>
                  <p className="mt-0.5">
                    Eligible accounts will not be charged today. Your first charge will occur after 7 days.
                  </p>
                </div>
              </div>
            )}

            {/* Customer Contact Phone Number */}
            <div>
              <label className="block text-xs font-semibold text-[#57534e] mb-1">
                Contact Phone Number {userPhone ? '(verified)' : '(for payment updates & receipts)'}
              </label>
              <input
                type="tel"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                placeholder="Enter 10-digit mobile number"
                className="w-full rounded-xl border border-[#e8dfd4] bg-white px-3 py-2 text-xs text-[#2c221e] placeholder:text-[#a8a29e] focus:border-[#8b5a2b] focus:outline-hidden"
              />
              <p className="mt-1 text-[11px] text-[#8b8277]">
                {phoneInput
                  ? 'Payment receipts and subscription notifications will be sent to this number.'
                  : 'If omitted, you can enter your contact number directly on the payment screen.'}
              </p>
            </div>

            <div className="pt-2 flex flex-col gap-2">
              <button
                type="button"
                disabled={isUpgradingSubscription}
                onClick={() => handleUpgradePlan(confirmingPlanUpgrade.plan.id, phoneInput)}
                className="w-full rounded-xl bg-[#8b5a2b] py-2.5 text-center text-xs font-bold text-white shadow-xs hover:bg-[#784b20] transition-colors disabled:opacity-60 cursor-pointer flex items-center justify-center gap-2"
              >
                {isUpgradingSubscription ? 'Connecting to Payment Gateway...' : 'Proceed to Razorpay Checkout'}
              </button>
              <button
                type="button"
                disabled={isUpgradingSubscription}
                onClick={() => setConfirmingPlanUpgrade(null)}
                className="w-full rounded-xl border border-[#e8dfd4] bg-white py-2 text-center text-xs font-semibold text-[#676b7d] hover:bg-[#faf7f2] transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* High-Impact Confirmation Dialog */}
      {confirmDialog.open && (
        <Modal
          title={confirmDialog.title}
          onClose={() => !isConfirming && setConfirmDialog((prev) => ({ ...prev, open: false }))}
        >
          <div className="space-y-4">
            {confirmDialog.actionLabel === 'Reverse Payment' ? (
              <div className="rounded-2xl border border-[#ffcfc7] bg-[#fff5f2] p-4 text-xs text-[#8c351e]">
                <div className="flex items-center gap-2 font-bold text-[#b95c3c] mb-1">
                  <RotateCcw className="size-4 shrink-0 text-[#b95c3c]" />
                  <span>Accounting Compliance Guard</span>
                </div>
                <p className="text-[#6d2f1f] leading-relaxed">
                  {confirmDialog.description}
                </p>
              </div>
            ) : confirmDialog.isDestructive ? (
              <div className="rounded-2xl border border-[#ffcfc7] bg-[#fff5f2] p-4 text-xs text-[#8c351e]">
                <div className="flex items-center gap-2 font-bold text-[#b95c3c] mb-1">
                  <AlertTriangle className="size-4 shrink-0 text-[#b95c3c]" />
                  <span>Safe Deletion to Deleted Records</span>
                </div>
                <p className="text-[#6d2f1f] leading-relaxed">
                  {confirmDialog.description}
                </p>
              </div>
            ) : (
              <p className="text-sm text-[#555a6c] leading-relaxed">{confirmDialog.description}</p>
            )}

            <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2.5 pt-3 border-t border-[#f0ebe3]">
              <button
                type="button"
                disabled={isConfirming}
                onClick={() => setConfirmDialog((prev) => ({ ...prev, open: false }))}
                className="w-full sm:w-auto rounded-xl border border-[#d6d9e0] bg-white px-5 py-2.5 text-xs font-semibold text-[#555a6c] hover:bg-[#faf7f2] hover:text-[#2c221e] active:scale-[0.98] transition-all disabled:opacity-40 cursor-pointer shadow-2xs"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isConfirming}
                onClick={async () => {
                  if (isConfirming) return
                  setIsConfirming(true)
                  try {
                    await confirmDialog.onConfirm()
                    setConfirmDialog((prev) => ({ ...prev, open: false }))
                  } catch (err) {
                    console.error('Confirmation action error:', err)
                  } finally {
                    setIsConfirming(false)
                  }
                }}
                className={`w-full sm:w-auto flex items-center justify-center gap-2 rounded-xl px-6 py-2.5 text-xs font-bold text-white shadow-sm active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer ${
                  confirmDialog.isDestructive
                    ? 'bg-[#b95c3c] hover:bg-[#a14a2c] shadow-[0_2px_8px_rgba(185,92,60,0.25)]'
                    : 'bg-[#8b5a2b] hover:bg-[#784b20] shadow-[0_2px_8px_rgba(139,90,43,0.25)]'
                }`}
              >
                {isConfirming ? (
                  <Loader2 className="size-4 animate-spin text-white" />
                ) : confirmDialog.actionLabel === 'Reverse Payment' ? (
                  <RotateCcw className="size-4" />
                ) : confirmDialog.isDestructive ? (
                  <Trash2 className="size-4" />
                ) : null}
                <span>
                  {isConfirming
                    ? confirmDialog.actionLabel === 'Reverse Payment'
                      ? 'Reversing Payment...'
                      : 'Processing...'
                    : confirmDialog.actionLabel}
                </span>
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Permanent Deletion Confirmation Modal */}
      {purgeTarget && (
        <Modal
          title="Delete Permanently?"
          onClose={() => !isPurgingTrashId && setPurgeTarget(null)}
        >
          <div className="space-y-4">
            <div className="rounded-xl border border-[#ffe0e0] bg-[#fff5f5] p-3 text-xs text-[#b95c3c]">
              <div className="flex items-center gap-2 font-bold mb-1">
                <AlertTriangle className="size-4 text-[#b95c3c]" />
                Irreversible Permanent Action
              </div>
              Are you sure you want to permanently delete <strong className="text-[#991b1b]">{purgeTarget.entity_name}</strong>? This record will be permanently purged from your account and cannot be restored.
            </div>
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={!!isPurgingTrashId}
                onClick={() => setPurgeTarget(null)}
                className="rounded-xl border border-[#e4e6ec] px-4 py-2.5 text-xs font-semibold text-[#676b7d] hover:bg-[#faf7f2] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!!isPurgingTrashId}
                onClick={handleConfirmPermanentDelete}
                className="flex items-center gap-1.5 rounded-xl bg-[#dc2626] px-5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-[#b91c1c] disabled:opacity-50 transition-colors"
              >
                {isPurgingTrashId && <Loader2 className="size-3.5 animate-spin" />}
                {isPurgingTrashId ? 'Deleting...' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Mid-Cycle Electricity Bill Sharing Modal */}
      {showMidCycleModal && (() => {
        const candidateTenants = currentPropertyTenants.filter((t) => {
          if (midCycleRoomId !== 'all' && t.room_id !== midCycleRoomId) return false
          return true
        })

        const cycleDays = (midCyclePeriodStart && midCyclePeriodEnd && midCyclePeriodEnd >= midCyclePeriodStart)
          ? Math.round((new Date(midCyclePeriodEnd).getTime() - new Date(midCyclePeriodStart).getTime()) / (1000 * 60 * 60 * 24)) + 1
          : 0

        const handleSetQuickPeriod = (type: 'prev_month' | 'curr_month') => {
          const now = new Date()
          const y = now.getFullYear()
          const m = now.getMonth()

          let start = ''
          let end = ''
          if (type === 'prev_month') {
            const prev = new Date(y, m - 1, 1)
            const py = prev.getFullYear()
            const pm = prev.getMonth() + 1
            const lastDay = new Date(py, pm, 0).getDate()
            start = `${py}-${String(pm).padStart(2, '0')}-01`
            end = `${py}-${String(pm).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
          } else {
            const cm = m + 1
            const lastDay = new Date(y, cm, 0).getDate()
            start = `${y}-${String(cm).padStart(2, '0')}-01`
            end = `${y}-${String(cm).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
          }

          setMidCyclePeriodStart(start)
          setMidCyclePeriodEnd(end)
          setMidCycleCalculatedSplit(null)
          setMidCycleError(null)
          setMidCycleSuccessMessage(null)
        }

        return (
          <Modal
            title="Fair Electricity Bill Split Calculator"
            onClose={() => !isSavingMidCycleSplit && setShowMidCycleModal(false)}
          >
            <div className="flex flex-col gap-4 text-xs max-h-[80vh] overflow-y-auto pr-1">
              {/* Introduction Banner */}
              <div className="rounded-xl border border-[#ebe4da] bg-[#faf7f2] p-3 text-[11px] text-[#676b7d] flex items-start gap-2.5">
                <Sparkles className="size-4 text-[#8b5a2b] shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  <strong className="text-[#2c221e]">Fair Mid-Cycle Occupancy Allocation:</strong> Calculates mathematically proportional electricity charges based on each resident&apos;s active occupancy dates. Residents who joined mid-cycle are <strong className="text-[#8b5a2b]">never charged</strong> for days before their move-in date.
                </div>
              </div>

              {/* 1. Scope and Billing Cycle */}
              <div className="space-y-3 rounded-2xl border border-[#e8dfd4] bg-white p-3.5 sm:p-4">
                <div className="flex items-center justify-between border-b border-[#eee6dc] pb-2.5">
                  <span className="font-bold text-sm text-[#2c221e] flex items-center gap-1.5">
                    <Building2 className="size-4 text-[#8b5a2b]" /> Scope & Billing Period
                  </span>
                  {cycleDays > 0 && (
                    <span className="rounded-lg bg-[#faf0e6] border border-[#d8c2aa] px-2 py-0.5 text-[11px] font-bold text-[#8b5a2b]">
                      {cycleDays} Days Cycle
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <label className="flex flex-col gap-1.5 font-semibold text-[#555a6c]">
                    <span>Scope / Room</span>
                    <select
                      value={midCycleRoomId}
                      onChange={(e) => {
                        setMidCycleRoomId(e.target.value)
                        setMidCycleCalculatedSplit(null)
                        setMidCycleError(null)
                        setMidCycleSuccessMessage(null)
                      }}
                      className="rounded-xl border border-[#e4e6ec] bg-white px-3 py-2 text-xs font-normal outline-none focus:border-[#8b5a2b]"
                    >
                      <option value="all">Entire Property (All Residents)</option>
                      {currentPropertyRooms.map((r) => (
                        <option key={r.id} value={r.id}>
                          Room {r.room_number} ({r.room_type})
                        </option>
                      ))}
                    </select>
                  </label>

                  <Field
                    label="Billing Period Start"
                    name="period_start"
                    type="date"
                    value={midCyclePeriodStart}
                    onChange={(e: any) => {
                      setMidCyclePeriodStart(e.target.value)
                      setMidCycleCalculatedSplit(null)
                      setMidCycleError(null)
                      setMidCycleSuccessMessage(null)
                    }}
                    required
                  />

                  <Field
                    label="Billing Period End"
                    name="period_end"
                    type="date"
                    value={midCyclePeriodEnd}
                    onChange={(e: any) => {
                      setMidCyclePeriodEnd(e.target.value)
                      setMidCycleCalculatedSplit(null)
                      setMidCycleError(null)
                      setMidCycleSuccessMessage(null)
                    }}
                    required
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px]">
                  <span className="text-[#85899a] font-medium">Quick Presets:</span>
                  <button
                    type="button"
                    onClick={() => handleSetQuickPeriod('prev_month')}
                    className="rounded-lg border border-[#d8c2aa] bg-[#faf7f2] px-2.5 py-1 font-semibold text-[#8b5a2b] hover:bg-[#f1e8dc] transition-colors"
                  >
                    Previous Month
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetQuickPeriod('curr_month')}
                    className="rounded-lg border border-[#e4e6ec] bg-white px-2.5 py-1 font-semibold text-[#555a6c] hover:bg-[#faf7f2] transition-colors"
                  >
                    Current Month
                  </button>
                </div>
              </div>

              {/* 2. Consumption & Bill Amounts */}
              <div className="space-y-3 rounded-2xl border border-[#e8dfd4] bg-white p-3.5 sm:p-4">
                <div className="flex items-center justify-between border-b border-[#eee6dc] pb-2.5">
                  <span className="font-bold text-sm text-[#2c221e] flex items-center gap-1.5">
                    <Zap className="size-4 text-[#8b5a2b]" /> Bill Details
                  </span>
                  <span className="text-[11px] text-[#85899a]">
                    Total Bill = Units × Rate
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Field
                    label="Total Units (kWh)"
                    name="total_units"
                    type="number"
                    min="0"
                    step="1"
                    value={midCycleTotalUnits === 0 ? '' : midCycleTotalUnits}
                    placeholder="e.g. 150"
                    onChange={(e: any) => {
                      const units = Number(e.target.value) || 0
                      setMidCycleTotalUnits(units)
                      if (midCycleRatePerUnit > 0) {
                        setMidCycleBillAmount(Math.round(units * midCycleRatePerUnit * 100) / 100)
                      }
                      setMidCycleCalculatedSplit(null)
                    }}
                    required
                  />

                  <Field
                    label="Rate per Unit (₹)"
                    name="rate_per_unit"
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={midCycleRatePerUnit || ''}
                    placeholder="e.g. 10"
                    onChange={(e: any) => {
                      const rate = Number(e.target.value) || 0
                      setMidCycleRatePerUnit(rate)
                      if (midCycleTotalUnits > 0) {
                        setMidCycleBillAmount(Math.round(midCycleTotalUnits * rate * 100) / 100)
                      } else if (midCycleBillAmount > 0 && rate > 0) {
                        setMidCycleTotalUnits(Math.round(midCycleBillAmount / rate))
                      }
                      setMidCycleCalculatedSplit(null)
                    }}
                    required
                  />

                  <Field
                    label="Total Bill (₹)"
                    name="bill_amount"
                    type="number"
                    min="0"
                    step="1"
                    value={midCycleBillAmount === 0 ? '' : midCycleBillAmount}
                    placeholder="e.g. 1500"
                    onChange={(e: any) => {
                      const amt = Number(e.target.value) || 0
                      setMidCycleBillAmount(amt)
                      if (midCycleRatePerUnit > 0) {
                        setMidCycleTotalUnits(Math.round(amt / midCycleRatePerUnit))
                      }
                      setMidCycleCalculatedSplit(null)
                    }}
                    required
                  />
                </div>
              </div>

              {/* 3. Automatic Resident Loading & Occupancy Dates */}
              <div className="space-y-3 rounded-2xl border border-[#e8dfd4] bg-white p-3.5 sm:p-4">
                <div className="flex items-center justify-between border-b border-[#eee6dc] pb-2.5">
                  <span className="font-bold text-sm text-[#2c221e] flex items-center gap-1.5">
                    <Users className="size-4 text-[#8b5a2b]" /> Loaded Residents ({candidateTenants.length})
                  </span>
                  <span className="text-[11px] text-[#85899a]">
                    Move-in & move-out dates loaded from database
                  </span>
                </div>

                {candidateTenants.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[#d8c2aa] bg-[#faf7f2] p-5 text-center text-xs text-[#85899a]">
                    No residents found in the selected scope. Choose another room or select &quot;Entire Property&quot;.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {candidateTenants.map((t) => {
                      const joinVal = midCycleResidentDates[t.id]?.joiningDate || t.joiningDate || midCyclePeriodStart
                      const vacVal = midCycleResidentDates[t.id]?.vacatedDate !== undefined
                        ? (midCycleResidentDates[t.id].vacatedDate || '')
                        : (t.status === 'Vacated' ? (t.updated_at ? t.updated_at.slice(0, 10) : '') : '')

                      return (
                        <div
                          key={t.id}
                          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-[#f0e8df] bg-[#fdfcf9] p-2.5 sm:p-3"
                        >
                          <div className="min-w-[140px]">
                            <p className="font-bold text-[#2c221e]">{t.name}</p>
                            <div className="flex items-center gap-1.5 text-[11px] text-[#85899a] mt-0.5">
                              <span>Room {t.room}</span>
                              {t.status === 'Vacated' && (
                                <span className="rounded bg-[#ffebe6] text-[#b91c1c] px-1.5 py-0.2 text-[10px] font-semibold">
                                  Vacated
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <label className="flex items-center gap-1 text-[11px] text-[#676b7d]">
                              <span>Move-in:</span>
                              <input
                                type="date"
                                value={joinVal}
                                onChange={(e) => {
                                  const newVal = e.target.value
                                  setMidCycleResidentDates((prev) => ({
                                    ...prev,
                                    [t.id]: {
                                      joiningDate: newVal,
                                      vacatedDate: prev[t.id]?.vacatedDate !== undefined ? prev[t.id].vacatedDate : vacVal,
                                    },
                                  }))
                                  setMidCycleCalculatedSplit(null)
                                }}
                                className="rounded-lg border border-[#e4e6ec] bg-white px-2 py-1 text-xs outline-none focus:border-[#8b5a2b]"
                              />
                            </label>

                            <label className="flex items-center gap-1 text-[11px] text-[#676b7d]">
                              <span>Move-out (optional):</span>
                              <input
                                type="date"
                                value={vacVal}
                                placeholder="Vacate date"
                                onChange={(e) => {
                                  const newVal = e.target.value || null
                                  setMidCycleResidentDates((prev) => ({
                                    ...prev,
                                    [t.id]: {
                                      joiningDate: joinVal,
                                      vacatedDate: newVal,
                                    },
                                  }))
                                  setMidCycleCalculatedSplit(null)
                                }}
                                className="rounded-lg border border-[#e4e6ec] bg-white px-2 py-1 text-xs outline-none focus:border-[#8b5a2b]"
                              />
                            </label>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* 4. Collapsible Advanced Settings: Meter Readings */}
              <div className="rounded-2xl border border-[#e8dfd4] bg-white overflow-hidden">
                <button
                  type="button"
                  onClick={() => setMidCycleShowAdvanced(!midCycleShowAdvanced)}
                  className="flex items-center justify-between w-full p-3.5 sm:p-4 text-left hover:bg-[#faf7f2] transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Settings className="size-4 text-[#8b5a2b]" />
                    <div>
                      <p className="font-bold text-sm text-[#2c221e]">Advanced Settings & Meter Readings</p>
                      <p className="text-[11px] text-[#85899a]">
                        Optional individual meter readings per resident. Default: proportional daily occupancy.
                      </p>
                    </div>
                  </div>
                  {midCycleShowAdvanced ? (
                    <ChevronUp className="size-4 text-[#8b5a2b]" />
                  ) : (
                    <ChevronDown className="size-4 text-[#8b5a2b]" />
                  )}
                </button>

                {midCycleShowAdvanced && (
                  <div className="border-t border-[#eee6dc] bg-[#faf7f2] p-3.5 sm:p-4 space-y-3">
                    <label className="flex items-center gap-2.5 cursor-pointer font-semibold text-[#2c221e]">
                      <input
                        type="checkbox"
                        checked={midCycleUseMeterReadings}
                        onChange={(e) => {
                          setMidCycleUseMeterReadings(e.target.checked)
                          setMidCycleCalculatedSplit(null)
                        }}
                        className="size-4 rounded accent-[#8b5a2b]"
                      />
                      <span>Calculate split using Individual Resident Meter Readings</span>
                    </label>

                    {midCycleUseMeterReadings && (
                      <div className="mt-3 space-y-2.5 pl-6 border-l-2 border-[#8b5a2b]/30">
                        <p className="text-[11px] font-bold text-[#555a6c]">
                          Enter opening and closing readings for each resident:
                        </p>
                        {candidateTenants.map((t) => {
                          const opening = midCycleResidentReadings[t.id]?.opening
                          const closing = midCycleResidentReadings[t.id]?.closing
                          const hasBoth = opening !== undefined && closing !== undefined
                          const diff = hasBoth ? closing - opening : null
                          const isInvalid = hasBoth && diff! < 0

                          return (
                            <div key={t.id} className="flex flex-wrap items-center gap-2 text-xs">
                              <span className="w-28 truncate font-medium text-[#2c221e]">{t.name}</span>
                              <input
                                type="number"
                                placeholder="Opening reading"
                                value={opening ?? ''}
                                onChange={(e) => {
                                  const val = e.target.value === '' ? undefined : Number(e.target.value)
                                  setMidCycleResidentReadings((prev) => ({
                                    ...prev,
                                    [t.id]: {
                                      opening: val ?? 0,
                                      closing: prev[t.id]?.closing ?? 0,
                                    },
                                  }))
                                  setMidCycleCalculatedSplit(null)
                                }}
                                className="w-28 rounded-lg border border-[#e4e6ec] bg-white px-2 py-1 text-xs outline-none focus:border-[#8b5a2b]"
                              />
                              <span className="text-[#85899a]">to</span>
                              <input
                                type="number"
                                placeholder="Closing reading"
                                value={closing ?? ''}
                                onChange={(e) => {
                                  const val = e.target.value === '' ? undefined : Number(e.target.value)
                                  setMidCycleResidentReadings((prev) => ({
                                    ...prev,
                                    [t.id]: {
                                      opening: prev[t.id]?.opening ?? 0,
                                      closing: val ?? 0,
                                    },
                                  }))
                                  setMidCycleCalculatedSplit(null)
                                }}
                                className="w-28 rounded-lg border border-[#e4e6ec] bg-white px-2 py-1 text-xs outline-none focus:border-[#8b5a2b]"
                              />
                              {hasBoth && (
                                isInvalid ? (
                                  <span className="text-[10px] font-bold text-[#b91c1c]">
                                    Closing must be ≥ opening
                                  </span>
                                ) : (
                                  <span className="rounded bg-[#eaf5ea] text-[#2e7d32] px-1.5 py-0.5 text-[10px] font-semibold">
                                    {diff} kWh
                                  </span>
                                )
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Step 1: Calculate Button */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                <div>
                  <button
                    type="button"
                    disabled={candidateTenants.length === 0 || isCalculatingMidCycle}
                    onClick={handleCalculateMidCycleSplit}
                    className="flex items-center gap-2 rounded-xl bg-[#faf7f2] border-2 border-[#8b5a2b] text-[#8b5a2b] hover:bg-[#8b5a2b] hover:text-white px-5 py-2.5 font-bold shadow-xs transition-all disabled:opacity-50"
                  >
                    {isCalculatingMidCycle ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Calculator className="size-4" />
                    )}
                    {isCalculatingMidCycle ? 'Calculating Split...' : 'Calculate Bill Split'}
                  </button>
                </div>
                <p className="text-[11px] text-[#85899a]">
                  Preview resident shares before saving to the database.
                </p>
              </div>

              {/* Status & Validation Messages */}
              {midCycleError && (
                <div className="rounded-xl border border-[#ffe0e0] bg-[#fff5f5] p-3 text-xs text-[#b91c1c] flex items-start gap-2">
                  <AlertCircle className="size-4 text-[#b91c1c] shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{midCycleError}</span>
                </div>
              )}

              {midCycleSuccessMessage && (
                <div className="rounded-xl border border-[#d1e7dd] bg-[#f0fdf4] p-3 text-xs text-[#155724] flex items-start gap-2">
                  <CheckCircle2 className="size-4 text-[#155724] shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{midCycleSuccessMessage}</span>
                </div>
              )}

              {/* 5. Clear Live Preview (Requirement 5) */}
              {midCycleCalculatedSplit && (
                <div className="space-y-3 rounded-2xl border border-[#8b5a2b]/40 bg-white p-3.5 sm:p-4 shadow-sm animate-in fade-in duration-200">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#eee6dc] pb-2.5">
                    <div>
                      <span className="font-bold text-sm text-[#2c221e] flex items-center gap-1.5">
                        <CheckCircle2 className="size-4 text-[#2e7d32]" /> Itemized Resident Share Preview
                      </span>
                      <p className="text-[11px] text-[#85899a] mt-0.5">
                        {midCycleCalculatedSplit.summaryText}
                      </p>
                    </div>
                    <span className="self-start sm:self-auto rounded-lg bg-[#eaf5ea] border border-[#a3cfbb] px-2.5 py-1 text-[11px] font-bold text-[#0f5132]">
                      Reconciled 100%
                    </span>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-[#e8dfd4] bg-white">
                    <table className="w-full text-left text-xs min-w-[580px]">
                      <thead className="border-b border-[#eee6dc] bg-[#faf7f2] font-semibold text-[#85899a]">
                        <tr>
                          <th className="px-3 py-2.5">Resident</th>
                          <th className="px-3 py-2.5">Occupancy Period</th>
                          <th className="px-3 py-2.5">Eligible Days</th>
                          <th className="px-3 py-2.5">Method</th>
                          <th className="px-3 py-2.5">Share %</th>
                          <th className="px-3 py-2.5 text-right">Amount Payable</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#eee6dc]">
                        {midCycleCalculatedSplit.residentShares.map((s) => {
                          const isMidCycleJoiner = s.occupiedDays < midCycleCalculatedSplit.totalPeriodDays
                          return (
                            <tr key={s.residentId} className="hover:bg-[#fbf8f3] transition-colors">
                              <td className="px-3 py-2.5 font-bold text-[#2c221e]">
                                <div>{s.residentName}</div>
                                <div className="text-[10px] font-normal text-[#85899a]">Room {s.room}</div>
                              </td>
                              <td className="px-3 py-2.5 text-[#676b7d]">
                                <div className="font-medium text-[#2c221e]">
                                  {new Date(s.joiningDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                                  {s.vacatedDate ? ` – ${new Date(s.vacatedDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ' – Active'}
                                </div>
                                <div className="text-[10px] text-[#85899a]">
                                  {isMidCycleJoiner ? 'Joined Mid-Cycle' : 'Full Month'}
                                </div>
                              </td>
                              <td className="px-3 py-2.5 text-[#676b7d]">
                                <span className="font-bold text-[#2c221e]">{s.occupiedDays}</span> / {s.totalPeriodDays} days
                              </td>
                              <td className="px-3 py-2.5 text-[#676b7d]">
                                <span className="inline-flex items-center rounded-md bg-[#faf3ea] px-1.5 py-0.5 text-[10px] font-semibold text-[#8b5a2b]">
                                  {s.calculationMethod === 'meter_readings' ? 'Meter Reading' : 'Daily Occupancy'}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-[#676b7d] font-semibold">
                                {s.sharePercentage.toFixed(1)}%
                              </td>
                              <td className="px-3 py-2.5 font-bold text-right text-[#2c221e] text-sm">
                                {currency(s.amountDue)}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                      <tfoot className="border-t-2 border-[#d8c2aa] bg-[#faf7f2] font-bold text-[#2c221e]">
                        <tr>
                          <td colSpan={4} className="px-3 py-2 text-right text-[#676b7d]">
                            Total Bill: <span className="text-[#2c221e]">{currency(midCycleCalculatedSplit.totalAmount)}</span>
                            {midCycleCalculatedSplit.roundingDifference !== 0 && (
                              <span className="text-[10px] text-[#85899a] font-normal ml-2">
                                (Rounding adjustment: {currency(midCycleCalculatedSplit.roundingDifference)})
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right text-[#85899a]">
                            Total Allocated:
                          </td>
                          <td className="px-3 py-2 text-right text-base font-extrabold text-[#8b5a2b]">
                            {currency(midCycleCalculatedSplit.totalAllocatedAmount)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {/* Modal Footer Actions (Step 2: Save Bill) */}
              <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-3 pt-3 border-t border-[#eee6dc]">
                <button
                  type="button"
                  disabled={isSavingMidCycleSplit}
                  onClick={() => setShowMidCycleModal(false)}
                  className="w-full sm:w-auto rounded-xl border border-[#e4e6ec] px-4 py-2.5 text-xs font-semibold text-[#676b7d] hover:bg-[#faf7f2] disabled:opacity-50 transition-colors"
                >
                  Cancel
                </button>

                <div className="flex items-center gap-2.5 w-full sm:w-auto">
                  <button
                    type="button"
                    disabled={isSavingMidCycleSplit || !midCycleCalculatedSplit}
                    onClick={() => handleSaveMidCycleSplit()}
                    className="flex-1 sm:flex-initial flex items-center justify-center gap-2 rounded-xl bg-[#8b5a2b] px-6 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#784b20] disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    {isSavingMidCycleSplit && <Loader2 className="size-4 animate-spin" />}
                    <Check className="size-4" />
                    {isSavingMidCycleSplit ? 'Saving Bill Record...' : 'Save & Record Bill'}
                  </button>
                </div>
              </div>
            </div>
          </Modal>
        )
      })()}

      {/* View Mid-Cycle Split Breakdown Modal */}
      {viewingSplitRecord && (
        <Modal
          title={`Electricity Split Breakdown — ${viewingSplitRecord.room_id ? `Room ${viewingSplitRecord.room}` : 'Property General'}`}
          onClose={() => setViewingSplitRecord(null)}
        >
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-2xl border border-[#e8dfd4] bg-[#faf7f2] p-4">
              <div>
                <p className="text-[11px] text-[#85899a]">Billing Period</p>
                <p className="font-bold text-[#3d3934]">
                  {viewingSplitRecord.period_start && viewingSplitRecord.period_end
                    ? `${new Date(viewingSplitRecord.period_start).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${new Date(viewingSplitRecord.period_end).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
                    : new Date(viewingSplitRecord.reading_date).toLocaleDateString('en-IN')}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-[#85899a]">Total Units</p>
                <p className="font-bold text-[#784b20]">{viewingSplitRecord.current_reading} units</p>
              </div>
              <div>
                <p className="text-[11px] text-[#85899a]">Rate / Unit</p>
                <p className="font-bold text-[#3d3934]">{currency(viewingSplitRecord.rate_per_unit)}</p>
              </div>
              <div>
                <p className="text-[11px] text-[#85899a]">Total Bill</p>
                <p className="font-bold text-[#3d3934]">
                  {currency(viewingSplitRecord.current_reading * viewingSplitRecord.rate_per_unit)}
                </p>
              </div>
            </div>

            <div>
              <h4 className="font-bold text-[#3d3934] mb-2">Itemized Resident Shares</h4>
              {viewingSplitRecord.split_breakdown && viewingSplitRecord.split_breakdown.length > 0 ? (
                <div className="overflow-x-auto rounded-xl border border-[#ebe4da] bg-white">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-[#eee6dc] bg-[#faf7f2] font-semibold text-[#85899a]">
                      <tr>
                        <th className="px-3 py-2.5">Resident</th>
                        <th className="px-3 py-2.5">Occupied Days</th>
                        <th className="px-3 py-2.5">Share %</th>
                        <th className="px-3 py-2.5">Explanation</th>
                        <th className="px-3 py-2.5 text-right">Amount Due</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#eee6dc]">
                      {viewingSplitRecord.split_breakdown.map((share: any, idx: number) => (
                        <tr key={idx} className="hover:bg-[#fbf8f3]">
                          <td className="px-3 py-2.5 font-bold text-[#3d3934]">
                            {share.residentName}
                          </td>
                          <td className="px-3 py-2.5 text-[#676b7d]">
                            {share.occupiedDays} / {share.totalPeriodDays} days
                          </td>
                          <td className="px-3 py-2.5 text-[#676b7d]">
                            {share.sharePercentage.toFixed(1)}%
                          </td>
                          <td className="px-3 py-2.5 text-[11px] text-[#85899a]">
                            {share.calculationExplanation || 'Proportional occupancy split'}
                          </td>
                          <td className="px-3 py-2.5 font-bold text-right text-[#3d3934]">
                            {currency(share.amountDue)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t border-[#eee6dc] bg-[#faf7f2] font-bold text-[#3d3934]">
                      <tr>
                        <td colSpan={4} className="px-3 py-2 text-right">
                          Total Bill:
                        </td>
                        <td className="px-3 py-2 text-right text-[#8b5a2b]">
                          {currency(viewingSplitRecord.split_breakdown.reduce((acc: number, s: any) => acc + s.amountDue, 0))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-[#85899a]">No breakdown details stored for this reading.</p>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setViewingSplitRecord(null)}
                className="rounded-xl bg-[#8b5a2b] px-4 py-2 text-xs font-semibold text-white hover:bg-[#784b20] transition-colors"
              >
                Close Breakdown
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Floating 5-Second Undo Toast */}
      {undoItem && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-2xl border border-[#c29668] bg-[#2e2318] px-5 py-3 text-xs text-white shadow-2xl animate-in slide-in-from-bottom-3">
          <AlertTriangle className="size-4 text-[#e8b584] animate-pulse" />
          <div>
            <p className="font-semibold text-white">
              {undoItem.type === 'payment' ? 'Payment entry deleted' : 'Resident record deleted'}
            </p>
            <p className="text-[11px] text-[#dec2a5] truncate max-w-[200px]">{undoItem.name}</p>
          </div>
          <button
            onClick={handleExecuteUndo}
            className="flex items-center gap-1.5 rounded-xl bg-[#8b5a2b] px-3.5 py-1.5 text-xs font-bold text-white shadow hover:bg-[#784b20] transition-colors"
          >
            <Undo2 className="size-3.5" />
            Undo ({undoItem.secondsLeft}s)
          </button>
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------------------------
// TAB COMPONENTS
// ------------------------------------------------------------------------------

function formatRelativeTime(dateStr?: string | null): string {
  if (!dateStr) return 'Recently'
  const time = new Date(dateStr).getTime()
  if (isNaN(time)) return 'Recently'
  const diffSec = Math.floor((Date.now() - time) / 1000)
  if (diffSec < 60) return 'Just now'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `${diffHour}h ago`
  const diffDay = Math.floor(diffHour / 24)
  if (diffDay < 30) return `${diffDay}d ago`
  const diffMonth = Math.floor(diffDay / 30)
  return `${diffMonth}mo ago`
}

function GuidedSetupWizard({
  property,
  rooms = [],
  beds = [],
  tenants = [],
  onAddProperty,
  onAddRoom,
  onAddTenant,
}: {
  property: any
  rooms: any[]
  beds: any[]
  tenants: any[]
  onAddProperty: () => void
  onAddRoom: () => void
  onAddTenant: () => void
}) {
  const isStep1Done = Boolean(property?.name && property.name.trim().length > 0)
  const isStep2Done = Boolean(rooms && rooms.length > 0)
  const isStep3Done = Boolean(tenants && tenants.length > 0)

  const completedCount = (isStep1Done ? 1 : 0) + (isStep2Done ? 1 : 0) + (isStep3Done ? 1 : 0)
  const allCompleted = completedCount === 3
  const progressPercent = Math.round((completedCount / 3) * 100)

  // Default active step to the first incomplete step, or 1 if all complete
  const defaultStep = !isStep1Done ? 1 : !isStep2Done ? 2 : !isStep3Done ? 3 : 1
  const [activeStep, setActiveStep] = useState<number>(defaultStep)
  const [isCollapsed, setIsCollapsed] = useState<boolean>(allCompleted)

  const steps = [
    {
      number: 1,
      title: 'Set up property',
      displayTitle: 'Property Details',
      subtitle: 'Profile, Address & House Rules',
      icon: Building2,
      isDone: isStep1Done,
      isLocked: false,
      lockMessage: '',
      currentStatusText: isStep1Done
        ? `Configured: ${property.name}${property.address ? ` (${property.address})` : ''}`
        : 'No property configured. Add property name, address & rules.',
      actionLabel: isStep1Done ? 'Edit Property' : 'Set Up Property',
      onAction: onAddProperty,
    },
    {
      number: 2,
      title: 'Add rooms and beds',
      displayTitle: 'Rooms & Beds',
      subtitle: 'Floors, Sharing & Bed Inventory',
      icon: BedDouble,
      isDone: isStep2Done,
      isLocked: !isStep1Done,
      lockMessage: 'Complete Property Details first before adding rooms.',
      currentStatusText: isStep2Done
        ? `${rooms.length} room${rooms.length !== 1 ? 's' : ''} · ${beds.length} bed${beds.length !== 1 ? 's' : ''} ready`
        : isStep1Done
        ? '0 rooms created. Configure room types & bed capacity.'
        : 'Prerequisite needed: Set up property first.',
      actionLabel: isStep2Done ? 'Manage Inventory' : '+ Add Rooms & Beds',
      onAction: onAddRoom,
    },
    {
      number: 3,
      title: 'Add tenants',
      displayTitle: 'Add Residents',
      subtitle: 'Resident Onboarding & Bed Allocation',
      icon: Users,
      isDone: isStep3Done,
      isLocked: !isStep2Done,
      lockMessage: 'Add rooms and beds first to enable bed assignment.',
      currentStatusText: isStep3Done
        ? `${tenants.length} resident${tenants.length !== 1 ? 's' : ''} onboarded (${tenants.filter((t: any) => t && t.status !== 'Vacated').length} active)`
        : isStep2Done
        ? '0 residents. Onboard tenants & track monthly rent dues.'
        : 'Prerequisite needed: Add rooms & beds first.',
      actionLabel: isStep3Done ? 'Onboard More' : '+ Add Residents',
      onAction: onAddTenant,
    },
  ]

  return (
    <div className="mb-8 rounded-3xl border border-[#ebe4da] bg-white p-5 sm:p-6 shadow-[0_2px_12px_rgba(70,50,30,0.03)] transition-all">
      {/* Wizard Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#eee6dc] pb-4 mb-5">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1 rounded-full bg-[#faf5ee] border border-[#ede3d7] px-2.5 py-0.5 text-[11px] font-bold text-[#8b5a2b]">
              <Sparkles className="size-3" /> Guided Setup
            </span>
            <h3 className="text-base sm:text-lg font-bold text-[#2c221e]">
              Property Setup Wizard
            </h3>
            {allCompleted && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#f0fbf5] border border-[#a3e4be] px-2.5 py-0.5 text-[11px] font-bold text-[#236b4e]">
                <CheckCircle2 className="size-3.5" /> All Steps Complete
              </span>
            )}
          </div>
          <p className="text-xs text-[#7d756d] mt-1">
            Complete these 3 foundational steps to unlock automated rent tracking & resident management.
          </p>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-auto">
          <div className="flex flex-col items-start sm:items-end">
            <span className="text-xs font-bold text-[#8b5a2b]">
              Step {activeStep} of 3 · {completedCount}/3 completed ({progressPercent}%)
            </span>
            <div className="mt-1.5 h-2 w-36 sm:w-44 overflow-hidden rounded-full bg-[#f0ebe3]">
              <div
                className="h-full bg-gradient-to-r from-[#8b5a2b] via-[#b46b1a] to-[#236b4e] transition-all duration-500 rounded-full"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {allCompleted && (
            <button
              type="button"
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="flex items-center gap-1 rounded-xl border border-[#ebe4da] bg-[#faf7f2] px-3 py-1.5 text-xs font-semibold text-[#6c635a] hover:bg-[#f2ebdf] transition-colors cursor-pointer"
            >
              <span>{isCollapsed ? 'Review Steps' : 'Collapse'}</span>
              {isCollapsed ? <ChevronDown className="size-3.5" /> : <ChevronUp className="size-3.5" />}
            </button>
          )}
        </div>
      </div>

      {!isCollapsed && (
        <div className="space-y-5 animate-in fade-in duration-300">
          {/* Polished Celebratory Success Banner when All Steps Completed */}
          {allCompleted && (
            <div className="rounded-2xl border border-[#cce9db] bg-gradient-to-r from-[#f4faf7] via-[#f0f9f4] to-[#edf7f1] p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#236b4e] text-white shadow-xs">
                  <CheckCircle2 className="size-6" />
                </div>
                <div>
                  <h4 className="text-sm sm:text-base font-bold text-[#1f5940]">
                    🎉 Property Setup Complete!
                  </h4>
                  <p className="text-xs text-[#328d68] mt-0.5">
                    Your PG is fully operational with active rooms, bed inventory, and residents.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="rounded-xl bg-white/90 border border-[#bce2cf] px-3 py-1 text-xs font-semibold text-[#236b4e] shadow-2xs">
                  📍 {property.name}
                </span>
                <span className="rounded-xl bg-white/90 border border-[#bce2cf] px-3 py-1 text-xs font-semibold text-[#236b4e] shadow-2xs">
                  🛏️ {rooms.length} Rooms · {beds.length} Beds
                </span>
                <span className="rounded-xl bg-white/90 border border-[#bce2cf] px-3 py-1 text-xs font-semibold text-[#236b4e] shadow-2xs">
                  👥 {tenants.length} Residents
                </span>
              </div>
            </div>
          )}

          {/* 3 Interactive Step Cards (Responsive Grid) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {steps.map((st) => {
              const isActive = activeStep === st.number
              const isLocked = st.isLocked
              return (
                <div
                  key={st.number}
                  onClick={() => setActiveStep(st.number)}
                  className={`group relative flex flex-col justify-between rounded-2xl border p-4 sm:p-5 transition-all cursor-pointer ${
                    isActive
                      ? 'border-[#8b5a2b] bg-[#faf5ee] shadow-sm ring-1 ring-[#8b5a2b]'
                      : st.isDone
                      ? 'border-[#cce9db] bg-[#f8fcf9] hover:border-[#a3e4be] hover:shadow-2xs'
                      : isLocked
                      ? 'border-[#ebe4da] bg-[#faf8f5]/70 opacity-85 hover:opacity-100'
                      : 'border-[#ebe4da] bg-white hover:border-[#d6c7b7] hover:bg-[#faf7f2] hover:shadow-2xs'
                  }`}
                >
                  <div>
                    {/* Header: Step Number & Status Badge */}
                    <div className="flex items-center justify-between gap-2 mb-3.5">
                      <div className="flex items-center gap-2">
                        <div
                          className={`grid size-7.5 shrink-0 place-items-center rounded-xl font-bold text-xs ${
                            st.isDone
                              ? 'bg-[#236b4e] text-white shadow-2xs'
                              : isActive
                              ? 'bg-[#8b5a2b] text-white shadow-2xs'
                              : isLocked
                              ? 'bg-[#e8e2d8] text-[#8c8278]'
                              : 'bg-[#f0ebe3] text-[#7d756d]'
                          }`}
                        >
                          {st.isDone ? <Check className="size-4 stroke-[3]" /> : st.number}
                        </div>
                        <span className="text-[11px] font-bold uppercase tracking-wider text-[#9c8e80]">
                          Step {st.number}
                        </span>
                      </div>

                      {st.isDone ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#edf7f1] border border-[#a3e4be] px-2.5 py-0.5 text-[10px] font-bold text-[#236b4e]">
                          <CheckCircle2 className="size-3" /> Done ✓
                        </span>
                      ) : isLocked ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#f2ede6] border border-[#ded5c8] px-2 py-0.5 text-[10px] font-semibold text-[#8c8278]">
                          Prerequisite
                        </span>
                      ) : isActive ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#faf3ea] border border-[#e8dfd4] px-2 py-0.5 text-[10px] font-bold text-[#8b5a2b]">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#fbf5ee] border border-[#efe5d9] px-2 py-0.5 text-[10px] font-semibold text-[#b46b1a]">
                          Pending
                        </span>
                      )}
                    </div>

                    {/* Step Icon, Title & Subtitle */}
                    <div className="flex items-start gap-3 mb-3">
                      <div
                        className={`grid size-10 shrink-0 place-items-center rounded-xl border ${
                          st.isDone
                            ? 'border-[#cce9db] bg-[#edf7f1] text-[#236b4e]'
                            : isActive
                            ? 'border-[#ede3d7] bg-[#faf3ea] text-[#8b5a2b]'
                            : 'border-[#ebe4da] bg-white text-[#8c7e72]'
                        }`}
                      >
                        <st.icon className="size-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="text-sm font-bold text-[#2c221e] leading-snug">
                          {st.displayTitle}
                        </h4>
                        <p className="text-[11px] text-[#7d756d] truncate">
                          {st.subtitle}
                        </p>
                      </div>
                    </div>

                    {/* Dynamic Real State or Prerequisite Empty Guidance */}
                    <div className="mt-2.5 rounded-xl border border-[#ebe4da] bg-white/95 p-3 text-xs">
                      {isLocked ? (
                        <div className="flex items-start gap-2 text-[11px] text-[#8c8278] leading-relaxed">
                          <AlertCircle className="size-3.5 shrink-0 mt-0.5 text-[#b46b1a]" />
                          <span>{st.lockMessage}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-[11px] font-medium text-[#2c221e]">
                          <span
                            className={`size-2 rounded-full shrink-0 ${
                              st.isDone ? 'bg-[#236b4e]' : 'bg-[#d97706]'
                            }`}
                          />
                          <span className="truncate">{st.currentStatusText}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Step Action Button */}
                  <div className="mt-4 pt-3.5 border-t border-[#f0ebe3]">
                    {isLocked ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setActiveStep(st.number === 3 ? (isStep1Done ? 2 : 1) : 1)
                          if (st.number === 2) onAddProperty()
                          if (st.number === 3) {
                            if (!isStep1Done) onAddProperty()
                            else onAddRoom()
                          }
                        }}
                        className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-[#ded5c8] bg-[#f7f2ea] px-3.5 py-2 text-xs font-semibold text-[#7c7166] hover:bg-[#eee7dc] transition-colors cursor-pointer"
                      >
                        <span>{st.number === 2 ? 'Complete Step 1 First' : 'Complete Step 2 First'}</span>
                        <ArrowRight className="size-3.5" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          st.onAction()
                        }}
                        className={`w-full flex items-center justify-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition-all cursor-pointer ${
                          st.isDone
                            ? 'border border-[#cce9db] bg-white text-[#236b4e] hover:bg-[#f4faf7] shadow-2xs'
                            : 'bg-[#8b5a2b] text-white hover:bg-[#784b20] shadow-xs active:scale-[0.99]'
                        }`}
                      >
                        <st.icon className="size-3.5" />
                        <span>{st.actionLabel}</span>
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Stepper Navigation Controls (Previous Step / Next Step) */}
          <div className="mt-5 flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-3 border-t border-[#ede3d7] pt-4">
            <button
              type="button"
              disabled={activeStep === 1}
              onClick={() => setActiveStep((prev) => Math.max(1, prev - 1))}
              className="flex items-center justify-center sm:justify-start gap-1.5 rounded-xl border border-[#ebe4da] bg-white px-3.5 py-2 text-xs font-semibold text-[#5c544c] hover:bg-[#faf7f2] hover:text-[#2c221e] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ArrowLeft className="size-3.5" />
              <span>Previous Step</span>
            </button>

            <div className="flex items-center justify-center sm:justify-end gap-2">
              {activeStep < 3 ? (
                <button
                  type="button"
                  onClick={() => setActiveStep((prev) => Math.min(3, prev + 1))}
                  className="flex items-center gap-1.5 rounded-xl border border-[#8b5a2b] bg-[#faf3ea] px-3.5 py-2 text-xs font-semibold text-[#8b5a2b] hover:bg-[#f4ebe1] transition-colors"
                >
                  <span>Next Step</span>
                  <ArrowRight className="size-3.5" />
                </button>
              ) : allCompleted ? (
                <span className="flex items-center gap-1.5 text-xs font-bold text-[#236b4e] bg-[#f0fbf5] border border-[#a3e4be] px-3.5 py-2 rounded-xl">
                  <CheckCircle2 className="size-3.5" />
                  <span>All Steps Completed</span>
                </span>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const OverviewTab = memo(function OverviewTab({
  property,
  properties = [],
  rooms = [],
  beds = [],
  tenants = [],
  payments = [],
  expenses = [],
  electricity = [],
  complaints = [],
  collectedMonth = 0,
  rentPending = 0,
  expensesMonth = 0,
  electricityPending = 0,
  activeTenantsCount = 0,
  availableBedsCount = 0,
  occupiedBedsCount = 0,
  daysRemaining,
  hoursRemaining,
  isEndingSoon,
  isTrialExpired,
  trialStart,
  trialEnd,
  userName = '',
  onAddProperty,
  onAddRoom,
  onAddTenant,
  onRecordPayment,
  onViewPlans,
  onNavigate,
  entitlement,
}: any) {
  // Time-of-day personalized greeting
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening'
  const ownerFirstName = userName ? userName.split(' ')[0] : 'Owner'

  // Metric 1: Properties count
  const propertiesCount = properties && properties.length > 0 ? properties.length : (property.name ? 1 : 0)

  // Metric 2: Rooms count
  const roomsCount = rooms ? rooms.length : 0

  // Metric 3: Active Residents
  const residentsCount = activeTenantsCount || (tenants ? tenants.filter((t: any) => t.status !== 'Vacated').length : 0)

  // Metric 4: Real Occupancy percentage calculation
  const totalCapacity = beds && beds.length > 0
    ? beds.length
    : rooms && rooms.length > 0
    ? rooms.reduce((acc: number, r: any) => acc + getRoomMaxCapacity(r.room_type), 0)
    : 0

  const occupancyPercent = totalCapacity > 0
    ? Math.min(100, Math.round((residentsCount / totalCapacity) * 100))
    : (residentsCount > 0 ? 100 : 0)

  // Chronological real activity stream
  const recentActivities = useMemo(() => {
    const list: Array<{
      id: string
      type: 'payment' | 'tenant' | 'electricity' | 'expense'
      title: string
      subtitle: string
      time: string
      timestamp: number
      iconBg: string
      iconColor: string
    }> = []

    // 1. Real payments
    ;(payments || []).forEach((p: PaymentRecord) => {
      if (!p) return
      list.push({
        id: `pay-${p.id}`,
        type: 'payment',
        title: `Rent received from ${p.tenant_name || 'Resident'}`,
        subtitle: `₹${Number(p.amount || 0).toLocaleString('en-IN')} • ${p.room_number ? `Room ${p.room_number}` : 'Rent Payment'}`,
        time: formatRelativeTime(p.paid_at),
        timestamp: p.paid_at ? new Date(p.paid_at).getTime() : 0,
        iconBg: 'bg-[#edf7f1]',
        iconColor: 'text-[#2f7e53]',
      })
    })

    // 2. Real onboarded tenants
    ;(tenants || []).forEach((t: Tenant) => {
      if (!t) return
      list.push({
        id: `ten-${t.id}`,
        type: 'tenant',
        title: 'New tenant added',
        subtitle: `${t.name} • ${t.room && t.room !== 'Unassigned' ? `Room ${t.room}` : 'Resident Record'}`,
        time: formatRelativeTime(t.joiningDate),
        timestamp: t.joiningDate ? new Date(t.joiningDate).getTime() : 0,
        iconBg: 'bg-[#fdf0ee]',
        iconColor: 'text-[#c05642]',
      })
    })

    // 3. Real electricity bills
    ;(electricity || []).forEach((el: ElectricityRecord) => {
      if (!el) return
      const units = Math.max(0, Number(el.current_reading || 0) - Number(el.previous_reading || 0))
      const bill = units * Number(el.rate_per_unit || 0)
      list.push({
        id: `elec-${el.id}`,
        type: 'electricity',
        title: 'Electricity bill updated',
        subtitle: `₹${bill > 0 ? bill.toLocaleString('en-IN') : Number(el.rate_per_unit || 0).toLocaleString('en-IN')} • ${el.room || 'Main Meter'}`,
        time: formatRelativeTime(el.reading_date),
        timestamp: el.reading_date ? new Date(el.reading_date).getTime() : 0,
        iconBg: 'bg-[#fef7ea]',
        iconColor: 'text-[#b87a1e]',
      })
    })

    // 4. Real expenses
    ;(expenses || []).forEach((ex: Expense) => {
      if (!ex) return
      list.push({
        id: `exp-${ex.id}`,
        type: 'expense',
        title: `Expense logged: ${ex.title}`,
        subtitle: `₹${Number(ex.amount || 0).toLocaleString('en-IN')} • ${ex.category || 'General'}`,
        time: formatRelativeTime(ex.expense_date),
        timestamp: ex.expense_date ? new Date(ex.expense_date).getTime() : 0,
        iconBg: 'bg-[#f6efe7]',
        iconColor: 'text-[#8b5a2b]',
      })
    })

    list.sort((a: any, b: any) => b.timestamp - a.timestamp)
    return list.slice(0, 5)
  }, [payments, tenants, electricity, expenses])

  // Real upcoming & overdue dues calculated with month-by-month rent status
  const upcomingDues = useMemo(() => {
    const activeTenants = (tenants || []).filter(
      (t: Tenant) => t && t.status !== 'Vacated'
    )

    return activeTenants
      .map((t: Tenant) => {
        const rentStatus = calculateTenantRentStatus({
          tenant: t,
          payments: payments || [],
          locale: 'en',
        })
        const isOverdue = rentStatus.status === 'overdue'
        const isDue = isOverdue || rentStatus.status === 'due_today' || rentStatus.status === 'due_soon'
        return {
          id: t.id,
          name: t.name,
          room: t.room && t.room !== 'Unassigned' ? t.room : 'Unit',
          amount: Number(t.rent || 0),
          status: t.status,
          isOverdue,
          isDue,
          dueLabel: isOverdue ? (rentStatus.labelEn || 'Overdue') : (rentStatus.labelEn || 'Due Soon'),
        }
      })
      .filter((item: any) => item.isDue)
      .sort((a: any, b: any) => (a.isOverdue === b.isOverdue ? 0 : a.isOverdue ? -1 : 1))
      .slice(0, 5)
  }, [tenants, payments])

  return (
    <>
      {/* Top Greeting Area (Matches Reference Image) */}
      <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-2xl sm:text-[28px] font-bold tracking-tight text-[#2c221e]">
            {greeting}, {ownerFirstName}
          </h2>
          <p className="mt-1 text-xs sm:text-sm text-[#7d756d]">
            Here&apos;s what&apos;s happening with your properties today.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          {!property.name ? (
            <button
              onClick={onAddProperty}
              className="flex items-center gap-2 rounded-xl bg-[#8b5a2b] px-4 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-[#784b20] transition-colors"
            >
              <Plus className="size-4" /> Set Up Property
            </button>
          ) : (
            <button
              onClick={onRecordPayment}
              className="flex items-center gap-2 rounded-xl bg-[#8b5a2b] px-4 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-[#784b20] transition-colors"
            >
              <Plus className="size-4" /> Record Payment
            </button>
          )}
        </div>
      </div>

      {/* 4 Dashboard Stat Cards: Properties, Rooms/Units, Residents, Occupancy (Responsive on desktop, tablet, mobile) */}
      <div className="mb-8 grid gap-3.5 sm:gap-4 lg:gap-5 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Properties"
          value={propertiesCount}
          note={
            propertiesCount > 1
              ? `${propertiesCount} active locations`
              : propertiesCount === 1
              ? '1 active location'
              : '0 active locations'
          }
          Icon={Home}
          i={0}
        />
        <MetricCard
          label={getPropertyType(property) === 'pg_hostel' ? 'Rooms & Beds' : 'Rooms / Units'}
          value={roomsCount}
          note={`${availableBedsCount} available · ${occupiedBedsCount} occupied`}
          Icon={DoorOpen}
          i={1}
        />
        <MetricCard
          label="Residents"
          value={residentsCount}
          note={`${tenants.length} total registered`}
          Icon={Users}
          i={2}
        />
        <MetricCard
          label="Occupancy"
          value={`${occupancyPercent}%`}
          note={`${occupiedBedsCount || residentsCount} of ${totalCapacity || '0'} slots occupied`}
          Icon={PieChart}
          i={3}
        />
      </div>

      {/* Main 2-Column Section: Recent Activity & Upcoming Dues */}
      <div className="mb-8 grid gap-6 xl:grid-cols-12 items-start">
        {/* Left Column: Recent Activity */}
        <section className="xl:col-span-7 rounded-2xl sm:rounded-3xl border border-[#ebe4da] bg-white p-5 sm:p-6 shadow-[0_2px_12px_rgba(70,50,30,0.03)]">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-[#2c221e]">Recent Activity</h3>
              <p className="mt-0.5 text-xs text-[#7d756d]">Live payments, resident onboardings, and utility updates</p>
            </div>
          </div>

          {recentActivities.length > 0 ? (
            <div className="divide-y divide-[#f5efe8]">
              {recentActivities.map((act: any) => (
                <div key={act.id} className="flex items-center justify-between py-3.5 first:pt-0 last:pb-0 gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`grid size-9 place-items-center rounded-full shrink-0 ${act.iconBg} ${act.iconColor}`}>
                      {act.type === 'payment' && <Receipt className="size-4" />}
                      {act.type === 'tenant' && <Users className="size-4" />}
                      {act.type === 'electricity' && <Zap className="size-4" />}
                      {act.type === 'expense' && <Wallet className="size-4" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-semibold text-[#2c221e] truncate">{act.title}</p>
                      <p className="text-[11px] text-[#7d756d] truncate">{act.subtitle}</p>
                    </div>
                  </div>
                  <span className="text-[11px] font-medium text-[#a09488] shrink-0">
                    {act.time}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="grid size-12 place-items-center rounded-full bg-[#faf3ea] text-[#8b5a2b] mb-3">
                <Clock className="size-5" />
              </div>
              <p className="text-sm font-semibold text-[#2c221e]">No recent activity recorded yet</p>
              <p className="mt-1 text-xs text-[#8c7e72] max-w-xs">
                When you record rent payments, onboard residents, or update utilities, they will appear here in real time.
              </p>
            </div>
          )}
        </section>

        {/* Right Column: Upcoming Dues */}
        <section className="xl:col-span-5 rounded-2xl sm:rounded-3xl border border-[#ebe4da] bg-white p-5 sm:p-6 shadow-[0_2px_12px_rgba(70,50,30,0.03)]">
          <div className="mb-5 flex items-center justify-between">
            <h3 className="text-base font-bold text-[#2c221e]">Upcoming Dues</h3>
            <button
              onClick={() => onNavigate && onNavigate('Rent & Payments')}
              className="text-xs font-semibold text-[#8b5a2b] hover:text-[#784b20] flex items-center gap-1 transition-colors"
            >
              View all →
            </button>
          </div>

          {upcomingDues.length > 0 ? (
            <div className="divide-y divide-[#f5efe8]">
              {upcomingDues.map((item: any) => (
                <div key={item.id} className="flex items-center justify-between py-3.5 first:pt-0 last:pb-0 gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="grid size-9 place-items-center rounded-full bg-[#faf3ea] text-[#8b5a2b] font-bold text-xs shrink-0 ring-1 ring-[#ede3d7]">
                      {item.name ? item.name.charAt(0).toUpperCase() : 'R'}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-semibold text-[#2c221e] truncate">{item.name}</p>
                      <p className="text-[11px] text-[#7d756d] truncate">
                        Room {item.room} • ₹{item.amount.toLocaleString('en-IN')}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${
                      item.isOverdue
                        ? 'border-[#f6d8d2] bg-[#fdf2f0] text-[#b84e34]'
                        : 'border-[#efe5d9] bg-[#fbf5ee] text-[#8b5a2b]'
                    }`}
                  >
                    {item.dueLabel}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="grid size-12 place-items-center rounded-full bg-[#edf7f1] text-[#2f7e53] mb-3">
                <CheckCircle2 className="size-5" />
              </div>
              <p className="text-sm font-semibold text-[#2c221e]">All rent dues are cleared! 🎉</p>
              <p className="mt-1 text-xs text-[#8c7e72] max-w-xs">
                No pending or overdue payments recorded for your active residents.
              </p>
            </div>
          )}
        </section>
      </div>

      {/* 3-Step Guided Setup Wizard for Property Owners */}
      <GuidedSetupWizard
        property={property}
        rooms={rooms}
        beds={beds}
        tenants={tenants}
        onAddProperty={onAddProperty}
        onAddRoom={onAddRoom}
        onAddTenant={onAddTenant}
      />


      {/* Financial Collection Ledger & Quick Operations */}
      <div className="grid gap-5 xl:grid-cols-[1.35fr_1fr]">
        <section className="rounded-2xl sm:rounded-3xl border border-[#ebe4da] bg-white p-6 shadow-[0_2px_12px_rgba(70,50,30,0.03)]">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-[#2c221e]">Rent Collection Ledger</h3>
              <p className="mt-1 text-xs text-[#7d756d]">Active month collection progress</p>
            </div>
            <button
              onClick={onRecordPayment}
              className="rounded-xl border border-[#ebe4da] px-3.5 py-1.5 text-xs font-medium text-[#6a635b] hover:bg-[#faf7f2] transition-colors"
            >
              Record Payment
            </button>
          </div>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6 rounded-2xl bg-[#fbf8f4] p-5 border border-[#eee4da]">
            <div className="grid size-20 shrink-0 place-items-center rounded-full border-[7px] border-[#ede3d7] border-t-[#8b5a2b] text-lg font-bold text-[#2c221e]">
              {residentsCount
                ? Math.round(
                    (tenants.filter((t: Tenant) => t.status === 'Paid').length / residentsCount) * 100
                  )
                : 0}
              %
            </div>
            <div>
              <p className="text-sm font-semibold text-[#2c221e]">
                {tenants.filter((t: Tenant) => t.status === 'Paid').length} of {residentsCount} active residents settled
              </p>
              <p className="mt-1 text-xs leading-5 text-[#7d756d]">
                Pending Collection: <strong className="text-[#b95c3c]">{currency(rentPending)}</strong>
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl sm:rounded-3xl border border-[#ebe4da] bg-white p-6 shadow-[0_2px_12px_rgba(70,50,30,0.03)]">
          <div className="mb-5">
            <h3 className="text-sm font-semibold text-[#2c221e]">Quick Operations</h3>
            <p className="mt-1 text-xs text-[#7d756d]">Direct management shortcuts</p>
          </div>
          <div className="grid gap-2.5">
            {[
              ['Configure Property', Building2, onAddProperty],
              [getPropertyType(property) === 'pg_hostel' ? 'Add Room & Beds' : 'Add Unit / Room', DoorOpen, onAddRoom],
              ['Onboard Resident', Users, onAddTenant],
              ['Record Payment', Wallet, onRecordPayment],
            ].map(([label, Icon, action]: any) => (
              <button
                key={label}
                onClick={action}
                className="flex items-center gap-3 rounded-xl border border-[#ebe4da] px-3.5 py-3 text-left text-xs font-medium text-[#5c544c] transition-colors hover:bg-[#faf7f2]"
              >
                <span className="grid size-8 place-items-center rounded-lg bg-[#faf3ea] text-[#8b5a2b]">
                  <Icon className="size-4" />
                </span>
                {label}
                <span className="ml-auto text-[#a09488]">→</span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </>
  )
})

const PropertyTab = memo(function PropertyTab({
  property,
  properties = [],
  selectedPropertyId,
  onSelectProperty,
  onAddProperty,
  onEdit,
  onDelete,
  roomsCount,
  tenantsCount,
  bedsCount,
  entitlement,
  subscriptionPlan,
  subscriptionStatus,
  onViewPlans,
}: any) {
  const planLabel =
    subscriptionStatus === 'active'
      ? subscriptionPlan === 'starter'
        ? 'Starter Plan'
        : subscriptionPlan === 'business'
        ? 'Business Plan'
        : subscriptionPlan === 'enterprise'
        ? 'Enterprise Plan'
        : 'Growth Pro'
      : 'Free Trial'

  return (
    <div className="flex flex-col gap-6">
      {/* Top Header & Actions */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-[#3d3934]">Rental Properties</h2>
          <p className="text-xs text-[#85899a] mt-1">
            Manage your properties, branches, and accommodation centers with isolated operational records.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={onAddProperty}
            className="flex items-center justify-center gap-2 rounded-xl bg-[#8b5a2b] px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-[#784b20] transition-colors"
          >
            <Plus className="size-4" /> Add New Property
          </button>
        </div>
      </div>

      {/* Multiple Properties Switcher Cards (when owner has >1 properties) */}
      {properties.length > 1 && (
        <div>
          <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-[#999daa]">
            Your Properties ({properties.length})
          </h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {properties.map((p: any) => {
              const isSelected = p.id === (selectedPropertyId || property.id)
              return (
                <div
                  key={p.id}
                  className={`rounded-2xl border p-5 transition-all shadow-xs ${
                    isSelected
                      ? 'border-[#8b5a2b] bg-[#fdfbf7] ring-2 ring-[#8b5a2b]/20'
                      : 'border-[#e8dfd4] bg-white hover:border-[#c5b19b]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className={`grid size-10 place-items-center rounded-xl ${isSelected ? 'bg-[#8b5a2b] text-white' : 'bg-[#faf3ea] text-[#8b5a2b]'}`}>
                        <Building2 className="size-5" />
                      </div>
                      <div>
                        <h4 className="font-bold text-sm text-[#3d3934]">{p.name}</h4>
                        <p className="text-[11px] text-[#85899a] truncate max-w-[180px]">{p.city || p.address}</p>
                      </div>
                    </div>
                    {isSelected && (
                      <span className="rounded-full bg-[#eef7f2] px-2 py-0.5 text-[10px] font-bold text-[#2e8560]">
                        Active
                      </span>
                    )}
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t border-[#f0ece5] pt-3 text-xs">
                    {isSelected ? (
                      <span className="text-[11px] font-semibold text-[#8b5a2b]">Selected Workspace</span>
                    ) : (
                      <button
                        onClick={() => onSelectProperty && onSelectProperty(p.id)}
                        className="rounded-lg bg-[#faf3ea] px-3 py-1.5 text-xs font-semibold text-[#8b5a2b] hover:bg-[#f2e6d6] transition-colors"
                      >
                        Switch Property
                      </button>
                    )}
                    <button
                      onClick={() => onEdit && onEdit(p)}
                      className="text-xs font-semibold text-[#85899a] hover:text-[#3d3934]"
                    >
                      Edit
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Selected Property Details Panel */}
      <div className="rounded-2xl border border-[#e9ebf0] bg-white p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center border-b border-[#f0f1f4] pb-6">
          <div className="flex items-center gap-4">
            <div className="grid size-14 place-items-center rounded-2xl bg-[#faf3ea] text-[#8b5a2b]">
              <Building2 className="size-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-bold">{property.name || 'No Property Configured'}</h3>
                {property.name && (
                  <span className="rounded-md bg-[#faf3ea] px-2 py-0.5 text-[10px] font-bold text-[#8b5a2b]">
                    Current Workspace
                  </span>
                )}
              </div>
              <p className="text-xs text-[#85899a]">
                {property.address ? `${property.address}${property.city ? `, ${property.city}` : ''}` : 'Add your rental property details.'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => onEdit(property)}
              className="rounded-xl bg-[#8b5a2b] px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-[#784b20] transition-colors"
            >
              {property.name ? 'Edit Details' : 'Add Property'}
            </button>
            {property.name && (
              <button
                onClick={onDelete}
                className="rounded-xl border border-[#ffe0e0] px-3 py-2.5 text-xs font-semibold text-[#b95c3c] hover:bg-[#fff5f5]"
              >
                Delete Property
              </button>
            )}
          </div>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-4">
          <div className="rounded-xl border border-[#eee6dc] bg-[#faf7f2] p-4">
            <p className="text-xs text-[#999daa]">Configured Rooms</p>
            <p className="mt-1 text-2xl font-bold">{roomsCount}</p>
          </div>
          <div className="rounded-xl border border-[#eee6dc] bg-[#faf7f2] p-4">
            <p className="text-xs text-[#999daa]">Total Beds</p>
            <p className="mt-1 text-2xl font-bold">{bedsCount}</p>
          </div>
          <div className="rounded-xl border border-[#eee6dc] bg-[#faf7f2] p-4">
            <p className="text-xs text-[#999daa]">Active Residents</p>
            <p className="mt-1 text-2xl font-bold">{tenantsCount}</p>
          </div>
          <div className="rounded-xl border border-[#eee6dc] bg-[#faf7f2] p-4">
            <p className="text-xs text-[#999daa]">Contact Phone</p>
            <p className="mt-1 text-sm font-semibold">{property.contact || 'Not provided'}</p>
          </div>
        </div>
      </div>
    </div>
  )
})

function RoomResidentsModal({
  room,
  beds,
  tenants,
  onClose,
  onViewRentSchedule,
  onAddBed,
  onOnboardTenant,
}: {
  room: Room
  beds: Bed[]
  tenants: Tenant[]
  onClose: () => void
  onViewRentSchedule?: (t: Tenant) => void
  onAddBed?: () => void
  onOnboardTenant?: (bedId?: string) => void
}) {
  const maxCap = getRoomMaxCapacity(room.room_type, beds.length)
  const isFull = tenants.length >= maxCap

  return (
    <Modal title={`Room ${room.room_number} Residents & Bed Allocation`} onClose={onClose}>
      <div className="space-y-5">
        {/* Room Summary Header */}
        <div className="rounded-2xl border border-[#e8dfd4] bg-[#faf7f2] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-[#8b5a2b] px-2 py-0.5 text-[10px] font-bold text-white uppercase">
                  Floor {room.floor}
                </span>
                <span className="rounded-md bg-white border border-[#d8c2aa] px-2 py-0.5 text-[10px] font-semibold text-[#8b5a2b]">
                  {room.room_type}
                </span>
              </div>
              <h3 className="mt-1.5 text-base font-bold text-[#2c221e]">Room {room.room_number}</h3>
            </div>
            <div className="text-right">
              <p className="text-[11px] text-[#85899a]">Base Monthly Rent</p>
              <p className="text-sm font-bold text-[#8b5a2b]">{currency(room.base_rent)}</p>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-[#ede4d8] pt-2.5 text-xs">
            <span className="text-[#6c635a]">Occupancy Status:</span>
            <span
              className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                isFull ? 'bg-[#ffebe8] text-[#b95c3c]' : 'bg-[#e7f7f0] text-[#328d68]'
              }`}
            >
              {tenants.length} / {maxCap} Beds Occupied ({isFull ? 'FULL' : 'Available'})
            </span>
          </div>
        </div>

        {/* Assigned Residents List */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-bold text-[#2c221e] uppercase tracking-wider flex items-center gap-1.5">
              <Users className="size-3.5 text-[#8b5a2b]" /> Assigned Residents ({tenants.length})
            </h4>
            {!isFull && onOnboardTenant && (
              <button
                type="button"
                onClick={() => onOnboardTenant()}
                className="text-xs font-bold text-[#8b5a2b] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Plus className="size-3" /> Onboard Resident
              </button>
            )}
          </div>

          {tenants.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#d8c2aa] bg-white p-4 text-center">
              <p className="text-xs text-[#85899a]">No residents are currently assigned to Room {room.room_number}.</p>
              {!isFull && onOnboardTenant && (
                <button
                  type="button"
                  onClick={() => onOnboardTenant()}
                  className="mt-2 inline-flex items-center gap-1 rounded-lg bg-[#8b5a2b] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#784b20] transition-colors"
                >
                  <Plus className="size-3.5" /> Assign First Resident
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2.5">
              {tenants.map((t) => (
                <div
                  key={t.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-[#ebe4da] bg-white p-3.5 shadow-2xs hover:border-[#d8cbbe] transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex size-9 items-center justify-center rounded-xl bg-[#faf3ea] text-[#8b5a2b] font-bold text-xs shrink-0">
                      {t.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[#2c221e]">{t.name}</span>
                        {t.bed_number && (
                          <span className="rounded bg-[#f0f1f4] px-1.5 py-0.2 text-[10px] font-semibold text-[#555a6c]">
                            Bed {t.bed_number}
                          </span>
                        )}
                        <span
                          className={`rounded px-1.5 py-0.2 text-[9px] font-bold uppercase ${
                            t.status === 'Paid'
                              ? 'bg-[#e7f7f0] text-[#328d68]'
                              : t.status === 'Overdue'
                              ? 'bg-[#ffebe8] text-[#b95c3c]'
                              : 'bg-[#fff4e5] text-[#b46b1a]'
                          }`}
                        >
                          {t.status}
                        </span>
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#85899a]">
                        <span>📞 {t.phone || 'No phone'}</span>
                        <span>₹{t.rent || room.base_rent}/mo</span>
                        {t.rent_due_day && <span>Due Day: {t.rent_due_day}st</span>}
                      </div>
                    </div>
                  </div>
                  {onViewRentSchedule && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose()
                        onViewRentSchedule(t)
                      }}
                      className="self-start sm:self-auto rounded-lg border border-[#d8c2aa] bg-[#faf7f2] px-2.5 py-1 text-[11px] font-semibold text-[#8b5a2b] hover:bg-[#8b5a2b] hover:text-white transition-colors cursor-pointer"
                    >
                      Rent Schedule
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bed Configuration Inventory */}
        <div className="border-t border-[#f2ede4] pt-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-bold text-[#2c221e] uppercase tracking-wider flex items-center gap-1.5">
              <BedDouble className="size-3.5 text-[#8b5a2b]" /> Bed Inventory ({beds.length})
            </h4>
            {onAddBed && (
              <button
                type="button"
                onClick={() => {
                  onClose()
                  onAddBed()
                }}
                className="text-xs font-bold text-[#8b5a2b] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Plus className="size-3" /> Add Bed
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {beds.map((b) => {
              const occupant = tenants.find((t) => t.bed_id === b.id || t.bed_number === b.bed_number)
              const isOccupied = b.status === 'occupied' || Boolean(occupant)

              return (
                <div
                  key={b.id}
                  className={`flex items-center justify-between rounded-xl border p-2.5 text-xs ${
                    isOccupied
                      ? 'border-[#e8dfd4] bg-[#faf7f2]'
                      : 'border-[#d0e5d9] bg-[#f4faf6]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[#2c221e]">{b.bed_number}</span>
                    <span
                      className={`rounded px-1.5 py-0.2 text-[9px] font-bold uppercase ${
                        isOccupied ? 'bg-[#fff4e5] text-[#b46b1a]' : 'bg-[#e7f7f0] text-[#328d68]'
                      }`}
                    >
                      {isOccupied ? 'Occupied' : 'Available'}
                    </span>
                  </div>
                  {isOccupied ? (
                    <span className="text-[11px] font-medium text-[#6c635a] truncate max-w-[120px]">
                      {occupant?.name || 'Resident'}
                    </span>
                  ) : onOnboardTenant ? (
                    <button
                      type="button"
                      onClick={() => onOnboardTenant(b.id)}
                      className="text-[10px] font-bold text-[#236b4e] hover:underline cursor-pointer"
                    >
                      + Assign
                    </button>
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="border-t border-[#f2ede4] pt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-[#d6d9e0] bg-white px-4 py-2 text-xs font-semibold text-[#555a6c] hover:bg-[#faf7f2] cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  )
}

const RoomsTab = memo(function RoomsTab({
  rooms,
  beds,
  tenants,
  onAddRoom,
  onEditRoom,
  onDeleteRoom,
  onAddBed,
  onEditBed,
  onToggleBedStatus,
  onDeleteBed,
  searchQuery,
  onClearSearch,
  onViewRentSchedule,
  onOnboardTenantForRoom,
}: any) {
  const [viewingRoom, setViewingRoom] = useState<Room | null>(null)

  return (
    <div>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-[#2c221e]">Rooms & Beds</h2>
          <p className="text-xs text-[#85899a]">Room occupancy, capacity rules, and bed allocations.</p>
        </div>
        <button
          onClick={onAddRoom}
          className="flex items-center gap-2 rounded-xl bg-[#8b5a2b] px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-[#784b20] transition-colors self-start sm:self-auto"
        >
          <Plus className="size-4" /> Add Room
        </button>
      </div>

      {rooms.length === 0 ? (
        searchQuery ? (
          <EmptySearchState query={searchQuery} onClear={onClearSearch} />
        ) : (
          <EmptyState
            title="No rooms configured yet"
            description="Add your first room with bed capacity to begin assigning residents."
            action={onAddRoom}
            actionLabel="Add Room"
          />
        )
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rooms.map((r: Room) => {
            const roomBeds = beds.filter((b: Bed) => b.room_id === r.id)
            const maxCap = getRoomMaxCapacity(r.room_type, roomBeds.length)
            const assignedTenants = tenants.filter((t: Tenant) => t.room_id === r.id && t.status !== 'Vacated')
            const isFull = assignedTenants.length >= maxCap

            return (
              <div key={r.id} className="rounded-2xl border border-[#ebe4da] bg-white p-5 shadow-sm flex flex-col justify-between hover:border-[#d8cbbe] transition-all">
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="rounded-md bg-[#faf3ea] px-2 py-0.5 text-[10px] font-bold text-[#8b5a2b]">
                        Floor {r.floor}
                      </span>
                      <h3 className="mt-2 text-lg font-bold text-[#2c221e]">Room {r.room_number}</h3>
                      <p className="text-xs text-[#85899a]">{r.room_type}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => onEditRoom(r)}
                        className="rounded-lg p-1.5 text-[#a0a3af] hover:bg-[#faf7f2] hover:text-[#8b5a2b] transition-colors"
                        title="Edit room"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        onClick={() => onDeleteRoom(r.id, r.room_number)}
                        className="rounded-lg p-1.5 text-[#a0a3af] hover:bg-[#fff0f0] hover:text-[#b95c3c] transition-colors"
                        title="Delete room"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between text-xs">
                    <div>
                      <p className="text-[#999daa]">Monthly Base</p>
                      <p className="font-bold text-[#44485a]">{currency(r.base_rent)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[#999daa]">Capacity</p>
                      <span
                        className={`inline-block rounded-md px-2 py-0.5 text-[10px] font-bold ${
                          isFull ? 'bg-[#ffebe8] text-[#b95c3c]' : 'bg-[#e7f7f0] text-[#328d68]'
                        }`}
                      >
                        {assignedTenants.length} / {maxCap} {isFull ? 'FULL' : 'Occupied'}
                      </span>
                    </div>
                  </div>

                  {/* Room-wise Resident Names List */}
                  <div className="mt-4 border-t border-[#f2ede4] pt-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-[11px] font-bold text-[#676b7d] flex items-center gap-1.5">
                        <Users className="size-3 text-[#8b5a2b]" /> Occupants ({assignedTenants.length})
                      </p>
                      {assignedTenants.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setViewingRoom(r)}
                          className="text-[10px] text-[#8b5a2b] font-bold hover:underline cursor-pointer"
                        >
                          View Details
                        </button>
                      )}
                    </div>
                    {assignedTenants.length === 0 ? (
                      <p className="text-[11px] italic text-[#a0a3af]">No residents in this room</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {assignedTenants.map((t: Tenant) => (
                          <span
                            key={t.id}
                            className="inline-flex items-center gap-1 rounded-lg border border-[#e8dfd4] bg-[#faf7f2] px-2 py-1 text-[11px] font-semibold text-[#2c221e]"
                            title={`${t.name} (${t.bed_number || 'Bed'}) - Status: ${t.status}`}
                          >
                            <span className="size-1.5 rounded-full bg-[#8b5a2b]" />
                            {t.name}
                            {t.bed_number && (
                              <span className="text-[10px] font-normal text-[#85899a]">({t.bed_number})</span>
                            )}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Bed Inventory Inside Room */}
                  <div className="mt-4 border-t border-[#f0f1f4] pt-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[11px] font-semibold text-[#676b7d]">Beds ({roomBeds.length})</p>
                      <button
                        onClick={() => onAddBed(r.id, r.room_number)}
                        className="flex items-center gap-1 text-[11px] font-semibold text-[#8b5a2b] hover:underline"
                      >
                        <Plus className="size-3" /> Add Bed
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {roomBeds.map((bed: Bed) => (
                        <div
                          key={bed.id}
                          className="flex items-center gap-1.5 rounded-lg border border-[#e8dfd4] bg-[#faf7f2] px-2 py-1 text-[10px]"
                        >
                          <span className="font-semibold text-[#3d3934]">{bed.bed_number}</span>
                          <button
                            onClick={() => onEditBed?.(bed)}
                            title="Edit bed details"
                            className="rounded p-0.5 text-[#a0a3af] hover:text-[#8b5a2b] transition-colors"
                          >
                            <Pencil className="size-2.5" />
                          </button>
                          <button
                            onClick={() => onToggleBedStatus(bed.id, bed.status)}
                            title="Click to toggle status"
                            className={`rounded px-1.5 py-0.2 font-bold uppercase text-[9px] ${
                              bed.status === 'available'
                                ? 'bg-[#e7f7f0] text-[#328d68]'
                                : bed.status === 'occupied'
                                ? 'bg-[#fff4e5] text-[#b46b1a]'
                                : 'bg-[#f0f1f4] text-[#74798a]'
                            }`}
                          >
                            {bed.status}
                          </button>
                          {bed.status !== 'occupied' && (
                            <button
                              onClick={() => onDeleteBed(bed.id, bed.bed_number)}
                              title="Delete bed"
                              className="text-[#a0a3af] hover:text-[#b95c3c]"
                            >
                              <X className="size-3" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* View Room & Residents Action Button */}
                  <button
                    type="button"
                    onClick={() => setViewingRoom(r)}
                    className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl border border-[#d8c2aa] bg-[#faf7f2] py-2 text-xs font-bold text-[#8b5a2b] hover:bg-[#8b5a2b] hover:text-white transition-all shadow-2xs cursor-pointer"
                  >
                    <Users className="size-3.5" /> Room & Resident Details ({assignedTenants.length})
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Dedicated Room-wise Resident & Bed Modal */}
      {viewingRoom && (
        <RoomResidentsModal
          room={viewingRoom}
          beds={beds.filter((b: Bed) => b.room_id === viewingRoom.id)}
          tenants={tenants.filter((t: Tenant) => t.room_id === viewingRoom.id && t.status !== 'Vacated')}
          onClose={() => setViewingRoom(null)}
          onViewRentSchedule={onViewRentSchedule}
          onAddBed={() => onAddBed(viewingRoom.id, viewingRoom.room_number)}
          onOnboardTenant={(bedId?: string) => {
            setViewingRoom(null)
            onOnboardTenantForRoom?.(viewingRoom.id, bedId)
          }}
        />
      )}
    </div>
  )
})

const TenantsTab = memo(function TenantsTab({
  tenants,
  rooms,
  property,
  locale = 'en',
  payments = [],
  onViewRentSchedule,
  onAddTenant,
  onEditTenant,
  onVacateTenant,
  onDeleteTenant,
  onRecordPayment,
  onSharePortalLink,
  ownerPaymentDetails,
  onOpenPaymentSettings,
  searchQuery,
  onClearSearch,
}: any) {
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'due' | 'overdue'>('all')

  // Calculate live due statuses for all tenants using monthly rent cycle tracking
  const tenantStatuses = useMemo(() => {
    return tenants.map((t: Tenant) => {
      const rentStatus = calculateTenantRentStatus({
        tenant: t,
        payments: payments || [],
        locale,
      })
      return {
        tenant: t,
        dueInfo: rentStatus,
        nextDueDateFormatted: rentStatus.nextDueDateFormatted,
      }
    })
  }, [tenants, payments, locale])

  const paidCount = useMemo(() => tenantStatuses.filter((item: any) => item.dueInfo.status === 'paid').length, [tenantStatuses])
  const dueCount = useMemo(() => tenantStatuses.filter((item: any) => item.dueInfo.status === 'due_soon' || item.dueInfo.status === 'due_today').length, [tenantStatuses])
  const overdueCount = useMemo(() => tenantStatuses.filter((item: any) => item.dueInfo.status === 'overdue').length, [tenantStatuses])

  const displayedTenants = useMemo(() => {
    if (statusFilter === 'paid') return tenantStatuses.filter((item: any) => item.dueInfo.status === 'paid')
    if (statusFilter === 'due') return tenantStatuses.filter((item: any) => item.dueInfo.status === 'due_soon' || item.dueInfo.status === 'due_today')
    if (statusFilter === 'overdue') return tenantStatuses.filter((item: any) => item.dueInfo.status === 'overdue')
    return tenantStatuses
  }, [tenantStatuses, statusFilter])

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-[#2c221e]">Tenants & Residents</h2>
          <p className="text-xs text-[#85899a]">Active resident directory, room assignments, due dates, and WhatsApp reminders.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onAddTenant}
            className="flex items-center gap-2 rounded-xl bg-[#8b5a2b] px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-[#784b20] transition-colors"
          >
            <Plus className="size-4" /> Onboard Resident
          </button>
        </div>
      </div>

      {/* Payment Option Setup Prompt Banner (Shown when owner has not configured valid payment options) */}
      {!Boolean(
        (ownerPaymentDetails?.upiId && validateUpiId(ownerPaymentDetails.upiId).isValid) ||
        (ownerPaymentDetails?.paymentLink && validatePaymentLink(ownerPaymentDetails.paymentLink).isValid) ||
        ownerPaymentDetails?.qrCodeUrl
      ) && (
        <div className="mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-[#eedfc9] bg-[#fdf9f2] p-4 text-xs text-[#784b20]">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-xl bg-[#8b5a2b]/15 text-[#8b5a2b] shrink-0">
              <CreditCard className="size-4" />
            </div>
            <div>
              <p className="font-bold text-[#3d3934]">No UPI QR code or payment link configured</p>
              <p className="text-[11px] text-[#85899a]">
                Payment reminders sent to residents currently omit payment links. Add your verified UPI details so residents can pay directly.
              </p>
            </div>
          </div>
          <button
            onClick={onOpenPaymentSettings}
            className="inline-flex items-center justify-center rounded-xl bg-[#8b5a2b] px-3.5 py-1.5 font-semibold text-white shadow-2xs hover:bg-[#784b20] transition-colors self-start sm:self-auto shrink-0"
          >
            Set Up Payment Options →
          </button>
        </div>
      )}

      {/* Due Status Quick Filter Badges */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setStatusFilter('all')}
          className={`rounded-full px-3 py-1 text-xs font-semibold transition-all ${
            statusFilter === 'all'
              ? 'bg-[#8b5a2b] text-white shadow-xs'
              : 'border border-[#e8dfd4] bg-white text-[#676b7d] hover:bg-[#faf7f2]'
          }`}
        >
          All Residents ({tenants.length})
        </button>
        <button
          onClick={() => setStatusFilter('paid')}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-all ${
            statusFilter === 'paid'
              ? 'bg-[#2e7d32] text-white shadow-xs'
              : 'border border-[#c5e6c7] bg-[#eaf5ea] text-[#2e7d32] hover:bg-[#d8eed9]'
          }`}
        >
          <CheckCircle2 className="size-3.5" />
          Paid ({paidCount})
        </button>
        <button
          onClick={() => setStatusFilter('due')}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-all ${
            statusFilter === 'due'
              ? 'bg-[#b46b1a] text-white shadow-xs'
              : 'border border-[#ffdcb0] bg-[#fff4e5] text-[#b46b1a] hover:bg-[#ffe8cc]'
          }`}
        >
          <Clock className="size-3.5" />
          Due Soon ({dueCount})
        </button>
        <button
          onClick={() => setStatusFilter('overdue')}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-all ${
            statusFilter === 'overdue'
              ? 'bg-[#b95c3c] text-white shadow-xs'
              : 'border border-[#ffc9c1] bg-[#ffebe8] text-[#b95c3c] hover:bg-[#ffd7d2]'
          }`}
        >
          <AlertTriangle className="size-3.5" />
          Overdue Rent ({overdueCount})
        </button>
      </div>

      {displayedTenants.length === 0 ? (
        searchQuery ? (
          <EmptySearchState query={searchQuery} onClear={onClearSearch} />
        ) : (
          <EmptyState
            title={statusFilter === 'all' ? 'No residents registered yet' : `No residents matching filter "${statusFilter}"`}
            description="Add resident profiles, assign available rooms and beds, and record monthly terms."
            action={onAddTenant}
            actionLabel="Onboard Resident"
          />
        )
      ) : (
        <>
          {/* Mobile Card Layout (md:hidden) */}
          <div className="grid grid-cols-1 gap-3 md:hidden">
            {displayedTenants.map(({ tenant: t, dueInfo, nextDueDateFormatted }: any) => {
              const whatsappUrl = generateWhatsAppReminder({
                tenantName: t.name,
                phone: t.phone,
                amount: t.rent,
                dueDay: t.rent_due_day || 5,
                propertyName: property?.name || 'BaseraBook Property',
                locale,
                paymentDetails: ownerPaymentDetails,
              })

              return (
                <div key={t.id} className="rounded-2xl border border-[#e8dfd4] bg-white p-4 shadow-2xs space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold text-sm text-[#3d3934]">{t.name}</p>
                      <p className="text-xs text-[#74798a]">{t.phone || '—'}</p>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${dueInfo.badgeColor}`}
                    >
                      {dueInfo.status === 'overdue' && <AlertTriangle className="size-3" />}
                      {dueInfo.status === 'paid' && <Check className="size-3" />}
                      {dueInfo.status === 'due_soon' && <Clock className="size-3" />}
                      {locale === 'hi' ? dueInfo.labelHi : dueInfo.labelEn}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 rounded-xl bg-[#faf7f2] p-2.5 text-xs">
                    <div>
                      <p className="text-[10px] text-[#8c827a]">Room / Bed</p>
                      <p className="font-semibold text-[#3d3934]">Room {t.room} {t.bed_number ? `· Bed ${t.bed_number}` : ''}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[#8c827a]">Monthly Rent</p>
                      <p className="font-bold text-[#784b20]">{currency(t.rent)}</p>
                    </div>
                    <div className="col-span-2 flex items-center justify-between">
                      <div>
                        <p className="text-[10px] text-[#8c827a]">Due Schedule</p>
                        <p className="font-medium text-[#44485a]">
                          {t.rent_due_day ? `${t.rent_due_day}th of month` : '5th of month'}
                        </p>
                        {nextDueDateFormatted && (
                          <p className="text-[10px] text-[#8b5a2b] font-medium">Next: {nextDueDateFormatted}</p>
                        )}
                      </div>
                      {onViewRentSchedule && (
                        <button
                          onClick={() => onViewRentSchedule(t)}
                          className="rounded-lg border border-[#e8dfd4] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#6c635a] hover:bg-[#faf7f2] transition-colors"
                        >
                          Rent Ledger
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-[#f0ebe3]">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <a
                        href={whatsappUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg border border-[#25D366]/40 bg-[#25D366]/10 px-2.5 py-1.5 text-xs font-semibold text-[#1e7e34] hover:bg-[#25D366]/20 transition-colors"
                        title={
                          ownerPaymentDetails?.upiId && validateUpiId(ownerPaymentDetails.upiId).isValid
                            ? `Send WhatsApp reminder (Includes UPI: ${ownerPaymentDetails.upiId})`
                            : ownerPaymentDetails?.paymentLink && validatePaymentLink(ownerPaymentDetails.paymentLink).isValid
                            ? 'Send WhatsApp reminder (Includes online payment link)'
                            : 'Send WhatsApp reminder (No payment details configured)'
                        }
                      >
                        <MessageCircle className="size-3.5 text-[#25D366]" />
                        <span>Remind</span>
                      </a>

                      {t.status !== 'Paid' && t.status !== 'Vacated' && (
                        <button
                          onClick={() => onRecordPayment(t)}
                          className="rounded-lg bg-[#8b5a2b] px-3 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-[#784b20] transition-colors"
                        >
                          Collect
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => onEditTenant(t)}
                        className="rounded-lg p-2 text-[#a0a3af] hover:text-[#8b5a2b] hover:bg-[#faf7f2] transition-colors"
                        title="Edit resident details"
                      >
                        <Pencil className="size-4" />
                      </button>
                      {t.status !== 'Vacated' && (
                        <button
                          onClick={() => onVacateTenant(t.id, t.name)}
                          className="rounded-lg p-2 text-[#a0a3af] hover:text-[#b46b1a] hover:bg-[#faf7f2] transition-colors"
                          title="Mark as vacated"
                        >
                          <UserMinus className="size-4" />
                        </button>
                      )}
                      <button
                        onClick={() => onSharePortalLink?.(t)}
                        className="rounded-lg p-2 text-[#a0a3af] hover:text-[#8b5a2b] hover:bg-[#faf7f2] transition-colors"
                        title="Share Self-Service Portal Link"
                      >
                        <Link2 className="size-4" />
                      </button>
                      <button
                        onClick={() => onDeleteTenant(t.id, t.name)}
                        className="rounded-lg p-2 text-[#a0a3af] hover:text-[#b95c3c] hover:bg-[#fff5f5] transition-colors"
                        title="Delete resident"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Desktop Table View (hidden md:block) */}
          <div className="hidden md:block overflow-hidden rounded-2xl border border-[#e9ebf0] bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-xs">
                <thead className="border-b border-[#eee6dc] bg-[#faf7f2] font-semibold text-[#85899a]">
                  <tr>
                    <th className="px-5 py-3.5">Resident</th>
                    <th className="px-5 py-3.5">Contact</th>
                    <th className="px-5 py-3.5">Room & Bed</th>
                    <th className="px-5 py-3.5">Monthly Rent</th>
                    <th className="px-5 py-3.5">Due Schedule</th>
                    <th className="px-5 py-3.5">Rent Status</th>
                    <th className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eee6dc]">
                  {displayedTenants.map(({ tenant: t, dueInfo, nextDueDateFormatted }: any) => {
                    const whatsappUrl = generateWhatsAppReminder({
                      tenantName: t.name,
                      phone: t.phone,
                      amount: t.rent,
                      dueDay: t.rent_due_day || 5,
                      propertyName: property?.name || 'BaseraBook Property',
                      locale,
                      paymentDetails: ownerPaymentDetails,
                    })

                    return (
                      <tr key={t.id} className="hover:bg-[#fbf8f3]">
                        <td className="px-5 py-4 font-bold text-[#3d3934]">{t.name}</td>
                        <td className="px-5 py-4 text-[#676b7d]">{t.phone || '—'}</td>
                        <td className="px-5 py-4 text-[#676b7d]">
                          Room {t.room} {t.bed_number ? `· Bed ${t.bed_number}` : ''}
                        </td>
                        <td className="px-5 py-4 font-semibold text-[#784b20]">{currency(t.rent)}</td>
                        <td className="px-5 py-4 text-[#74798a]">
                          <span className="font-medium text-[#44485a] block">
                            {t.rent_due_day ? `${t.rent_due_day}th of month` : '5th of month'}
                          </span>
                          {nextDueDateFormatted && (
                            <span className="text-[10px] text-[#8b5a2b] font-medium block">
                              Next: {nextDueDateFormatted}
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold ${dueInfo.badgeColor}`}
                          >
                            {dueInfo.status === 'overdue' && <AlertTriangle className="size-3" />}
                            {dueInfo.status === 'paid' && <Check className="size-3" />}
                            {dueInfo.status === 'due_soon' && <Clock className="size-3" />}
                            {locale === 'hi' ? dueInfo.labelHi : dueInfo.labelEn}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Monthly Rent Ledger */}
                            {onViewRentSchedule && (
                              <button
                                onClick={() => onViewRentSchedule(t)}
                                className="flex items-center gap-1 rounded-lg border border-[#e8dfd4] bg-white px-2 py-1 text-[11px] font-semibold text-[#6c635a] hover:bg-[#faf7f2] transition-colors"
                                title="View monthly rent schedule & payment history"
                              >
                                <Calendar className="size-3.5 text-[#8b5a2b]" />
                                <span className="hidden xl:inline">Ledger</span>
                              </button>
                            )}

                            {/* 1-Click WhatsApp Reminder */}
                            <a
                              href={whatsappUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 rounded-lg border border-[#25D366]/40 bg-[#25D366]/10 px-2 py-1 text-[11px] font-semibold text-[#1e7e34] hover:bg-[#25D366]/20 transition-colors"
                              title={
                                ownerPaymentDetails?.upiId && validateUpiId(ownerPaymentDetails.upiId).isValid
                                  ? `Send WhatsApp reminder (Includes UPI: ${ownerPaymentDetails.upiId})`
                                  : ownerPaymentDetails?.paymentLink && validatePaymentLink(ownerPaymentDetails.paymentLink).isValid
                                  ? 'Send WhatsApp reminder (Includes online payment link)'
                                  : 'Send WhatsApp reminder (No payment details configured)'
                              }
                            >
                              <MessageCircle className="size-3.5 text-[#25D366]" />
                              <span className="hidden md:inline">Remind</span>
                            </a>

                            {t.status !== 'Paid' && t.status !== 'Vacated' && (
                              <button
                                onClick={() => onRecordPayment(t)}
                                className="rounded-lg bg-[#8b5a2b]/10 px-2.5 py-1 text-[11px] font-semibold text-[#8b5a2b] hover:bg-[#8b5a2b]/20 transition-colors"
                              >
                                Collect
                              </button>
                            )}

                            <button
                              onClick={() => onEditTenant(t)}
                              className="rounded-lg p-1.5 text-[#a0a3af] hover:text-[#8b5a2b] hover:bg-[#faf7f2] transition-colors"
                              title="Edit resident details"
                            >
                              <Pencil className="size-3.5" />
                            </button>

                            {t.status !== 'Vacated' && (
                              <button
                                onClick={() => onVacateTenant(t.id, t.name)}
                                className="rounded-lg p-1.5 text-[#a0a3af] hover:text-[#b46b1a] hover:bg-[#faf7f2] transition-colors"
                                title="Mark as vacated"
                              >
                                <UserMinus className="size-3.5" />
                              </button>
                            )}

                            <button
                              onClick={() => onSharePortalLink?.(t)}
                              className="rounded-lg p-1.5 text-[#a0a3af] hover:text-[#8b5a2b] hover:bg-[#faf7f2] transition-colors"
                              title="Share Self-Service Portal Link"
                            >
                              <Link2 className="size-3.5" />
                            </button>

                            <button
                              onClick={() => onDeleteTenant(t.id, t.name)}
                              className="rounded-lg p-1.5 text-[#a0a3af] hover:text-[#b95c3c] hover:bg-[#fff5f5] transition-colors"
                              title="Delete resident (Soft-delete with 5s undo)"
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
          </div>
        </>
      )}
    </div>
  )
})

const PaymentsTab = memo(function PaymentsTab({
  payments,
  tenants,
  locale = 'en',
  onRecordPayment,
  onViewReceipt,
  onEditPayment,
  onDeletePayment,
  searchQuery,
  onClearSearch,
}: any) {
  const HISTORICAL_START_YEAR = 2026
  const currentYear = new Date().getFullYear()
  const currentMonth = new Date().getMonth()
  const [selectedMonth, setSelectedMonth] = useState<number | 'all'>(currentMonth)
  const [selectedYear, setSelectedYear] = useState<number>(currentYear)

  const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]

  const availableYears = useMemo(() => {
    const years: number[] = []
    const maxYear = Math.max(HISTORICAL_START_YEAR + 1, currentYear + 1)
    for (let yr = HISTORICAL_START_YEAR; yr <= maxYear; yr++) {
      years.push(yr)
    }
    return years
  }, [currentYear])

  const availableMonths = useMemo(() => {
    return MONTH_NAMES.map((name, idx) => ({ name, idx })).filter(({ idx }) => {
      if (selectedYear === 2026) {
        const hasOlderRecord = payments.some((p: PaymentRecord) => {
          const d = new Date(p.paid_at)
          return d.getFullYear() === 2026 && d.getMonth() === idx
        })
        return idx >= 9 || hasOlderRecord
      }
      return true
    })
  }, [selectedYear, payments])

  const displayedPayments = useMemo(() => {
    if (selectedMonth === 'all') return payments
    return payments.filter((p: PaymentRecord) => {
      const d = new Date(p.paid_at)
      return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear
    })
  }, [payments, selectedMonth, selectedYear])

  const totalFilteredAmount = useMemo(() => {
    return displayedPayments.reduce((sum: number, p: PaymentRecord) => sum + (p.amount || 0), 0)
  }, [displayedPayments])

  return (
    <div>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-[#2c221e]">Rent & Payments Ledger</h2>
          <p className="text-xs text-[#85899a]">Confirmed collections, exact timestamps in owner timezone, and owner controls.</p>
        </div>
        <button
          onClick={onRecordPayment}
          className="flex items-center gap-2 rounded-xl bg-[#8b5a2b] px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-[#784b20] transition-colors self-start sm:self-auto"
        >
          <Plus className="size-4" /> Record Payment
        </button>
      </div>

      {/* Month/Year Filter Controls & Summary */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#e8dfd4] bg-[#faf7f2] p-3.5 sm:p-4 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-[#6c635a] flex items-center gap-1.5">
            <Calendar className="size-3.5 text-[#8b5a2b]" /> Period:
          </span>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            className="rounded-xl border border-[#d8c2aa] bg-white px-3 py-1.5 font-semibold text-[#2c221e] shadow-2xs outline-none cursor-pointer"
          >
            <option value="all">All Months (Historical)</option>
            {availableMonths.map(({ name, idx }) => (
              <option key={name} value={idx}>
                {name}
              </option>
            ))}
          </select>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="rounded-xl border border-[#d8c2aa] bg-white px-3 py-1.5 font-semibold text-[#2c221e] shadow-2xs outline-none cursor-pointer"
          >
            {availableYears.map((yr) => (
              <option key={yr} value={yr}>
                {yr}
              </option>
            ))}
          </select>
          {selectedMonth !== currentMonth && (
            <button
              onClick={() => {
                setSelectedMonth(currentMonth)
                setSelectedYear(currentYear)
              }}
              className="rounded-xl border border-[#d8c2aa] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#8b5a2b] hover:bg-[#faf4ed] transition-colors"
            >
              Current Month
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 font-semibold">
          <span className="text-[#6c635a]">
            {selectedMonth === 'all' ? 'All Collections' : `${MONTH_NAMES[selectedMonth]} ${selectedYear}`}:
          </span>
          <span className="rounded-lg bg-emerald-100/70 border border-emerald-200 px-2 py-0.5 font-bold text-emerald-800">
            {currency(totalFilteredAmount)} ({displayedPayments.length} recorded)
          </span>
        </div>
      </div>

      {displayedPayments.length === 0 ? (
        searchQuery ? (
          <EmptySearchState query={searchQuery} onClear={onClearSearch} />
        ) : (
          <div className="rounded-2xl border border-[#e8dfd4] bg-white p-8 text-center text-xs text-[#85899a]">
            <p className="font-semibold text-sm text-[#2c221e]">
              No rent payments recorded for {selectedMonth === 'all' ? 'this property' : `${MONTH_NAMES[selectedMonth]} ${selectedYear}`}.
            </p>
            <p className="mt-1">
              Select another month using the period selector above, or record a new rent collection.
            </p>
            <div className="mt-4 flex items-center justify-center gap-2">
              {selectedMonth !== 'all' && (
                <button
                  onClick={() => setSelectedMonth('all')}
                  className="rounded-xl border border-[#d8c2aa] bg-[#faf7f2] px-3.5 py-1.5 text-xs font-semibold text-[#8b5a2b] hover:bg-[#f1e8dc]"
                >
                  View All Historical Payments
                </button>
              )}
              <button
                onClick={onRecordPayment}
                className="rounded-xl bg-[#8b5a2b] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#784b20]"
              >
                Record Payment
              </button>
            </div>
          </div>
        )
      ) : (
        <>
          {/* Mobile Card Layout (md:hidden) */}
          <div className="grid grid-cols-1 gap-3 md:hidden">
            {displayedPayments.map((p: PaymentRecord) => (
              <div key={p.id} className="rounded-2xl border border-[#ebe4da] bg-white p-4 shadow-2xs space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-mono text-xs font-bold text-[#676b7d]">
                      REC-{p.id.slice(0, 8).toUpperCase()}
                    </span>
                    <p className="font-bold text-sm text-[#3d3934] mt-0.5">{p.tenant_name}</p>
                    <p className="text-xs text-[#85899a]">Room {p.room_number}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-base font-bold text-[#328d68]">{currency(p.amount)}</p>
                    <span className="uppercase text-[10px] font-bold text-[#85899a] bg-[#faf7f2] px-2 py-0.5 rounded border border-[#e8dfd4] mt-1 inline-block">
                      {p.payment_type}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-[#74798a] border-t border-[#f0ebe3] pt-2">
                  <div>
                    <span className="uppercase text-[10px] font-semibold text-[#8c827a] block">Method / Date</span>
                    <span className="font-medium text-[#44485a]">
                      {p.payment_method.toUpperCase()} · {formatPaymentTimestamp(p.paid_at, 'Asia/Kolkata', locale)}
                    </span>
                    {p.month_covered && (
                      <p className="text-[11px] font-medium text-[#8b5a2b]">{p.month_covered}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#f0ebe3]">
                  <button
                    onClick={() => onViewReceipt(p)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#e8dfd4] px-3 py-1.5 text-xs font-semibold text-[#8b5a2b] hover:bg-[#faf7f2] hover:border-[#8b5a2b] transition-colors"
                  >
                    View Receipt
                  </button>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onEditPayment(p)}
                      className="rounded-lg p-2 text-[#a0a3af] hover:text-[#8b5a2b] hover:bg-[#faf7f2] transition-colors"
                      title="Edit payment entry"
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button
                      onClick={() => onDeletePayment(p.id, p.amount, p.tenant_name)}
                      className="rounded-lg p-2 text-[#a0a3af] hover:text-[#b95c3c] hover:bg-[#fff5f5] transition-colors"
                      title="Delete payment"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Table View (hidden md:block) */}
          <div className="hidden md:block overflow-hidden rounded-2xl border border-[#ebe4da] bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-xs">
                <thead className="border-b border-[#eee6dc] bg-[#faf7f2] font-semibold text-[#85899a]">
                  <tr>
                    <th className="px-5 py-3.5">Receipt #</th>
                    <th className="px-5 py-3.5">Resident</th>
                    <th className="px-5 py-3.5">Type & Period</th>
                    <th className="px-5 py-3.5">Method</th>
                    <th className="px-5 py-3.5">Payment Date & Exact Time (IST)</th>
                    <th className="px-5 py-3.5">Amount</th>
                    <th className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eee6dc]">
                  {displayedPayments.map((p: PaymentRecord) => (
                    <tr key={p.id} className="hover:bg-[#fbf8f3] transition-colors">
                      <td className="px-5 py-4 font-mono font-bold text-[#676b7d]">
                        REC-{p.id.slice(0, 8).toUpperCase()}
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-semibold text-[#3d3934]">{p.tenant_name}</p>
                        <p className="text-[11px] text-[#85899a]">Room {p.room_number}</p>
                      </td>
                      <td className="px-5 py-4">
                        <span className="uppercase text-[10px] font-bold text-[#85899a] bg-[#faf7f2] px-2 py-0.5 rounded border border-[#e8dfd4]">
                          {p.payment_type}
                        </span>
                        {p.month_covered && (
                          <p className="mt-1 text-[11px] font-medium text-[#8b5a2b]">{p.month_covered}</p>
                        )}
                      </td>
                      <td className="px-5 py-4 uppercase text-[10px] text-[#85899a]">{p.payment_method}</td>
                      <td className="px-5 py-4 text-[#555a6c] font-medium">
                        {formatPaymentTimestamp(p.paid_at, 'Asia/Kolkata', locale)}
                      </td>
                      <td className="px-5 py-4 font-bold text-[#328d68] text-sm">{currency(p.amount)}</td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => onViewReceipt(p)}
                            className="rounded-lg border border-[#e8dfd4] px-2.5 py-1 text-xs font-semibold text-[#8b5a2b] hover:bg-[#faf7f2] hover:border-[#8b5a2b] transition-colors"
                          >
                            Receipt
                          </button>
                          <button
                            onClick={() => onEditPayment(p)}
                            className="rounded-lg p-1.5 text-[#a0a3af] hover:text-[#8b5a2b] hover:bg-[#faf7f2] transition-colors"
                            title="Edit payment entry"
                          >
                            <Pencil className="size-3.5" />
                          </button>
                          <button
                            onClick={() => onDeletePayment(p.id, p.amount, p.tenant_name)}
                            className="rounded-lg p-1.5 text-[#a0a3af] hover:text-[#b95c3c] hover:bg-[#fff5f5] transition-colors"
                            title="Delete payment (Soft-delete with 5s undo)"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
})

const DeletedRecordsTab = memo(function DeletedRecordsTab({
  trashRecords,
  isLoading = false,
  isRestoringId = null,
  locale = 'en',
  onRestore,
  onPermanentDelete,
  onRefresh,
}: {
  trashRecords: TrashRecord[]
  isLoading?: boolean
  isRestoringId?: string | null
  locale?: string
  onRestore: (record: TrashRecord) => Promise<void>
  onPermanentDelete: (record: TrashRecord) => void
  onRefresh: () => Promise<void>
}) {
  const [filterType, setFilterType] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

  const filteredRecords = useMemo(() => {
    return trashRecords.filter((rec) => {
      const matchesType =
        filterType === 'all'
          ? true
          : filterType === 'rooms_beds'
          ? rec.entity_type === 'room' || rec.entity_type === 'bed'
          : rec.entity_type === filterType

      const matchesSearch =
        !searchQuery ||
        rec.entity_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        rec.details?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        rec.deleted_by?.toLowerCase().includes(searchQuery.toLowerCase())

      return matchesType && matchesSearch
    })
  }, [trashRecords, filterType, searchQuery])

  const counts = useMemo(() => {
    return {
      all: trashRecords.length,
      tenant: trashRecords.filter((r) => r.entity_type === 'tenant').length,
      property: trashRecords.filter((r) => r.entity_type === 'property').length,
      rooms_beds: trashRecords.filter((r) => r.entity_type === 'room' || r.entity_type === 'bed').length,
      expense: trashRecords.filter((r) => r.entity_type === 'expense').length,
      complaint: trashRecords.filter((r) => r.entity_type === 'complaint').length,
      payment: trashRecords.filter((r) => r.entity_type === 'payment').length,
    }
  }, [trashRecords])

  const getBadgeStyle = (type: string) => {
    switch (type) {
      case 'property':
        return 'border-[#e0ceb9] bg-[#fbf5ee] text-[#8b5a2b]'
      case 'room':
        return 'border-[#e0ceb9] bg-[#f7f0e6] text-[#784b20]'
      case 'bed':
        return 'border-[#ebd5be] bg-[#faf3ea] text-[#b46b1a]'
      case 'tenant':
        return 'border-[#c5e6c7] bg-[#eaf5ea] text-[#2e7d32]'
      case 'expense':
        return 'border-[#edd7cf] bg-[#fff5f2] text-[#9a7651]'
      case 'complaint':
        return 'border-[#fed7d7] bg-[#fff5f5] text-[#b95c3c]'
      case 'payment':
        return 'border-[#ccebe1] bg-[#e7f7f0] text-[#328d68]'
      default:
        return 'border-[#e8dfd4] bg-[#faf7f2] text-[#676b7d]'
    }
  }

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'property':
        return 'Property'
      case 'room':
        return 'Room'
      case 'bed':
        return 'Bed'
      case 'tenant':
        return 'Resident'
      case 'expense':
        return 'Expense'
      case 'complaint':
        return 'Complaint'
      case 'payment':
        return 'Payment (Reversed)'
      default:
        return type.toUpperCase()
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-[#2c221e]">Deleted Records & Trash</h2>
          <p className="text-xs text-[#85899a]">
            Safely review soft-deleted records. Restored items return immediately to your active data.
          </p>
        </div>
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="inline-flex items-center gap-2 rounded-xl border border-[#e8dfd4] bg-white px-3.5 py-2 text-xs font-semibold text-[#676b7d] shadow-2xs hover:bg-[#faf7f2] disabled:opacity-50 transition-colors self-start sm:self-auto"
        >
          <RotateCw className={`size-3.5 text-[#8b5a2b] ${isLoading ? 'animate-spin' : ''}`} />
          Refresh Trash
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-[#e8dfd4] bg-[#faf7f2] p-3.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: 'all', label: `All (${counts.all})` },
            { id: 'tenant', label: `Residents (${counts.tenant})` },
            { id: 'property', label: `Properties (${counts.property})` },
            { id: 'rooms_beds', label: `Rooms & Beds (${counts.rooms_beds})` },
            { id: 'expense', label: `Expenses (${counts.expense})` },
            { id: 'complaint', label: `Complaints (${counts.complaint})` },
            { id: 'payment', label: `Payments (${counts.payment})` },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterType(tab.id)}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
                filterType === tab.id
                  ? 'bg-[#8b5a2b] text-white shadow-xs'
                  : 'bg-white text-[#676b7d] border border-[#e8dfd4] hover:bg-[#f5ede4]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 rounded-xl border border-[#e8dfd4] bg-white px-3 py-2 text-xs">
          <Search className="size-3.5 text-[#8b5a2b]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search deleted records by name, details, or user..."
            className="w-full bg-transparent outline-none placeholder:text-[#a0a3b0]"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="text-[#a0a3b0] hover:text-[#2c221e]">
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Trash Records List / Table */}
      {trashRecords.length === 0 ? (
        <div className="rounded-2xl border border-[#e8dfd4] bg-[#faf7f2] p-10 text-center">
          <ShieldCheck className="mx-auto size-9 text-[#2e7d32]" />
          <h4 className="mt-2.5 text-base font-bold text-[#3d3934]">Trash is Empty</h4>
          <p className="mt-1 text-xs text-[#74798a] max-w-md mx-auto">
            Your workspace is completely up to date. Any properties, rooms, beds, residents, expenses, or complaints deleted in the future can be safely restored here.
          </p>
        </div>
      ) : filteredRecords.length === 0 ? (
        <div className="rounded-2xl border border-[#e8dfd4] bg-white p-8 text-center text-xs text-[#85899a]">
          No deleted records match your active filter or search query.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[#e8dfd4] bg-white shadow-xs">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className="border-b border-[#eee6dc] bg-[#faf7f2] font-semibold text-[#85899a]">
              <tr>
                <th className="px-5 py-3.5">Record Type</th>
                <th className="px-5 py-3.5">Name / Description</th>
                <th className="px-5 py-3.5">Deleted At</th>
                <th className="px-5 py-3.5">Deleted By</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eee6dc]">
              {filteredRecords.map((record) => {
                const isRestoring = isRestoringId === record.id
                return (
                  <tr key={record.id} className="hover:bg-[#fbf8f3] transition-colors">
                    <td className="px-5 py-4">
                      <span className={`inline-block rounded-lg border px-2.5 py-1 text-[11px] font-bold ${getBadgeStyle(record.entity_type)}`}>
                        {getTypeLabel(record.entity_type)}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-bold text-[#2c221e]">{record.entity_name}</p>
                      {record.details && (
                        <p className="mt-0.5 text-[11px] text-[#74798a]">{record.details}</p>
                      )}
                    </td>
                    <td className="px-5 py-4 text-[#74798a]">
                      {formatPaymentTimestamp(record.deleted_at, 'Asia/Kolkata', locale)}
                    </td>
                    <td className="px-5 py-4 text-[#74798a] font-mono text-[11px]">
                      {record.deleted_by || 'PG Owner'}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {/* Restore Action Button */}
                        <button
                          onClick={() => onRestore(record)}
                          disabled={!!isRestoringId}
                          title="Restore record to active data"
                          className="inline-flex items-center gap-1.5 rounded-xl border border-[#c5e6c7] bg-[#eaf5ea] px-3.5 py-1.5 text-xs font-semibold text-[#2e7d32] hover:bg-[#d5edd7] disabled:opacity-50 transition-colors"
                        >
                          {isRestoring ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <RotateCcw className="size-3.5" />
                          )}
                          {isRestoring ? 'Restoring...' : 'Restore'}
                        </button>

                        {/* Permanent Delete Button */}
                        <button
                          onClick={() => onPermanentDelete(record)}
                          disabled={!!isRestoringId}
                          title="Permanently purge this record"
                          className="inline-flex items-center gap-1.5 rounded-xl border border-[#f5c6cb] bg-[#fff5f5] px-3 py-1.5 text-xs font-semibold text-[#b95c3c] hover:bg-[#ffe8e8] disabled:opacity-50 transition-colors"
                        >
                          <Trash2 className="size-3.5" />
                          Purge
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
    </div>
  )
})

const ElectricityTab = memo(function ElectricityTab({
  records,
  rooms,
  onAddReading,
  onAddMidCycle,
  onViewSplitBreakdown,
  onEditReading,
  onDeleteReading,
  searchQuery,
  onClearSearch,
}: any) {
  const HISTORICAL_START_YEAR = 2026
  const currentYear = new Date().getFullYear()
  const currentMonth = new Date().getMonth()
  const [selectedMonth, setSelectedMonth] = useState<number | 'all'>(currentMonth)
  const [selectedYear, setSelectedYear] = useState<number>(currentYear)

  const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]

  const availableYears = useMemo(() => {
    const years: number[] = []
    const maxYear = Math.max(HISTORICAL_START_YEAR + 1, currentYear + 1)
    for (let yr = HISTORICAL_START_YEAR; yr <= maxYear; yr++) {
      years.push(yr)
    }
    return years
  }, [currentYear])

  const availableMonths = useMemo(() => {
    return MONTH_NAMES.map((name, idx) => ({ name, idx })).filter(({ idx }) => {
      if (selectedYear === 2026) {
        const hasOlderRecord = records.some((el: ElectricityRecord) => {
          const { year, month } = getYearMonthFromDate(el.reading_date)
          return year === 2026 && month === idx
        })
        return idx >= 9 || hasOlderRecord
      }
      return true
    })
  }, [selectedYear, records])

  const displayedRecords = useMemo(() => {
    if (selectedMonth === 'all') return records
    return records.filter((el: ElectricityRecord) => {
      const { year, month } = getYearMonthFromDate(el.reading_date)
      return month === selectedMonth && year === selectedYear
    })
  }, [records, selectedMonth, selectedYear])

  const totalUnits = useMemo(() => {
    return displayedRecords.reduce((sum: number, el: ElectricityRecord) => {
      return sum + Math.max(0, el.current_reading - el.previous_reading)
    }, 0)
  }, [displayedRecords])

  const totalAmount = useMemo(() => {
    return displayedRecords.reduce((sum: number, el: ElectricityRecord) => {
      const units = Math.max(0, el.current_reading - el.previous_reading)
      return sum + units * el.rate_per_unit
    }, 0)
  }, [displayedRecords])

  return (
    <div>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-[#2c221e]">Electricity & Utilities</h2>
          <p className="text-xs text-[#85899a]">Meter reading logger and automated consumption charges with mid-cycle occupancy splits.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onAddMidCycle}
            className="flex items-center gap-2 rounded-xl border border-[#8b5a2b] bg-white px-3.5 py-2 text-xs font-semibold text-[#8b5a2b] shadow-2xs hover:bg-[#faf7f2] transition-colors self-start sm:self-auto"
          >
            <Split className="size-4" /> Mid-Cycle Bill Split
          </button>
          <button
            onClick={onAddReading}
            className="flex items-center gap-2 rounded-xl bg-[#8b5a2b] px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#784b20] transition-colors self-start sm:self-auto"
          >
            <Plus className="size-4" /> Record Reading
          </button>
        </div>
      </div>

      {/* Month/Year Filter Controls & Summary */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#e8dfd4] bg-[#faf7f2] p-3.5 sm:p-4 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-[#6c635a] flex items-center gap-1.5">
            <Calendar className="size-3.5 text-[#8b5a2b]" /> Period:
          </span>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            className="rounded-xl border border-[#d8c2aa] bg-white px-3 py-1.5 font-semibold text-[#2c221e] shadow-2xs outline-none cursor-pointer"
          >
            <option value="all">All Months (Historical)</option>
            {availableMonths.map(({ name, idx }) => (
              <option key={name} value={idx}>
                {name}
              </option>
            ))}
          </select>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="rounded-xl border border-[#d8c2aa] bg-white px-3 py-1.5 font-semibold text-[#2c221e] shadow-2xs outline-none cursor-pointer"
          >
            {availableYears.map((yr) => (
              <option key={yr} value={yr}>
                {yr}
              </option>
            ))}
          </select>
          {selectedMonth !== currentMonth && (
            <button
              onClick={() => {
                setSelectedMonth(currentMonth)
                setSelectedYear(currentYear)
              }}
              className="rounded-xl border border-[#d8c2aa] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#8b5a2b] hover:bg-[#faf4ed] transition-colors"
            >
              Current Month
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 font-semibold">
          <span className="text-[#6c635a]">
            {selectedMonth === 'all' ? 'All Readings' : `${MONTH_NAMES[selectedMonth]} ${selectedYear}`}:
          </span>
          <span className="rounded-lg bg-[#faf0e6] border border-[#d8c2aa] px-2 py-0.5 font-bold text-[#8b5a2b]">
            {currency(totalAmount)} ({totalUnits} units · {displayedRecords.length} readings)
          </span>
        </div>
      </div>

      {displayedRecords.length === 0 ? (
        searchQuery ? (
          <EmptySearchState query={searchQuery} onClear={onClearSearch} />
        ) : (
          <div className="rounded-2xl border border-[#e8dfd4] bg-white p-8 text-center text-xs text-[#85899a]">
            <p className="font-semibold text-sm text-[#2c221e]">
              No electricity readings recorded for {selectedMonth === 'all' ? 'this property' : `${MONTH_NAMES[selectedMonth]} ${selectedYear}`}.
            </p>
            <p className="mt-1">
              Select another month using the period selector above, or record a new meter reading.
            </p>
            <div className="mt-4 flex items-center justify-center gap-2">
              {selectedMonth !== 'all' && (
                <button
                  onClick={() => setSelectedMonth('all')}
                  className="rounded-xl border border-[#d8c2aa] bg-[#faf7f2] px-3.5 py-1.5 text-xs font-semibold text-[#8b5a2b] hover:bg-[#f1e8dc]"
                >
                  View All Historical Readings
                </button>
              )}
              <button
                onClick={onAddReading}
                className="rounded-xl bg-[#8b5a2b] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#784b20]"
              >
                Record Reading
              </button>
            </div>
          </div>
        )
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[#ebe4da] bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-xs">
              <thead className="border-b border-[#eee6dc] bg-[#faf7f2] font-semibold text-[#85899a]">
                <tr>
                  <th className="px-5 py-3.5">Meter / Room</th>
                  <th className="px-5 py-3.5">Previous (kWh)</th>
                  <th className="px-5 py-3.5">Current (kWh)</th>
                  <th className="px-5 py-3.5">Units</th>
                  <th className="px-5 py-3.5">Rate / Unit</th>
                  <th className="px-5 py-3.5">Total Amount</th>
                  <th className="px-5 py-3.5">Date / Period</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eee6dc]">
                {displayedRecords.map((el: ElectricityRecord) => {
                  const isMidCycle = el.calculation_type && el.calculation_type !== 'standard'
                  const units = Math.max(0, el.current_reading - el.previous_reading)
                  const total = units * el.rate_per_unit
                  return (
                    <tr key={el.id} className="hover:bg-[#fbf8f3] transition-colors">
                      <td className="px-5 py-4 font-bold text-[#3d3934]">
                        <div className="flex flex-col gap-1">
                          <span>{el.room_id ? `Room ${el.room}` : 'Building General Meter'}</span>
                          {isMidCycle && (
                            <span className="inline-flex items-center gap-1 w-fit rounded-md bg-[#8b5a2b]/10 px-1.5 py-0.5 text-[10px] font-bold text-[#784b20]">
                              <Split className="size-3" />
                              Mid-Cycle Split
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-[#676b7d]">{el.previous_reading}</td>
                      <td className="px-5 py-4 text-[#676b7d]">{el.current_reading}</td>
                      <td className="px-5 py-4 font-bold text-[#784b20]">{units} units</td>
                      <td className="px-5 py-4 text-[#676b7d]">{currency(el.rate_per_unit)}</td>
                      <td className="px-5 py-4 font-bold text-[#44485a]">{currency(total)}</td>
                      <td className="px-5 py-4 text-[#85899a]">
                        {el.period_start && el.period_end ? (
                          <div className="flex flex-col">
                            <span className="font-semibold text-[#44485a]">
                              {new Date(el.period_start).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} –{' '}
                              {new Date(el.period_end).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                            </span>
                            <span className="text-[10px] text-[#999daa]">Billing Period</span>
                          </div>
                        ) : (
                          new Date(el.reading_date).toLocaleDateString('en-IN')
                        )}
                      </td>
                      <td className="px-5 py-4 text-right">
                        {isMidCycle && el.split_breakdown && (
                          <button
                            onClick={() => onViewSplitBreakdown?.(el)}
                            className="rounded-lg p-1.5 text-[#8b5a2b] hover:bg-[#faf7f2] transition-colors mr-1"
                            title="View mid-cycle resident calculation breakdown"
                          >
                            <FileText className="size-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => onEditReading?.(el)}
                          className="rounded-lg p-1.5 text-[#a0a3af] hover:text-[#8b5a2b] hover:bg-[#faf7f2] transition-colors mr-1"
                          title="Edit reading"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                        <button
                          onClick={() => onDeleteReading(el.id, el.room)}
                          className="rounded-lg p-1.5 text-[#a0a3af] hover:text-[#b95c3c] hover:bg-[#fff5f5] transition-colors"
                          title="Delete reading"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
})

const ExpensesTab = memo(function ExpensesTab({ expenses, totalMonth, onAddExpense, onEditExpense, onDeleteExpense, searchQuery, onClearSearch }: any) {
  const HISTORICAL_START_YEAR = 2026
  const currentYear = new Date().getFullYear()
  const currentMonth = new Date().getMonth()
  const [selectedMonth, setSelectedMonth] = useState<number | 'all'>(currentMonth)
  const [selectedYear, setSelectedYear] = useState<number>(currentYear)

  const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]

  const availableYears = useMemo(() => {
    const years: number[] = []
    const maxYear = Math.max(HISTORICAL_START_YEAR + 1, currentYear + 1)
    for (let yr = HISTORICAL_START_YEAR; yr <= maxYear; yr++) {
      years.push(yr)
    }
    return years
  }, [currentYear])

  const availableMonths = useMemo(() => {
    return MONTH_NAMES.map((name, idx) => ({ name, idx })).filter(({ idx }) => {
      if (selectedYear === 2026) {
        const hasOlderRecord = expenses.some((e: Expense) => {
          const d = new Date(e.expense_date)
          return d.getFullYear() === 2026 && d.getMonth() === idx
        })
        return idx >= 9 || hasOlderRecord
      }
      return true
    })
  }, [selectedYear, expenses])

  const displayedExpenses = useMemo(() => {
    if (selectedMonth === 'all') return expenses
    return expenses.filter((e: Expense) => {
      const d = new Date(e.expense_date)
      return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear
    })
  }, [expenses, selectedMonth, selectedYear])

  const totalFilteredExpenses = useMemo(() => {
    return displayedExpenses.reduce((sum: number, e: Expense) => sum + (e.amount || 0), 0)
  }, [displayedExpenses])

  return (
    <div>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-[#2c221e]">Operating Expenses</h2>
          <p className="text-xs text-[#85899a]">Track property repairs, utility bills, and vendor costs.</p>
        </div>
        <button
          onClick={onAddExpense}
          className="flex items-center gap-2 rounded-xl bg-[#8b5a2b] px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-[#784b20] transition-colors self-start sm:self-auto"
        >
          <Plus className="size-4" /> Log Expense
        </button>
      </div>

      {/* Month/Year Filter Controls & Summary */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#e8dfd4] bg-[#faf7f2] p-4 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-[#6c635a] flex items-center gap-1.5">
            <Calendar className="size-3.5 text-[#8b5a2b]" /> Period:
          </span>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            className="rounded-xl border border-[#d8c2aa] bg-white px-3 py-1.5 font-semibold text-[#2c221e] shadow-2xs outline-none cursor-pointer"
          >
            <option value="all">All Months (Historical)</option>
            {availableMonths.map(({ name, idx }) => (
              <option key={name} value={idx}>
                {name}
              </option>
            ))}
          </select>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="rounded-xl border border-[#d8c2aa] bg-white px-3 py-1.5 font-semibold text-[#2c221e] shadow-2xs outline-none cursor-pointer"
          >
            {availableYears.map((yr) => (
              <option key={yr} value={yr}>
                {yr}
              </option>
            ))}
          </select>
          {selectedMonth !== currentMonth && (
            <button
              onClick={() => {
                setSelectedMonth(currentMonth)
                setSelectedYear(currentYear)
              }}
              className="rounded-xl border border-[#d8c2aa] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#8b5a2b] hover:bg-[#faf4ed] transition-colors"
            >
              Current Month
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 font-semibold">
          <span className="text-[#6c635a]">
            {selectedMonth === 'all' ? 'All Operating Expenses' : `Expenses for ${MONTH_NAMES[selectedMonth]} ${selectedYear}`}:
          </span>
          <span className="rounded-lg bg-rose-100/70 border border-rose-200 px-2 py-0.5 font-bold text-rose-800">
            {currency(totalFilteredExpenses)} ({displayedExpenses.length} entries)
          </span>
        </div>
      </div>

      {displayedExpenses.length === 0 ? (
        searchQuery ? (
          <EmptySearchState query={searchQuery} onClear={onClearSearch} />
        ) : (
          <div className="rounded-2xl border border-[#e8dfd4] bg-white p-8 text-center text-xs text-[#85899a]">
            <p className="font-semibold text-sm text-[#2c221e]">
              No expenses logged for {selectedMonth === 'all' ? 'this property' : `${MONTH_NAMES[selectedMonth]} ${selectedYear}`}.
            </p>
            <p className="mt-1">
              Select another month using the period selector above, or log a maintenance or utility expense.
            </p>
            <div className="mt-4 flex items-center justify-center gap-2">
              {selectedMonth !== 'all' && (
                <button
                  onClick={() => setSelectedMonth('all')}
                  className="rounded-xl border border-[#d8c2aa] bg-[#faf7f2] px-3.5 py-1.5 text-xs font-semibold text-[#8b5a2b] hover:bg-[#f1e8dc]"
                >
                  View All Historical Expenses
                </button>
              )}
              <button
                onClick={onAddExpense}
                className="rounded-xl bg-[#8b5a2b] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#784b20]"
              >
                Log Expense
              </button>
            </div>
          </div>
        )
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[#ebe4da] bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-left text-xs">
              <thead className="border-b border-[#eee6dc] bg-[#faf7f2] font-semibold text-[#85899a]">
                <tr>
                  <th className="px-5 py-3.5">Description</th>
                  <th className="px-5 py-3.5">Category</th>
                  <th className="px-5 py-3.5">Date</th>
                  <th className="px-5 py-3.5">Amount</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eee6dc]">
                {displayedExpenses.map((e: Expense) => (
                  <tr key={e.id} className="hover:bg-[#fbf8f3] transition-colors">
                    <td className="px-5 py-4 font-bold text-[#3d3934]">{e.title}</td>
                    <td className="px-5 py-4 uppercase text-[10px] text-[#85899a]">{e.category}</td>
                    <td className="px-5 py-4 text-[#676b7d]">{new Date(e.expense_date).toLocaleDateString('en-IN')}</td>
                    <td className="px-5 py-4 font-bold text-[#b95c3c]">{currency(e.amount)}</td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => onEditExpense(e)}
                          className="rounded-lg p-1.5 text-[#a0a3af] hover:text-[#8b5a2b] hover:bg-[#faf7f2] transition-colors"
                          title="Edit expense"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                        <button
                          onClick={() => onDeleteExpense(e.id, e.title)}
                          className="rounded-lg p-1.5 text-[#a0a3af] hover:text-[#b95c3c] hover:bg-[#fff5f5] transition-colors"
                          title="Delete expense"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
})

const ComplaintsTab = memo(function ComplaintsTab({ complaints, onAddComplaint, onEditComplaint, onResolve, onDelete, searchQuery, onClearSearch }: any) {
  return (
    <div>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-[#2c221e]">Resident Complaints & Maintenance</h2>
          <p className="text-xs text-[#85899a]">Track repair tickets and resolve resident issues promptly.</p>
        </div>
        <button
          onClick={onAddComplaint}
          className="flex items-center gap-2 rounded-xl bg-[#8b5a2b] px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-[#784b20] transition-colors self-start sm:self-auto"
        >
          <Plus className="size-4" /> Log Complaint
        </button>
      </div>

      {complaints.length === 0 ? (
        searchQuery ? (
          <EmptySearchState query={searchQuery} onClear={onClearSearch} />
        ) : (
          <EmptyState
            title="No complaints logged"
            description="Everything is running smoothly! Log maintenance tickets when reported by residents."
            action={onAddComplaint}
            actionLabel="Log Ticket"
          />
        )
      ) : (
        <div className="grid gap-3">
          {complaints.map((c: Complaint) => (
            <div
              key={c.id}
              className="flex flex-col gap-4 rounded-2xl border border-[#ebe4da] bg-white p-5 shadow-sm sm:flex-row sm:items-center justify-between hover:border-[#d8cbbe] transition-all"
            >
              <div className="flex-1">
                <div className="mb-1.5 flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      c.priority === 'High' ? 'bg-[#fff0f0] text-[#d46d75]' : 'bg-[#fff7e7] text-[#c58a35]'
                    }`}
                  >
                    {c.priority} Priority
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      c.status === 'Resolved' ? 'bg-[#e7f7f0] text-[#328d68]' : 'bg-[#faf3ea] text-[#8b5a2b]'
                    }`}
                  >
                    {c.status}
                  </span>
                </div>
                <h4 className="text-sm font-bold text-[#3d3934]">{c.title}</h4>
                <p className="mt-1 text-xs text-[#85899a]">
                  Reported by {c.tenant} on {new Date(c.created_at).toLocaleDateString('en-IN')}
                </p>
                {c.description && <p className="mt-2 text-xs text-[#676b7d]">{c.description}</p>}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => onEditComplaint?.(c)}
                  className="rounded-lg p-2 text-[#a0a3af] hover:text-[#8b5a2b] hover:bg-[#faf7f2] transition-colors"
                  title="Edit ticket"
                >
                  <Pencil className="size-4" />
                </button>
                {c.status !== 'Resolved' && (
                  <button
                    onClick={() => onResolve(c.id)}
                    className="rounded-lg border border-[#8b5a2b] px-3.5 py-2 text-xs font-semibold text-[#784b20] hover:bg-[#fbf8f3] transition-colors"
                  >
                    Mark Resolved
                  </button>
                )}
                <button
                  onClick={() => onDelete(c.id, c.title)}
                  className="rounded-lg p-2 text-[#a0a3af] hover:text-[#b95c3c] hover:bg-[#fff5f5] transition-colors"
                  title="Delete ticket"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
})

const ReportsTab = memo(function ReportsTab({
  property,
  rooms = [],
  beds = [],
  tenants = [],
  payments = [],
  expenses = [],
  electricity = [],
  revenueMonth = 0,
  expensesMonth = 0,
  rentPending = 0,
  electricityPending = 0,
  locale = 'en',
}: any) {
  const HISTORICAL_START_YEAR = 2026
  const currentYear = new Date().getFullYear()
  const currentMonth = new Date().getMonth()
  const [selectedMonth, setSelectedMonth] = useState<number>(() => {
    return currentYear === 2026 ? Math.max(9, currentMonth) : currentMonth
  })
  const [selectedYear, setSelectedYear] = useState<number>(currentYear)
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'rent' | 'expenses' | 'electricity' | 'occupancy'>('overview')

  const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]

  const availableYears = useMemo(() => {
    const years: number[] = []
    const maxYear = Math.max(HISTORICAL_START_YEAR + 1, currentYear + 1)
    for (let yr = HISTORICAL_START_YEAR; yr <= maxYear; yr++) {
      years.push(yr)
    }
    return years
  }, [currentYear])

  const availableMonths = useMemo(() => {
    return MONTH_NAMES.map((name, idx) => ({ name, idx })).filter(({ idx }) => {
      if (selectedYear === 2026) {
        const hasOlderRecord =
          payments.some((p: PaymentRecord) => {
            const d = new Date(p.paid_at)
            return d.getFullYear() === 2026 && d.getMonth() === idx
          }) ||
          expenses.some((e: Expense) => {
            const d = new Date(e.expense_date)
            return d.getFullYear() === 2026 && d.getMonth() === idx
          }) ||
          electricity.some((el: ElectricityRecord) => {
            const { year, month } = getYearMonthFromDate(el.reading_date)
            return year === 2026 && month === idx
          })
        return idx >= 9 || hasOlderRecord
      }
      return true
    })
  }, [selectedYear, payments, expenses, electricity])

  const periodLabel = `${MONTH_NAMES[selectedMonth]} ${selectedYear}`
  const isCurrentMonth = selectedMonth === currentMonth && selectedYear === currentYear

  // 1. Scoped Monthly Rent Collections (from actual DB records)
  const monthPayments = useMemo(() => {
    return payments.filter((p: PaymentRecord) => {
      const d = new Date(p.paid_at)
      return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear
    })
  }, [payments, selectedMonth, selectedYear])

  const monthRevenue = useMemo(() => {
    return monthPayments.reduce((sum: number, p: PaymentRecord) => sum + (p.amount || 0), 0)
  }, [monthPayments])

  // 2. Scoped Monthly Operating Expenses (from actual DB records)
  const monthExpenses = useMemo(() => {
    return expenses.filter((e: Expense) => {
      const d = new Date(e.expense_date)
      return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear
    })
  }, [expenses, selectedMonth, selectedYear])

  const monthExpensesTotal = useMemo(() => {
    return monthExpenses.reduce((sum: number, e: Expense) => sum + (e.amount || 0), 0)
  }, [monthExpenses])

  // 3. Scoped Monthly Electricity Utility Charges (from actual DB records)
  const monthElectricity = useMemo(() => {
    return electricity.filter((el: ElectricityRecord) => {
      const { year, month } = getYearMonthFromDate(el.reading_date)
      return month === selectedMonth && year === selectedYear
    })
  }, [electricity, selectedMonth, selectedYear])

  const monthElectricityUnits = useMemo(() => {
    return monthElectricity.reduce((sum: number, el: ElectricityRecord) => {
      return sum + Math.max(0, el.current_reading - el.previous_reading)
    }, 0)
  }, [monthElectricity])

  const monthElectricityTotal = useMemo(() => {
    return monthElectricity.reduce((sum: number, el: ElectricityRecord) => {
      const units = Math.max(0, el.current_reading - el.previous_reading)
      return sum + units * (el.rate_per_unit || 10)
    }, 0)
  }, [monthElectricity])

  // 4. Pending Rent for the period
  const monthPendingRent = useMemo(() => {
    if (isCurrentMonth) return rentPending
    const activeTenants = tenants.filter((t: Tenant) => t.status !== 'Vacated')
    const totalExpected = activeTenants.reduce((sum: number, t: Tenant) => sum + (t.rent || 0), 0)
    return Math.max(0, totalExpected - monthRevenue)
  }, [isCurrentMonth, rentPending, tenants, monthRevenue])

  // 5. Net Cashflow / Operating Income
  const netCashflow = monthRevenue - monthExpensesTotal

  // 6. Rent Collection Rate
  const totalExpectedRent = monthRevenue + monthPendingRent
  const collectionRate = totalExpectedRent > 0 ? Math.min(100, Math.round((monthRevenue / totalExpectedRent) * 100)) : 100

  // 7. Overall Occupancy Rate
  const totalCapacity = useMemo(() => {
    return rooms.reduce((sum: number, r: Room) => sum + getRoomMaxCapacity(r.room_type), 0)
  }, [rooms])

  const totalOccupants = useMemo(() => {
    return tenants.filter((t: Tenant) => t.status !== 'Vacated').length
  }, [tenants])

  const occupancyRate = totalCapacity > 0 ? Math.min(100, Math.round((totalOccupants / totalCapacity) * 100)) : 0

  // 8. Expense Breakdown by Category
  const expenseCategories = useMemo(() => {
    const map = new Map<string, number>()
    monthExpenses.forEach((e: Expense) => {
      const cat = e.category || 'General'
      map.set(cat, (map.get(cat) || 0) + (e.amount || 0))
    })
    return Array.from(map.entries()).map(([category, amount]) => ({
      category,
      amount,
      pct: monthExpensesTotal > 0 ? Math.round((amount / monthExpensesTotal) * 100) : 0,
    })).sort((a, b) => b.amount - a.amount)
  }, [monthExpenses, monthExpensesTotal])

  const handleDownloadPdf = () => {
    window.print()
  }

  return (
    <div className="space-y-6">
      {/* Screen Controls Header (Hidden in Print) */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 no-print">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight text-[#2c221e]">Property Analytics & Reports</h2>
            <span className="rounded-full bg-[#faf0e6] border border-[#d8c2aa] px-2.5 py-0.5 text-[11px] font-bold text-[#8b5a2b]">
              {property.name || 'Selected Property'}
            </span>
          </div>
          <p className="text-xs text-[#85899a] mt-0.5">
            Official monthly statement, financial ledger, and room occupancy records.
          </p>
        </div>

        {/* Month/Year Selectors & PDF Download Action */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-xl border border-[#d8c2aa] bg-white p-1 shadow-2xs">
            <Calendar className="size-3.5 text-[#8b5a2b] ml-1.5" />
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="bg-transparent font-semibold text-xs text-[#2c221e] outline-none cursor-pointer py-1 pr-1"
            >
              {availableMonths.map(({ name, idx }) => (
                <option key={name} value={idx}>
                  {name}
                </option>
              ))}
            </select>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="bg-transparent font-semibold text-xs text-[#2c221e] outline-none cursor-pointer py-1 pr-1"
            >
              {availableYears.map((yr) => (
                <option key={yr} value={yr}>
                  {yr}
                </option>
              ))}
            </select>
          </div>

          {!isCurrentMonth && (
            <button
              onClick={() => {
                setSelectedMonth(currentMonth)
                setSelectedYear(currentYear)
              }}
              className="rounded-xl border border-[#d8c2aa] bg-white px-3 py-2 text-xs font-semibold text-[#8b5a2b] hover:bg-[#faf4ed] transition-colors"
              title="Jump to current active month"
            >
              Current Month
            </button>
          )}

          <button
            onClick={handleDownloadPdf}
            className="flex items-center gap-1.5 rounded-xl bg-[#8b5a2b] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#784b20] transition-colors"
            title="Download report as PDF or Print"
          >
            <Download className="size-3.5" /> Download PDF / Print
          </button>
        </div>
      </div>

      {/* Screen View: Executive Financial KPI Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 no-print">
        <div className="rounded-2xl border border-[#e8dfd4] bg-white p-5 shadow-2xs">
          <p className="text-xs font-medium text-[#85899a]">Rent Collected ({periodLabel})</p>
          <p className="mt-1 text-2xl font-bold text-[#328d68]">{currency(monthRevenue)}</p>
          <p className="mt-1 text-[11px] text-[#74798a]">{monthPayments.length} payment(s) confirmed</p>
        </div>

        <div className="rounded-2xl border border-[#e8dfd4] bg-white p-5 shadow-2xs">
          <p className="text-xs font-medium text-[#85899a]">Operating Expenses ({periodLabel})</p>
          <p className="mt-1 text-2xl font-bold text-[#b95c3c]">{currency(monthExpensesTotal)}</p>
          <p className="mt-1 text-[11px] text-[#74798a]">{monthExpenses.length} expense entry(ies)</p>
        </div>

        <div className="rounded-2xl border border-[#e8dfd4] bg-white p-5 shadow-2xs">
          <p className="text-xs font-medium text-[#85899a]">Net Operating Cashflow</p>
          <p className={`mt-1 text-2xl font-bold ${netCashflow >= 0 ? 'text-[#3d3934]' : 'text-[#b95c3c]'}`}>
            {currency(netCashflow)}
          </p>
          <span className={`inline-block mt-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
            netCashflow >= 0 ? 'bg-[#eaf5ea] text-[#2e7d32]' : 'bg-[#ffebe8] text-[#b95c3c]'
          }`}>
            {netCashflow >= 0 ? 'Operating Surplus' : 'Operating Deficit'}
          </span>
        </div>

        <div className="rounded-2xl border border-[#e8dfd4] bg-white p-5 shadow-2xs">
          <p className="text-xs font-medium text-[#85899a]">Pending Rent Dues</p>
          <p className="mt-1 text-2xl font-bold text-[#b46b1a]">{currency(monthPendingRent)}</p>
          <p className="mt-1 text-[11px] text-[#74798a]">{collectionRate}% collection rate</p>
        </div>

        <div className="rounded-2xl border border-[#e8dfd4] bg-white p-5 shadow-2xs">
          <p className="text-xs font-medium text-[#85899a]">Electricity Utilities</p>
          <p className="mt-1 text-2xl font-bold text-[#44485a]">{currency(monthElectricityTotal)}</p>
          <p className="mt-1 text-[11px] text-[#74798a]">{monthElectricityUnits} units billed</p>
        </div>
      </div>

      {/* Sub-tab Navigation (Screen only) */}
      <div className="flex items-center gap-1.5 border-b border-[#e8dfd4] pb-2 text-xs font-semibold overflow-x-auto no-print">
        <button
          onClick={() => setActiveSubTab('overview')}
          className={`rounded-xl px-3.5 py-2 transition-colors shrink-0 ${
            activeSubTab === 'overview'
              ? 'bg-[#8b5a2b] text-white shadow-2xs'
              : 'text-[#6a635b] hover:bg-[#faf7f2]'
          }`}
        >
          Executive Summary & P&L
        </button>
        <button
          onClick={() => setActiveSubTab('rent')}
          className={`rounded-xl px-3.5 py-2 transition-colors shrink-0 ${
            activeSubTab === 'rent'
              ? 'bg-[#8b5a2b] text-white shadow-2xs'
              : 'text-[#6a635b] hover:bg-[#faf7f2]'
          }`}
        >
          Rent Collections ({monthPayments.length})
        </button>
        <button
          onClick={() => setActiveSubTab('expenses')}
          className={`rounded-xl px-3.5 py-2 transition-colors shrink-0 ${
            activeSubTab === 'expenses'
              ? 'bg-[#8b5a2b] text-white shadow-2xs'
              : 'text-[#6a635b] hover:bg-[#faf7f2]'
          }`}
        >
          Operating Expenses ({monthExpenses.length})
        </button>
        <button
          onClick={() => setActiveSubTab('electricity')}
          className={`rounded-xl px-3.5 py-2 transition-colors shrink-0 ${
            activeSubTab === 'electricity'
              ? 'bg-[#8b5a2b] text-white shadow-2xs'
              : 'text-[#6a635b] hover:bg-[#faf7f2]'
          }`}
        >
          Electricity Utilities ({monthElectricity.length})
        </button>
        <button
          onClick={() => setActiveSubTab('occupancy')}
          className={`rounded-xl px-3.5 py-2 transition-colors shrink-0 ${
            activeSubTab === 'occupancy'
              ? 'bg-[#8b5a2b] text-white shadow-2xs'
              : 'text-[#6a635b] hover:bg-[#faf7f2]'
          }`}
        >
          Room Occupancy ({rooms.length})
        </button>
      </div>

      {/* Screen Sub-Tab 1: Executive Summary & P&L */}
      {activeSubTab === 'overview' && (
        <div className="grid gap-6 lg:grid-cols-2 no-print">
          {/* P&L Statement Card */}
          <div className="rounded-2xl border border-[#e8dfd4] bg-white p-6 shadow-sm">
            <h3 className="text-sm font-bold text-[#3d3934]">Profit & Loss Statement ({periodLabel})</h3>
            <p className="mt-0.5 text-xs text-[#85899a]">Summary of verified revenue inflows and operating outflows.</p>

            <div className="mt-5 divide-y divide-[#f0f1f4] text-xs">
              <div className="py-2.5 flex items-center justify-between">
                <span className="font-semibold text-[#3d3934]">Gross Rent Collections</span>
                <span className="font-bold text-[#328d68]">{currency(monthRevenue)}</span>
              </div>
              <div className="py-2.5 flex items-center justify-between">
                <span className="text-[#676b7d]">Electricity & Utility Billings</span>
                <span className="font-semibold text-[#44485a]">{currency(monthElectricityTotal)}</span>
              </div>
              <div className="py-2.5 flex items-center justify-between">
                <span className="text-[#b95c3c]">Total Operating Expenses</span>
                <span className="font-bold text-[#b95c3c]">-{currency(monthExpensesTotal)}</span>
              </div>
              <div className="py-3 flex items-center justify-between font-bold text-sm bg-[#faf8f5] -mx-6 px-6 border-t border-b border-[#e8dfd4]">
                <span className="text-[#2c221e]">Net Operating Surplus / Deficit</span>
                <span className={netCashflow >= 0 ? 'text-[#328d68]' : 'text-[#b95c3c]'}>
                  {currency(netCashflow)}
                </span>
              </div>
              <div className="py-2.5 flex items-center justify-between text-[#85899a]">
                <span>Uncollected / Pending Rent</span>
                <span className="font-semibold text-[#b46b1a]">{currency(monthPendingRent)}</span>
              </div>
            </div>
          </div>

          {/* Operational Metrics & Expense Breakdown */}
          <div className="rounded-2xl border border-[#e8dfd4] bg-white p-6 shadow-sm flex flex-col justify-between">
            <div>
              <h3 className="text-sm font-bold text-[#3d3934]">Operating Ratios & Capacity</h3>
              <p className="mt-0.5 text-xs text-[#85899a]">Core business performance indicators.</p>

              <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-xl border border-[#ebe4da] bg-[#faf8f5] p-3.5">
                  <span className="text-[#85899a] block">Occupancy Rate</span>
                  <span className="mt-1 text-lg font-bold text-[#2c221e]">{occupancyRate}%</span>
                  <span className="text-[11px] text-[#74798a] block mt-0.5">{totalOccupants} / {totalCapacity} beds filled</span>
                </div>
                <div className="rounded-xl border border-[#ebe4da] bg-[#faf8f5] p-3.5">
                  <span className="text-[#85899a] block">Collection Efficiency</span>
                  <span className="mt-1 text-lg font-bold text-[#2c221e]">{collectionRate}%</span>
                  <span className="text-[11px] text-[#74798a] block mt-0.5">Rent recovered on time</span>
                </div>
              </div>

              {/* Expense Category Breakdown */}
              <div className="mt-5">
                <h4 className="text-xs font-bold text-[#3d3934] mb-2.5">Expenses by Category</h4>
                {expenseCategories.length === 0 ? (
                  <p className="text-xs text-[#85899a] italic">No expenses logged in this period.</p>
                ) : (
                  <div className="space-y-2">
                    {expenseCategories.slice(0, 4).map((c) => (
                      <div key={c.category} className="flex items-center justify-between text-xs">
                        <span className="capitalize text-[#44485a] font-medium">{c.category}</span>
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-[#2c221e]">{currency(c.amount)}</span>
                          <span className="text-[10px] text-[#85899a] w-8 text-right">({c.pct}%)</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-5 pt-3 border-t border-[#f0f1f4] flex items-center justify-between text-xs">
              <span className="text-[#85899a]">Need official documentation?</span>
              <button
                onClick={handleDownloadPdf}
                className="font-semibold text-[#8b5a2b] hover:underline flex items-center gap-1"
              >
                <Printer className="size-3.5" /> Print Statement
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Screen Sub-Tab 2: Monthly Rent Ledger */}
      {activeSubTab === 'rent' && (
        <div className="rounded-2xl border border-[#e8dfd4] bg-white shadow-sm overflow-hidden no-print">
          <div className="p-5 border-b border-[#eee6dc] bg-[#faf8f5] flex items-center justify-between">
            <div>
              <h3 className="font-bold text-sm text-[#2c221e]">Monthly Rent Collections — {periodLabel}</h3>
              <p className="text-xs text-[#85899a]">Total collections: {currency(monthRevenue)} across {monthPayments.length} payment(s)</p>
            </div>
          </div>

          {monthPayments.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#85899a]">
              No rent collections recorded for {periodLabel}.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-left text-xs">
                <thead className="border-b border-[#eee6dc] bg-[#faf7f2] font-semibold text-[#85899a]">
                  <tr>
                    <th className="px-5 py-3.5">Receipt #</th>
                    <th className="px-5 py-3.5">Resident</th>
                    <th className="px-5 py-3.5">Payment Method</th>
                    <th className="px-5 py-3.5">Paid At</th>
                    <th className="px-5 py-3.5 font-bold text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eee6dc]">
                  {monthPayments.map((p: PaymentRecord) => (
                    <tr key={p.id} className="hover:bg-[#fbf8f3] transition-colors">
                      <td className="px-5 py-3.5 font-mono text-[11px] font-bold text-[#676b7d]">
                        REC-{p.id.slice(0, 8).toUpperCase()}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="font-bold text-[#3d3934]">{p.tenant_name}</span>
                        <span className="text-[#85899a] ml-1.5">(Room {p.room_number})</span>
                      </td>
                      <td className="px-5 py-3.5 uppercase text-[10px] text-[#85899a] font-semibold">{p.payment_method}</td>
                      <td className="px-5 py-3.5 text-[#555a6c]">
                        {formatPaymentTimestamp(p.paid_at, 'Asia/Kolkata', locale)}
                      </td>
                      <td className="px-5 py-3.5 font-bold text-emerald-700 text-right">{currency(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Screen Sub-Tab 3: Operating Expenses Ledger */}
      {activeSubTab === 'expenses' && (
        <div className="rounded-2xl border border-[#e8dfd4] bg-white shadow-sm overflow-hidden no-print">
          <div className="p-5 border-b border-[#eee6dc] bg-[#faf8f5] flex items-center justify-between">
            <div>
              <h3 className="font-bold text-sm text-[#2c221e]">Monthly Operating Expenses — {periodLabel}</h3>
              <p className="text-xs text-[#85899a]">Total expenses: {currency(monthExpensesTotal)} across {monthExpenses.length} record(s)</p>
            </div>
          </div>

          {monthExpenses.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#85899a]">
              No operating expenses recorded for {periodLabel}.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-left text-xs">
                <thead className="border-b border-[#eee6dc] bg-[#faf7f2] font-semibold text-[#85899a]">
                  <tr>
                    <th className="px-5 py-3.5">Description</th>
                    <th className="px-5 py-3.5">Category</th>
                    <th className="px-5 py-3.5">Expense Date</th>
                    <th className="px-5 py-3.5">Notes</th>
                    <th className="px-5 py-3.5 font-bold text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eee6dc]">
                  {monthExpenses.map((e: Expense) => (
                    <tr key={e.id} className="hover:bg-[#fbf8f3] transition-colors">
                      <td className="px-5 py-3.5 font-bold text-[#3d3934]">{e.title}</td>
                      <td className="px-5 py-3.5 uppercase text-[10px] text-[#85899a] font-semibold">{e.category}</td>
                      <td className="px-5 py-3.5 text-[#555a6c]">
                        {new Date(e.expense_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-5 py-3.5 text-[#85899a] text-[11px]">{e.notes || '—'}</td>
                      <td className="px-5 py-3.5 font-bold text-rose-700 text-right">{currency(e.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Screen Sub-Tab 4: Electricity Utility Charges */}
      {activeSubTab === 'electricity' && (
        <div className="rounded-2xl border border-[#e8dfd4] bg-white shadow-sm overflow-hidden no-print">
          <div className="p-5 border-b border-[#eee6dc] bg-[#faf8f5] flex items-center justify-between">
            <div>
              <h3 className="font-bold text-sm text-[#2c221e]">Monthly Electricity Charges — {periodLabel}</h3>
              <p className="text-xs text-[#85899a]">Total utility: {currency(monthElectricityTotal)} ({monthElectricityUnits} units)</p>
            </div>
          </div>

          {monthElectricity.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#85899a]">
              No electricity readings logged for {periodLabel}.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-left text-xs">
                <thead className="border-b border-[#eee6dc] bg-[#faf7f2] font-semibold text-[#85899a]">
                  <tr>
                    <th className="px-5 py-3.5">Meter / Room</th>
                    <th className="px-5 py-3.5">Prev (kWh)</th>
                    <th className="px-5 py-3.5">Curr (kWh)</th>
                    <th className="px-5 py-3.5">Units</th>
                    <th className="px-5 py-3.5">Rate / Unit</th>
                    <th className="px-5 py-3.5 font-bold text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eee6dc]">
                  {monthElectricity.map((el: ElectricityRecord) => {
                    const units = Math.max(0, el.current_reading - el.previous_reading)
                    const total = units * el.rate_per_unit
                    return (
                      <tr key={el.id} className="hover:bg-[#fbf8f3] transition-colors">
                        <td className="px-5 py-3.5 font-bold text-[#3d3934]">
                          {el.room_id ? `Room ${el.room}` : 'General Meter'}
                        </td>
                        <td className="px-5 py-3.5 text-[#555a6c]">{el.previous_reading}</td>
                        <td className="px-5 py-3.5 text-[#555a6c]">{el.current_reading}</td>
                        <td className="px-5 py-3.5 font-semibold text-[#784b20]">{units}</td>
                        <td className="px-5 py-3.5 text-[#555a6c]">{currency(el.rate_per_unit)}</td>
                        <td className="px-5 py-3.5 font-bold text-[#44485a] text-right">{currency(total)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Screen Sub-Tab 5: Room Occupancy */}
      {activeSubTab === 'occupancy' && (
        <div className="rounded-2xl border border-[#e8dfd4] bg-white p-6 shadow-sm no-print">
          <div className="flex items-center justify-between pb-4 border-b border-[#f0f1f4]">
            <div>
              <h3 className="text-sm font-bold text-[#3d3934]">Room Occupancy Distribution</h3>
              <p className="mt-0.5 text-xs text-[#85899a]">Overall Occupancy: {occupancyRate}% ({totalOccupants} residents across {totalCapacity} total beds)</p>
            </div>
          </div>
          <div className="mt-4 divide-y divide-[#f0f1f4]">
            {rooms.map((r: Room) => {
              const cap = getRoomMaxCapacity(r.room_type)
              const count = tenants.filter((t: Tenant) => t.room_id === r.id && t.status !== 'Vacated').length
              const pct = Math.min(100, Math.round((count / cap) * 100))
              return (
                <div key={r.id} className="py-3 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-[#3d3934]">Room {r.room_number}</span>
                    <span className="ml-2 text-[#85899a]">({r.room_type})</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-28 bg-[#eee6dc] rounded-full h-2 overflow-hidden">
                      <div className="bg-[#8b5a2b] h-full" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="font-semibold text-[#555a6c] w-20 text-right">
                      {count} / {cap} ({pct}%)
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* Printable PDF Document View (Rendered exclusively for window.print())     */}
      {/* ========================================================================= */}
      <div className="print-only">
        {/* Printable Header */}
        <div className="border-b-2 border-[#2c221e] pb-4 mb-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-[#2c221e]">BaseraBook SaaS</h1>
              <p className="text-xs text-[#555a6c]">Official Monthly Operations & Financial Statement</p>
            </div>
            <div className="text-right text-xs">
              <span className="font-bold text-sm block text-[#2c221e]">{property.name || 'Rental Property'}</span>
              <span className="text-[#555a6c] block">{property.address || 'Address on file'}</span>
              {property.contact && <span className="text-[#555a6c] block">Contact: {property.contact}</span>}
            </div>
          </div>
          <div className="mt-3 flex justify-between items-center text-xs font-semibold bg-[#faf8f5] p-2.5 rounded border border-[#e8dfd4]">
            <span>Statement Period: {periodLabel}</span>
            <span>Generated on: {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
          </div>
        </div>

        {/* Financial Summary Table */}
        <div className="mb-6 print-break-inside-avoid">
          <h2 className="text-sm font-bold text-[#2c221e] mb-2 uppercase tracking-wide">1. Executive Financial Summary</h2>
          <table className="print-table text-xs">
            <tbody>
              <tr>
                <td className="font-semibold bg-[#faf7f2]">Gross Rent Collected:</td>
                <td className="font-bold text-emerald-800">{currency(monthRevenue)}</td>
                <td className="font-semibold bg-[#faf7f2]">Confirmed Payments:</td>
                <td>{monthPayments.length} transactions</td>
              </tr>
              <tr>
                <td className="font-semibold bg-[#faf7f2]">Total Operating Expenses:</td>
                <td className="font-bold text-rose-800">{currency(monthExpensesTotal)}</td>
                <td className="font-semibold bg-[#faf7f2]">Logged Expenses:</td>
                <td>{monthExpenses.length} entries</td>
              </tr>
              <tr>
                <td className="font-semibold bg-[#faf7f2]">Net Operating Income (NOI):</td>
                <td className="font-bold">{currency(netCashflow)}</td>
                <td className="font-semibold bg-[#faf7f2]">Cashflow Status:</td>
                <td>{netCashflow >= 0 ? 'Surplus' : 'Deficit'}</td>
              </tr>
              <tr>
                <td className="font-semibold bg-[#faf7f2]">Pending Rent Dues:</td>
                <td className="font-bold text-amber-800">{currency(monthPendingRent)}</td>
                <td className="font-semibold bg-[#faf7f2]">Collection Efficiency:</td>
                <td>{collectionRate}%</td>
              </tr>
              <tr>
                <td className="font-semibold bg-[#faf7f2]">Electricity & Utilities:</td>
                <td>{currency(monthElectricityTotal)} ({monthElectricityUnits} units)</td>
                <td className="font-semibold bg-[#faf7f2]">Portfolio Occupancy:</td>
                <td>{occupancyRate}% ({totalOccupants}/{totalCapacity} beds)</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Itemized Rent Collections */}
        <div className="mb-6 print-break-inside-avoid">
          <h2 className="text-sm font-bold text-[#2c221e] mb-2 uppercase tracking-wide">
            2. Rent Collections Ledger ({monthPayments.length} entries)
          </h2>
          {monthPayments.length === 0 ? (
            <p className="text-xs text-[#85899a] italic">No rent payments recorded for {periodLabel}.</p>
          ) : (
            <table className="print-table text-xs">
              <thead>
                <tr className="bg-[#faf7f2] font-semibold">
                  <th>Receipt #</th>
                  <th>Resident</th>
                  <th>Room</th>
                  <th>Method</th>
                  <th>Payment Date</th>
                  <th className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {monthPayments.map((p: PaymentRecord) => (
                  <tr key={p.id}>
                    <td className="font-mono text-[10px]">REC-{p.id.slice(0, 8).toUpperCase()}</td>
                    <td className="font-semibold">{p.tenant_name}</td>
                    <td>Room {p.room_number}</td>
                    <td className="uppercase text-[10px]">{p.payment_method}</td>
                    <td>{formatPaymentTimestamp(p.paid_at, 'Asia/Kolkata', locale)}</td>
                    <td className="text-right font-bold text-emerald-800">{currency(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Itemized Expenses */}
        <div className="mb-6 print-break-inside-avoid">
          <h2 className="text-sm font-bold text-[#2c221e] mb-2 uppercase tracking-wide">
            3. Operating Expenses Ledger ({monthExpenses.length} entries)
          </h2>
          {monthExpenses.length === 0 ? (
            <p className="text-xs text-[#85899a] italic">No operating expenses recorded for {periodLabel}.</p>
          ) : (
            <table className="print-table text-xs">
              <thead>
                <tr className="bg-[#faf7f2] font-semibold">
                  <th>Description</th>
                  <th>Category</th>
                  <th>Date</th>
                  <th>Notes</th>
                  <th className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {monthExpenses.map((e: Expense) => (
                  <tr key={e.id}>
                    <td className="font-semibold">{e.title}</td>
                    <td className="uppercase text-[10px]">{e.category}</td>
                    <td>{new Date(e.expense_date).toLocaleDateString('en-IN')}</td>
                    <td>{e.notes || '—'}</td>
                    <td className="text-right font-bold text-rose-800">{currency(e.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Printable Footer / Signoff */}
        <div className="mt-10 pt-4 border-t border-[#d1d5db] flex justify-between items-end text-[11px] text-[#676b7d] print-break-inside-avoid">
          <div>
            <p className="font-semibold text-[#2c221e]">BaseraBook SaaS Property Management</p>
            <p>Confidential operational report for property owner records.</p>
          </div>
          <div className="text-right">
            <p className="font-semibold">Authorized Signatory / Property Owner</p>
            <div className="mt-8 border-b border-[#2c221e] w-48 ml-auto" />
          </div>
        </div>
      </div>
    </div>
  )
})

const SettingsTab = memo(function SettingsTab({
  userName,
  userEmail,
  property,
  properties = [],
  selectedPropertyId,
  onSelectProperty,
  onAddProperty,
  onEditProperty,
  onEditSpecificProperty,
  onDeleteProperty,
  trialStart,
  trialEnd,
  daysRemaining,
  hoursRemaining,
  isEndingSoon,
  isTrialExpired,
  subscriptionPlan,
  subscriptionStatus = 'trialing',
  ownerPaymentDetails = { upiId: '', paymentLink: '', qrCodeUrl: '' },
  setOwnerPaymentDetails,
  onSavePaymentDetails,
  onQrImageUpload,
  isSavingPaymentDetails,
  isDecodingQr = false,
  paymentValidationErrors = {},
  setPaymentValidationErrors,
  paymentSuccessMessage = '',
  onViewPlans,
  onSignOut,
  entitlement,
}: any) {
  const isPaymentConfigured = Boolean(
    (ownerPaymentDetails?.upiId && validateUpiId(ownerPaymentDetails.upiId).isValid) ||
    (ownerPaymentDetails?.paymentLink && validatePaymentLink(ownerPaymentDetails.paymentLink).isValid) ||
    ownerPaymentDetails?.qrCodeUrl
  )

  return (
    <div className="max-w-2xl space-y-6">
      <div className="rounded-2xl border border-[#e9ebf0] bg-white p-6 shadow-sm">
        <h3 className="text-base font-bold text-[#3d3934]">Account Profile</h3>
        <p className="text-xs text-[#85899a]">Authenticated owner profile details.</p>
        <div className="mt-5 space-y-3 text-xs">
          <div>
            <p className="text-[#999daa]">Role</p>
            <p className="font-semibold text-[#44485a]">Property Owner (Customer Workspace)</p>
          </div>
          <div>
            <p className="text-[#999daa]">Name</p>
            <p className="font-semibold text-[#44485a]">{userName}</p>
          </div>
          <div>
            <p className="text-[#999daa]">Email</p>
            <p className="font-semibold text-[#44485a] break-all">{userEmail}</p>
          </div>
        </div>
      </div>

      {/* 2. Resident Payment Options (UPI ID, Link, QR Code) */}
      <div id="payment-options-settings" className="rounded-2xl border border-[#ebe4da] bg-white p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2.5 text-[#8b5a2b]">
            <QrCode className="size-5" />
            <div>
              <h3 className="text-base font-bold text-[#3d3934]">Payment QR Code & UPI Link</h3>
              <p className="text-xs text-[#85899a]">
                Auto-included in payment-due reminders sent to your residents via WhatsApp & SMS.
              </p>
            </div>
          </div>
          {isPaymentConfigured ? (
            <span className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-full bg-[#f0fbf5] border border-[#a3e4be] px-2.5 py-0.5 text-[10px] font-bold text-[#236b4e]">
              <CheckCircle2 className="size-3.5" />
              Configured
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-full bg-[#fff4e5] border border-[#f5c285] px-2.5 py-0.5 text-[10px] font-bold text-[#b46b1a]">
              <AlertCircle className="size-3.5" />
              Setup Needed
            </span>
          )}
        </div>

        {paymentSuccessMessage && (
          <div className="mt-4 rounded-xl border border-[#a3e4be] bg-[#f0fbf5] p-3 text-xs text-[#236b4e] flex items-center gap-2 font-medium">
            <CheckCircle2 className="size-4 shrink-0 text-[#236b4e]" />
            <span>{paymentSuccessMessage}</span>
          </div>
        )}

        {paymentValidationErrors?.general && (
          <div className="mt-4 rounded-xl border border-[#ffc9c1] bg-[#fff0e9] p-3 text-xs text-[#b95c3c] flex items-center gap-2 font-medium">
            <AlertCircle className="size-4 shrink-0 text-[#b95c3c]" />
            <span>{paymentValidationErrors.general}</span>
          </div>
        )}

        <form onSubmit={onSavePaymentDetails} className="mt-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#555a6c]">
              UPI ID / VPA
            </label>
            <p className="text-[11px] text-[#85899a] mb-1.5">Residents can pay directly using Google Pay, PhonePe, Paytm, or BHIM.</p>
            <input
              type="text"
              placeholder="e.g. yourname@okhdfcbank or 9876543210@paytm"
              value={ownerPaymentDetails?.upiId || ''}
              onChange={(e) => {
                setOwnerPaymentDetails?.((prev: any) => ({ ...prev, upiId: e.target.value }))
                setPaymentValidationErrors?.((prev: any) => ({ ...prev, upiId: undefined, general: undefined }))
              }}
              className={`w-full rounded-xl border bg-white px-3 py-2.5 text-sm font-normal text-[#3d3934] outline-none transition-colors ${
                paymentValidationErrors?.upiId
                  ? 'border-[#b95c3c] focus:border-[#b95c3c] focus:ring-1 focus:ring-[#b95c3c]'
                  : 'border-[#e4e6ec] focus:border-[#8b5a2b] focus:ring-1 focus:ring-[#8b5a2b]'
              }`}
            />
            {paymentValidationErrors?.upiId && (
              <p className="mt-1.5 text-xs text-[#b95c3c] flex items-center gap-1 font-medium">
                <AlertCircle className="size-3.5 shrink-0" />
                {paymentValidationErrors.upiId}
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#555a6c]">
              Payment Link (Optional)
            </label>
            <p className="text-[11px] text-[#85899a] mb-1.5">Online payment or gateway collection URL (e.g. Razorpay, Paytm link, or UPI deep link).</p>
            <input
              type="text"
              placeholder="e.g. https://rzp.io/l/yourpgrent or upi://pay?pa=..."
              value={ownerPaymentDetails?.paymentLink || ''}
              onChange={(e) => {
                setOwnerPaymentDetails?.((prev: any) => ({ ...prev, paymentLink: e.target.value }))
                setPaymentValidationErrors?.((prev: any) => ({ ...prev, paymentLink: undefined, general: undefined }))
              }}
              className={`w-full rounded-xl border bg-white px-3 py-2.5 text-sm font-normal text-[#3d3934] outline-none transition-colors ${
                paymentValidationErrors?.paymentLink
                  ? 'border-[#b95c3c] focus:border-[#b95c3c] focus:ring-1 focus:ring-[#b95c3c]'
                  : 'border-[#e4e6ec] focus:border-[#8b5a2b] focus:ring-1 focus:ring-[#8b5a2b]'
              }`}
            />
            {paymentValidationErrors?.paymentLink && (
              <p className="mt-1.5 text-xs text-[#b95c3c] flex items-center gap-1 font-medium">
                <AlertCircle className="size-3.5 shrink-0" />
                {paymentValidationErrors.paymentLink}
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#555a6c]">
              UPI QR Code Image
            </label>
            <p className="text-[11px] text-[#85899a] mb-2">
              Upload your UPI QR code image (PNG, JPG, WebP, or SVG). BaseraBook automatically verifies readability and embeds it into resident self-service links.
            </p>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <label className="inline-flex items-center gap-2 rounded-xl border border-[#e8dfd4] bg-[#faf7f2] px-4 py-2 text-xs font-semibold text-[#784b20] hover:bg-[#f3ede3] transition-colors cursor-pointer shadow-xs disabled:opacity-60">
                {isDecodingQr ? <Loader2 className="size-4 animate-spin text-[#8b5a2b]" /> : <Upload className="size-4" />}
                {isDecodingQr ? 'Verifying & Scanning QR...' : 'Upload QR Image'}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  onChange={onQrImageUpload}
                  disabled={isDecodingQr}
                  className="hidden"
                />
              </label>

              {ownerPaymentDetails?.qrCodeUrl && (
                <button
                  type="button"
                  onClick={() => {
                    setOwnerPaymentDetails?.((prev: any) => ({ ...prev, qrCodeUrl: '' }))
                    setPaymentValidationErrors?.((prev: any) => ({ ...prev, qrCode: undefined }))
                  }}
                  className="text-xs font-medium text-[#b95c3c] hover:underline"
                >
                  Remove QR Image
                </button>
              )}
            </div>

            {paymentValidationErrors?.qrCode && (
              <p className="mt-1.5 text-xs text-[#b95c3c] flex items-center gap-1 font-medium">
                <AlertCircle className="size-3.5 shrink-0" />
                {paymentValidationErrors.qrCode}
              </p>
            )}

            {ownerPaymentDetails?.qrCodeUrl && (
              <div className="mt-3 flex items-center gap-3 rounded-xl border border-[#a3e4be] bg-[#f0fbf5] p-3 w-fit">
                <img
                  src={ownerPaymentDetails.qrCodeUrl}
                  alt="Saved UPI QR Code Preview"
                  className="size-24 rounded-lg border border-[#e8dfd4] bg-white object-contain p-1 shadow-2xs"
                />
                <div className="text-xs">
                  <p className="font-semibold text-[#236b4e] flex items-center gap-1">
                    <CheckCircle2 className="size-3.5 text-[#236b4e]" />
                    Verified Active QR Code
                  </p>
                  <p className="text-[11px] text-[#676b7d] mt-0.5">Ready to be shared with residents</p>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-[#e8dfd4] bg-[#faf7f2] p-3 text-[11px] text-[#676b7d] flex items-start gap-2">
            <Sparkles className="size-4 text-[#8b5a2b] shrink-0 mt-0.5" />
            <span>
              <strong>Smart Reminders:</strong> When you send rent or utility payment-due reminders from the Residents tab, BaseraBook will automatically attach your verified UPI ID, Payment Link, and QR details. If not set, reminders are sent cleanly without payment info.
            </span>
          </div>

          <button
            type="submit"
            disabled={isSavingPaymentDetails || isDecodingQr}
            className="flex items-center justify-center gap-2 rounded-xl bg-[#8b5a2b] px-5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-[#784b20] disabled:opacity-60 transition-colors"
          >
            {isSavingPaymentDetails ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
            {isSavingPaymentDetails ? 'Saving Payment Details...' : 'Save Payment Details'}
          </button>
        </form>
      </div>

      <div className="rounded-2xl border border-[#e9ebf0] bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-[#3d3934]">Properties & Locations</h3>
            <p className="text-xs text-[#85899a]">
              Manage multi-branch hostels, apartments, societies, and PG properties.
            </p>
          </div>
          <button
            onClick={onAddProperty}
            className="flex items-center gap-1.5 rounded-lg bg-[#8b5a2b] px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-[#784b20] transition-colors"
          >
            <Plus className="size-3.5" />
            Add Property
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {(!properties || properties.length === 0) ? (
            <div className="rounded-xl border border-[#eee6dc] bg-[#faf7f2] p-4 text-center">
              <p className="text-xs font-semibold text-[#676b7d]">No properties configured yet.</p>
              <button
                onClick={onAddProperty}
                className="mt-2 text-xs font-bold text-[#8b5a2b] hover:underline"
              >
                + Set Up Your First Property
              </button>
            </div>
          ) : (
            properties.map((p: any) => {
              const isActive = (selectedPropertyId && p.id === selectedPropertyId) || (!selectedPropertyId && p.id === property?.id)
              return (
                <div
                  key={p.id}
                  className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border p-4 transition-all ${
                    isActive
                      ? 'border-[#8b5a2b] bg-[#fbf8f3] shadow-2xs'
                      : 'border-[#e8dfd4] bg-white hover:border-[#cfb79f]'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-[#3d3934]">{p.name}</span>
                      {isActive ? (
                        <span className="rounded-md bg-[#8b5a2b] px-2 py-0.5 text-[10px] font-bold text-white uppercase tracking-wider">
                          Active Workspace
                        </span>
                      ) : (
                        <button
                          onClick={() => onSelectProperty && onSelectProperty(p.id)}
                          className="rounded-md border border-[#8b5a2b] px-2 py-0.5 text-[10px] font-semibold text-[#784b20] hover:bg-[#faf7f2] transition-colors"
                        >
                          Switch Here
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-[#676b7d]">
                      {p.address ? `${p.address}${p.city ? `, ${p.city}` : ''}` : 'Address not configured'}
                    </p>
                    {p.contact && <p className="text-[11px] text-[#85899a]">Phone: {p.contact}</p>}
                  </div>

                  <div className="flex items-center gap-2 self-start sm:self-center">
                    <button
                      onClick={() => onEditSpecificProperty ? onEditSpecificProperty(p.id) : onEditProperty()}
                      className="rounded-lg border border-[#d8c2aa] px-3 py-1 text-xs font-medium text-[#784b20] hover:bg-[#faf7f2] transition-colors"
                    >
                      Edit
                    </button>
                    {isActive && (
                      <button
                        onClick={onDeleteProperty}
                        className="rounded-lg border border-[#ffe0e0] px-3 py-1 text-xs font-medium text-[#b95c3c] hover:bg-[#fff5f5] transition-colors"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* 4. Primary Subscription & Plan Management Hub */}
      <div id="settings-subscription" className="rounded-2xl border border-[#e8dfd4] bg-white p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#eee6dc] pb-5">
          <div className="flex items-center gap-2.5 text-[#8b5a2b]">
            <CreditCard className="size-5" />
            <div>
              <h3 className="text-base font-bold text-[#2c221e]">Subscription & Billing</h3>
              <p className="text-xs text-[#85899a]">
                Manage your BaseraBook plan, property quotas, and billing status.
              </p>
            </div>
          </div>
          <button
            onClick={onViewPlans}
            className="self-start sm:self-auto inline-flex items-center gap-1.5 rounded-xl bg-[#8b5a2b] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#784b20] transition-colors"
          >
            <Sparkles className="size-3.5" />
            {subscriptionStatus === 'active' ? 'Change / Upgrade Plan' : 'Upgrade Plan'}
          </button>
        </div>

        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Current Tier Details */}
          <div className="rounded-xl border border-[#ebe4da] bg-[#faf8f5] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#9c8e80]">Current Plan</p>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-base font-bold text-[#2c221e] capitalize">
                {subscriptionPlan || 'Free Trial'} Plan
              </span>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                  subscriptionStatus === 'active'
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    : isTrialExpired
                    ? 'bg-[#ffebe8] text-[#b95c3c] border border-[#ffcfc7]'
                    : isEndingSoon
                    ? 'bg-[#fff4e5] text-[#b46b1a] border border-[#f5c285]'
                    : 'bg-[#faf3ea] text-[#8b5a2b] border border-[#e8dfd4]'
                }`}
              >
                {subscriptionStatus === 'active'
                  ? 'Active Paid Plan'
                  : isTrialExpired
                  ? 'Trial Expired'
                  : hoursRemaining !== null && hoursRemaining < 48
                  ? `Trial (${hoursRemaining}h left)`
                  : `Trial (${daysRemaining ?? 7}d left)`}
              </span>
            </div>
            <p className="mt-2 text-xs text-[#676b7d]">
              {subscriptionStatus === 'active'
                ? 'Your account has full access to all features, automated rent cycles, and multi-property management.'
                : isTrialExpired
                ? 'Your 7-day trial period has ended. Historical records remain preserved. Upgrade to resume operational actions.'
                : 'You are on a 7-day free trial. Experience all features without restriction.'}
            </p>
          </div>

          {/* Property Quota & Usage */}
          <div className="rounded-xl border border-[#ebe4da] bg-[#faf8f5] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#9c8e80]">Property Quota</p>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-base font-bold text-[#2c221e]">
                {entitlement?.activePropertyCount ?? properties.length} / {entitlement?.maxProperties ?? 1} Active
              </span>
              {entitlement && !entitlement.canCreateProperty && (
                <span className="rounded-md bg-[#fff0e6] px-2 py-0.5 text-[10px] font-bold text-[#b46b1a] border border-[#f5c285]">
                  Quota Limit Reached
                </span>
              )}
            </div>
            {/* Usage Progress Bar */}
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[#eee6dc]">
              <div
                className={`h-full transition-all duration-300 ${
                  entitlement && !entitlement.canCreateProperty ? 'bg-[#b95c3c]' : 'bg-[#8b5a2b]'
                }`}
                style={{
                  width: `${Math.min(
                    100,
                    Math.round(
                      ((entitlement?.activePropertyCount ?? properties.length) /
                        Math.max(1, entitlement?.maxProperties ?? 1)) *
                        100
                    )
                  )}%`,
                }}
              />
            </div>
            <p className="mt-2 text-[11px] text-[#85899a]">
              {entitlement && !entitlement.canCreateProperty
                ? 'Upgrade to a higher tier plan to add more hostel branches or properties.'
                : `${(entitlement?.maxProperties ?? 1) - (entitlement?.activePropertyCount ?? properties.length)} additional property slot(s) available.`}
            </p>
          </div>
        </div>

        {/* Feature Highlights */}
        <div className="mt-5 rounded-xl border border-[#ebe4da] bg-[#faf8f5] p-4">
          <p className="text-xs font-bold text-[#2c221e] mb-2.5">Included in your subscription:</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-[#676b7d]">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-3.5 text-emerald-600 shrink-0" />
              <span>Recurring monthly rent schedule & cycle tracking</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-3.5 text-emerald-600 shrink-0" />
              <span>Multi-property branch isolation & switching</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-3.5 text-emerald-600 shrink-0" />
              <span>Monthly financial ledgers & printable PDF export</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-3.5 text-emerald-600 shrink-0" />
              <span>WhatsApp / SMS rent reminders with UPI QR code</span>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-[#e9ebf0] bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2.5 text-[#8b5a2b]">
          <CircleHelp className="size-5" />
          <h3 className="text-base font-bold text-[#3d3934]">Help & Dedicated Support</h3>
        </div>
        <p className="mt-1 text-xs text-[#85899a]">
          Have questions or need technical help configuring your property? Our support team is ready to assist.
        </p>
        <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-[#e8dfd4] bg-[#faf7f2] p-4 text-xs">
          <div>
            <p className="font-semibold text-[#44485a]">Official Support Email</p>
            <a
              href="mailto:baserabook.team@gmail.com"
              className="font-mono text-[#8b5a2b] hover:underline"
            >
              baserabook.team@gmail.com
            </a>
          </div>
          <a
            href="mailto:baserabook.team@gmail.com?subject=BaseraBook%20Owner%20Support%20Request"
            className="inline-flex items-center justify-center rounded-lg bg-[#8b5a2b] px-4 py-2 text-xs font-semibold text-white hover:bg-[#784b20] transition-colors"
          >
            Email Support
          </a>
        </div>
      </div>

      <div className="rounded-2xl border border-[#ffe4e4] bg-[#fffbfb] p-6">
        <h3 className="text-base font-bold text-[#b95c3c]">Session & Sign Out</h3>
        <p className="mt-1 text-xs text-[#a04e32]">Securely end your current workspace session.</p>
        <button
          onClick={onSignOut}
          className="mt-4 rounded-xl border border-[#b95c3c] bg-white px-4 py-2 text-xs font-semibold text-[#b95c3c] hover:bg-[#fff5f5] transition-colors"
        >
          Sign Out of BaseraBook
        </button>
      </div>
    </div>
  )
})

function MetricCard({ label, value, note, Icon, i }: any) {
  return (
    <div className="rounded-2xl sm:rounded-3xl border border-[#ebe4da] bg-white p-4 sm:p-5 lg:p-6 shadow-[0_2px_12px_rgba(70,50,30,0.03)] hover:border-[#d9cbbe] transition-all min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-[#7d756d] truncate">{label}</span>
        <div className="grid size-8 sm:size-9 shrink-0 place-items-center rounded-full bg-[#faf3ea] text-[#8b5a2b]">
          <Icon className="size-4" />
        </div>
      </div>
      <p className="text-2xl sm:text-3xl font-bold tracking-tight text-[#2c221e] mt-2 sm:mt-3 truncate">{value}</p>
      {note && (
        <p className="mt-1 text-[11px] font-medium text-[#8b5a2b] truncate" title={note}>
          {note}
        </p>
      )}
    </div>
  )
}

function EmptyState({ title, description, action, actionLabel }: any) {
  return (
    <div className="grid min-h-64 place-items-center rounded-2xl border border-[#eceff5] bg-white p-8 text-center shadow-xs">
      <div className="max-w-md">
        <h3 className="text-base font-bold tracking-tight text-[#3d3934]">{title}</h3>
        <p className="mt-2 text-xs text-[#85899a]">{description}</p>
        {action && (
          <button
            onClick={action}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#8b5a2b] px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-[#784b20] transition-colors"
          >
            <Plus className="size-3.5" />
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  )
}

function EmptySearchState({ query, onClear }: any) {
  return (
    <div className="grid min-h-56 place-items-center rounded-2xl border border-[#eceff5] bg-white p-8 text-center shadow-xs">
      <div className="max-w-md">
        <Search className="mx-auto size-8 text-[#c7c9d4] mb-3" />
        <h3 className="text-sm font-bold tracking-tight text-[#3d3934]">No results found</h3>
        <p className="mt-1 text-xs text-[#85899a]">
          No matching records found for <strong className="text-[#3d3934]">&quot;{query}&quot;</strong>.
        </p>
        <button
          onClick={onClear}
          className="mt-4 rounded-xl border border-[#e8dfd4] px-4 py-2 text-xs font-semibold text-[#784b20] hover:bg-[#faf7f2] hover:border-[#8b5a2b] transition-colors"
        >
          Clear Search Filter
        </button>
      </div>
    </div>
  )
}

function Field({ label, name, placeholder, type = 'text', defaultValue, value, onChange, min, required = false }: any) {
  return (
    <label className="flex flex-col gap-1.5 text-xs font-semibold text-[#555a6c]">
      <span>
        {label} {required && <span className="text-[#8b5a2b] font-bold">*</span>}
      </span>
      <input
        type={type}
        name={name}
        placeholder={placeholder}
        defaultValue={defaultValue}
        value={value}
        onChange={onChange}
        min={min}
        required={required}
        className="rounded-xl border border-[#e4e6ec] bg-white px-3 py-2.5 text-sm font-normal text-[#3d3934] outline-none transition-colors focus:border-[#8b5a2b] focus:ring-1 focus:ring-[#8b5a2b]"
      />
    </label>
  )
}

function Modal({ title, onClose, children, maxWidth = 'max-w-lg' }: any) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={typeof title === 'string' ? title : 'Modal dialog'}
      className="fixed inset-0 z-50 grid place-items-center bg-[#202536]/40 p-2.5 sm:p-4 backdrop-blur-xs overflow-y-auto"
    >
      <div className={`w-full ${maxWidth} max-h-[92vh] flex flex-col rounded-2xl sm:rounded-3xl border border-[#e8dfd4] bg-white p-4 sm:p-6 shadow-2xl animate-in fade-in zoom-in-95 my-auto overflow-hidden`}>
        <div className="mb-4 flex items-center justify-between border-b border-[#f0f1f4] pb-3 shrink-0">
          <h3 className="text-base font-bold text-[#3d3934]">{title}</h3>
          <button onClick={onClose} aria-label="Close modal" className="rounded-xl p-2 text-[#8b8fa0] hover:bg-[#f7f3ed] hover:text-[#3d3934] transition-colors cursor-pointer">
            <X className="size-4" />
          </button>
        </div>
        <div className="overflow-y-auto overscroll-contain pr-1">
          {children}
        </div>
      </div>
    </div>
  )
}

function MonthlyRentScheduleModal({
  tenant,
  payments,
  locale = 'en',
  onClose,
  onRecordPaymentForMonth,
}: {
  tenant: Tenant
  payments: PaymentRecord[]
  locale?: 'en' | 'hi'
  onClose: () => void
  onRecordPaymentForMonth: (tenant: Tenant, monthCovered: string, amount: number) => void
}) {
  const schedules = useMemo(() => {
    return generateMonthlyRentSchedules({
      tenantId: tenant.id,
      joiningDate: tenant.joiningDate,
      rentDueDay: tenant.rent_due_day,
      monthlyRent: tenant.rent,
      payments,
      locale,
    })
  }, [tenant, payments, locale])

  const totalBilled = schedules.reduce((sum, s) => sum + s.amount, 0)
  const totalPaid = schedules.filter((s) => s.isPaid).reduce((sum, s) => sum + s.amount, 0)
  const totalOutstanding = totalBilled - totalPaid

  return (
    <Modal title={`Rent Ledger: ${tenant.name}`} onClose={onClose} maxWidth="max-w-3xl">
      <div className="space-y-4">
        {/* Tenant Summary Banner */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-2xl border border-[#ebe4da] bg-[#faf8f5] p-3.5 text-xs">
          <div>
            <p className="text-[10px] text-[#8c827a]">Room & Bed</p>
            <p className="font-semibold text-[#2c221e]">
              Room {tenant.room || 'Unassigned'} {tenant.bed_number ? `· Bed ${tenant.bed_number}` : ''}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-[#8c827a]">Joining Date</p>
            <p className="font-semibold text-[#2c221e]">
              {tenant.joiningDate ? new Date(tenant.joiningDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-[#8c827a]">Monthly Rent</p>
            <p className="font-bold text-[#8b5a2b]">₹{tenant.rent.toLocaleString('en-IN')}</p>
          </div>
          <div>
            <p className="text-[10px] text-[#8c827a]">Recurring Due Day</p>
            <p className="font-semibold text-[#2c221e]">
              {tenant.rent_due_day ? `${tenant.rent_due_day}th of month` : '5th of month'}
            </p>
          </div>
        </div>

        {/* Ledger Balance Summary */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs">
          <div className="flex items-center gap-4">
            <span className="text-[#6c635a]">
              Total Billed: <strong className="text-[#2c221e]">₹{totalBilled.toLocaleString('en-IN')}</strong>
            </span>
            <span className="text-[#2e7d32]">
              Collected: <strong>₹{totalPaid.toLocaleString('en-IN')}</strong>
            </span>
            {totalOutstanding > 0 && (
              <span className="text-[#b95c3c]">
                Pending: <strong>₹{totalOutstanding.toLocaleString('en-IN')}</strong>
              </span>
            )}
          </div>
          <p className="text-[11px] text-[#8c827a]">
            Month-by-month billing cycle · Duplicate payments prevented
          </p>
        </div>

        {/* Monthly Schedules Table */}
        <div className="overflow-hidden rounded-xl border border-[#ebe4da] bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-xs">
              <thead className="border-b border-[#eee6dc] bg-[#faf7f2] font-semibold text-[#7d756d]">
                <tr>
                  <th className="px-4 py-3">Billing Cycle</th>
                  <th className="px-4 py-3">Due Date</th>
                  <th className="px-4 py-3">Rent Amount</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Payment Record</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eee6dc]">
                {schedules.map((cycle) => (
                  <tr key={cycle.monthKey} className="hover:bg-[#fbf9f6] transition-colors">
                    <td className="px-4 py-3 font-semibold text-[#2c221e]">
                      {cycle.monthCovered}
                      <span className="block text-[10px] text-[#8c827a] font-normal">{cycle.cycleLabel}</span>
                    </td>
                    <td className="px-4 py-3 text-[#555a6c]">
                      {cycle.dueDateFormatted}
                    </td>
                    <td className="px-4 py-3 font-semibold text-[#2c221e]">
                      ₹{cycle.amount.toLocaleString('en-IN')}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${cycle.badgeColor}`}
                      >
                        {cycle.status === 'overdue' && <AlertTriangle className="size-3" />}
                        {cycle.status === 'paid' && <Check className="size-3" />}
                        {cycle.status === 'due_soon' && <Clock className="size-3" />}
                        {cycle.status === 'due_today' && <Clock className="size-3" />}
                        {locale === 'hi' ? cycle.labelHi : cycle.labelEn}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[#555a6c]">
                      {cycle.isPaid ? (
                        <div>
                          <p className="font-semibold text-emerald-800">Paid</p>
                          <p className="text-[10px] text-[#7d756d]">
                            {cycle.paidAtFormatted || 'Recorded'}
                            {cycle.paymentMethod ? ` · ${cycle.paymentMethod.toUpperCase()}` : ''}
                          </p>
                        </div>
                      ) : (
                        <span className="text-[#a09488] italic">Unpaid</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!cycle.isPaid ? (
                        <button
                          onClick={() => onRecordPaymentForMonth(tenant, cycle.monthCovered, cycle.amount)}
                          className="rounded-lg bg-[#8b5a2b] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#784b20] transition-colors shadow-2xs"
                        >
                          Collect
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                          <CheckCircle2 className="size-3.5" /> Settled
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            onClick={onClose}
            className="rounded-xl border border-[#d9cbbe] bg-white px-4 py-2 text-xs font-semibold text-[#2c221e] hover:bg-[#faf7f2] transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  )
}

