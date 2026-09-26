'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { isValidPhone } from '@/lib/validation'
import {
  AlertTriangle,
  Building2,
  Calendar,
  Check,
  ChevronDown,
  CircleHelp,
  DoorOpen,
  Download,
  FileText,
  Home,
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
  MessageSquare,
  Plus,
  Printer,
  Receipt,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
  Wallet,
  X,
  Zap,
} from 'lucide-react'

type Tenant = {
  id: string
  name: string
  phone?: string
  room: string
  rent: number
  deposit?: number
  joiningDate?: string
  status: 'Paid' | 'Pending' | 'Overdue'
}

type Room = {
  id: string
  room_number: string
  floor: number
  room_type: string
  base_rent: number
  beds_count?: number
}

type PaymentRecord = {
  id: string
  tenant_id: string
  tenant_name: string
  room_number: string
  amount: number
  payment_method: string
  payment_type: string
  paid_at: string
  notes?: string
}

type Complaint = {
  id: string
  title: string
  tenant: string
  priority: 'High' | 'Medium' | 'Low'
  status: 'Open' | 'In progress' | 'Resolved'
  description?: string
  created_at: string
}

type Expense = {
  id: string
  title: string
  category: string
  amount: number
  expense_date: string
  notes?: string
}

type ElectricityRecord = {
  id: string
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
  { label: 'Settings', icon: Settings },
]

const currency = (val: number) => `₹${Number(val || 0).toLocaleString('en-IN')}`

export default function DashboardPage() {
  const router = useRouter()
  const supabase = createClient()

  // Navigation & UI state
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

  // Real Database Business State (Zero fake data)
  const [property, setProperty] = useState({ id: '', name: '', address: '', contact: '', city: '' })
  const [rooms, setRooms] = useState<Room[]>([])
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [payments, setPayments] = useState<PaymentRecord[]>([])
  const [complaints, setComplaints] = useState<Complaint[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [electricity, setElectricity] = useState<ElectricityRecord[]>([])

  // Modals & Action loading state
  const [isSavingProperty, setIsSavingProperty] = useState(false)
  const [showPropertyModal, setShowPropertyModal] = useState(false)
  const [showRoomModal, setShowRoomModal] = useState(false)
  const [showTenantModal, setShowTenantModal] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [showExpenseModal, setShowExpenseModal] = useState(false)
  const [showElectricityModal, setShowElectricityModal] = useState(false)
  const [showComplaintModal, setShowComplaintModal] = useState(false)
  const [showPricingModal, setShowPricingModal] = useState(false)
  const [selectedReceipt, setSelectedReceipt] = useState<PaymentRecord | null>(null)

  // Confirmation modal state
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

  const flash = (text: string) => {
    setNotice(text)
    window.setTimeout(() => setNotice(''), 3000)
  }

  // Initial Data Fetching from Supabase
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
          tenantRes,
          paymentRes,
          expenseRes,
          elecRes,
          complaintRes,
        ] = await Promise.all([
          supabase.from('subscriptions').select('trial_start,trial_end,status,plan').eq('owner_id', user.id).maybeSingle(),
          supabase.from('properties').select('id,name,address,contact_number,city').eq('owner_id', user.id).maybeSingle(),
          supabase.from('rooms').select('id,room_number,floor,room_type,base_rent').eq('owner_id', user.id).order('room_number', { ascending: true }),
          supabase.from('tenants').select('id,full_name,phone,monthly_rent,security_deposit,joining_date,status,room_id').eq('owner_id', user.id).order('created_at', { ascending: false }),
          supabase.from('payments').select('id,tenant_id,amount,payment_method,payment_type,paid_at,notes').eq('owner_id', user.id).order('paid_at', { ascending: false }),
          supabase.from('expenses').select('id,title,category,amount,expense_date,notes').eq('owner_id', user.id).order('expense_date', { ascending: false }),
          supabase.from('electricity_readings').select('id,previous_reading,current_reading,rate_per_unit,reading_date,room_id').eq('owner_id', user.id).order('reading_date', { ascending: false }),
          supabase.from('complaints').select('id,title,tenant,priority,status,description,created_at').eq('owner_id', user.id).order('created_at', { ascending: false }),
        ])

        if (!isMounted) return

        // Subscription & Trial calculation from real database subscription row
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

        // Property info
        if (propRes.data) {
          setProperty({
            id: propRes.data.id,
            name: propRes.data.name || '',
            address: propRes.data.address || '',
            contact: propRes.data.contact_number || '',
            city: propRes.data.city || '',
          })
        }

        // Rooms & Beds
        const roomList: Room[] = roomRes.data || []
        setRooms(roomList)

        // Tenants map with room names
        const roomMap = new Map(roomList.map((r) => [r.id, r.room_number]))
        const tenantList: Tenant[] = (tenantRes.data || []).map((t: any) => ({
          id: t.id,
          name: t.full_name,
          phone: t.phone || '',
          room: t.room_id ? roomMap.get(t.room_id) || 'Unassigned' : 'Unassigned',
          rent: Number(t.monthly_rent || 0),
          deposit: Number(t.security_deposit || 0),
          joiningDate: t.joining_date,
          status: t.status || 'Pending',
        }))
        setTenants(tenantList)

        // Payments map with tenant names
        const tenantNameMap = new Map(tenantList.map((t) => [t.id, t.name]))
        const tenantRoomMap = new Map(tenantList.map((t) => [t.id, t.room]))
        const paymentList: PaymentRecord[] = (paymentRes.data || []).map((p: any) => ({
          id: p.id,
          tenant_id: p.tenant_id,
          tenant_name: tenantNameMap.get(p.tenant_id) || 'Unknown Tenant',
          room_number: tenantRoomMap.get(p.tenant_id) || 'N/A',
          amount: Number(p.amount || 0),
          payment_method: p.payment_method || 'upi',
          payment_type: p.payment_type || 'rent',
          paid_at: p.paid_at,
          notes: p.notes,
        }))
        setPayments(paymentList)

        // Expenses, Electricity, Complaints
        setExpenses((expenseRes.data || []).map((e: any) => ({ ...e, amount: Number(e.amount) })))
        setElectricity((elecRes.data || []).map((el: any) => ({
          ...el,
          room: roomMap.get(el.room_id) || 'General',
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

  // Calculations for Real Metrics (No Fake Data)
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
      .filter((t) => t.status !== 'Paid')
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

  // Filtered tenants for search
  const filteredTenants = useMemo(() => {
    if (!search.trim()) return tenants
    const q = search.toLowerCase()
    return tenants.filter((t) => t.name.toLowerCase().includes(q) || t.room.toLowerCase().includes(q) || t.phone?.includes(q))
  }, [tenants, search])

  // ----------------------------------------------------------------------------
  // REAL CRUD ACTIONS
  // ----------------------------------------------------------------------------

  // Save / Update Property (End-to-End verified)
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

    setIsSavingProperty(true)
    try {
      // Check if this property owner already has a property row
      let existingId = property.id
      if (!existingId) {
        const { data: existingProp } = await supabase
          .from('properties')
          .select('id')
          .eq('owner_id', userId)
          .maybeSingle()
        if (existingProp?.id) {
          existingId = existingProp.id
        }
      }

      let res
      if (existingId) {
        // Update existing property record
        res = await supabase
          .from('properties')
          .update({
            name,
            address,
            contact_number: contact,
            city,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingId)
          .eq('owner_id', userId)
          .select('id,name,address,contact_number,city')
          .single()
      } else {
        // Insert new property record for this authenticated owner
        res = await supabase
          .from('properties')
          .insert({
            owner_id: userId,
            name,
            address,
            contact_number: contact,
            city,
            updated_at: new Date().toISOString(),
          })
          .select('id,name,address,contact_number,city')
          .single()
      }

      if (res.error) {
        console.error('Property save error:', res.error)
        flash(`Could not save property: ${res.error.message || 'Database error'}`)
        return
      }

      if (res.data) {
        setProperty({
          id: res.data.id,
          name: res.data.name,
          address: res.data.address || '',
          contact: res.data.contact_number || '',
          city: res.data.city || '',
        })
        setShowPropertyModal(false)
        flash('Property details saved successfully!')
      }
    } catch (err: any) {
      console.error('Unexpected error saving property:', err)
      flash('An unexpected error occurred while saving property.')
    } finally {
      setIsSavingProperty(false)
    }
  }

  // Add Room
  async function handleAddRoom(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!userId || !property.id) {
      flash('Please set up your property before adding rooms.')
      setShowPropertyModal(true)
      return
    }

    const fd = new FormData(e.currentTarget)
    const roomNumber = String(fd.get('room_number')).trim()
    const floor = Number(fd.get('floor') || 0)
    const roomType = String(fd.get('room_type') || 'sharing')
    const baseRent = Number(fd.get('base_rent') || 0)
    const bedsCount = Math.max(1, Number(fd.get('beds_count') || 1))

    if (!roomNumber) return

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

    // Auto-create associated beds
    const bedsToInsert = Array.from({ length: bedsCount }, (_, i) => ({
      owner_id: userId,
      property_id: property.id,
      room_id: newRoom.id,
      bed_number: `${roomNumber}-${String.fromCharCode(65 + i)}`,
      status: 'available',
      monthly_rate: baseRent,
    }))

    await supabase.from('beds').insert(bedsToInsert)

    setRooms((prev) => [...prev, newRoom])
    setShowRoomModal(false)
    flash(`Room ${roomNumber} added with ${bedsCount} bed${bedsCount > 1 ? 's' : ''}.`)
  }

  // Delete Room
  async function handleDeleteRoom(roomId: string, roomNumber: string) {
    setConfirmDialog({
      open: true,
      title: `Delete Room ${roomNumber}?`,
      description: 'This will permanently remove the room, all configured beds, and disassociate any assigned tenants. This action cannot be undone.',
      actionLabel: 'Delete Room',
      isDestructive: true,
      onConfirm: async () => {
        const { error } = await supabase.from('rooms').delete().eq('id', roomId).eq('owner_id', userId)
        if (error) {
          flash('Could not delete room.')
          return
        }
        setRooms((prev) => prev.filter((r) => r.id !== roomId))
        setTenants((prev) => prev.map((t) => (t.room === roomNumber ? { ...t, room: 'Unassigned' } : t)))
        flash(`Room ${roomNumber} deleted.`)
      },
    })
  }

  // Add Tenant
  async function handleAddTenant(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!userId) return
    const fd = new FormData(e.currentTarget)
    const name = String(fd.get('name')).trim()
    const phone = String(fd.get('phone')).trim()
    const roomId = String(fd.get('room_id')) || null
    const rent = Number(fd.get('rent') || 0)
    const deposit = Number(fd.get('deposit') || 0)
    const joiningDate = String(fd.get('joining_date')) || new Date().toISOString().slice(0, 10)

    if (!name || rent <= 0) {
      flash('Please provide a valid tenant name and monthly rent.')
      return
    }

    if (!phone || !isValidPhone(phone)) {
      flash('Please enter a valid 10-15 digit tenant contact phone number.')
      return
    }

    const { data: newTenant, error } = await supabase
      .from('tenants')
      .insert({
        owner_id: userId,
        property_id: property.id || null,
        room_id: roomId && roomId !== 'unassigned' ? roomId : null,
        full_name: name,
        phone,
        monthly_rent: rent,
        security_deposit: deposit,
        joining_date: joiningDate,
        status: 'Pending',
      })
      .select('id,full_name,phone,monthly_rent,security_deposit,joining_date,status,room_id')
      .single()

    if (error) {
      flash('Could not create tenant record.')
      return
    }

    const roomName = rooms.find((r) => r.id === newTenant.room_id)?.room_number || 'Unassigned'

    setTenants((prev) => [
      {
        id: newTenant.id,
        name: newTenant.full_name,
        phone: newTenant.phone,
        room: roomName,
        rent: Number(newTenant.monthly_rent),
        deposit: Number(newTenant.security_deposit),
        joiningDate: newTenant.joining_date,
        status: 'Pending',
      },
      ...prev,
    ])

    setShowTenantModal(false)
    flash(`Tenant ${name} added successfully.`)
  }

  // Delete Tenant
  async function handleDeleteTenant(tenantId: string, tenantName: string) {
    setConfirmDialog({
      open: true,
      title: `Remove Tenant ${tenantName}?`,
      description: 'Are you sure you want to remove this tenant? Past payment history will remain recorded for tax and accounting integrity.',
      actionLabel: 'Remove Tenant',
      isDestructive: true,
      onConfirm: async () => {
        const { error } = await supabase.from('tenants').delete().eq('id', tenantId).eq('owner_id', userId)
        if (error) {
          flash('Could not remove tenant.')
          return
        }
        setTenants((prev) => prev.filter((t) => t.id !== tenantId))
        flash(`Tenant ${tenantName} removed.`)
      },
    })
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
    const notes = String(fd.get('notes') || '').trim()

    const targetTenant = tenants.find((t) => t.id === tenantId)
    if (!targetTenant || amount <= 0) {
      flash('Please select a valid tenant and specify the payment amount.')
      return
    }

    setConfirmDialog({
      open: true,
      title: 'Confirm Payment Entry',
      description: `Record payment of ${currency(amount)} from ${targetTenant.name} via ${method.toUpperCase()}? This will update the collection ledger and generate a formal receipt.`,
      actionLabel: 'Confirm Payment',
      isDestructive: false,
      onConfirm: async () => {
        const now = new Date().toISOString()
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
            notes,
          })
          .select('id,tenant_id,amount,payment_method,payment_type,paid_at,notes')
          .single()

        if (error) {
          flash('Could not save payment to ledger.')
          return
        }

        // Update tenant status to 'Paid'
        await supabase.from('tenants').update({ status: 'Paid' }).eq('id', tenantId)

        const recordedPayment: PaymentRecord = {
          id: newPayment.id,
          tenant_id: newPayment.tenant_id,
          tenant_name: targetTenant.name,
          room_number: targetTenant.room,
          amount: newPayment.amount,
          payment_method: newPayment.payment_method,
          payment_type: newPayment.payment_type,
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

  // Add Expense
  async function handleAddExpense(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
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
    flash('Expense logged.')
  }

  // Delete Expense
  async function handleDeleteExpense(id: string, title: string) {
    setConfirmDialog({
      open: true,
      title: `Delete Expense "${title}"?`,
      description: 'Remove this expense entry from your accounting log?',
      actionLabel: 'Delete Entry',
      isDestructive: true,
      onConfirm: async () => {
        await supabase.from('expenses').delete().eq('id', id).eq('owner_id', userId)
        setExpenses((prev) => prev.filter((e) => e.id !== id))
        flash('Expense entry deleted.')
      },
    })
  }

  // Add Electricity Reading
  async function handleAddElectricity(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
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
  }

  // Add Complaint
  async function handleAddComplaint(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!userId) return

    const fd = new FormData(e.currentTarget)
    const title = String(fd.get('title')).trim()
    const tenantName = String(fd.get('tenant') || 'Resident').trim()
    const priority = String(fd.get('priority') || 'Medium') as 'High' | 'Medium' | 'Low'
    const desc = String(fd.get('description') || '').trim()

    if (!title) return

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
    flash('Complaint registered.')
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

  // Sign out
  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="min-h-screen bg-[#f7f3ed] text-[#3d3934]">
      {/* Toast Notification */}
      {notice && (
        <div className="fixed right-5 top-5 z-50 flex items-center gap-2 rounded-xl bg-[#202536] px-4 py-3 text-xs font-semibold text-white shadow-xl transition-all">
          <Check className="size-4 text-[#8bd8b4]" />
          {notice}
        </div>
      )}

      {/* Sidebar Navigation */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col border-r border-[#e8dfd4] bg-white transition-transform lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-[74px] items-center justify-between border-b border-[#eee6dc] px-6">
          <div className="flex items-center gap-2.5">
            <div className="grid size-9 place-items-center rounded-xl bg-[#9a7651] text-white">
              <Building2 className="size-5" />
            </div>
            <div>
              <p className="text-[15px] font-bold tracking-tight">StayNest</p>
              <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-[#969baa]">Property SaaS</p>
            </div>
          </div>
          <button className="lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Close menu">
            <X className="size-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pt-6">
          <p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#9ca0ae]">Workspace</p>
          <nav className="flex flex-col gap-1">
            {navigation.map((item) => {
              const Icon = item.icon
              const isActive = active === item.label
              const openCount = item.label === 'Complaints' ? complaints.filter((c) => c.status !== 'Resolved').length : 0
              return (
                <button
                  key={item.label}
                  onClick={() => {
                    setActive(item.label)
                    setMobileOpen(false)
                  }}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] font-medium transition-colors ${
                    isActive ? 'bg-[#f1e8dc] text-[#866342]' : 'text-[#74798a] hover:bg-[#faf7f2]'
                  }`}
                >
                  <Icon className="size-[17px]" />
                  {item.label}
                  {openCount > 0 && (
                    <span className="ml-auto rounded-full bg-[#fff0f0] px-2 py-0.5 text-[10px] font-semibold text-[#d46d75]">
                      {openCount}
                    </span>
                  )}
                </button>
              )
            })}
          </nav>
        </div>

        {/* Subscription / Plan Box */}
        <div className="p-4">
          <div className="rounded-2xl border border-[#e8dfd4] bg-[#fbf8f3] p-4 text-xs">
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-bold text-[#9a7651]">
                <Sparkles className="size-3.5" />
                7-Day Free Trial
              </span>
              <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                isTrialExpired
                  ? 'bg-[#ffebe8] text-[#b95c3c]'
                  : isEndingSoon
                  ? 'bg-[#fff4e5] text-[#b46b1a]'
                  : 'bg-[#f4ede3] text-[#9a7651]'
              }`}>
                {isTrialExpired ? 'Expired' : hoursRemaining !== null && hoursRemaining < 48 ? `${hoursRemaining}h left` : daysRemaining !== null ? `${daysRemaining}d left` : 'Active'}
              </span>
            </div>
            <p className="mb-1 font-semibold text-[#403a34]">
              {isTrialExpired
                ? 'Your 7-day trial has concluded.'
                : 'You are currently using your 7-day free trial.'}
            </p>
            <p className="mb-2.5 text-[11px] leading-4 text-[#74798a]">
              {isTrialExpired
                ? 'Upgrade anytime to continue adding business records.'
                : isEndingSoon
                ? `Ending soon! Only ${hoursRemaining} hours left. Upgrade to prevent disruption.`
                : 'Your free trial is active. Upgrade anytime to continue after the trial ends.'}
            </p>
            {trialEnd && (
              <p className="mb-3 text-[10px] text-[#999daa]">
                Valid until {new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(trialEnd))}
              </p>
            )}
            <button
              onClick={() => setShowPricingModal(true)}
              className="w-full rounded-lg bg-[#9a7651] py-2 text-center text-xs font-semibold text-white shadow-sm hover:bg-[#866342]"
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
        <header className="sticky top-0 z-20 flex h-[74px] items-center justify-between border-b border-[#e8dfd4] bg-white px-5 sm:px-8">
          <div className="flex items-center gap-3">
            <button className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu">
              <Menu className="size-5" />
            </button>
            <div className="hidden items-center gap-2 text-xs text-[#969baa] sm:flex">
              <span>Workspace</span>
              <span>/</span>
              <span className="font-semibold text-[#44485a]">{active}</span>
            </div>
            <h1 className="text-base font-semibold lg:hidden">{active}</h1>
          </div>

          <div className="flex items-center gap-3">
            {/* Header Trial Status Pill */}
            <div className="hidden sm:flex items-center gap-2 rounded-full border border-[#e8dfd4] bg-[#fbf8f3] px-3 py-1.5 text-xs shadow-xs">
              <span className={`size-2 rounded-full ${isTrialExpired ? 'bg-[#b95c3c]' : isEndingSoon ? 'bg-[#d97706] animate-pulse' : 'bg-[#9a7651]'}`} />
              <span className="font-semibold text-[#5a4838]">
                {isTrialExpired
                  ? 'Trial Ended'
                  : hoursRemaining !== null && hoursRemaining < 48
                  ? `7-Day Trial: ${hoursRemaining}h remaining`
                  : `7-Day Trial: ${daysRemaining ?? 7}d remaining`}
              </span>
            </div>

            <div className="hidden items-center gap-2 rounded-lg border border-[#e8dfd4] px-3 py-2 text-xs text-[#a0a3b0] md:flex">
              <Search className="size-3.5" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tenant, room..."
                className="w-36 bg-transparent outline-none placeholder:text-[#a0a3b0]"
              />
            </div>

            <div className="flex items-center gap-2 border-l border-[#eceef2] pl-3">
              <div className="grid size-8 place-items-center rounded-full bg-[#f4ede3] text-xs font-bold text-[#9a7651]">
                {userName ? userName.slice(0, 2).toUpperCase() : 'PO'}
              </div>
              <div className="hidden sm:block">
                <p className="max-w-[130px] truncate text-xs font-bold">{userName}</p>
                <p className="text-[10px] text-[#999daa]">{property.name || 'Owner Workspace'}</p>
              </div>
              <button
                onClick={handleSignOut}
                title="Sign out"
                className="ml-2 rounded-lg p-1.5 text-[#9296a5] hover:bg-[#f7f3ed] hover:text-[#b95c3c]"
              >
                <LogOut className="size-4" />
              </button>
            </div>
          </div>
        </header>

        {/* Trial Ending Soon Alert Banner */}
        {!isTrialExpired && isEndingSoon && (
          <div className="border-b border-[#fed7aa] bg-[#fffbf5] px-6 py-2.5 text-xs text-[#9a540b]">
            <div className="mx-auto flex max-w-[1360px] items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="size-4 shrink-0 text-[#b46b1a]" />
                <span>
                  <strong>Your 7-day free trial is ending soon!</strong> You have {hoursRemaining} hours remaining. Upgrade anytime to continue after the trial ends.
                </span>
              </div>
              <button
                onClick={() => setShowPricingModal(true)}
                className="rounded-lg bg-[#9a7651] px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-[#866342]"
              >
                View Plans & Upgrade
              </button>
            </div>
          </div>
        )}

        {/* Trial Expiration Alert Banner */}
        {isTrialExpired && (
          <div className="border-b border-[#ffd9d4] bg-[#fff5f5] px-6 py-3 text-xs text-[#b95c3c]">
            <div className="mx-auto flex max-w-[1360px] items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="size-4 shrink-0 text-[#b95c3c]" />
                <span>
                  <strong>Your 7-day trial has concluded.</strong> Existing records are safe, but new entries require an active subscription.
                </span>
              </div>
              <button
                onClick={() => setShowPricingModal(true)}
                className="rounded-lg bg-[#b95c3c] px-3 py-1 text-xs font-semibold text-white shadow-sm"
              >
                Activate Subscription
              </button>
            </div>
          </div>
        )}

        {/* View Router */}
        <div className="mx-auto max-w-[1360px] px-5 py-7 sm:px-8 lg:px-10">
          {active === 'Overview' && (
            <OverviewTab
              property={property}
              rooms={rooms}
              tenants={tenants}
              payments={payments}
              collectedMonth={totalCollectedMonth}
              rentPending={totalRentPending}
              expensesMonth={totalExpensesMonth}
              daysRemaining={daysRemaining}
              hoursRemaining={hoursRemaining}
              isEndingSoon={isEndingSoon}
              isTrialExpired={isTrialExpired}
              trialStart={trialStart}
              trialEnd={trialEnd}
              onAddProperty={() => setShowPropertyModal(true)}
              onAddRoom={() => setShowRoomModal(true)}
              onAddTenant={() => setShowTenantModal(true)}
              onRecordPayment={() => setShowPaymentModal(true)}
              onViewPlans={() => setShowPricingModal(true)}
              onNavigate={setActive}
            />
          )}

          {active === 'Property' && (
            <PropertyTab property={property} onEdit={() => setShowPropertyModal(true)} roomsCount={rooms.length} tenantsCount={tenants.length} />
          )}

          {active === 'Rooms & Beds' && (
            <RoomsTab rooms={rooms} tenants={tenants} onAddRoom={() => setShowRoomModal(true)} onDeleteRoom={handleDeleteRoom} />
          )}

          {active === 'Tenants' && (
            <TenantsTab
              tenants={filteredTenants}
              onAddTenant={() => setShowTenantModal(true)}
              onDeleteTenant={handleDeleteTenant}
              onRecordPayment={() => setShowPaymentModal(true)}
            />
          )}

          {active === 'Rent & Payments' && (
            <PaymentsTab
              payments={payments}
              tenants={tenants}
              onRecordPayment={() => setShowPaymentModal(true)}
              onViewReceipt={(p: any) => setSelectedReceipt(p)}
            />
          )}

          {active === 'Electricity' && (
            <ElectricityTab records={electricity} onAddReading={() => setShowElectricityModal(true)} />
          )}

          {active === 'Expenses' && (
            <ExpensesTab
              expenses={expenses}
              totalMonth={totalExpensesMonth}
              onAddExpense={() => setShowExpenseModal(true)}
              onDeleteExpense={handleDeleteExpense}
            />
          )}

          {active === 'Complaints' && (
            <ComplaintsTab
              complaints={complaints}
              onAddComplaint={() => setShowComplaintModal(true)}
              onResolve={handleResolveComplaint}
            />
          )}

          {active === 'Reports' && (
            <ReportsTab
              property={property}
              rooms={rooms}
              tenants={tenants}
              revenueMonth={totalCollectedMonth}
              expensesMonth={totalExpensesMonth}
              rentPending={totalRentPending}
            />
          )}

          {active === 'Settings' && (
            <SettingsTab
              userName={userName}
              userEmail={userEmail}
              property={property}
              trialStart={trialStart}
              trialEnd={trialEnd}
              daysRemaining={daysRemaining}
              hoursRemaining={hoursRemaining}
              isEndingSoon={isEndingSoon}
              isTrialExpired={isTrialExpired}
              subscriptionPlan={subscriptionPlan}
              onEditProperty={() => setShowPropertyModal(true)}
              onViewPlans={() => setShowPricingModal(true)}
              onSignOut={handleSignOut}
            />
          )}
        </div>
      </main>

      {/* ---------------------------------------------------------------------- */}
      {/* MODALS & DIALOGS */}
      {/* ---------------------------------------------------------------------- */}

      {/* Property Setup Modal */}
      {showPropertyModal && (
        <Modal
          title={property.name ? 'Edit Property Details' : 'Set Up Your Property'}
          onClose={() => !isSavingProperty && setShowPropertyModal(false)}
        >
          <form onSubmit={handleSaveProperty} className="flex flex-col gap-4">
            <p className="text-xs text-[#74798a]">
              Please fill in your rental property details below. Required fields are marked with an asterisk (<span className="text-[#9a7651] font-bold">*</span>).
            </p>
            <Field label="Property Name" name="name" defaultValue={property.name} placeholder="e.g. Green Valley Residency" required />
            <Field label="Property Address" name="address" defaultValue={property.address} placeholder="Street, Locality, Area" required />
            <div className="grid grid-cols-2 gap-3">
              <Field label="City" name="city" defaultValue={property.city} placeholder="e.g. Bengaluru" />
              <Field label="Contact Phone" name="contact" defaultValue={property.contact} placeholder="e.g. 9876543210" />
            </div>
            <button
              disabled={isSavingProperty}
              className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-[#9a7651] py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#866342] disabled:opacity-60"
            >
              {isSavingProperty && <Loader2 className="size-4 animate-spin" />}
              {isSavingProperty ? 'Saving Property Details...' : 'Save Property Details'}
            </button>
          </form>
        </Modal>
      )}

      {/* Add Room Modal */}
      {showRoomModal && (
        <Modal title="Add Room & Beds" onClose={() => setShowRoomModal(false)}>
          <form onSubmit={handleAddRoom} className="flex flex-col gap-4">
            <Field label="Room Number / Name" name="room_number" placeholder="e.g. 101, A-2" required />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Floor Number" name="floor" type="number" defaultValue="1" required />
              <label className="flex flex-col gap-1.5 text-xs font-semibold text-[#555a6c]">
                Room Type
                <select name="room_type" className="rounded-xl border border-[#e4e6ec] bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-[#9a7651]">
                  <option value="Single">Single Occupancy</option>
                  <option value="Double Sharing">Double Sharing</option>
                  <option value="Triple Sharing">Triple Sharing</option>
                  <option value="Four Sharing">Four Sharing</option>
                </select>
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Bed Capacity" name="beds_count" type="number" defaultValue="2" min="1" required />
              <Field label="Monthly Base Rent (₹)" name="base_rent" type="number" placeholder="8500" required />
            </div>
            <button className="mt-2 rounded-xl bg-[#9a7651] py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#866342]">
              Configure Room
            </button>
          </form>
        </Modal>
      )}

      {/* Add Tenant Modal */}
      {showTenantModal && (
        <Modal title="Onboard New Tenant" onClose={() => setShowTenantModal(false)}>
          <form onSubmit={handleAddTenant} className="flex flex-col gap-4">
            <Field label="Full Name" name="name" placeholder="Tenant full name" required />
            <Field label="Contact Phone" name="phone" placeholder="10-digit mobile number" required />
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5 text-xs font-semibold text-[#555a6c]">
                Assign Room
                <select name="room_id" className="rounded-xl border border-[#e4e6ec] bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-[#9a7651]">
                  <option value="unassigned">Unassigned</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      Room {r.room_number} ({r.room_type})
                    </option>
                  ))}
                </select>
              </label>
              <Field label="Monthly Rent (₹)" name="rent" type="number" placeholder="8500" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Security Deposit (₹)" name="deposit" type="number" placeholder="10000" />
              <Field label="Joining Date" name="joining_date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required />
            </div>
            <button className="mt-2 rounded-xl bg-[#9a7651] py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#866342]">
              Create Tenant Record
            </button>
          </form>
        </Modal>
      )}

      {/* Record Payment Modal */}
      {showPaymentModal && (
        <Modal title="Record Rent / Utility Payment" onClose={() => setShowPaymentModal(false)}>
          <form onSubmit={handleRecordPayment} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-[#555a6c]">
              Select Resident
              <select name="tenant_id" required className="rounded-xl border border-[#e4e6ec] bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-[#9a7651]">
                <option value="">Choose resident...</option>
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} (Room {t.room}) - Due: {currency(t.rent)}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Amount Paid (₹)" name="amount" type="number" placeholder="8500" required />
              <label className="flex flex-col gap-1.5 text-xs font-semibold text-[#555a6c]">
                Payment Method
                <select name="payment_method" className="rounded-xl border border-[#e4e6ec] bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-[#9a7651]">
                  <option value="upi">UPI / GPay / PhonePe</option>
                  <option value="cash">Cash</option>
                  <option value="bank_transfer">Bank Transfer / NEFT</option>
                  <option value="card">Debit / Credit Card</option>
                </select>
              </label>
            </div>
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-[#555a6c]">
              Payment Type
              <select name="payment_type" className="rounded-xl border border-[#e4e6ec] bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-[#9a7651]">
                <option value="rent">Monthly Rent</option>
                <option value="deposit">Security Deposit</option>
                <option value="electricity">Electricity Charges</option>
                <option value="maintenance">Maintenance</option>
              </select>
            </label>
            <Field label="Notes / Reference (Optional)" name="notes" placeholder="e.g. UTR #12345678" />
            <button className="mt-2 rounded-xl bg-[#9a7651] py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#866342]">
              Record Payment
            </button>
          </form>
        </Modal>
      )}

      {/* Add Expense Modal */}
      {showExpenseModal && (
        <Modal title="Log Operating Expense" onClose={() => setShowExpenseModal(false)}>
          <form onSubmit={handleAddExpense} className="flex flex-col gap-4">
            <Field label="Description" name="title" placeholder="e.g. Water Tanker Refill, Wi-Fi Bill" required />
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5 text-xs font-semibold text-[#555a6c]">
                Category
                <select name="category" className="rounded-xl border border-[#e4e6ec] bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-[#9a7651]">
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
            <Field label="Notes / Vendor" name="notes" placeholder="Vendor name or remarks" />
            <button className="mt-2 rounded-xl bg-[#9a7651] py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#866342]">
              Save Expense Entry
            </button>
          </form>
        </Modal>
      )}

      {/* Add Electricity Modal */}
      {showElectricityModal && (
        <Modal title="Record Electricity Meter Reading" onClose={() => setShowElectricityModal(false)}>
          <form onSubmit={handleAddElectricity} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-[#555a6c]">
              Select Meter / Room
              <select name="room_id" className="rounded-xl border border-[#e4e6ec] bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-[#9a7651]">
                <option value="general">Building General Meter</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    Room {r.room_number} Meter
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Previous Reading (kWh)" name="previous_reading" type="number" defaultValue="0" required />
              <Field label="Current Reading (kWh)" name="current_reading" type="number" placeholder="150" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Rate per Unit (₹)" name="rate_per_unit" type="number" defaultValue="10" required />
              <Field label="Reading Date" name="reading_date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required />
            </div>
            <button className="mt-2 rounded-xl bg-[#9a7651] py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#866342]">
              Record Reading
            </button>
          </form>
        </Modal>
      )}

      {/* Add Complaint Modal */}
      {showComplaintModal && (
        <Modal title="Log Maintenance Ticket / Complaint" onClose={() => setShowComplaintModal(false)}>
          <form onSubmit={handleAddComplaint} className="flex flex-col gap-4">
            <Field label="Issue Summary" name="title" placeholder="e.g. Geyser not heating in Room 201" required />
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5 text-xs font-semibold text-[#555a6c]">
                Reported by Resident
                <select name="tenant" className="rounded-xl border border-[#e4e6ec] bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-[#9a7651]">
                  {tenants.map((t) => (
                    <option key={t.id} value={t.name}>
                      {t.name} (Room {t.room})
                    </option>
                  ))}
                  <option value="General Property">General Property Issue</option>
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-semibold text-[#555a6c]">
                Priority
                <select name="priority" className="rounded-xl border border-[#e4e6ec] bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-[#9a7651]">
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                  <option value="Low">Low</option>
                </select>
              </label>
            </div>
            <Field label="Details / Remarks" name="description" placeholder="Additional context for repair technician" />
            <button className="mt-2 rounded-xl bg-[#9a7651] py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#866342]">
              Register Complaint
            </button>
          </form>
        </Modal>
      )}

      {/* High-Risk Confirmation Modal */}
      {confirmDialog.open && (
        <Modal title={confirmDialog.title} onClose={() => setConfirmDialog((prev) => ({ ...prev, open: false }))}>
          <div className="flex flex-col gap-4">
            <p className="text-sm leading-6 text-[#74798a]">{confirmDialog.description}</p>
            <div className="mt-3 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmDialog((prev) => ({ ...prev, open: false }))}
                className="rounded-xl border border-[#e8dfd4] bg-white px-4 py-2.5 text-xs font-semibold text-[#676b7d] hover:bg-[#f7f3ed]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  await confirmDialog.onConfirm()
                  setConfirmDialog((prev) => ({ ...prev, open: false }))
                }}
                className={`rounded-xl px-4 py-2.5 text-xs font-semibold text-white shadow-sm ${
                  confirmDialog.isDestructive ? 'bg-[#b95c3c] hover:bg-[#a04e32]' : 'bg-[#9a7651] hover:bg-[#866342]'
                }`}
              >
                {confirmDialog.actionLabel}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Formal Receipt Preview & Print Modal */}
      {selectedReceipt && (
        <Modal title="Payment Receipt" onClose={() => setSelectedReceipt(null)}>
          <div className="rounded-2xl border border-[#e8dfd4] bg-[#faf7f2] p-6 text-sm" id="printable-receipt">
            <div className="flex items-start justify-between border-b border-[#e4d9cc] pb-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#9a7651]">StayNest Official Receipt</span>
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
              </div>
              <div>
                <p className="text-[#999daa]">Payment Date</p>
                <p className="font-semibold text-[#44485a]">{new Date(selectedReceipt.paid_at).toLocaleDateString('en-IN')}</p>
                <p className="text-[#74798a]">Mode: {selectedReceipt.payment_method.toUpperCase()}</p>
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-[#e8dfd4] bg-white p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">{selectedReceipt.payment_type === 'rent' ? 'Monthly Rent Payment' : selectedReceipt.payment_type}</p>
                  <p className="text-[11px] text-[#999daa]">{selectedReceipt.notes || 'Full settlement'}</p>
                </div>
                <p className="text-base font-bold text-[#866342]">{currency(selectedReceipt.amount)}</p>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-between text-[11px] text-[#999daa]">
              <span>Verified system record</span>
              <span>Generated by StayNest</span>
            </div>
          </div>

          <div className="mt-5 flex justify-end gap-3">
            <button
              onClick={() => setSelectedReceipt(null)}
              className="rounded-xl border border-[#e8dfd4] bg-white px-4 py-2.5 text-xs font-semibold text-[#676b7d]"
            >
              Close
            </button>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 rounded-xl bg-[#9a7651] px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-[#866342]"
            >
              <Printer className="size-4" />
              Print / Save PDF
            </button>
          </div>
        </Modal>
      )}

      {/* Pricing / Plan Modal */}
      {showPricingModal && (
        <Modal title="StayNest Subscription Plans" onClose={() => setShowPricingModal(false)}>
          <div className="flex flex-col gap-4 text-sm">
            <p className="text-xs text-[#74798a]">
              Transparent pricing designed for professional property management. No hidden commissions.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border-2 border-[#9a7651] bg-[#fbf8f3] p-5">
                <span className="rounded-full bg-[#f3eadf] px-2.5 py-0.5 text-[10px] font-bold uppercase text-[#9a7651]">Monthly</span>
                <p className="mt-3 text-2xl font-bold">₹1,699 <span className="text-xs font-normal text-[#85899a]">/ month</span></p>
                <p className="mt-1 text-xs text-[#776d62]">Flexible month-to-month billing. Cancel anytime.</p>
                <ul className="mt-4 flex flex-col gap-2 text-xs text-[#555a6c]">
                  <li className="flex items-center gap-1.5"><Check className="size-3.5 text-[#9a7651]" />Unlimited rooms & beds</li>
                  <li className="flex items-center gap-1.5"><Check className="size-3.5 text-[#9a7651]" />Tenant ledger & receipts</li>
                  <li className="flex items-center gap-1.5"><Check className="size-3.5 text-[#9a7651]" />Expense & utility tracking</li>
                </ul>
                <button
                  onClick={() => flash('Payment gateway checkout will open upon commercial activation.')}
                  className="mt-5 w-full rounded-xl bg-[#9a7651] py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-[#866342]"
                >
                  Subscribe Monthly
                </button>
              </div>

              <div className="rounded-2xl border border-[#e8dfd4] bg-white p-5">
                <span className="rounded-full bg-[#f4ede3] px-2.5 py-0.5 text-[10px] font-bold uppercase text-[#9a7651]">Yearly</span>
                <p className="mt-3 text-2xl font-bold">₹14,999 <span className="text-xs font-normal text-[#85899a]">/ year</span></p>
                <p className="mt-1 text-xs text-[#776d62]">Best value for long-term predictability.</p>
                <ul className="mt-4 flex flex-col gap-2 text-xs text-[#555a6c]">
                  <li className="flex items-center gap-1.5"><Check className="size-3.5 text-[#9a7651]" />All Monthly plan features</li>
                  <li className="flex items-center gap-1.5"><Check className="size-3.5 text-[#9a7651]" />Annual accounting exports</li>
                  <li className="flex items-center gap-1.5"><Check className="size-3.5 text-[#9a7651]" />Zero monthly disruptions</li>
                </ul>
                <button
                  onClick={() => flash('Payment gateway checkout will open upon commercial activation.')}
                  className="mt-5 w-full rounded-xl border border-[#9a7651] py-2.5 text-xs font-semibold text-[#866342] hover:bg-[#fbf8f3]"
                >
                  Subscribe Yearly
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ------------------------------------------------------------------------------
// SUB-COMPONENTS (TABS & VIEWS)
// ------------------------------------------------------------------------------

function OverviewTab({
  property,
  rooms,
  tenants,
  payments,
  collectedMonth,
  rentPending,
  expensesMonth,
  daysRemaining,
  hoursRemaining,
  isEndingSoon,
  isTrialExpired,
  trialStart,
  trialEnd,
  onAddProperty,
  onAddRoom,
  onAddTenant,
  onRecordPayment,
  onViewPlans,
  onNavigate,
}: any) {
  const today = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())

  return (
    <>
      <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-1 text-[12px] font-medium text-[#8b8fa0]">{today}</p>
          <h2 className="text-[26px] font-bold tracking-[-0.04em]">
            {property.name ? property.name : 'Welcome to StayNest'}
          </h2>
          <p className="mt-1 text-sm text-[#85899a]">Real-time operational summary of your rental property.</p>
        </div>
        <div className="flex gap-2">
          {!property.name ? (
            <button
              onClick={onAddProperty}
              className="flex items-center gap-2 rounded-xl bg-[#9a7651] px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-[#866342]"
            >
              <Plus className="size-4" /> Set Up Property
            </button>
          ) : (
            <button
              onClick={onRecordPayment}
              className="flex items-center gap-2 rounded-xl bg-[#9a7651] px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-[#866342]"
            >
              <Plus className="size-4" /> Record Payment
            </button>
          )}
        </div>
      </div>

      {/* Property Setup Onboarding Prompt if no property yet */}
      {!property.name && (
        <div className="mb-6 flex flex-col justify-between gap-4 rounded-2xl border-2 border-dashed border-[#d8c2aa] bg-[#fdfbf7] p-5 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3.5">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#f4ede3] text-[#9a7651]">
              <Building2 className="size-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#443e38]">Step 1: Set Up Your Rental Property</h3>
              <p className="mt-0.5 text-xs text-[#7d746a]">
                Configure your PG or hostel details, address, and contact number to start adding rooms, beds, and tenants.
              </p>
            </div>
          </div>
          <button
            onClick={onAddProperty}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#9a7651] px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-[#866342]"
          >
            <Plus className="size-4" /> Complete Property Setup
          </button>
        </div>
      )}

      {/* Trial Countdown Card */}
      <section className={`mb-6 flex flex-col justify-between gap-4 rounded-2xl border px-5 py-4 sm:flex-row sm:items-center ${
        isTrialExpired
          ? 'border-[#ffd9d4] bg-[#fff5f5]'
          : isEndingSoon
          ? 'border-[#fed7aa] bg-[#fffbf5]'
          : 'border-[#e6d8c9] bg-[#f4ede3]'
      }`}>
        <div className="flex items-start gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-white text-[#9a7651] shadow-xs">
            <Sparkles className="size-[17px]" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-bold text-[#594331]">
                {isTrialExpired
                  ? '7-Day Free Trial Concluded'
                  : 'You are currently using your 7-day free trial.'}
              </p>
              {!isTrialExpired && (
                <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${
                  isEndingSoon ? 'bg-[#ffeedd] text-[#b46b1a]' : 'bg-white text-[#9a7651]'
                }`}>
                  {hoursRemaining !== null && hoursRemaining < 48 ? `${hoursRemaining} hours remaining` : `${daysRemaining ?? 7} days remaining`}
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-[#696c9b]">
              {isTrialExpired
                ? 'Your 7-day trial period has ended. Your existing records are safely preserved. Upgrade to a plan to continue operations.'
                : isEndingSoon
                ? `Your trial is ending soon (${hoursRemaining} hours remaining). Upgrade anytime to ensure seamless continuity for your PG.`
                : 'Your free trial is active. Upgrade anytime to continue after the trial ends.'}
            </p>
            {trialStart && trialEnd && (
              <p className="mt-1 text-[11px] text-[#8e857b]">
                Trial window: {new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(new Date(trialStart))} – {new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(trialEnd))}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => onNavigate('Reports')}
            className="rounded-lg border border-[#c8c9f3] bg-white px-3 py-2 text-xs font-semibold text-[#866342] hover:bg-[#faf7f2]"
          >
            View Reports
          </button>
          <button
            onClick={onViewPlans}
            className="rounded-lg bg-[#9a7651] px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#866342]"
          >
            Upgrade Plan
          </button>
        </div>
      </section>

      {/* Metrics Row (Real Data) */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Configured Rooms" value={rooms.length} note={`${rooms.length} active room${rooms.length === 1 ? '' : 's'}`} Icon={DoorOpen} i={0} />
        <MetricCard label="Total Residents" value={tenants.length} note={tenants.length ? 'Registered tenants' : 'No tenants added'} Icon={Users} i={1} />
        <MetricCard label="Rent Collected" value={currency(collectedMonth)} note="Current month collections" Icon={Wallet} i={2} />
        <MetricCard label="Operating Expenses" value={currency(expensesMonth)} note="Current month expenses" Icon={Receipt} i={3} />
      </div>

      {/* Overview Body */}
      <div className="grid gap-5 xl:grid-cols-[1.35fr_1fr]">
        {/* Rent Summary Box */}
        <section className="rounded-2xl border border-[#e9ebf0] bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">Rent Collection Status</h3>
              <p className="mt-1 text-xs text-[#999daa]">Active month collection tracking</p>
            </div>
            <button
              onClick={onRecordPayment}
              className="rounded-lg border border-[#e8dfd4] px-3 py-1.5 text-xs font-medium text-[#676b7d] hover:bg-[#fbf8f3]"
            >
              Record Payment
            </button>
          </div>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6 rounded-xl bg-[#faf7f2] p-5">
            <div className="grid size-20 shrink-0 place-items-center rounded-full border-[7px] border-[#e8e8ff] border-t-[#9a7651] text-lg font-bold">
              {tenants.length ? Math.round((tenants.filter((t: Tenant) => t.status === 'Paid').length / tenants.length) * 100) : 0}%
            </div>
            <div>
              <p className="text-sm font-semibold">
                {tenants.filter((t: Tenant) => t.status === 'Paid').length} of {tenants.length} residents settled
              </p>
              <p className="mt-1 text-xs leading-5 text-[#85899a]">
                Pending Collection: <strong className="text-[#b95c3c]">{currency(rentPending)}</strong>
              </p>
            </div>
          </div>
        </section>

        {/* Quick Actions */}
        <section className="rounded-2xl border border-[#e9ebf0] bg-white p-6 shadow-sm">
          <div className="mb-5">
            <h3 className="text-sm font-semibold">Quick Actions</h3>
            <p className="mt-1 text-xs text-[#999daa]">Common property operations</p>
          </div>
          <div className="grid gap-2.5">
            {[
              ['Configure Property Profile', Building2, onAddProperty],
              ['Add Room & Beds', DoorOpen, onAddRoom],
              ['Onboard Tenant', Users, onAddTenant],
              ['Record Payment', Wallet, onRecordPayment],
            ].map(([label, Icon, action]: any) => (
              <button
                key={label}
                onClick={action}
                className="flex items-center gap-3 rounded-xl border border-[#eee6dc] px-3.5 py-3 text-left text-xs font-medium text-[#555a6c] transition-colors hover:bg-[#fbf8f3]"
              >
                <span className="grid size-8 place-items-center rounded-lg bg-[#f4ede3] text-[#9a7651]">
                  <Icon className="size-4" />
                </span>
                {label}
                <span className="ml-auto text-[#b3b6c0]">→</span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </>
  )
}

function PropertyTab({ property, onEdit, roomsCount, tenantsCount }: any) {
  return (
    <div className="rounded-2xl border border-[#e9ebf0] bg-white p-6 shadow-sm">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center border-b border-[#f0f1f4] pb-6">
        <div className="flex items-center gap-4">
          <div className="grid size-14 place-items-center rounded-2xl bg-[#f4ede3] text-[#9a7651]">
            <Building2 className="size-7" />
          </div>
          <div>
            <h3 className="text-xl font-bold">{property.name || 'No Property Configured'}</h3>
            <p className="text-xs text-[#85899a]">{property.address ? `${property.address}, ${property.city}` : 'Add your rental property details.'}</p>
          </div>
        </div>
        <button
          onClick={onEdit}
          className="rounded-xl bg-[#9a7651] px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-[#866342]"
        >
          {property.name ? 'Edit Details' : 'Add Property'}
        </button>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-[#eee6dc] bg-[#faf7f2] p-4">
          <p className="text-xs text-[#999daa]">Registered Rooms</p>
          <p className="mt-1 text-2xl font-bold">{roomsCount}</p>
        </div>
        <div className="rounded-xl border border-[#eee6dc] bg-[#faf7f2] p-4">
          <p className="text-xs text-[#999daa]">Active Tenants</p>
          <p className="mt-1 text-2xl font-bold">{tenantsCount}</p>
        </div>
        <div className="rounded-xl border border-[#eee6dc] bg-[#faf7f2] p-4">
          <p className="text-xs text-[#999daa]">Contact Phone</p>
          <p className="mt-1 text-sm font-semibold">{property.contact || 'Not provided'}</p>
        </div>
      </div>
    </div>
  )
}

function RoomsTab({ rooms, tenants, onAddRoom, onDeleteRoom }: any) {
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Rooms & Beds</h2>
          <p className="text-xs text-[#85899a]">Manage room configurations and capacity.</p>
        </div>
        <button
          onClick={onAddRoom}
          className="flex items-center gap-2 rounded-xl bg-[#9a7651] px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-[#866342]"
        >
          <Plus className="size-4" /> Add Room
        </button>
      </div>

      {rooms.length === 0 ? (
        <EmptyState title="No rooms configured yet" description="Add your first room with bed capacity to begin assigning tenants." action={onAddRoom} actionLabel="Add Room" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rooms.map((r: Room) => {
            const assignedCount = tenants.filter((t: Tenant) => t.room === r.room_number).length
            return (
              <div key={r.id} className="rounded-2xl border border-[#e9ebf0] bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="rounded-md bg-[#f4ede3] px-2 py-0.5 text-[10px] font-bold text-[#9a7651]">Floor {r.floor}</span>
                    <h3 className="mt-2 text-lg font-bold">Room {r.room_number}</h3>
                    <p className="text-xs text-[#85899a]">{r.room_type}</p>
                  </div>
                  <button
                    onClick={() => onDeleteRoom(r.id, r.room_number)}
                    className="rounded-lg p-1.5 text-[#a0a3af] hover:bg-[#fff0f0] hover:text-[#b95c3c]"
                    title="Delete room"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
                <div className="mt-6 flex items-center justify-between border-t border-[#f0f1f4] pt-4 text-xs">
                  <div>
                    <p className="text-[#999daa]">Monthly Base</p>
                    <p className="font-bold text-[#44485a]">{currency(r.base_rent)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[#999daa]">Assigned Residents</p>
                    <p className="font-bold text-[#866342]">{assignedCount} tenant{assignedCount === 1 ? '' : 's'}</p>
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

function TenantsTab({ tenants, onAddTenant, onDeleteTenant, onRecordPayment }: any) {
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Tenants & Residents</h2>
          <p className="text-xs text-[#85899a]">Active resident directory and rent status.</p>
        </div>
        <button
          onClick={onAddTenant}
          className="flex items-center gap-2 rounded-xl bg-[#9a7651] px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-[#866342]"
        >
          <Plus className="size-4" /> Onboard Tenant
        </button>
      </div>

      {tenants.length === 0 ? (
        <EmptyState title="No tenants registered yet" description="Add resident profiles, room allocations, and rent terms." action={onAddTenant} actionLabel="Onboard Tenant" />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[#e9ebf0] bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-xs">
              <thead className="border-b border-[#eee6dc] bg-[#faf7f2] font-semibold text-[#85899a]">
                <tr>
                  <th className="px-5 py-3.5">Resident Name</th>
                  <th className="px-5 py-3.5">Contact</th>
                  <th className="px-5 py-3.5">Room</th>
                  <th className="px-5 py-3.5">Monthly Rent</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eee6dc]">
                {tenants.map((t: Tenant) => (
                  <tr key={t.id} className="hover:bg-[#fbf8f3]">
                    <td className="px-5 py-4 font-bold text-[#3d3934]">{t.name}</td>
                    <td className="px-5 py-4 text-[#676b7d]">{t.phone || '—'}</td>
                    <td className="px-5 py-4 text-[#676b7d]">{t.room}</td>
                    <td className="px-5 py-4 font-semibold text-[#866342]">{currency(t.rent)}</td>
                    <td className="px-5 py-4">
                      <span
                        className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
                          t.status === 'Paid' ? 'bg-[#e7f7f0] text-[#328d68]' : 'bg-[#fff7e7] text-[#c58a35]'
                        }`}
                      >
                        {t.status}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {t.status !== 'Paid' && (
                          <button onClick={onRecordPayment} className="font-semibold text-[#9a7651] hover:underline">
                            Collect
                          </button>
                        )}
                        <button
                          onClick={() => onDeleteTenant(t.id, t.name)}
                          className="rounded-lg p-1 text-[#a0a3af] hover:text-[#b95c3c]"
                          title="Remove tenant"
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

function PaymentsTab({ payments, tenants, onRecordPayment, onViewReceipt }: any) {
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Rent & Payments Ledger</h2>
          <p className="text-xs text-[#85899a]">Confirmed payment records and formal receipts.</p>
        </div>
        <button
          onClick={onRecordPayment}
          className="flex items-center gap-2 rounded-xl bg-[#9a7651] px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-[#866342]"
        >
          <Plus className="size-4" /> Record Payment
        </button>
      </div>

      {payments.length === 0 ? (
        <EmptyState title="No payments recorded yet" description="Record rent collections to generate receipts and update ledger records." action={onRecordPayment} actionLabel="Record First Payment" />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[#e9ebf0] bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-xs">
              <thead className="border-b border-[#eee6dc] bg-[#faf7f2] font-semibold text-[#85899a]">
                <tr>
                  <th className="px-5 py-3.5">Receipt #</th>
                  <th className="px-5 py-3.5">Resident</th>
                  <th className="px-5 py-3.5">Type</th>
                  <th className="px-5 py-3.5">Method</th>
                  <th className="px-5 py-3.5">Date</th>
                  <th className="px-5 py-3.5">Amount</th>
                  <th className="px-5 py-3.5 text-right">Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eee6dc]">
                {payments.map((p: PaymentRecord) => (
                  <tr key={p.id} className="hover:bg-[#fbf8f3]">
                    <td className="px-5 py-4 font-mono font-bold text-[#676b7d]">REC-{p.id.slice(0, 8).toUpperCase()}</td>
                    <td className="px-5 py-4 font-semibold text-[#3d3934]">{p.tenant_name}</td>
                    <td className="px-5 py-4 uppercase text-[10px] text-[#85899a]">{p.payment_type}</td>
                    <td className="px-5 py-4 uppercase text-[10px] text-[#85899a]">{p.payment_method}</td>
                    <td className="px-5 py-4 text-[#676b7d]">{new Date(p.paid_at).toLocaleDateString('en-IN')}</td>
                    <td className="px-5 py-4 font-bold text-[#328d68]">{currency(p.amount)}</td>
                    <td className="px-5 py-4 text-right">
                      <button onClick={() => onViewReceipt(p)} className="font-semibold text-[#9a7651] hover:underline">
                        View Receipt
                      </button>
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

function ElectricityTab({ records, onAddReading }: any) {
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Electricity & Utilities</h2>
          <p className="text-xs text-[#85899a]">Meter reading logger and consumption calculations.</p>
        </div>
        <button
          onClick={onAddReading}
          className="flex items-center gap-2 rounded-xl bg-[#9a7651] px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-[#866342]"
        >
          <Plus className="size-4" /> Record Meter Reading
        </button>
      </div>

      {records.length === 0 ? (
        <EmptyState title="No electricity readings recorded" description="Track previous and current meter readings to calculate utility charges." action={onAddReading} actionLabel="Record Reading" />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[#e9ebf0] bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-xs">
              <thead className="border-b border-[#eee6dc] bg-[#faf7f2] font-semibold text-[#85899a]">
                <tr>
                  <th className="px-5 py-3.5">Meter / Room</th>
                  <th className="px-5 py-3.5">Previous (kWh)</th>
                  <th className="px-5 py-3.5">Current (kWh)</th>
                  <th className="px-5 py-3.5">Units Consumed</th>
                  <th className="px-5 py-3.5">Rate / Unit</th>
                  <th className="px-5 py-3.5">Total Amount</th>
                  <th className="px-5 py-3.5">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eee6dc]">
                {records.map((el: ElectricityRecord) => {
                  const units = Math.max(0, el.current_reading - el.previous_reading)
                  const total = units * el.rate_per_unit
                  return (
                    <tr key={el.id} className="hover:bg-[#fbf8f3]">
                      <td className="px-5 py-4 font-bold text-[#3d3934]">Room {el.room}</td>
                      <td className="px-5 py-4 text-[#676b7d]">{el.previous_reading}</td>
                      <td className="px-5 py-4 text-[#676b7d]">{el.current_reading}</td>
                      <td className="px-5 py-4 font-bold text-[#866342]">{units} units</td>
                      <td className="px-5 py-4 text-[#676b7d]">{currency(el.rate_per_unit)}</td>
                      <td className="px-5 py-4 font-bold text-[#44485a]">{currency(total)}</td>
                      <td className="px-5 py-4 text-[#85899a]">{new Date(el.reading_date).toLocaleDateString('en-IN')}</td>
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

function ExpensesTab({ expenses, totalMonth, onAddExpense, onDeleteExpense }: any) {
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Operating Expenses</h2>
          <p className="text-xs text-[#85899a]">Track day-to-day property maintenance and utility bills.</p>
        </div>
        <button
          onClick={onAddExpense}
          className="flex items-center gap-2 rounded-xl bg-[#9a7651] px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-[#866342]"
        >
          <Plus className="size-4" /> Log Expense
        </button>
      </div>

      <div className="mb-6 rounded-2xl border border-[#e8dfd4] bg-[#faf7f2] p-5">
        <p className="text-xs text-[#999daa]">Total Expenses This Month</p>
        <p className="mt-1 text-2xl font-bold text-[#b95c3c]">{currency(totalMonth)}</p>
      </div>

      {expenses.length === 0 ? (
        <EmptyState title="No expenses logged yet" description="Keep operating expenses organized for accurate monthly net income reporting." action={onAddExpense} actionLabel="Log Expense" />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[#e9ebf0] bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-xs">
              <thead className="border-b border-[#eee6dc] bg-[#faf7f2] font-semibold text-[#85899a]">
                <tr>
                  <th className="px-5 py-3.5">Expense Item</th>
                  <th className="px-5 py-3.5">Category</th>
                  <th className="px-5 py-3.5">Date</th>
                  <th className="px-5 py-3.5">Amount</th>
                  <th className="px-5 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eee6dc]">
                {expenses.map((e: Expense) => (
                  <tr key={e.id} className="hover:bg-[#fbf8f3]">
                    <td className="px-5 py-4">
                      <p className="font-bold text-[#3d3934]">{e.title}</p>
                      {e.notes && <p className="text-[10px] text-[#999daa]">{e.notes}</p>}
                    </td>
                    <td className="px-5 py-4">
                      <span className="rounded-full bg-[#f4ede3] px-2.5 py-1 text-[10px] font-semibold uppercase text-[#9a7651]">
                        {e.category}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-[#676b7d]">{new Date(e.expense_date).toLocaleDateString('en-IN')}</td>
                    <td className="px-5 py-4 font-bold text-[#b95c3c]">{currency(e.amount)}</td>
                    <td className="px-5 py-4 text-right">
                      <button
                        onClick={() => onDeleteExpense(e.id, e.title)}
                        className="rounded-lg p-1 text-[#a0a3af] hover:text-[#b95c3c]"
                        title="Delete expense"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
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

function ComplaintsTab({ complaints, onAddComplaint, onResolve }: any) {
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Resident Complaints & Maintenance</h2>
          <p className="text-xs text-[#85899a]">Track repair requests and resolve resident issues promptly.</p>
        </div>
        <button
          onClick={onAddComplaint}
          className="flex items-center gap-2 rounded-xl bg-[#9a7651] px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-[#866342]"
        >
          <Plus className="size-4" /> Log Complaint
        </button>
      </div>

      {complaints.length === 0 ? (
        <EmptyState title="No complaints logged" description="Everything is running smoothly! Log maintenance tickets when reported by residents." action={onAddComplaint} actionLabel="Log Ticket" />
      ) : (
        <div className="grid gap-3">
          {complaints.map((c: Complaint) => (
            <div key={c.id} className="flex flex-col gap-4 rounded-2xl border border-[#e9ebf0] bg-white p-5 shadow-sm sm:flex-row sm:items-center">
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
                      c.status === 'Resolved' ? 'bg-[#e7f7f0] text-[#328d68]' : 'bg-[#f4ede3] text-[#9a7651]'
                    }`}
                  >
                    {c.status}
                  </span>
                </div>
                <h4 className="text-sm font-bold text-[#3d3934]">{c.title}</h4>
                <p className="mt-1 text-xs text-[#85899a]">Reported by {c.tenant} on {new Date(c.created_at).toLocaleDateString('en-IN')}</p>
                {c.description && <p className="mt-2 text-xs text-[#676b7d]">{c.description}</p>}
              </div>

              {c.status !== 'Resolved' && (
                <button
                  onClick={() => onResolve(c.id)}
                  className="rounded-lg border border-[#9a7651] px-3.5 py-2 text-xs font-semibold text-[#866342] hover:bg-[#fbf8f3]"
                >
                  Mark Resolved
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ReportsTab({ property, rooms, tenants, revenueMonth, expensesMonth, rentPending }: any) {
  const netOperatingIncome = revenueMonth - expensesMonth
  const collectionRate = tenants.length ? Math.round((tenants.filter((t: any) => t.status === 'Paid').length / tenants.length) * 100) : 0

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold tracking-tight">Property Performance Reports</h2>
        <p className="text-xs text-[#85899a]">Financial ledger calculations based on real database records.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-[#e9ebf0] bg-white p-5 shadow-sm">
          <p className="text-xs text-[#999daa]">Monthly Revenue</p>
          <p className="mt-1 text-2xl font-bold text-[#328d68]">{currency(revenueMonth)}</p>
          <p className="mt-1 text-[11px] text-[#a4a7b2]">Confirmed payments</p>
        </div>

        <div className="rounded-2xl border border-[#e9ebf0] bg-white p-5 shadow-sm">
          <p className="text-xs text-[#999daa]">Operating Expenses</p>
          <p className="mt-1 text-2xl font-bold text-[#b95c3c]">{currency(expensesMonth)}</p>
          <p className="mt-1 text-[11px] text-[#a4a7b2]">Maintenance & bills</p>
        </div>

        <div className="rounded-2xl border border-[#e9ebf0] bg-white p-5 shadow-sm">
          <p className="text-xs text-[#999daa]">Net Operating Income</p>
          <p className={`mt-1 text-2xl font-bold ${netOperatingIncome >= 0 ? 'text-[#866342]' : 'text-[#b95c3c]'}`}>
            {currency(netOperatingIncome)}
          </p>
          <p className="mt-1 text-[11px] text-[#a4a7b2]">Revenue minus expenses</p>
        </div>

        <div className="rounded-2xl border border-[#e9ebf0] bg-white p-5 shadow-sm">
          <p className="text-xs text-[#999daa]">Collection Efficiency</p>
          <p className="mt-1 text-2xl font-bold text-[#44485a]">{collectionRate}%</p>
          <p className="mt-1 text-[11px] text-[#a4a7b2]">Paid vs pending residents</p>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-[#e9ebf0] bg-white p-6 shadow-sm">
        <h3 className="text-sm font-bold">Property Health Summary</h3>
        <p className="mt-1 text-xs text-[#85899a]">Overview of active capacity</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-3 text-xs">
          <div className="rounded-xl border border-[#eee6dc] bg-[#faf7f2] p-4">
            <p className="text-[#999daa]">Configured Rooms</p>
            <p className="mt-1 text-xl font-bold">{rooms.length}</p>
          </div>
          <div className="rounded-xl border border-[#eee6dc] bg-[#faf7f2] p-4">
            <p className="text-[#999daa]">Active Tenants</p>
            <p className="mt-1 text-xl font-bold">{tenants.length}</p>
          </div>
          <div className="rounded-xl border border-[#eee6dc] bg-[#faf7f2] p-4">
            <p className="text-[#999daa]">Outstanding Due Rent</p>
            <p className="mt-1 text-xl font-bold text-[#b95c3c]">{currency(rentPending)}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function SettingsTab({
  userName,
  userEmail,
  property,
  trialStart,
  trialEnd,
  daysRemaining,
  hoursRemaining,
  isEndingSoon,
  isTrialExpired,
  subscriptionPlan,
  onEditProperty,
  onViewPlans,
  onSignOut,
}: any) {
  return (
    <div className="max-w-2xl space-y-6">
      <div className="rounded-2xl border border-[#e9ebf0] bg-white p-6 shadow-sm">
        <h3 className="text-base font-bold text-[#3d3934]">Account Information</h3>
        <p className="text-xs text-[#85899a]">Your authenticated profile details.</p>
        <div className="mt-5 space-y-3 text-xs">
          <div>
            <p className="text-[#999daa]">Account Role</p>
            <p className="font-semibold text-[#44485a]">Property Owner (Customer)</p>
          </div>
          <div>
            <p className="text-[#999daa]">Full Name</p>
            <p className="font-semibold text-[#44485a]">{userName}</p>
          </div>
          <div>
            <p className="text-[#999daa]">Registered Email</p>
            <p className="font-semibold text-[#44485a]">{userEmail}</p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-[#e9ebf0] bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-[#3d3934]">Property Details</h3>
            <p className="text-xs text-[#85899a]">Default property profile used for tenant receipts.</p>
          </div>
          <button
            onClick={onEditProperty}
            className="rounded-lg border border-[#9a7651] px-3.5 py-1.5 text-xs font-semibold text-[#866342] hover:bg-[#fbf8f3]"
          >
            {property.name ? 'Edit' : 'Set Up Property'}
          </button>
        </div>
        <div className="mt-5 space-y-2 text-xs">
          <p className="font-bold text-[#3d3934]">{property.name || 'No property set up yet'}</p>
          <p className="text-[#676b7d]">{property.address ? `${property.address}${property.city ? `, ${property.city}` : ''}` : 'Address not configured'}</p>
          <p className="text-[#676b7d]">{property.contact ? `Phone: ${property.contact}` : 'Phone not configured'}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-[#e9ebf0] bg-white p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 font-bold text-[#9a7651]">
                <Sparkles className="size-4" />
                7-Day Free Trial
              </span>
              <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${
                isTrialExpired ? 'bg-[#ffebe8] text-[#b95c3c]' : isEndingSoon ? 'bg-[#fff4e5] text-[#b46b1a]' : 'bg-[#f4ede3] text-[#9a7651]'
              }`}>
                {isTrialExpired ? 'Expired' : hoursRemaining !== null && hoursRemaining < 48 ? `${hoursRemaining}h remaining` : `${daysRemaining ?? 7} days remaining`}
              </span>
            </div>
            <p className="mt-2 text-sm font-semibold text-[#3d3934]">
              {isTrialExpired
                ? 'Your 7-day trial period has ended.'
                : 'You are currently using your 7-day free trial.'}
            </p>
            <p className="mt-1 text-xs text-[#74798a]">
              {isTrialExpired
                ? 'All historical records are safely retained. Upgrade anytime to continue day-to-day operations.'
                : 'Your free trial is active with full access to all workspace features. Upgrade anytime to continue after the trial ends.'}
            </p>
            {trialStart && trialEnd && (
              <p className="mt-2 text-[11px] text-[#999daa]">
                Trial window: {new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(new Date(trialStart))} to {new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(trialEnd))}
              </p>
            )}
          </div>
          <button
            onClick={onViewPlans}
            className="self-start sm:self-center shrink-0 rounded-xl bg-[#9a7651] px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-[#866342]"
          >
            View Plans & Upgrade
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-[#ffe4e4] bg-[#fffbfb] p-6">
        <h3 className="text-base font-bold text-[#b95c3c]">Session & Sign Out</h3>
        <p className="mt-1 text-xs text-[#a04e32]">Securely end your current management session.</p>
        <button
          onClick={onSignOut}
          className="mt-4 rounded-xl border border-[#b95c3c] bg-white px-4 py-2 text-xs font-semibold text-[#b95c3c] hover:bg-[#fff5f5]"
        >
          Sign Out of StayNest
        </button>
      </div>
    </div>
  )
}

function MetricCard({ label, value, note, Icon, i }: any) {
  const bgClasses = [
    'bg-[#f4ede3] text-[#9a7651]',
    'bg-[#e7f7f0] text-[#328d68]',
    'bg-[#eaf4ff] text-[#4d7ca8]',
    'bg-[#fff0e9] text-[#c46e4d]',
  ]
  return (
    <div className="rounded-2xl border border-[#e9ebf0] bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div className={`grid size-9 place-items-center rounded-xl ${bgClasses[i % 4]}`}>
          <Icon className="size-[17px]" />
        </div>
      </div>
      <p className="text-[12px] text-[#9296a5]">{label}</p>
      <p className="mt-1 text-[24px] font-bold tracking-tight text-[#3d3934]">{value}</p>
      <p className="mt-1 text-[11px] text-[#a4a7b2]">{note}</p>
    </div>
  )
}

function EmptyState({ title, description, action, actionLabel }: any) {
  return (
    <div className="grid min-h-60 place-items-center rounded-2xl border border-dashed border-[#e4d9cc] bg-white p-8 text-center shadow-sm">
      <div className="max-w-sm">
        <h4 className="text-sm font-bold text-[#44485a]">{title}</h4>
        <p className="mt-1 text-xs leading-5 text-[#85899a]">{description}</p>
        {action && (
          <button
            onClick={action}
            className="mt-5 rounded-xl bg-[#9a7651] px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-[#866342]"
          >
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  )
}

function Field({ label, name, placeholder, type = 'text', defaultValue = '', min, required = false }: any) {
  return (
    <label className="flex flex-col gap-1.5 text-xs font-semibold text-[#555a6c]">
      <span>
        {label} {required && <span className="font-bold text-[#9a7651]">*</span>}
      </span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        min={min}
        required={required}
        className="rounded-xl border border-[#e4e6ec] bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-[#9a7651] focus:ring-1 focus:ring-[#9a7651]"
      />
    </label>
  )
}

function Modal({ title, onClose, children }: any) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#202536]/30 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-[#e8dfd4] bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between border-b border-[#f0f1f4] pb-3">
          <h3 className="text-base font-bold text-[#3d3934]">{title}</h3>
          <button onClick={onClose} aria-label="Close dialog" className="rounded-lg p-1.5 text-[#85899a] hover:bg-[#f7f7fa]">
            <X className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
