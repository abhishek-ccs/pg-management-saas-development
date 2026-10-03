'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient, ensureFreshSession } from '@/lib/supabase/client'
import {
  createTenantAction,
  updateTenantAction,
  deleteTenantAction,
  deleteExpenseAction,
  deletePaymentAction,
} from './actions'
import { isValidPhone } from '@/lib/validation'
import { SUPPORT_EMAIL, getMailtoSupport } from '@/lib/constants'
import { LocaleSwitcher } from '@/components/i18n/LocaleSwitcher'
import { useI18n } from '@/lib/i18n'
import {
  PRICING_CONFIG,
  formatINR,
  getSavingsLabel,
  ANNUAL_SAVINGS_PERCENT,
  YEARLY_MONTHLY_EQUIVALENT,
  ANNUAL_SAVINGS_AMOUNT,
} from '@/lib/pricing'
import {
  calculateRentDueStatus,
  formatPaymentTimestamp,
  generateWhatsAppReminder,
  generateSmsReminder,
} from '@/lib/due-dates'
import { StayBookLogo, StayBookIcon } from '@/components/ui/StayBookLogo'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BedDouble,
  Bell,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock,
  DoorOpen,
  Download,
  Edit2,
  FileText,
  Home,
  LayoutDashboard,
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
  Receipt,
  RotateCcw,
  Search,
  Settings,
  Share2,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  Undo2,
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
  title: string
  tenant: string
  priority: 'High' | 'Medium' | 'Low'
  status: 'Open' | 'In progress' | 'Resolved'
  description?: string
  created_at: string
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
}

const navigation = [
  { label: 'Overview', icon: LayoutDashboard },
  { label: 'Property', icon: Building2 },
  { label: 'Rooms & Beds', icon: DoorOpen },
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

export default function DashboardPage() {
  const router = useRouter()
  const supabase = createClient()


  // Navigation & UI state
  const { t, locale } = useI18n()
  const [active, setActive] = useState('Overview')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  // User & Subscription state
  const [userId, setUserId] = useState<string | null>(null)
  const [userName, setUserName] = useState('')
  const [userEmail, setUserEmail] = useState('')
  const [trialStart, setTrialStart] = useState<string | null>(null)
  const [trialEnd, setTrialEnd] = useState<string | null>(null)
  const [subscriptionPlan, setSubscriptionPlan] = useState<string>('trial')
  const [subscriptionStatus, setSubscriptionStatus] = useState<string>('trialing')
  const [isTrialExpired, setIsTrialExpired] = useState(false)
  const [dashboardBillingCycle, setDashboardBillingCycle] = useState<'yearly' | 'monthly'>('yearly')

  // Real Database Business State (Multi-property support with strict property isolation)
  const [properties, setProperties] = useState<Array<{ id: string; name: string; address: string; contact: string; city: string; rules?: string | null }>>([])
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>('')
  const [editingPropertyId, setEditingPropertyId] = useState<string | null>(null)

  // Active property derived helper
  const property = useMemo(() => {
    return properties.find((p) => p.id === selectedPropertyId) || properties[0] || { id: '', name: '', address: '', contact: '', city: '', rules: null }
  }, [properties, selectedPropertyId])

  const propertyType = useMemo(() => getPropertyType(property), [property])
  const isPgHostel = propertyType === 'pg_hostel'

  const isSuperAdminUser = useMemo(() => {
    const email = (userEmail || '').trim().toLowerCase()
    return email === 'abhishekrawat67320@gmail.com' || email === 'sharmavn258@gmail.com'
  }, [userEmail])

  const [rooms, setRooms] = useState<Room[]>([])
  const [beds, setBeds] = useState<Bed[]>([])
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [payments, setPayments] = useState<PaymentRecord[]>([])
  const [deletedPayments, setDeletedPayments] = useState<PaymentRecord[]>([])
  const [deletedTenants, setDeletedTenants] = useState<Tenant[]>([])
  const [complaints, setComplaints] = useState<Complaint[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [electricity, setElectricity] = useState<ElectricityRecord[]>([])

  // Scoped views for the currently selected property (ensures strict isolation between multiple properties)
  const currentPropertyRooms = useMemo(() => {
    if (!property.id) return rooms
    return rooms.filter((r) => !r.property_id || r.property_id === property.id)
  }, [rooms, property.id])

  const currentPropertyRoomIds = useMemo(() => {
    return new Set(currentPropertyRooms.map((r) => r.id))
  }, [currentPropertyRooms])

  const currentPropertyBeds = useMemo(() => {
    if (!property.id) return beds
    return beds.filter((b) => (!b.property_id || b.property_id === property.id) || currentPropertyRoomIds.has(b.room_id))
  }, [beds, property.id, currentPropertyRoomIds])

  const currentPropertyTenants = useMemo(() => {
    if (!property.id) return tenants
    return tenants.filter((t) => (!t.property_id || t.property_id === property.id) || (t.room_id && currentPropertyRoomIds.has(t.room_id)))
  }, [tenants, property.id, currentPropertyRoomIds])

  const currentPropertyTenantIds = useMemo(() => {
    return new Set(currentPropertyTenants.map((t) => t.id))
  }, [currentPropertyTenants])

  const currentPropertyPayments = useMemo(() => {
    if (!property.id) return payments
    return payments.filter((p) => (!p.property_id || p.property_id === property.id) || currentPropertyTenantIds.has(p.tenant_id))
  }, [payments, property.id, currentPropertyTenantIds])

  const currentPropertyExpenses = useMemo(() => {
    if (!property.id) return expenses
    return expenses.filter((e) => !e.property_id || e.property_id === property.id)
  }, [expenses, property.id])

  const currentPropertyElectricity = useMemo(() => {
    if (!property.id) return electricity
    return electricity.filter((el) => (!el.property_id || el.property_id === property.id) || (el.room_id && currentPropertyRoomIds.has(el.room_id)))
  }, [electricity, property.id, currentPropertyRoomIds])

  const currentPropertyComplaints = useMemo(() => {
    if (!property.id) return complaints
    return complaints.filter((c) => !c.property_id || c.property_id === property.id)
  }, [complaints, property.id])

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
  const [editingPayment, setEditingPayment] = useState<PaymentRecord | null>(null)
  const [showExpenseModal, setShowExpenseModal] = useState(false)
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null)
  const [showElectricityModal, setShowElectricityModal] = useState(false)
  const [showComplaintModal, setShowComplaintModal] = useState(false)
  const [showPricingModal, setShowPricingModal] = useState(false)
  const [showLogoutModal, setShowLogoutModal] = useState(false)
  const [selectedReceipt, setSelectedReceipt] = useState<PaymentRecord | null>(null)

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

  // ----------------------------------------------------------------------------
  // Real Database Fetching from Supabase
  // ----------------------------------------------------------------------------
  useEffect(() => {
    let isMounted = true

    async function fetchDashboardData() {
      try {
        setLoading(true)
        const { data: authData } = await supabase.auth.getUser()
        if (!authData.user) {
          router.push('/login?next=/dashboard')
          return
        }

        const user = authData.user
        if (!isMounted) return

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
        ] = await Promise.all([
          supabase.from('subscriptions').select('trial_start,trial_end,status,plan').eq('owner_id', user.id).maybeSingle(),
          supabase.from('properties').select('id,name,address,contact_number,city,rules').eq('owner_id', user.id).order('created_at', { ascending: true }),
          supabase.from('rooms').select('id,property_id,room_number,floor,room_type,base_rent').eq('owner_id', user.id).order('room_number', { ascending: true }),
          supabase.from('beds').select('id,property_id,room_id,bed_number,status,monthly_rate').eq('owner_id', user.id).order('bed_number', { ascending: true }),
          supabase.from('tenants').select('id,property_id,full_name,phone,monthly_rent,security_deposit,joining_date,status,room_id,bed_id').eq('owner_id', user.id).order('created_at', { ascending: false }),
          supabase.from('payments').select('id,property_id,tenant_id,amount,payment_method,payment_type,paid_at,notes').eq('owner_id', user.id).order('paid_at', { ascending: false }),
          supabase.from('expenses').select('id,property_id,title,category,amount,expense_date,notes').eq('owner_id', user.id).order('expense_date', { ascending: false }),
          supabase.from('electricity_readings').select('id,property_id,previous_reading,current_reading,rate_per_unit,reading_date,room_id').eq('owner_id', user.id).order('reading_date', { ascending: false }),
          supabase.from('complaints').select('id,property_id,title,tenant,priority,status,description,created_at').eq('owner_id', user.id).order('created_at', { ascending: false }),
        ])

        if (!isMounted) return

        // Subscription & Trial status from database row
        if (subRes.data) {
          setTrialStart(subRes.data.trial_start || null)
          setTrialEnd(subRes.data.trial_end || null)
          setSubscriptionStatus(subRes.data.status || 'trialing')
          setSubscriptionPlan(subRes.data.plan || 'trial')
          if (subRes.data.trial_end) {
            const remainingMs = new Date(subRes.data.trial_end).getTime() - Date.now()
            setIsTrialExpired(remainingMs <= 0 && subRes.data.status !== 'active')
          }
        }

        // Multiple properties handling
        const propList = (propRes.data || []).map((p: any) => ({
          id: p.id,
          name: p.name || '',
          address: p.address || '',
          contact: p.contact_number || '',
          city: p.city || '',
          rules: p.rules || null,
        }))
        setProperties(propList)
        setSelectedPropertyId((curr) => {
          if (curr && propList.some((p: any) => p.id === curr)) return curr
          return propList[0]?.id || ''
        })

        // Rooms
        const roomList: Room[] = roomRes.data || []
        setRooms(roomList)

        // Beds
        const bedList: Bed[] = (bedRes.data || []).map((b: any) => ({
          id: b.id,
          property_id: b.property_id,
          room_id: b.room_id,
          bed_number: b.bed_number,
          status: b.status || 'available',
          monthly_rate: Number(b.monthly_rate || 0),
        }))
        setBeds(bedList)

        // Map helpers
        const roomMap = new Map(roomList.map((r) => [r.id, r.room_number]))
        const bedMap = new Map(bedList.map((b) => [b.id, b.bed_number]))

        // Tenants (Separate active from soft-deleted)
        const allTenants: Tenant[] = (tenantRes.data || []).map((t: any) => ({
          id: t.id,
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
          deleted_at: t.deleted_at || null,
          status: t.status || 'Pending',
        }))
        setTenants(allTenants.filter((t) => !t.deleted_at))
        setDeletedTenants(allTenants.filter((t) => !!t.deleted_at))

        // Payments (Separate active from soft-deleted)
        const tenantNameMap = new Map(allTenants.map((t) => [t.id, t.name]))
        const tenantRoomMap = new Map(allTenants.map((t) => [t.id, t.room]))
        const allPayments: PaymentRecord[] = (paymentRes.data || []).map((p: any) => ({
          id: p.id,
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
        }))
        setPayments(allPayments.filter((p) => !p.deleted_at))
        setDeletedPayments(allPayments.filter((p) => !!p.deleted_at))

        // Expenses, Electricity, Complaints
        setExpenses((expenseRes.data || []).map((e: any) => ({ ...e, amount: Number(e.amount) })))
        setElectricity((elecRes.data || []).map((el: any) => ({
          ...el,
          room_id: el.room_id,
          room: el.room_id ? roomMap.get(el.room_id) || 'General' : 'General',
          previous_reading: Number(el.previous_reading),
          current_reading: Number(el.current_reading),
          rate_per_unit: Number(el.rate_per_unit),
        })))
        setComplaints(complaintRes.data || [])
      } catch (err) {
        console.error('Failed to load dashboard records:', err)
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    void fetchDashboardData()
    return () => {
      isMounted = false
    }
  }, [supabase, router])

  // ----------------------------------------------------------------------------
  // Calculations for Real Metrics (No Fake Data)
  // ----------------------------------------------------------------------------
  const totalCollectedMonth = useMemo(() => {
    const currentMonth = new Date().getMonth()
    const currentYear = new Date().getFullYear()
    return payments
      .filter((p) => {
        const d = new Date(p.paid_at)
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear
      })
      .reduce((sum, p) => sum + p.amount, 0)
  }, [payments])

  const totalRentPending = useMemo(() => {
    return tenants
      .filter((t) => t.status !== 'Paid' && t.status !== 'Vacated')
      .reduce((sum, t) => sum + t.rent, 0)
  }, [tenants])

  const totalExpensesMonth = useMemo(() => {
    const currentMonth = new Date().getMonth()
    const currentYear = new Date().getFullYear()
    return expenses
      .filter((e) => {
        const d = new Date(e.expense_date)
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear
      })
      .reduce((sum, e) => sum + e.amount, 0)
  }, [expenses])

  const totalElectricityPending = useMemo(() => {
    return electricity.reduce((sum, el) => {
      const units = Math.max(0, el.current_reading - el.previous_reading)
      return sum + units * el.rate_per_unit
    }, 0)
  }, [electricity])

  const activeTenantsCount = useMemo(() => {
    return tenants.filter((t) => t.status !== 'Vacated').length
  }, [tenants])

  const availableBedsCount = useMemo(() => {
    return beds.filter((b) => b.status === 'available').length
  }, [beds])

  const occupiedBedsCount = useMemo(() => {
    return beds.filter((b) => b.status === 'occupied').length
  }, [beds])

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
  // Multi-Module Search Filtering (Real Data Search)
  // ----------------------------------------------------------------------------
  const q = search.trim().toLowerCase()

  const filteredTenants = useMemo(() => {
    if (!q) return tenants
    return tenants.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.room.toLowerCase().includes(q) ||
        (t.bed_number && t.bed_number.toLowerCase().includes(q)) ||
        (t.phone && t.phone.includes(q)) ||
        t.status.toLowerCase().includes(q)
    )
  }, [tenants, q])

  const filteredRooms = useMemo(() => {
    if (!q) return rooms
    return rooms.filter(
      (r) =>
        r.room_number.toLowerCase().includes(q) ||
        r.room_type.toLowerCase().includes(q) ||
        String(r.floor).includes(q)
    )
  }, [rooms, q])

  const filteredPayments = useMemo(() => {
    if (!q) return payments
    return payments.filter(
      (p) =>
        p.tenant_name.toLowerCase().includes(q) ||
        p.room_number.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        p.payment_method.toLowerCase().includes(q) ||
        p.payment_type.toLowerCase().includes(q) ||
        (p.notes && p.notes.toLowerCase().includes(q))
    )
  }, [payments, q])

  const filteredElectricity = useMemo(() => {
    if (!q) return electricity
    return electricity.filter(
      (el) => el.room.toLowerCase().includes(q) || el.reading_date.includes(q)
    )
  }, [electricity, q])

  const filteredExpenses = useMemo(() => {
    if (!q) return expenses
    return expenses.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        e.category.toLowerCase().includes(q) ||
        (e.notes && e.notes.toLowerCase().includes(q)) ||
        String(e.amount).includes(q)
    )
  }, [expenses, q])

  const filteredComplaints = useMemo(() => {
    if (!q) return complaints
    return complaints.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.tenant.toLowerCase().includes(q) ||
        c.priority.toLowerCase().includes(q) ||
        c.status.toLowerCase().includes(q) ||
        (c.description && c.description.toLowerCase().includes(q))
    )
  }, [complaints, q])

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

    setIsSavingProperty(true)
    try {
      let targetId = editingPropertyId
      let res
      if (targetId) {
        res = await supabase
          .from('properties')
          .update({
            name,
            address,
            contact_number: contact,
            city,
            rules: packedRules,
            updated_at: new Date().toISOString(),
          })
          .eq('id', targetId)
          .eq('owner_id', userId)
          .select('id,name,address,contact_number,city,rules')
          .single()
      } else {
        res = await supabase
          .from('properties')
          .insert({
            owner_id: userId,
            name,
            address,
            contact_number: contact,
            city,
            rules: packedRules,
            updated_at: new Date().toISOString(),
          })
          .select('id,name,address,contact_number,city,rules')
          .single()
      }

      if (res.error) {
        if (res.error.code === '23505' || res.error.message?.includes('uq_properties_owner')) {
          flash('Multiple properties requires relaxing the database constraint. Run migration 20261001000001_safe_production_fixes.sql in your Supabase SQL editor.')
        } else {
          flash(`Could not save property: ${res.error.message || 'Database error'}`)
        }
        return
      }

      if (res.data) {
        const savedProp = {
          id: res.data.id,
          name: res.data.name,
          address: res.data.address || '',
          contact: res.data.contact_number || '',
          city: res.data.city || '',
          rules: res.data.rules || packedRules,
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
      const { error } = await supabase
        .from('properties')
        .delete()
        .eq('id', property.id)
        .eq('owner_id', userId)

      if (error) {
        flash(`Could not delete property: ${error.message}`)
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
      flash(`Property "${property.name}" deleted successfully.`)
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
    if (!userId || !property.id) {
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
          property_id: property.id,
          room_number: roomNumber,
          floor,
          room_type: roomType,
          base_rent: baseRent,
        })
        .select('id,room_number,floor,room_type,base_rent')
        .single()

      if (roomErr) {
        flash(roomErr.message.includes('unique') ? 'A room with this number already exists.' : 'Could not add room.')
        return
      }

      // Auto-create associated beds matching capacity
      const bedsToInsert = Array.from({ length: bedsCount }, (_, i) => ({
        owner_id: userId,
        property_id: property.id,
        room_id: newRoom.id,
        bed_number: `${roomNumber}-${String.fromCharCode(65 + i)}`,
        status: 'available',
        monthly_rate: baseRent,
      }))

      const { data: insertedBeds } = await supabase.from('beds').insert(bedsToInsert).select('id,property_id,room_id,bed_number,status,monthly_rate')

      setRooms((prev) => [...prev, newRoom])
      if (insertedBeds) {
        setBeds((prev) => [...prev, ...insertedBeds.map((b: any) => ({ ...b, monthly_rate: Number(b.monthly_rate) }))])
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
        .select('id,room_number,floor,room_type,base_rent')
        .single()

      if (error) {
        flash('Could not update room details.')
        return
      }

      setRooms((prev) => prev.map((r) => (r.id === editingRoom.id ? updated : r)))
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
    setConfirmDialog({
      open: true,
      title: `Delete Room ${roomNumber}?`,
      description: 'This will permanently remove the room, its configured beds, and unassign any residents linked to it.',
      actionLabel: 'Delete Room',
      isDestructive: true,
      onConfirm: async () => {
        const { error } = await supabase.from('rooms').delete().eq('id', roomId).eq('owner_id', userId)
        if (error) {
          flash('Could not delete room.')
          return
        }
        setRooms((prev) => prev.filter((r) => r.id !== roomId))
        setBeds((prev) => prev.filter((b) => b.room_id !== roomId))
        setTenants((prev) => prev.map((t) => (t.room_id === roomId ? { ...t, room: 'Unassigned', room_id: null, bed_id: null, bed_number: '' } : t)))
        flash(`Room ${roomNumber} deleted.`)
      },
    })
  }

  // Add Bed to Room
  async function handleAddBed(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (isSavingBed) return
    if (!userId || !property.id || !showAddBedModal.roomId) return

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
          property_id: property.id,
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

      setBeds((prev) => [...prev, { ...data, monthly_rate: Number(data.monthly_rate) }])
      setShowAddBedModal({ open: false, roomId: '', roomNumber: '' })
      flash(`Bed ${bedNumber} added.`)
    } catch {
      flash('An error occurred while adding the bed.')
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
      title: `Delete Bed ${bedNumber}?`,
      description: 'Remove this bed from room inventory?',
      actionLabel: 'Delete Bed',
      isDestructive: true,
      onConfirm: async () => {
        const { error } = await supabase.from('beds').delete().eq('id', bedId).eq('owner_id', userId)
        if (!error) {
          setBeds((prev) => prev.filter((b) => b.id !== bedId))
          flash(`Bed ${bedNumber} deleted.`)
        }
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
      const actionRes = await createTenantAction({
        name,
        phone,
        roomId,
        bedId,
        propertyId: property.id || null,
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

        // Direct client fallback using guaranteed columns
        const { data: newTenant, error } = await supabase
          .from('tenants')
          .insert({
            owner_id: userId,
            property_id: property.id || null,
            room_id: roomId && roomId !== 'unassigned' ? roomId : null,
            bed_id: bedId && bedId !== 'unassigned' ? bedId : null,
            full_name: name,
            phone,
            monthly_rent: rent,
            security_deposit: deposit,
            joining_date: joiningDate,
            status: 'Pending',
          })
          .select('id,property_id,full_name,phone,monthly_rent,security_deposit,joining_date,status,room_id,bed_id')
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

      // If bed was assigned, set bed status to 'occupied'
      if (createdTenant.bed_id) {
        await supabase.from('beds').update({ status: 'occupied' }).eq('id', createdTenant.bed_id)
        setBeds((prev) => prev.map((b) => (b.id === createdTenant.bed_id ? { ...b, status: 'occupied' } : b)))
      }

      const roomName = rooms.find((r) => r.id === createdTenant.room_id)?.room_number || 'Unassigned'
      const bedName = beds.find((b) => b.id === createdTenant.bed_id)?.bed_number || ''

      setTenants((prev) => [
        {
          id: createdTenant.id,
          property_id: createdTenant.property_id || property.id,
          name: createdTenant.full_name,
          phone: createdTenant.phone,
          room_id: createdTenant.room_id,
          bed_id: createdTenant.bed_id,
          bed_number: bedName,
          room: roomName,
          rent: Number(createdTenant.monthly_rent),
          deposit: Number(createdTenant.security_deposit || 0),
          joiningDate: createdTenant.joining_date,
          rent_due_day: dueDay,
          status: 'Pending',
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

      // Server action execution with client fallback
      const updateRes = await updateTenantAction(editingTenant.id, {
        name,
        phone,
        roomId: finalRoomId,
        bedId: finalBedId,
        rent,
        deposit,
        joiningDate,
        status,
      })

      if (!updateRes.success) {
        if (updateRes.error?.includes('session has expired')) {
          flash('Your session has expired. Please sign in again.')
          router.push('/login?next=/dashboard')
          return
        }

        const { error: clientUpdateErr } = await supabase
          .from('tenants')
          .update({
            full_name: name,
            phone,
            room_id: finalRoomId,
            bed_id: finalBedId,
            monthly_rent: rent,
            security_deposit: deposit,
            joining_date: joiningDate,
            status,
            updated_at: new Date().toISOString(),
          })
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

      // Sync Bed Statuses
      if (editingTenant.bed_id && editingTenant.bed_id !== finalBedId) {
        await supabase.from('beds').update({ status: 'available' }).eq('id', editingTenant.bed_id)
        setBeds((prev) => prev.map((b) => (b.id === editingTenant.bed_id ? { ...b, status: 'available' } : b)))
      }
      if (finalBedId && status !== 'Vacated') {
        await supabase.from('beds').update({ status: 'occupied' }).eq('id', finalBedId)
        setBeds((prev) => prev.map((b) => (b.id === finalBedId ? { ...b, status: 'occupied' } : b)))
      } else if (finalBedId && status === 'Vacated') {
        await supabase.from('beds').update({ status: 'available' }).eq('id', finalBedId)
        setBeds((prev) => prev.map((b) => (b.id === finalBedId ? { ...b, status: 'available' } : b)))
      }

      const roomName = rooms.find((r) => r.id === finalRoomId)?.room_number || 'Unassigned'
      const bedName = beds.find((b) => b.id === finalBedId)?.bed_number || ''

      setTenants((prev) =>
        prev.map((t) =>
          t.id === editingTenant.id
            ? {
                ...t,
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
                status,
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

  // Delete Resident
  async function handleDeleteTenant(tenantId: string, tenantName: string) {
    const target = tenants.find((t) => t.id === tenantId)
    if (!target || !userId) return

    setConfirmDialog({
      open: true,
      title: `Delete Resident ${tenantName}?`,
      description: 'Are you sure you want to permanently delete this resident record? Any assigned bed will immediately be released back to available inventory.',
      actionLabel: 'Delete Resident',
      isDestructive: true,
      onConfirm: async () => {
        const res = await deleteTenantAction(tenantId)
        if (!res.success) {
          flash(res.error || 'Could not delete resident.')
          return
        }

        // Release bed in local state if occupied
        if (target.bed_id) {
          setBeds((prev) => prev.map((b) => (b.id === target.bed_id ? { ...b, status: 'available' } : b)))
        }

        setTenants((prev) => prev.filter((t) => t.id !== tenantId))
        flash(`Resident ${tenantName} deleted successfully.`)
      },
    })
  }

  // Restore Tenant
  async function handleRestoreTenant(tenantId: string) {
    if (!userId) return
    const target = deletedTenants.find((t) => t.id === tenantId)
    if (!target) return

    const { error } = await supabase
      .from('tenants')
      .update({ deleted_at: null, updated_at: new Date().toISOString() })
      .eq('id', tenantId)
      .eq('owner_id', userId)

    if (error) {
      flash(`Could not restore resident: ${error.message}`)
      return
    }

    if (target.bed_id) {
      const bed = beds.find((b) => b.id === target.bed_id)
      if (bed && bed.status === 'available') {
        await supabase.from('beds').update({ status: 'occupied' }).eq('id', target.bed_id)
        setBeds((prev) => prev.map((b) => (b.id === target.bed_id ? { ...b, status: 'occupied' } : b)))
      }
    }

    const restored = { ...target, deleted_at: null }
    setDeletedTenants((prev) => prev.filter((t) => t.id !== tenantId))
    setTenants((prev) => [restored, ...prev])
    flash(`Resident ${target.name} restored successfully.`)
  }

  // Record Payment
  async function handleRecordPayment(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
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

    setConfirmDialog({
      open: true,
      title: 'Confirm Payment Entry',
      description: `Record payment of ${currency(amount)} from ${targetTenant.name} via ${method.toUpperCase()}? This will update your accounting ledger and generate a formal receipt.`,
      actionLabel: 'Confirm Payment',
      isDestructive: false,
      onConfirm: async () => {
        const now = new Date().toISOString()
        const combinedNotes = monthCovered ? `[Month: ${monthCovered}] ${notes}`.trim() : notes
        const sessionCheck = await ensureFreshSession(supabase)
        if (!sessionCheck.valid) {
          flash('Your session has expired. Please sign in again.')
          router.push('/login?next=/dashboard')
          return
        }

        const { data: newPayment, error } = await supabase
          .from('payments')
          .insert({
            owner_id: userId,
            property_id: property.id || null,
            tenant_id: tenantId,
            amount,
            payment_method: method,
            payment_type: type,
            paid_at: now,
            notes: combinedNotes || null,
          })
          .select('id,property_id,tenant_id,amount,payment_method,payment_type,paid_at,notes')
          .single()

        if (error) {
          if (error.code === 'PGRST303' || error.message?.includes('JWT') || error.message?.includes('expired')) {
            flash('Your session has expired. Please sign in again.')
            router.push('/login?next=/dashboard')
            return
          }
          flash(`Could not save payment to ledger: ${error.message}`)
          return
        }

        // Update tenant status to 'Paid'
        await supabase.from('tenants').update({ status: 'Paid' }).eq('id', tenantId)

        const recordedPayment: PaymentRecord = {
          id: newPayment.id,
          property_id: newPayment.property_id || property.id,
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
          updated_at: new Date().toISOString(),
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

  // Delete Payment
  async function handleDeletePayment(paymentId: string, amount: number, tenantName: string) {
    if (!userId) return
    const target = payments.find((p) => p.id === paymentId)
    if (!target) return

    setConfirmDialog({
      open: true,
      title: `Delete Payment #${paymentId.slice(0, 8).toUpperCase()}?`,
      description: `Remove payment of ${currency(amount)} for ${tenantName}? This action permanently removes the record from your ledger.`,
      actionLabel: 'Delete Payment',
      isDestructive: true,
      onConfirm: async () => {
        const res = await deletePaymentAction(paymentId)
        if (!res.success) {
          flash(res.error || 'Could not delete payment.')
          return
        }

        setPayments((prev) => prev.filter((p) => p.id !== paymentId))
        flash(`Payment of ${currency(amount)} deleted successfully.`)
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
      .update({ deleted_at: null, updated_at: new Date().toISOString() })
      .eq('id', paymentId)
      .eq('owner_id', userId)

    if (error) {
      flash(`Could not restore payment: ${error.message}`)
      return
    }

    const restored = { ...target, deleted_at: null }
    setDeletedPayments((prev) => prev.filter((p) => p.id !== paymentId))
    setPayments((prev) => [restored, ...prev])
    flash(`Payment of ${currency(target.amount)} restored successfully.`)
  }

  // Execute Immediate Undo
  function handleExecuteUndo() {
    if (!undoItem) return
    if (undoItem.intervalId) clearInterval(undoItem.intervalId)
    if (undoItem.type === 'payment') {
      void handleRestorePayment(undoItem.id)
    } else if (undoItem.type === 'tenant') {
      void handleRestoreTenant(undoItem.id)
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

    setIsSavingExpense(true)
    try {
      const { data: newExp, error } = await supabase
        .from('expenses')
        .insert({
          owner_id: userId,
          property_id: property.id || null,
          title,
          category,
          amount,
          expense_date: date,
          notes,
        })
        .select('id,title,category,amount,expense_date,notes')
        .single()

      if (error) {
        flash('Could not record expense.')
        return
      }

      setExpenses((prev) => [{ ...newExp, amount: Number(newExp.amount) }, ...prev])
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

  // Delete Expense
  async function handleDeleteExpense(id: string, title: string) {
    setConfirmDialog({
      open: true,
      title: `Delete Expense "${title}"?`,
      description: 'Remove this expense entry from your accounting ledger? This action cannot be undone.',
      actionLabel: 'Delete Entry',
      isDestructive: true,
      onConfirm: async () => {
        const res = await deleteExpenseAction(id)
        if (!res.success) {
          flash(res.error || 'Could not delete expense.')
          return
        }
        setExpenses((prev) => prev.filter((e) => e.id !== id))
        flash('Expense entry deleted successfully.')
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

    setIsSavingElectricity(true)
    try {
      const { data, error } = await supabase
        .from('electricity_readings')
        .insert({
          owner_id: userId,
          property_id: property.id || null,
          room_id: roomId && roomId !== 'general' ? roomId : null,
          previous_reading: prevReading,
          current_reading: currReading,
          rate_per_unit: rate,
          reading_date: date,
        })
        .select('id,previous_reading,current_reading,rate_per_unit,reading_date,room_id')
        .single()

      if (error) {
        flash('Could not record meter reading.')
        return
      }

      const roomName = rooms.find((r) => r.id === data.room_id)?.room_number || 'General'

      setElectricity((prev) => [
        {
          id: data.id,
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
    setConfirmDialog({
      open: true,
      title: `Delete Reading for Room ${room}?`,
      description: 'Remove this electricity consumption record?',
      actionLabel: 'Delete Reading',
      isDestructive: true,
      onConfirm: async () => {
        await supabase.from('electricity_readings').delete().eq('id', id).eq('owner_id', userId)
        setElectricity((prev) => prev.filter((el) => el.id !== id))
        flash('Meter reading deleted.')
      },
    })
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

    setIsSavingComplaint(true)
    try {
      const { data, error } = await supabase
        .from('complaints')
        .insert({
          owner_id: userId,
          property_id: property.id || null,
          title,
          tenant: tenantName,
          priority,
          status: 'Open',
          description: desc,
        })
        .select('id,title,tenant,priority,status,description,created_at')
        .single()

      if (error) {
        flash('Could not register complaint.')
        return
      }

      setComplaints((prev) => [data, ...prev])
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

  // Delete Complaint
  async function handleDeleteComplaint(id: string, title: string) {
    setConfirmDialog({
      open: true,
      title: `Delete Ticket "${title}"?`,
      description: 'Remove this complaint record from your ticket log?',
      actionLabel: 'Delete Ticket',
      isDestructive: true,
      onConfirm: async () => {
        await supabase.from('complaints').delete().eq('id', id).eq('owner_id', userId)
        setComplaints((prev) => prev.filter((c) => c.id !== id))
        flash('Complaint ticket removed.')
      },
    })
  }

  // Sign out (Triggers Confirmation Modal)
  async function executeSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="min-h-screen bg-[#faf8f5] text-[#2c221e] font-sans">
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
          <StayBookLogo iconSize={36} />
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

        {/* Sidebar Trial Callout */}
        <div className="p-4 border-t border-[#ebe4da] bg-white">
          <div className="rounded-2xl border border-[#ebe4da] bg-[#fbf8f4] p-4 text-xs">
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-bold text-[#8b5a2b]">
                <Sparkles className="size-3.5" />
                7-Day Free Trial
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  isTrialExpired
                    ? 'bg-[#ffebe8] text-[#b95c3c]'
                    : isEndingSoon
                    ? 'bg-[#fff4e5] text-[#b46b1a]'
                    : 'bg-[#f4ede4] text-[#8b5a2b]'
                }`}
              >
                {isTrialExpired
                  ? 'Expired'
                  : hoursRemaining !== null && hoursRemaining < 48
                  ? `${hoursRemaining}h left`
                  : daysRemaining !== null
                  ? `${daysRemaining}d left`
                  : 'Active'}
              </span>
            </div>
            <p className="mb-1 font-semibold text-[#2c221e]">
              {isTrialExpired ? 'Trial concluded.' : 'Active 7-day trial.'}
            </p>
            <p className="mb-3 text-[11px] leading-4 text-[#7d756d]">
              {isTrialExpired
                ? 'Upgrade anytime to continue adding business records.'
                : 'Full workspace access with real database isolation.'}
            </p>
            <button
              onClick={() => setShowPricingModal(true)}
              className="w-full rounded-xl bg-[#8b5a2b] py-2 text-center text-xs font-semibold text-white shadow-xs hover:bg-[#784b20] transition-colors"
            >
              View Plans & Upgrade
            </button>
          </div>
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
        <header className="sticky top-0 z-20 flex min-h-[74px] flex-wrap items-center justify-between border-b border-[#ebe4da] bg-white/95 backdrop-blur px-3 sm:px-8 py-2.5 gap-3">
          <div className="flex items-center gap-3">
            <button className="lg:hidden p-1.5 rounded-lg hover:bg-[#faf7f2] text-[#6c635a]" onClick={() => setMobileOpen(true)} aria-label="Open menu">
              <Menu className="size-5" />
            </button>
            <div className="hidden items-center gap-2 text-xs text-[#9c8e80] sm:flex">
              <span>Workspace</span>
              <span>/</span>
              <span className="font-semibold text-[#2c221e]">
                {active === 'Overview' ? 'Dashboard' : active}
              </span>
            </div>
            <h1 className="text-base font-semibold text-[#2c221e] lg:hidden">
              {active === 'Overview' ? 'Dashboard' : active}
            </h1>

            {/* Multiple Properties Switcher Dropdown in Header */}
            {properties.length > 0 && (
              <div className="flex items-center gap-1.5 rounded-xl border border-[#ebe4da] bg-[#faf8f5] px-2.5 py-1 text-xs shadow-2xs hover:border-[#d9cbbe] transition-colors">
                <Building2 className="size-3.5 text-[#8b5a2b] shrink-0" />
                <select
                  value={selectedPropertyId || property.id}
                  onChange={(e) => {
                    if (e.target.value === '__add_new__') {
                      setEditingPropertyId(null)
                      setShowPropertyModal(true)
                    } else {
                      setSelectedPropertyId(e.target.value)
                    }
                  }}
                  className="bg-transparent font-semibold text-[#2c221e] outline-none cursor-pointer text-xs max-w-[130px] sm:max-w-[180px] truncate"
                >
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                  <option value="__add_new__">+ Add Property...</option>
                </select>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            {/* Header Trial Pill (Matches Reference Image) */}
            <div className="hidden md:flex items-center gap-2 rounded-full border border-[#e5dcd0] bg-[#faf6f1] px-3.5 py-1.5 text-xs font-semibold text-[#8b5a2b] shadow-2xs">
              <span
                className={`size-2 rounded-full ${
                  isTrialExpired ? 'bg-[#b95c3c]' : isEndingSoon ? 'bg-[#d97706] animate-pulse' : 'bg-[#8b5a2b]'
                }`}
              />
              <span>
                {isTrialExpired
                  ? 'Trial Ended'
                  : hoursRemaining !== null && hoursRemaining < 48
                  ? `Trial: ${hoursRemaining}h remaining`
                  : `Trial: ${daysRemaining ?? 7}d remaining`}
              </span>
            </div>

            {/* Discreet Admin Console Button for Verified Super Admins */}
            {isSuperAdminUser && (
              <a
                href="/admin"
                title="Open StayBook Super Admin Console"
                className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-[#d8c2aa] bg-[#faf7f2] px-2.5 py-1 text-xs font-semibold text-[#784b20] hover:bg-[#f1e8dc] transition-colors shadow-2xs"
              >
                <ShieldCheck className="size-3.5 text-[#8b5a2b]" />
                <span>Staff Admin</span>
              </a>
            )}

            {/* Bilingual Language Switcher */}
            <LocaleSwitcher />

            {/* Dynamic Multi-Module Search Input */}
            <div className="relative flex items-center gap-2 rounded-xl border border-[#ebe4da] bg-[#faf8f5] px-2.5 sm:px-3 py-1.5 text-xs text-[#74798a] focus-within:border-[#8b5a2b] transition-colors">
              <Search className="size-3.5 text-[#8b5a2b] shrink-0" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Search ${active === 'Overview' ? 'Dashboard' : active}...`}
                className="w-24 sm:w-36 md:w-44 bg-transparent outline-none placeholder:text-[#a09488] text-xs text-[#2c221e]"
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
            <div className="flex items-center gap-2.5 border-l border-[#ebe4da] pl-2 sm:pl-3">
              <div className="grid size-9 place-items-center rounded-full bg-[#8b5a2b] text-white text-xs font-bold shadow-2xs ring-2 ring-[#f4ebe1]">
                {userName ? userName.slice(0, 1).toUpperCase() : 'O'}
              </div>
              <div className="hidden sm:block leading-tight">
                <div className="flex items-center gap-1">
                  <p className="max-w-[110px] sm:max-w-[130px] truncate text-xs font-bold text-[#2c221e]">
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
                className="rounded-xl p-2 text-[#9296a5] hover:bg-[#faf7f2] hover:text-[#b95c3c] transition-colors"
              >
                <LogOut className="size-4" />
              </button>
            </div>
          </div>
        </header>

        {/* View Router */}
        <div className="mx-auto max-w-[1360px] px-3 sm:px-8 py-5 sm:py-7 lg:px-10">
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
              onAddProperty={() => {
                setEditingPropertyId(null)
                setShowPropertyModal(true)
              }}
              onAddRoom={() => setShowRoomModal(true)}
              onAddTenant={() => {
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
            />
          )}

          {active === 'Rooms & Beds' && (
            <RoomsTab
              rooms={filteredRooms.filter((r) => !property.id || !r.property_id || r.property_id === property.id)}
              beds={currentPropertyBeds}
              tenants={currentPropertyTenants}
              onAddRoom={() => setShowRoomModal(true)}
              onEditRoom={(r: Room) => setEditingRoom(r)}
              onDeleteRoom={handleDeleteRoom}
              onAddBed={(roomId: string, roomNumber: string) =>
                setShowAddBedModal({ open: true, roomId, roomNumber })
              }
              onToggleBedStatus={handleToggleBedStatus}
              onDeleteBed={handleDeleteBed}
              searchQuery={q}
              onClearSearch={() => setSearch('')}
            />
          )}

          {active === 'Tenants' && (
            <TenantsTab
              tenants={filteredTenants.filter((t) => !property.id || !t.property_id || t.property_id === property.id)}
              rooms={currentPropertyRooms}
              property={property}
              locale={locale}
              onAddTenant={() => {
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
              onRecordPayment={(t: Tenant) => {
                setPaymentFormTenantId(t.id)
                setPaymentFormAmount(t.rent)
                setShowPaymentModal(true)
              }}
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
                const firstRoom = currentPropertyRooms[0]
                if (firstRoom) {
                  const lastReading = currentPropertyElectricity.find((el) => el.room_id === firstRoom.id)?.current_reading || 0
                  setElecFormRoomId(firstRoom.id)
                  setElecFormPrevReading(lastReading)
                }
                setShowElectricityModal(true)
              }}
              onDeleteReading={handleDeleteElectricity}
              searchQuery={q}
              onClearSearch={() => setSearch('')}
            />
          )}

          {active === 'Expenses' && (
            <ExpensesTab
              expenses={filteredExpenses.filter((e) => !property.id || !e.property_id || e.property_id === property.id)}
              totalMonth={totalExpensesMonth}
              onAddExpense={() => setShowExpenseModal(true)}
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
              revenueMonth={totalCollectedMonth}
              expensesMonth={totalExpensesMonth}
              rentPending={totalRentPending}
              electricityPending={totalElectricityPending}
            />
          )}

          {active === 'Deleted Records' && (
            <DeletedRecordsTab
              deletedPayments={deletedPayments}
              deletedTenants={deletedTenants}
              locale={locale}
              onRestorePayment={handleRestorePayment}
              onRestoreTenant={handleRestoreTenant}
            />
          )}

          {active === 'Settings' && (
            <SettingsTab
              userName={userName}
              userEmail={userEmail}
              isSuperAdminUser={isSuperAdminUser}
              property={property}
              properties={properties}
              selectedPropertyId={selectedPropertyId || property.id}
              onSelectProperty={(id: string) => setSelectedPropertyId(id)}
              onAddProperty={() => {
                setEditingPropertyId(null)
                setShowPropertyModal(true)
              }}
              trialStart={trialStart}
              trialEnd={trialEnd}
              daysRemaining={daysRemaining}
              hoursRemaining={hoursRemaining}
              isEndingSoon={isEndingSoon}
              isTrialExpired={isTrialExpired}
              subscriptionPlan={subscriptionPlan}
              onEditProperty={() => {
                setEditingPropertyId(property.id)
                setShowPropertyModal(true)
              }}
              onEditSpecificProperty={(id: string) => {
                setEditingPropertyId(id)
                setShowPropertyModal(true)
              }}
              onDeleteProperty={() => setShowDeletePropertyModal(true)}
              onViewPlans={() => setShowPricingModal(true)}
              onSignOut={() => setShowLogoutModal(true)}
            />
          )}
        </div>
      </main>

      {/* ---------------------------------------------------------------------- */}
      {/* MODALS & DIALOGS */}
      {/* ---------------------------------------------------------------------- */}

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
              <div className="grid grid-cols-2 gap-3">
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
            <div className="grid grid-cols-2 gap-3">
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
            <div className={isPgHostel ? 'grid grid-cols-2 gap-3' : 'block'}>
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
            <div className="grid grid-cols-2 gap-3">
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

      {/* 6. Onboard New Tenant Modal (with Auto-Prefill + Capacity Check) */}
      {showTenantModal && (
        <Modal title="Onboard New Resident" onClose={() => !isSavingTenant && setShowTenantModal(false)}>
          <form onSubmit={handleAddTenant} className="flex flex-col gap-4">
            <Field label="Full Name" name="name" placeholder="Resident full name" required />
            <Field label="Contact Phone" name="phone" placeholder="10-15 digit mobile number" required />

            <div className={isPgHostel ? 'grid grid-cols-2 gap-3' : 'block'}>
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

            <div className={isPgHostel ? 'grid grid-cols-2 gap-3' : 'block'}>
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

            <div className="grid grid-cols-2 gap-3">
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

            <div className="grid grid-cols-2 gap-3">
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

            <div className="grid grid-cols-2 gap-3">
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
            <div className="grid grid-cols-2 gap-3">
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
            <div className="grid grid-cols-2 gap-3">
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

            <div className="grid grid-cols-2 gap-3">
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

            <div className="grid grid-cols-2 gap-3">
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
            <div className="grid grid-cols-2 gap-3">
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
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#8b5a2b]">StayBook Official Receipt</span>
                <h4 className="mt-1 text-base font-bold text-[#3d3934]">{property.name || 'Rental Property'}</h4>
                <p className="text-xs text-[#85899a]">{property.address || 'Address on file'}</p>
              </div>
              <div className="text-right">
                <span className="rounded-full bg-[#e7f7f0] px-2.5 py-1 text-[10px] font-bold text-[#328d68]">PAID</span>
                <p className="mt-2 text-xs font-mono font-semibold text-[#676b7d]">REC-{selectedReceipt.id.slice(0, 8).toUpperCase()}</p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-4 text-xs">
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
                    `*StayBook Official Rent Receipt*\nReceipt: REC-${selectedReceipt.id.slice(0, 8).toUpperCase()}\nProperty: ${property.name || 'StayBook'}\nResident: ${selectedReceipt.tenant_name} (Room ${selectedReceipt.room_number})\nAmount: ${currency(selectedReceipt.amount)}\nType: ${selectedReceipt.payment_type.toUpperCase()}\nMethod: ${selectedReceipt.payment_method.toUpperCase()}\nPaid At: ${formatPaymentTimestamp(selectedReceipt.paid_at, 'Asia/Kolkata', locale)}\n${selectedReceipt.month_covered ? `Period: ${selectedReceipt.month_covered}\n` : ''}Status: CONFIRMED & PAID`
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
        <Modal title="StayBook Subscription Plans" onClose={() => setShowPricingModal(false)}>
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <p className="text-xs text-[#74798a]">
                Choose the plan that fits your property scale. Save with annual billing or switch anytime.
              </p>
              {/* Billing Cycle Toggle - Yearly as Default */}
              <div className="inline-flex items-center self-start sm:self-auto rounded-xl border border-[#e8dfd4] bg-[#faf7f2] p-1 text-xs">
                <button
                  type="button"
                  onClick={() => setDashboardBillingCycle('yearly')}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-bold transition-all ${
                    dashboardBillingCycle === 'yearly'
                      ? 'bg-[#8b5a2b] text-white shadow-xs'
                      : 'text-[#676b7d] hover:text-[#3d3934]'
                  }`}
                >
                  Yearly
                  <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-black ${
                    dashboardBillingCycle === 'yearly' ? 'bg-[#5f442b] text-[#f7d8ba]' : 'bg-[#eaf5ea] text-[#2e7d32]'
                  }`}>
                    Save {ANNUAL_SAVINGS_PERCENT}%
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setDashboardBillingCycle('monthly')}
                  className={`rounded-lg px-3 py-1.5 font-medium transition-all ${
                    dashboardBillingCycle === 'monthly'
                      ? 'bg-[#8b5a2b] text-white shadow-xs'
                      : 'text-[#676b7d] hover:text-[#3d3934]'
                  }`}
                >
                  Monthly
                </button>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-[#e8dfd4] bg-[#faf7f2] p-5">
                <h4 className="font-bold text-sm">7-Day Free Trial</h4>
                <p className="text-2xl font-bold mt-1 text-[#8b5a2b]">
                  ₹0<span className="text-xs font-normal text-[#85899a]"> / 7 days</span>
                </p>
                <p className="text-[11px] text-[#85899a] mt-0.5">No credit card required</p>
                <ul className="mt-3 space-y-1.5 text-xs text-[#676b7d]">
                  <li>✓ Up to 10 Rooms & Beds</li>
                  <li>✓ Digital Rent Receipts</li>
                  <li>✓ WhatsApp Reminders</li>
                  <li>✓ Electricity Meter Logger</li>
                </ul>
              </div>

              <div className="rounded-2xl border-2 border-[#8b5a2b] bg-[#faf7f2] p-5 relative">
                <div className="absolute top-4 right-4">
                  <span className="rounded-full bg-[#8b5a2b] px-2.5 py-0.5 text-[10px] font-bold text-white uppercase tracking-wider">
                    Recommended
                  </span>
                </div>
                <h4 className="font-bold text-sm">Growth Pro</h4>
                {dashboardBillingCycle === 'yearly' ? (
                  <div>
                    <p className="text-2xl font-bold mt-1 text-[#8b5a2b]">
                      {formatINR(PRICING_CONFIG.yearlyRate)}
                      <span className="text-xs font-normal text-[#85899a]"> / year</span>
                    </p>
                    <p className="text-[11px] font-semibold text-[#2e7d32] mt-0.5">
                      Save ₹{ANNUAL_SAVINGS_AMOUNT.toLocaleString('en-IN')}/yr (Effective ₹{YEARLY_MONTHLY_EQUIVALENT.toLocaleString('en-IN')}/mo)
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="text-2xl font-bold mt-1 text-[#8b5a2b]">
                      {formatINR(PRICING_CONFIG.monthlyRate)}
                      <span className="text-xs font-normal text-[#85899a]"> / month</span>
                    </p>
                    <p className="text-[11px] text-[#85899a] mt-0.5">Billed monthly</p>
                  </div>
                )}
                <ul className="mt-3 space-y-1.5 text-xs text-[#676b7d]">
                  <li>✓ Unlimited Rooms, Beds & Residents</li>
                  <li>✓ Full Owner Ledger & Soft Deletes</li>
                  <li>✓ 1-Click WhatsApp & SMS Reminders</li>
                  <li>✓ Real-Time Overdue Status Badges</li>
                  <li>✓ Priority Support: {SUPPORT_EMAIL}</li>
                </ul>
              </div>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <a
                href={getMailtoSupport('Subscription Inquiry')}
                className="text-xs font-medium text-[#8b5a2b] hover:underline"
              >
                Questions? Email {SUPPORT_EMAIL}
              </a>
              <button
                onClick={() => {
                  setShowPricingModal(false)
                  flash(`Plan upgrade to Growth Pro (${dashboardBillingCycle}) selected. Payment checkout gateway connecting...`)
                }}
                className="rounded-xl bg-[#8b5a2b] px-5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-[#784b20] transition-colors"
              >
                Continue with Growth Pro ({dashboardBillingCycle === 'yearly' ? `${formatINR(PRICING_CONFIG.yearlyRate)}/yr` : `${formatINR(PRICING_CONFIG.monthlyRate)}/mo`})
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
            <p className="text-sm text-[#676b7d] leading-relaxed">{confirmDialog.description}</p>
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={isConfirming}
                onClick={() => setConfirmDialog((prev) => ({ ...prev, open: false }))}
                className="rounded-xl border border-[#e4e6ec] px-4 py-2.5 text-xs font-semibold text-[#676b7d] hover:bg-[#faf7f2] disabled:opacity-50"
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
                className={`flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-xs font-semibold text-white shadow-sm disabled:opacity-50 transition-colors ${
                  confirmDialog.isDestructive
                    ? 'bg-[#b95c3c] hover:bg-[#9e4a2e]'
                    : 'bg-[#8b5a2b] hover:bg-[#784b20]'
                }`}
              >
                {isConfirming && <Loader2 className="size-3.5 animate-spin" />}
                {isConfirming ? 'Processing...' : confirmDialog.actionLabel}
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

function OverviewTab({
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

  // Real upcoming & overdue dues
  const upcomingDues = useMemo(() => {
    const pendingTenants = (tenants || []).filter(
      (t: Tenant) => t && t.status !== 'Vacated' && (t.status === 'Pending' || t.status === 'Overdue')
    )

    return pendingTenants
      .map((t: Tenant) => {
        const dueInfo = calculateRentDueStatus(t.rent_due_day || 5, false)
        const isOverdue = dueInfo.status === 'overdue' || t.status === 'Overdue'
        return {
          id: t.id,
          name: t.name,
          room: t.room && t.room !== 'Unassigned' ? t.room : 'Unit',
          amount: Number(t.rent || 0),
          status: t.status,
          isOverdue,
          dueLabel: isOverdue ? 'Overdue' : dueInfo.labelEn,
        }
      })
      .sort((a: any, b: any) => (a.isOverdue === b.isOverdue ? 0 : a.isOverdue ? -1 : 1))
      .slice(0, 5)
  }, [tenants])

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

      {/* 4 Dashboard Stat Cards: Properties, Rooms/Units, Residents, Occupancy (Matches Reference Image) */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Properties"
          value={propertiesCount}
          note={propertiesCount > 1 ? `${propertiesCount} active locations` : '1 active location'}
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

      {/* Main 2-Column Section: Recent Activity & Upcoming Dues (Matches Reference Image) */}
      <div className="mb-8 grid gap-6 lg:grid-cols-12 items-start">
        {/* Left Column: Recent Activity */}
        <section className="lg:col-span-7 rounded-2xl sm:rounded-3xl border border-[#ebe4da] bg-white p-5 sm:p-6 shadow-[0_2px_12px_rgba(70,50,30,0.03)]">
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
        <section className="lg:col-span-5 rounded-2xl sm:rounded-3xl border border-[#ebe4da] bg-white p-5 sm:p-6 shadow-[0_2px_12px_rgba(70,50,30,0.03)]">
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

      {/* 3-Step Guided Setup Checklist for Property Owners (When new/unconfigured) */}
      {(!property.name || rooms.length === 0 || tenants.length === 0) && (
        <div className="mb-8 rounded-2xl border border-[#ebe4da] bg-white p-5 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-[#eee6dc] pb-3 mb-4">
            <div>
              <h3 className="text-sm font-bold text-[#2c221e]">Setup & Onboarding Checklist</h3>
              <p className="text-xs text-[#7d756d]">Complete these simple steps to get your rental property operational.</p>
            </div>
            <span className="self-start sm:self-auto rounded-full bg-[#faf7f2] px-3 py-1 text-xs font-semibold text-[#8b5a2b] border border-[#ebe4da]">
              {(!property.name ? 0 : rooms.length === 0 ? 1 : tenants.length === 0 ? 2 : 3)} / 3 Completed
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {/* Step 1: Property */}
            <div className={`rounded-xl border p-3.5 transition-colors ${property.name ? 'border-[#cce9db] bg-[#f4faf7]' : 'border-[#ebe4da] bg-[#faf7f2]'}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#7d756d]">Step 1</span>
                {property.name ? (
                  <span className="flex items-center gap-1 text-[11px] font-bold text-[#328d68]">
                    <CheckCircle2 className="size-3.5" /> Done
                  </span>
                ) : (
                  <span className="text-[11px] font-bold text-[#b46b1a]">Pending</span>
                )}
              </div>
              <p className="text-xs font-bold text-[#2c221e]">Property Profile</p>
              <p className="mt-0.5 text-[11px] text-[#7d756d] truncate">
                {property.name ? property.name : 'Create your property profile'}
              </p>
              {!property.name ? (
                <button
                  onClick={onAddProperty}
                  className="mt-3 w-full rounded-lg bg-[#8b5a2b] py-1.5 text-xs font-semibold text-white hover:bg-[#784b20] transition-colors"
                >
                  Set Up Property
                </button>
              ) : (
                <button
                  onClick={onAddProperty}
                  className="mt-3 w-full rounded-lg border border-[#cce9db] bg-white py-1.5 text-xs font-semibold text-[#328d68] hover:bg-[#f4faf7]"
                >
                  Edit Profile
                </button>
              )}
            </div>

            {/* Step 2: Rooms & Units */}
            <div className={`rounded-xl border p-3.5 transition-colors ${rooms.length > 0 ? 'border-[#cce9db] bg-[#f4faf7]' : 'border-[#ebe4da] bg-[#faf7f2]'}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#7d756d]">Step 2</span>
                {rooms.length > 0 ? (
                  <span className="flex items-center gap-1 text-[11px] font-bold text-[#328d68]">
                    <CheckCircle2 className="size-3.5" /> Done ({rooms.length})
                  </span>
                ) : (
                  <span className="text-[11px] font-bold text-[#b46b1a]">Pending</span>
                )}
              </div>
              <p className="text-xs font-bold text-[#2c221e]">Rooms & Units</p>
              <p className="mt-0.5 text-[11px] text-[#7d756d]">
                {rooms.length > 0 ? `${rooms.length} configured` : 'Add your first room or unit'}
              </p>
              <button
                onClick={onAddRoom}
                className={`mt-3 w-full rounded-lg py-1.5 text-xs font-semibold ${rooms.length > 0 ? 'border border-[#cce9db] bg-white text-[#328d68] hover:bg-[#f4faf7]' : 'bg-[#8b5a2b] text-white hover:bg-[#784b20] transition-colors'}`}
              >
                {rooms.length > 0 ? '+ Add More Units' : '+ Add First Unit'}
              </button>
            </div>

            {/* Step 3: Residents */}
            <div className={`rounded-xl border p-3.5 transition-colors ${tenants.length > 0 ? 'border-[#cce9db] bg-[#f4faf7]' : 'border-[#ebe4da] bg-[#faf7f2]'}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#7d756d]">Step 3</span>
                {tenants.length > 0 ? (
                  <span className="flex items-center gap-1 text-[11px] font-bold text-[#328d68]">
                    <CheckCircle2 className="size-3.5" /> Done ({tenants.length})
                  </span>
                ) : (
                  <span className="text-[11px] font-bold text-[#b46b1a]">Pending</span>
                )}
              </div>
              <p className="text-xs font-bold text-[#2c221e]">Residents / Tenants</p>
              <p className="mt-0.5 text-[11px] text-[#7d756d]">
                {tenants.length > 0 ? `${tenants.length} onboarded` : 'Onboard your first resident'}
              </p>
              <button
                onClick={onAddTenant}
                className={`mt-3 w-full rounded-lg py-1.5 text-xs font-semibold ${tenants.length > 0 ? 'border border-[#cce9db] bg-white text-[#328d68] hover:bg-[#f4faf7]' : 'bg-[#8b5a2b] text-white hover:bg-[#784b20] transition-colors'}`}
              >
                {tenants.length > 0 ? '+ Onboard More' : '+ Onboard Resident'}
              </button>
            </div>
          </div>
        </div>
      )}

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
}

function PropertyTab({
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
}: any) {
  return (
    <div className="flex flex-col gap-6">
      {/* Top Header & Actions */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-[#3d3934]">Rental Properties</h2>
          <p className="text-xs text-[#85899a]">
            Manage your properties, branches, and accommodation centers with isolated operational records.
          </p>
        </div>
        <button
          onClick={onAddProperty}
          className="flex items-center justify-center gap-2 rounded-xl bg-[#8b5a2b] px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-[#784b20] transition-colors"
        >
          <Plus className="size-4" /> Add New Property
        </button>
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
}

function RoomsTab({
  rooms,
  beds,
  tenants,
  onAddRoom,
  onEditRoom,
  onDeleteRoom,
  onAddBed,
  onToggleBedStatus,
  onDeleteBed,
  searchQuery,
  onClearSearch,
}: any) {
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

                  {/* Bed Inventory Inside Room */}
                  <div className="mt-5 border-t border-[#f0f1f4] pt-4">
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
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function TenantsTab({
  tenants,
  rooms,
  property,
  locale = 'en',
  onAddTenant,
  onEditTenant,
  onVacateTenant,
  onDeleteTenant,
  onRecordPayment,
  searchQuery,
  onClearSearch,
}: any) {
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'due' | 'overdue'>('all')

  // Calculate live due statuses for all tenants
  const tenantStatuses = useMemo(() => {
    return tenants.map((t: Tenant) => {
      const dueInfo = calculateRentDueStatus(t.rent_due_day || 5, t.status === 'Paid')
      return { tenant: t, dueInfo }
    })
  }, [tenants])

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
        <div className="overflow-hidden rounded-2xl border border-[#e9ebf0] bg-white shadow-sm">
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
                {displayedTenants.map(({ tenant: t, dueInfo }: any) => {
                  const whatsappUrl = generateWhatsAppReminder({
                    tenantName: t.name,
                    phone: t.phone,
                    amount: t.rent,
                    dueDay: t.rent_due_day || 5,
                    propertyName: property?.name || 'StayBook Property',
                    locale,
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
                        <span className="font-medium text-[#44485a]">
                          {t.rent_due_day ? `${t.rent_due_day}th of month` : '5th of month'}
                        </span>
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
                          {/* 1-Click WhatsApp Reminder */}
                          <a
                            href={whatsappUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 rounded-lg border border-[#25D366]/40 bg-[#25D366]/10 px-2 py-1 text-[11px] font-semibold text-[#1e7e34] hover:bg-[#25D366]/20 transition-colors"
                            title="Send WhatsApp payment reminder"
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
      )}
    </div>
  )
}

function PaymentsTab({
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

      {payments.length === 0 ? (
        searchQuery ? (
          <EmptySearchState query={searchQuery} onClear={onClearSearch} />
        ) : (
          <EmptyState
            title="No payments recorded yet"
            description="Record rent collections to generate receipts and update ledger records."
            action={onRecordPayment}
            actionLabel="Record First Payment"
          />
        )
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[#ebe4da] bg-white shadow-sm">
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
                {payments.map((p: PaymentRecord) => (
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
      )}
    </div>
  )
}

function DeletedRecordsTab({
  deletedPayments,
  deletedTenants,
  locale = 'en',
  onRestorePayment,
  onRestoreTenant,
}: {
  deletedPayments: PaymentRecord[]
  deletedTenants: Tenant[]
  locale?: string
  onRestorePayment: (id: string) => Promise<void>
  onRestoreTenant: (id: string) => Promise<void>
}) {
  const totalDeleted = deletedPayments.length + deletedTenants.length

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Deleted Records & Audit Recovery</h2>
        <p className="text-xs text-[#85899a]">
          Records are soft-deleted for financial compliance and accounting integrity. You can restore any accidentally deleted item here anytime.
        </p>
      </div>

      {totalDeleted === 0 ? (
        <div className="rounded-2xl border border-[#e8dfd4] bg-[#faf7f2] p-8 text-center">
          <ShieldCheck className="mx-auto size-8 text-[#2e7d32]" />
          <h4 className="mt-2 text-sm font-bold text-[#3d3934]">No Deleted Records</h4>
          <p className="mt-1 text-xs text-[#74798a]">Your ledger is clean. Any payments or residents deleted in the future can be restored here.</p>
        </div>
      ) : (
        <>
          {/* Deleted Payments Section */}
          <section className="rounded-2xl border border-[#e9ebf0] bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-[#3d3934]">Deleted Payment Entries ({deletedPayments.length})</h3>
                <p className="text-xs text-[#85899a]">Soft-deleted payments excluded from monthly totals</p>
              </div>
            </div>

            {deletedPayments.length === 0 ? (
              <p className="text-xs text-[#999daa] italic">No deleted payment entries.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] text-left text-xs">
                  <thead className="border-b border-[#eee6dc] bg-[#faf7f2] font-semibold text-[#85899a]">
                    <tr>
                      <th className="px-4 py-3">Receipt</th>
                      <th className="px-4 py-3">Resident</th>
                      <th className="px-4 py-3">Amount</th>
                      <th className="px-4 py-3">Original Payment Date</th>
                      <th className="px-4 py-3">Deleted At</th>
                      <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#eee6dc]">
                    {deletedPayments.map((p) => (
                      <tr key={p.id} className="hover:bg-[#fbf8f3]">
                        <td className="px-4 py-3 font-mono font-bold text-[#676b7d]">REC-{p.id.slice(0, 8).toUpperCase()}</td>
                        <td className="px-4 py-3 font-semibold text-[#3d3934]">{p.tenant_name}</td>
                        <td className="px-4 py-3 font-bold text-[#784b20]">{currency(p.amount)}</td>
                        <td className="px-4 py-3 text-[#74798a]">{formatPaymentTimestamp(p.paid_at, 'Asia/Kolkata', locale)}</td>
                        <td className="px-4 py-3 text-[#b95c3c]">{formatPaymentTimestamp(p.deleted_at, 'Asia/Kolkata', locale)}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => onRestorePayment(p.id)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-[#c5e6c7] bg-[#eaf5ea] px-3 py-1 text-xs font-semibold text-[#2e7d32] hover:bg-[#d5edd7]"
                          >
                            <RotateCcw className="size-3" />
                            Restore Payment
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Deleted Tenants Section */}
          <section className="rounded-2xl border border-[#e9ebf0] bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-[#3d3934]">Deleted Resident Profiles ({deletedTenants.length})</h3>
                <p className="text-xs text-[#85899a]">Soft-deleted residents and occupancy terms</p>
              </div>
            </div>

            {deletedTenants.length === 0 ? (
              <p className="text-xs text-[#999daa] italic">No deleted resident profiles.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] text-left text-xs">
                  <thead className="border-b border-[#eee6dc] bg-[#faf7f2] font-semibold text-[#85899a]">
                    <tr>
                      <th className="px-4 py-3">Resident</th>
                      <th className="px-4 py-3">Contact</th>
                      <th className="px-4 py-3">Room</th>
                      <th className="px-4 py-3">Monthly Rent</th>
                      <th className="px-4 py-3">Deleted At</th>
                      <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#eee6dc]">
                    {deletedTenants.map((t) => (
                      <tr key={t.id} className="hover:bg-[#fbf8f3]">
                        <td className="px-4 py-3 font-bold text-[#3d3934]">{t.name}</td>
                        <td className="px-4 py-3 text-[#676b7d]">{t.phone || '—'}</td>
                        <td className="px-4 py-3 text-[#676b7d]">Room {t.room}</td>
                        <td className="px-4 py-3 font-semibold text-[#784b20]">{currency(t.rent)}</td>
                        <td className="px-4 py-3 text-[#b95c3c]">{formatPaymentTimestamp(t.deleted_at, 'Asia/Kolkata', locale)}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => onRestoreTenant(t.id)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-[#c5e6c7] bg-[#eaf5ea] px-3 py-1 text-xs font-semibold text-[#2e7d32] hover:bg-[#d5edd7]"
                          >
                            <RotateCcw className="size-3" />
                            Restore Resident
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}

function ElectricityTab({ records, rooms, onAddReading, onDeleteReading, searchQuery, onClearSearch }: any) {
  return (
    <div>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-[#2c221e]">Electricity & Utilities</h2>
          <p className="text-xs text-[#85899a]">Meter reading logger and automated consumption charges.</p>
        </div>
        <button
          onClick={onAddReading}
          className="flex items-center gap-2 rounded-xl bg-[#8b5a2b] px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-[#784b20] transition-colors self-start sm:self-auto"
        >
          <Plus className="size-4" /> Record Reading
        </button>
      </div>

      {records.length === 0 ? (
        searchQuery ? (
          <EmptySearchState query={searchQuery} onClear={onClearSearch} />
        ) : (
          <EmptyState
            title="No electricity readings recorded"
            description="Track previous and current meter readings to calculate utility charges."
            action={onAddReading}
            actionLabel="Record Reading"
          />
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
                  <th className="px-5 py-3.5">Date</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eee6dc]">
                {records.map((el: ElectricityRecord) => {
                  const units = Math.max(0, el.current_reading - el.previous_reading)
                  const total = units * el.rate_per_unit
                  return (
                    <tr key={el.id} className="hover:bg-[#fbf8f3] transition-colors">
                      <td className="px-5 py-4 font-bold text-[#3d3934]">Room {el.room}</td>
                      <td className="px-5 py-4 text-[#676b7d]">{el.previous_reading}</td>
                      <td className="px-5 py-4 text-[#676b7d]">{el.current_reading}</td>
                      <td className="px-5 py-4 font-bold text-[#784b20]">{units} units</td>
                      <td className="px-5 py-4 text-[#676b7d]">{currency(el.rate_per_unit)}</td>
                      <td className="px-5 py-4 font-bold text-[#44485a]">{currency(total)}</td>
                      <td className="px-5 py-4 text-[#85899a]">{new Date(el.reading_date).toLocaleDateString('en-IN')}</td>
                      <td className="px-5 py-4 text-right">
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
}

function ExpensesTab({ expenses, totalMonth, onAddExpense, onEditExpense, onDeleteExpense, searchQuery, onClearSearch }: any) {
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

      <div className="mb-6 rounded-2xl border border-[#e8dfd4] bg-[#faf7f2] p-5">
        <p className="text-xs text-[#999daa]">Total Expenses This Month</p>
        <p className="mt-1 text-2xl font-bold text-[#b95c3c]">{currency(totalMonth)}</p>
      </div>

      {expenses.length === 0 ? (
        searchQuery ? (
          <EmptySearchState query={searchQuery} onClear={onClearSearch} />
        ) : (
          <EmptyState
            title="No expenses logged"
            description="Record maintenance, Wi-Fi bills, water supplies, and staff salaries."
            action={onAddExpense}
            actionLabel="Log Expense"
          />
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
                {expenses.map((e: Expense) => (
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
}

function ComplaintsTab({ complaints, onAddComplaint, onResolve, onDelete, searchQuery, onClearSearch }: any) {
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
}

function ReportsTab({ property, rooms, beds, tenants, revenueMonth, expensesMonth, rentPending, electricityPending }: any) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Property Analytics & Reports</h2>
          <p className="text-xs text-[#85899a]">Financial ledger overview and occupancy breakdown.</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-[#e9ebf0] bg-white p-5">
          <p className="text-xs text-[#999daa]">Revenue (Month)</p>
          <p className="mt-1 text-2xl font-bold text-[#328d68]">{currency(revenueMonth)}</p>
        </div>
        <div className="rounded-2xl border border-[#e9ebf0] bg-white p-5">
          <p className="text-xs text-[#999daa]">Pending Rent</p>
          <p className="mt-1 text-2xl font-bold text-[#b95c3c]">{currency(rentPending)}</p>
        </div>
        <div className="rounded-2xl border border-[#e9ebf0] bg-white p-5">
          <p className="text-xs text-[#999daa]">Expenses (Month)</p>
          <p className="mt-1 text-2xl font-bold text-[#b46b1a]">{currency(expensesMonth)}</p>
        </div>
        <div className="rounded-2xl border border-[#e9ebf0] bg-white p-5">
          <p className="text-xs text-[#999daa]">Net Cashflow</p>
          <p className="mt-1 text-2xl font-bold text-[#3d3934]">{currency(revenueMonth - expensesMonth)}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-[#e9ebf0] bg-white p-6 shadow-sm">
        <h3 className="text-sm font-bold text-[#3d3934]">Room Occupancy Distribution</h3>
        <p className="mt-0.5 text-xs text-[#85899a]">Live breakdown of configured rooms and assigned capacity.</p>
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
                  <div className="w-24 bg-[#eee6dc] rounded-full h-2 overflow-hidden">
                    <div className="bg-[#8b5a2b] h-full" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="font-semibold text-[#555a6c]">
                    {count} / {cap} ({pct}%)
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function SettingsTab({
  userName,
  userEmail,
  isSuperAdminUser,
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
  onViewPlans,
  onSignOut,
}: any) {
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
            <p className="font-semibold text-[#44485a]">{userEmail}</p>
          </div>
        </div>
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

      <div className="rounded-2xl border border-[#e9ebf0] bg-white p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 font-bold text-[#8b5a2b]">
                <Sparkles className="size-4" />
                7-Day Free Trial
              </span>
              <span
                className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${
                  isTrialExpired
                    ? 'bg-[#ffebe8] text-[#b95c3c]'
                    : isEndingSoon
                    ? 'bg-[#fff4e5] text-[#b46b1a]'
                    : 'bg-[#faf3ea] text-[#8b5a2b]'
                }`}
              >
                {isTrialExpired
                  ? 'Expired'
                  : hoursRemaining !== null && hoursRemaining < 48
                  ? `${hoursRemaining}h remaining`
                  : `${daysRemaining ?? 7} days remaining`}
              </span>
            </div>
            <p className="mt-2 text-sm font-semibold text-[#3d3934]">
              {isTrialExpired ? 'Your 7-day trial period has ended.' : 'Your 7-day free trial is currently active.'}
            </p>
            <p className="mt-1 text-xs text-[#74798a]">
              Historical records are retained safely. Upgrade anytime to continue day-to-day operations.
            </p>
          </div>
          <button
            onClick={onViewPlans}
            className="self-start sm:self-center shrink-0 rounded-xl bg-[#8b5a2b] px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-[#784b20] transition-colors"
          >
            Upgrade Plan
          </button>
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
            <p className="font-mono text-[#8b5a2b]">{SUPPORT_EMAIL}</p>
          </div>
          <a
            href={getMailtoSupport('StayBook Owner Support Request')}
            className="inline-flex items-center justify-center rounded-lg bg-[#8b5a2b] px-4 py-2 text-xs font-semibold text-white hover:bg-[#784b20] transition-colors"
          >
            Email Support
          </a>
        </div>
      </div>

      {/* Discreet Platform Admin Console Shortcut for Verified Administrators */}
      {isSuperAdminUser && (
        <div className="rounded-2xl border border-[#8b5a2b]/30 bg-[#faf7f2] p-6 shadow-sm">
          <div className="flex items-center gap-2.5 text-[#8b5a2b]">
            <ShieldCheck className="size-5" />
            <h3 className="text-base font-bold text-[#3d3934]">StayBook Super Admin Console</h3>
          </div>
          <p className="mt-1 text-xs text-[#85899a]">
            Your email (<strong className="text-[#3d3934]">{userEmail}</strong>) is verified as a platform administrator.
          </p>
          <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-xs text-[#676b7d]">
              Manage global customer tenants, subscriptions, audit logs, and platform system health.
            </p>
            <a
              href="/admin"
              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-[#2c2926] px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-[#1a1816] transition-colors"
            >
              <ShieldCheck className="size-4 text-[#d8c2aa]" />
              Open Admin Console →
            </a>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-[#ffe4e4] bg-[#fffbfb] p-6">
        <h3 className="text-base font-bold text-[#b95c3c]">Session & Sign Out</h3>
        <p className="mt-1 text-xs text-[#a04e32]">Securely end your current workspace session.</p>
        <button
          onClick={onSignOut}
          className="mt-4 rounded-xl border border-[#b95c3c] bg-white px-4 py-2 text-xs font-semibold text-[#b95c3c] hover:bg-[#fff5f5] transition-colors"
        >
          Sign Out of StayBook
        </button>
      </div>
    </div>
  )
}

function MetricCard({ label, value, note, Icon, i }: any) {
  return (
    <div className="rounded-2xl sm:rounded-3xl border border-[#ebe4da] bg-white p-5 sm:p-6 shadow-[0_2px_12px_rgba(70,50,30,0.03)] hover:border-[#d9cbbe] transition-all">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[#7d756d]">{label}</span>
        <div className="grid size-9 place-items-center rounded-full bg-[#faf3ea] text-[#8b5a2b]">
          <Icon className="size-4" />
        </div>
      </div>
      <p className="text-2xl sm:text-3xl font-bold tracking-tight text-[#2c221e] mt-3">{value}</p>
      {note && <p className="mt-1 text-[11px] font-medium text-[#8b5a2b] truncate">{note}</p>}
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

function Modal({ title, onClose, children }: any) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#202536]/40 p-3 sm:p-4 backdrop-blur-xs overflow-y-auto">
      <div className="w-full max-w-lg max-h-[92vh] flex flex-col rounded-3xl border border-[#e8dfd4] bg-white p-5 sm:p-7 shadow-2xl animate-in fade-in zoom-in-95 my-auto overflow-hidden">
        <div className="mb-4 flex items-center justify-between border-b border-[#f0f1f4] pb-3 shrink-0">
          <h3 className="text-base font-bold text-[#3d3934]">{title}</h3>
          <button onClick={onClose} aria-label="Close modal" className="rounded-xl p-2 text-[#8b8fa0] hover:bg-[#f7f3ed] hover:text-[#3d3934] transition-colors">
            <X className="size-4" />
          </button>
        </div>
        <div className="overflow-y-auto pr-1">
          {children}
        </div>
      </div>
    </div>
  )
}
