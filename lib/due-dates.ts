/**
 * StayNest SaaS - Rent Due Dates, Overdue Status & Reminder Generators
 * Handles exact timestamp in owner timezone, rent_due_day, overdue badges,
 * and one-click WhatsApp/SMS notification generation.
 */

export interface DueStatusResult {
  status: 'paid' | 'due_today' | 'due_soon' | 'overdue'
  days: number
  months?: number
  remainingDays?: number
  labelEn: string
  labelHi: string
  badgeColor: string
}

/**
 * Calculates real-time rent due and overdue status for a tenant.
 * Backwards-compatible signature supporting legacy day/paid checks,
 * and enhanced with optional joiningDate and schedule awareness.
 *
 * @param rentDueDay Day of month rent is due (1-31, defaults to 5)
 * @param isPaid Whether tenant is marked Paid for current billing cycle
 * @param referenceDate Optional date to evaluate against (defaults to now)
 * @param customOverdueDays Optional manual override of overdue days
 * @param joiningDate Optional joining date to enforce "due next month if joined this month" law
 */
export function calculateRentDueStatus(
  rentDueDay: number = 5,
  isPaid: boolean = false,
  referenceDate: Date = new Date(),
  customOverdueDays?: number,
  joiningDate?: string | Date | null
): DueStatusResult {
  if (isPaid) {
    return {
      status: 'paid',
      days: 0,
      labelEn: 'Paid On Time',
      labelHi: 'समय पर भुगतान',
      badgeColor: 'bg-[#eaf5ea] text-[#2e7d32] border-[#c5e6c7]',
    }
  }

  const safeDay = Math.min(Math.max(Number(rentDueDay) || 5, 1), 31)
  const currentYear = referenceDate.getFullYear()
  const currentMonth = referenceDate.getMonth() // 0-indexed
  const currentDate = referenceDate.getDate()

  // If tenant joined in the same month as referenceDate, their first upcoming rent is due NEXT month
  if (joiningDate) {
    const jd = new Date(joiningDate)
    if (!isNaN(jd.getTime()) && jd.getFullYear() === currentYear && jd.getMonth() === currentMonth) {
      // Tenant joined this month (e.g. joined on 10th). Next rent is due on 10th of following month.
      const nextMonth = currentMonth + 1
      const nextYear = currentYear + Math.floor(nextMonth / 12)
      const normNextMonth = nextMonth % 12
      const daysInNextMonth = new Date(nextYear, normNextMonth + 1, 0).getDate()
      const effectiveDueDayNext = Math.min(safeDay, daysInNextMonth)
      const nextDueDate = new Date(nextYear, normNextMonth, effectiveDueDayNext, 23, 59, 59)
      const msLeft = nextDueDate.getTime() - referenceDate.getTime()
      const daysLeft = Math.max(1, Math.ceil(msLeft / (1000 * 60 * 60 * 24)))

      return {
        status: 'due_soon',
        days: daysLeft,
        labelEn: daysLeft === 1 ? 'Due tomorrow' : `Due in ${daysLeft} days`,
        labelHi: daysLeft === 1 ? 'कल देय है' : `${daysLeft} दिनों में देय`,
        badgeColor: 'bg-[#faf7f2] text-[#9a7651] border-[#e8dfd4]',
      }
    }
  }

  // Target due date in current month
  const daysInCurrentMonth = new Date(currentYear, currentMonth + 1, 0).getDate()
  const effectiveDueDay = Math.min(safeDay, daysInCurrentMonth)
  const dueDateCurrentMonth = new Date(currentYear, currentMonth, effectiveDueDay, 23, 59, 59)

  if (customOverdueDays === undefined) {
    if (currentDate === effectiveDueDay) {
      return {
        status: 'due_today',
        days: 0,
        labelEn: 'Due Today',
        labelHi: 'आज देय है',
        badgeColor: 'bg-[#fff4e5] text-[#b46b1a] border-[#ffdcb0]',
      }
    }

    if (referenceDate < dueDateCurrentMonth) {
      // Due in the future
      const daysLeft = effectiveDueDay - currentDate
      return {
        status: 'due_soon',
        days: daysLeft,
        labelEn: daysLeft === 1 ? 'Due tomorrow' : `Due in ${daysLeft} days`,
        labelHi: daysLeft === 1 ? 'कल देय है' : `${daysLeft} दिनों में देय`,
        badgeColor: 'bg-[#faf7f2] text-[#9a7651] border-[#e8dfd4]',
      }
    }
  }

  // Overdue
  const overdueDays = customOverdueDays !== undefined ? customOverdueDays : Math.max(1, currentDate - effectiveDueDay)

  if (overdueDays > 30) {
    const months = Math.floor(overdueDays / 30)
    const remainingDays = overdueDays % 30
    const labelEn =
      remainingDays > 0
        ? `Overdue ${months} mo ${remainingDays} d`
        : `Overdue ${months} month${months > 1 ? 's' : ''}`
    const labelHi =
      remainingDays > 0
        ? `${months} माह ${remainingDays} दिन अतिदेय`
        : `${months} माह अतिदेय`

    return {
      status: 'overdue',
      days: overdueDays,
      months,
      remainingDays,
      labelEn,
      labelHi,
      badgeColor: 'bg-[#ffebe8] text-[#b95c3c] border-[#ffc9c1] font-bold',
    }
  }

  return {
    status: 'overdue',
    days: overdueDays,
    labelEn: `Overdue by ${overdueDays} day${overdueDays === 1 ? '' : 's'}`,
    labelHi: `${overdueDays} दिन विलंबित (अतिदेय)`,
    badgeColor: 'bg-[#ffebe8] text-[#b95c3c] border-[#ffc9c1]',
  }
}

/**
 * Monthly Rent Schedule entry representing a single month's rent cycle
 */
export interface MonthlyRentSchedule {
  monthKey: string // YYYY-MM
  monthCovered: string // e.g. "November 2026"
  cycleLabel: string // e.g. "10 Oct 2026 – 09 Nov 2026"
  dueDate: string // YYYY-MM-DD
  dueDateFormatted: string // e.g. "10 Nov 2026"
  amount: number
  status: 'paid' | 'due_today' | 'due_soon' | 'overdue'
  daysDiff: number
  labelEn: string
  labelHi: string
  badgeColor: string
  isPaid: boolean
  paidAt?: string | null
  paidAtFormatted?: string | null
  paymentId?: string | null
  paymentMethod?: string | null
  notes?: string | null
}

/**
 * Calculates the exact next rent due date following the monthly recurring rule:
 * If a tenant joins on the 10th (e.g. Oct 10), next rent is due on the 10th of the
 * following month (Nov 10), and every month thereafter (Dec 10, Jan 10...).
 */
export function calculateNextRentDueDate(
  joiningDateStr: string | Date,
  rentDueDay?: number | null,
  referenceDate: Date = new Date()
): Date {
  const joining = new Date(joiningDateStr)
  const safeJoining = isNaN(joining.getTime()) ? new Date(referenceDate) : joining
  const dueDay = rentDueDay && rentDueDay >= 1 && rentDueDay <= 31 ? rentDueDay : safeJoining.getDate()

  const refYear = referenceDate.getFullYear()
  const refMonth = referenceDate.getMonth()

  // Target due date in current reference month
  const daysInCurrentMonth = new Date(refYear, refMonth + 1, 0).getDate()
  const effectiveDayCurrent = Math.min(dueDay, daysInCurrentMonth)
  const currentMonthDueDate = new Date(refYear, refMonth, effectiveDayCurrent, 23, 59, 59)

  // If tenant joined in this exact month, next rent is strictly in following month
  if (safeJoining.getFullYear() === refYear && safeJoining.getMonth() === refMonth) {
    const nextMonth = refMonth + 1
    const nextYear = refYear + Math.floor(nextMonth / 12)
    const normMonth = nextMonth % 12
    const daysInNext = new Date(nextYear, normMonth + 1, 0).getDate()
    return new Date(nextYear, normMonth, Math.min(dueDay, daysInNext), 23, 59, 59)
  }

  // If reference date is already past current month's due date, advance to next month
  if (referenceDate > currentMonthDueDate) {
    const nextMonth = refMonth + 1
    const nextYear = refYear + Math.floor(nextMonth / 12)
    const normMonth = nextMonth % 12
    const daysInNext = new Date(nextYear, normMonth + 1, 0).getDate()
    return new Date(nextYear, normMonth, Math.min(dueDay, daysInNext), 23, 59, 59)
  }

  return currentMonthDueDate
}

/**
 * Generates and tracks month-by-month rent records for a tenant.
 * Preserves past payments, prevents duplicate monthly bills, and computes
 * real-time Paid/Due/Overdue status for each separate billing cycle.
 */
export function generateMonthlyRentSchedules(params: {
  tenantId: string
  joiningDate?: string | Date | null
  rentDueDay?: number | null
  monthlyRent: number
  payments?: any[]
  referenceDate?: Date
  timeZone?: string
  locale?: 'en' | 'hi'
}): MonthlyRentSchedule[] {
  const {
    tenantId,
    joiningDate,
    rentDueDay,
    monthlyRent,
    payments = [],
    referenceDate = new Date(),
    timeZone = 'Asia/Kolkata',
    locale = 'en',
  } = params

  const jDate = joiningDate ? new Date(joiningDate) : new Date(referenceDate)
  const safeJoining = isNaN(jDate.getTime()) ? new Date(referenceDate) : jDate
  const dueDay = rentDueDay && rentDueDay >= 1 && rentDueDay <= 31 ? rentDueDay : safeJoining.getDate()

  // Filter payments for this tenant and of type 'rent' (ignoring soft-deleted)
  const tenantRentPayments = payments.filter((p: any) => {
    if (!p) return false
    if (p.tenant_id !== tenantId) return false
    if (p.deleted_at) return false
    const type = (p.payment_type || 'rent').toLowerCase()
    return type === 'rent'
  })

  const schedules: MonthlyRentSchedule[] = []

  // Iterate month by month from joining month up to reference date + 1 month (next due cycle)
  let curYear = safeJoining.getFullYear()
  let curMonth = safeJoining.getMonth()

  const targetYear = referenceDate.getFullYear()
  const targetMonth = referenceDate.getMonth()

  // Max cycles guard (up to 36 months to prevent runaway loops)
  let loopCount = 0
  const maxCycles = 36

  while (loopCount < maxCycles) {
    loopCount++

    // Determine due date for this monthly cycle:
    // If curYear/curMonth is joining month, the rent due date is next month on dueDay!
    const dueYear = curMonth === 11 ? curYear + 1 : curYear
    const dueMonthIndex = (curMonth + 1) % 12

    const daysInDueMonth = new Date(dueYear, dueMonthIndex + 1, 0).getDate()
    const effectiveDueDay = Math.min(dueDay, daysInDueMonth)
    const cycleDueDate = new Date(dueYear, dueMonthIndex, effectiveDueDay, 23, 59, 59)

    // Formatted names
    const dueMonthDate = new Date(dueYear, dueMonthIndex, 1)
    const monthCovered = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(dueMonthDate)
    const monthKey = `${dueYear}-${String(dueMonthIndex + 1).padStart(2, '0')}`

    const dueDateFormatted = new Intl.DateTimeFormat('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(cycleDueDate)

    // Cycle range label: e.g. "10 Oct 2026 – 09 Nov 2026"
    const cycleStartDate = new Date(curYear, curMonth, Math.min(dueDay, new Date(curYear, curMonth + 1, 0).getDate()))
    const cycleStartFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(cycleStartDate)
    const cycleLabel = `${cycleStartFmt} – ${dueDateFormatted}`

    // Match payment for this specific month
    const matchingPayment = tenantRentPayments.find((p: any) => {
      // 1. Exact match on month_covered column
      if (p.month_covered) {
        const mc = p.month_covered.trim().toLowerCase()
        if (mc === monthCovered.toLowerCase() || mc === monthKey.toLowerCase()) return true
      }
      // 2. Check notes field for "[Month: ...]" tag
      if (p.notes && typeof p.notes === 'string') {
        if (p.notes.toLowerCase().includes(monthCovered.toLowerCase())) return true
      }
      // 3. Fallback: payment was made within the cycle window (cycleStartDate to cycleDueDate + 7 days)
      if (p.paid_at) {
        const paidTime = new Date(p.paid_at).getTime()
        const startWindow = cycleStartDate.getTime() - 5 * 24 * 60 * 60 * 1000
        const endWindow = cycleDueDate.getTime() + 15 * 24 * 60 * 60 * 1000
        if (paidTime >= startWindow && paidTime <= endWindow) {
          // Verify no other cycle already claimed this payment
          const alreadyClaimed = schedules.some((s) => s.paymentId === p.id)
          if (!alreadyClaimed) return true
        }
      }
      return false
    })

    let status: 'paid' | 'due_today' | 'due_soon' | 'overdue' = 'due_soon'
    let daysDiff = 0
    let labelEn = ''
    let labelHi = ''
    let badgeColor = ''
    let isPaid = false
    let paidAtFormatted: string | null = null

    if (matchingPayment) {
      isPaid = true
      status = 'paid'
      labelEn = 'Paid On Time'
      labelHi = 'समय पर भुगतान'
      badgeColor = 'bg-[#eaf5ea] text-[#2e7d32] border-[#c5e6c7]'
      paidAtFormatted = formatPaymentTimestamp(matchingPayment.paid_at, timeZone, locale)
    } else {
      // Calculate real-time Due Today / Due Soon / Overdue relative to referenceDate
      const diffMs = cycleDueDate.getTime() - referenceDate.getTime()
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

      const refDay = referenceDate.getDate()
      const isToday =
        referenceDate.getFullYear() === dueYear &&
        referenceDate.getMonth() === dueMonthIndex &&
        refDay === effectiveDueDay

      if (isToday) {
        status = 'due_today'
        daysDiff = 0
        labelEn = 'Due Today'
        labelHi = 'आज देय है'
        badgeColor = 'bg-[#fff4e5] text-[#b46b1a] border-[#ffdcb0]'
      } else if (diffMs >= 0) {
        status = 'due_soon'
        daysDiff = Math.max(1, diffDays)
        labelEn = daysDiff === 1 ? 'Due tomorrow' : `Due in ${daysDiff} days`
        labelHi = daysDiff === 1 ? 'कल देय है' : `${daysDiff} दिनों में देय`
        badgeColor = 'bg-[#faf7f2] text-[#9a7651] border-[#e8dfd4]'
      } else {
        status = 'overdue'
        daysDiff = Math.max(1, Math.abs(diffDays))
        if (daysDiff > 30) {
          const mo = Math.floor(daysDiff / 30)
          const rem = daysDiff % 30
          labelEn = rem > 0 ? `Overdue ${mo} mo ${rem} d` : `Overdue ${mo} month${mo > 1 ? 's' : ''}`
          labelHi = rem > 0 ? `${mo} माह ${rem} दिन अतिदेय` : `${mo} माह अतिदेय`
          badgeColor = 'bg-[#ffebe8] text-[#b95c3c] border-[#ffc9c1] font-bold'
        } else {
          labelEn = `Overdue by ${daysDiff} day${daysDiff === 1 ? '' : 's'}`
          labelHi = `${daysDiff} दिन विलंबित (अतिदेय)`
          badgeColor = 'bg-[#ffebe8] text-[#b95c3c] border-[#ffc9c1]'
        }
      }
    }

    schedules.push({
      monthKey,
      monthCovered,
      cycleLabel,
      dueDate: cycleDueDate.toISOString().slice(0, 10),
      dueDateFormatted,
      amount: monthlyRent,
      status,
      daysDiff,
      labelEn,
      labelHi,
      badgeColor,
      isPaid,
      paidAt: matchingPayment?.paid_at || null,
      paidAtFormatted,
      paymentId: matchingPayment?.id || null,
      paymentMethod: matchingPayment?.payment_method || null,
      notes: matchingPayment?.notes || null,
    })

    // Advance to next cycle
    curYear = dueYear
    curMonth = dueMonthIndex

    // Stop after covering up to the next due cycle past referenceDate
    if (curYear > targetYear || (curYear === targetYear && curMonth > targetMonth)) {
      break
    }
  }

  return schedules
}

/**
 * Resolves the primary live rent due status for a tenant using their monthly schedule.
 * If tenant has overdue months, the earliest unpaid month's status is returned.
 * If all past months are paid, returns the status of the next upcoming month.
 */
export function calculateTenantRentStatus(params: {
  tenant: {
    id: string
    joining_date?: string | Date | null
    joiningDate?: string | Date | null
    rent_due_day?: number | null
    monthly_rent?: number | null
    rent?: number | null
    status?: string | null
  }
  payments?: any[]
  referenceDate?: Date
  locale?: 'en' | 'hi'
}): DueStatusResult & { nextDueDate?: string; nextDueDateFormatted?: string; monthCovered?: string } {
  const { tenant, payments = [], referenceDate = new Date(), locale = 'en' } = params

  const effectiveJoining = tenant.joining_date || tenant.joiningDate || referenceDate
  const effectiveRent = Number(tenant.monthly_rent !== undefined && tenant.monthly_rent !== null ? tenant.monthly_rent : (tenant.rent || 0))

  const schedules = generateMonthlyRentSchedules({
    tenantId: tenant.id,
    joiningDate: effectiveJoining,
    rentDueDay: tenant.rent_due_day,
    monthlyRent: effectiveRent,
    payments,
    referenceDate,
    locale,
  })

  if (schedules.length === 0) {
    return calculateRentDueStatus(tenant.rent_due_day || 5, tenant.status === 'Paid', referenceDate)
  }

  // 1. Look for overdue schedule entries first
  const overdueEntry = schedules.find((s) => s.status === 'overdue')
  if (overdueEntry) {
    return {
      status: 'overdue',
      days: overdueEntry.daysDiff,
      labelEn: overdueEntry.labelEn,
      labelHi: overdueEntry.labelHi,
      badgeColor: overdueEntry.badgeColor,
      nextDueDate: overdueEntry.dueDate,
      nextDueDateFormatted: overdueEntry.dueDateFormatted,
      monthCovered: overdueEntry.monthCovered,
    }
  }

  // 2. Look for due today
  const dueTodayEntry = schedules.find((s) => s.status === 'due_today')
  if (dueTodayEntry) {
    return {
      status: 'due_today',
      days: 0,
      labelEn: dueTodayEntry.labelEn,
      labelHi: dueTodayEntry.labelHi,
      badgeColor: dueTodayEntry.badgeColor,
      nextDueDate: dueTodayEntry.dueDate,
      nextDueDateFormatted: dueTodayEntry.dueDateFormatted,
      monthCovered: dueTodayEntry.monthCovered,
    }
  }

  // 3. Look for next unpaid due soon entry
  const dueSoonEntry = schedules.find((s) => s.status === 'due_soon')
  if (dueSoonEntry) {
    return {
      status: 'due_soon',
      days: dueSoonEntry.daysDiff,
      labelEn: dueSoonEntry.labelEn,
      labelHi: dueSoonEntry.labelHi,
      badgeColor: dueSoonEntry.badgeColor,
      nextDueDate: dueSoonEntry.dueDate,
      nextDueDateFormatted: dueSoonEntry.dueDateFormatted,
      monthCovered: dueSoonEntry.monthCovered,
    }
  }

  // 4. All past & current cycles are paid
  const lastPaid = schedules[schedules.length - 1]
  return {
    status: 'paid',
    days: 0,
    labelEn: 'Paid On Time',
    labelHi: 'समय पर भुगतान',
    badgeColor: 'bg-[#eaf5ea] text-[#2e7d32] border-[#c5e6c7]',
    nextDueDate: lastPaid?.dueDate,
    nextDueDateFormatted: lastPaid?.dueDateFormatted,
    monthCovered: lastPaid?.monthCovered,
  }
}

/**
 * Checks if a rent payment for this tenant & monthCovered already exists.
 * Prevents duplicate monthly rent billing while strictly preserving payment history.
 */
export function isDuplicateRentPayment(params: {
  tenantId: string
  monthCovered: string
  payments: any[]
  currentPaymentId?: string
}): { isDuplicate: boolean; existingPayment?: any } {
  const { tenantId, monthCovered, payments, currentPaymentId } = params
  if (!monthCovered || !tenantId) return { isDuplicate: false }

  const cleanMonth = monthCovered.trim().toLowerCase()

  const existing = payments.find((p: any) => {
    if (!p) return false
    if (p.tenant_id !== tenantId) return false
    if (p.deleted_at) return false
    if (currentPaymentId && p.id === currentPaymentId) return false
    const type = (p.payment_type || 'rent').toLowerCase()
    if (type !== 'rent') return false

    if (p.month_covered && p.month_covered.trim().toLowerCase() === cleanMonth) return true
    if (p.notes && typeof p.notes === 'string' && p.notes.toLowerCase().includes(cleanMonth)) return true

    return false
  })

  return { isDuplicate: Boolean(existing), existingPayment: existing }
}

/**
 * Format timestamp in owner timezone (defaults to Asia/Kolkata)
 */
export function formatPaymentTimestamp(
  isoDate: string | null | undefined,
  timeZone: string = 'Asia/Kolkata',
  locale: string = 'en'
): string {
  if (!isoDate) return '—'
  const date = new Date(isoDate)
  if (isNaN(date.getTime())) return '—'

  try {
    return new Intl.DateTimeFormat(locale === 'hi' ? 'hi-IN' : 'en-IN', {
      timeZone,
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(date)
  } catch {
    return date.toLocaleString()
  }
}

import { getValidatedReminderPaymentOptions } from './payment-validation'

export interface ReminderPaymentDetails {
  upiId?: string | null
  paymentLink?: string | null
  qrCodeUrl?: string | null
}

/**
 * Generate a prefilled WhatsApp reminder link
 */
export function generateWhatsAppReminder(params: {
  tenantName: string
  phone?: string
  amount: number
  dueDay: number
  propertyName: string
  locale?: 'en' | 'hi'
  paymentDetails?: ReminderPaymentDetails | null
}): string {
  const { tenantName, phone, amount, dueDay, propertyName, locale = 'en', paymentDetails } = params
  const cleanPhone = (phone || '').replace(/[^\d]/g, '')
  const formattedPhone = cleanPhone.startsWith('91') && cleanPhone.length === 12 ? cleanPhone : cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone

  const amountStr = `₹${amount.toLocaleString('en-IN')}`

  // Strict validation: Incomplete, malformed, or invalid payment details are never included
  const validatedPayment = getValidatedReminderPaymentOptions(paymentDetails)
  const upiId = validatedPayment?.upiId
  const paymentLink = validatedPayment?.paymentLink

  // Format payment section if verified payment option exists
  let paymentTextEn = ''
  let paymentTextHi = ''

  if (upiId || paymentLink) {
    const linesEn: string[] = []
    const linesHi: string[] = []

    if (upiId) {
      linesEn.push(`• UPI ID: ${upiId}`)
      linesHi.push(`• UPI ID: ${upiId}`)
    }
    if (paymentLink) {
      linesEn.push(`• Pay Online: ${paymentLink}`)
      linesHi.push(`• ऑनलाइन भुगतान लिंक: ${paymentLink}`)
    }

    paymentTextEn = `\n\nPayment Options:\n${linesEn.join('\n')}\n\nPlease share the transaction confirmation/screenshot once completed.`
    paymentTextHi = `\n\nभुगतान विकल्प:\n${linesHi.join('\n')}\n\nभुगतान पश्चात कृपया स्क्रीनशॉट या संदर्भ संख्या साझा करें।`
  }

  const messageEn = `Hello ${tenantName},\n\nThis is a friendly rent reminder from ${propertyName || 'BaseraBook Property'}. Your monthly rent of ${amountStr} is due on the ${dueDay}th of this month.${paymentTextEn}\n\nPlease complete your payment at your earliest convenience. Thank you!`
  const messageHi = `नमस्ते ${tenantName},\n\n${propertyName || 'BaseraBook Property'} से आपके मासिक किराए का स्मरण पत्र। आपका मासिक किराया ${amountStr} इस महीने की ${dueDay} तारीख को देय है।${paymentTextHi}\n\nकृपया समय पर भुगतान सुनिश्चित करें। धन्यवाद!`

  const text = encodeURIComponent(locale === 'hi' ? messageHi : messageEn)
  return formattedPhone ? `https://wa.me/${formattedPhone}?text=${text}` : `https://wa.me/?text=${text}`
}

/**
 * Generate a prefilled SMS reminder link
 */
export function generateSmsReminder(params: {
  tenantName: string
  phone?: string
  amount: number
  dueDay: number
  propertyName: string
  locale?: 'en' | 'hi'
  paymentDetails?: ReminderPaymentDetails | null
}): string {
  const { tenantName, phone, amount, dueDay, propertyName, locale = 'en', paymentDetails } = params
  const cleanPhone = (phone || '').replace(/[^\d]/g, '')
  const amountStr = `₹${amount.toLocaleString('en-IN')}`

  // Strict validation: Incomplete, malformed, or invalid payment details are never included
  const validatedPayment = getValidatedReminderPaymentOptions(paymentDetails)
  const upiId = validatedPayment?.upiId
  const paymentLink = validatedPayment?.paymentLink

  let payInfoEn = ''
  let payInfoHi = ''

  if (upiId) {
    payInfoEn += ` Pay via UPI: ${upiId}.`
    payInfoHi += ` UPI: ${upiId}.`
  } else if (paymentLink) {
    payInfoEn += ` Pay link: ${paymentLink}.`
    payInfoHi += ` लिंक: ${paymentLink}.`
  }

  const message =
    locale === 'hi'
      ? `नमस्ते ${tenantName}, ${propertyName || 'BaseraBook Property'} का किराया ${amountStr} देय तारीख (${dueDay}) तक अवश्य जमा करें।${payInfoHi} धन्यवाद।`
      : `Dear ${tenantName}, kindly note your rent of ${amountStr} for ${propertyName || 'BaseraBook Property'} is due on the ${dueDay}th.${payInfoEn} Thank you.`

  return `sms:${cleanPhone}?body=${encodeURIComponent(message)}`
}

