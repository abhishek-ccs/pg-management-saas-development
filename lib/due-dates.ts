/**
 * StayNest SaaS - Rent Due Dates, Overdue Status & Reminder Generators
 * Handles exact timestamp in owner timezone, rent_due_day, overdue badges,
 * and one-click WhatsApp/SMS notification generation.
 */

export interface DueStatusResult {
  status: 'paid' | 'due_today' | 'due_soon' | 'overdue' | 'vacated'
  days: number
  months?: number
  remainingDays?: number
  labelEn: string
  labelHi: string
  badgeColor: string
}

/**
 * Safely parse a date string or Date object into a local Date instance without
 * negative or positive timezone shift side-effects (e.g. YYYY-MM-DD shifting back a day).
 */
export function parseLocalDate(input: string | Date | null | undefined, defaultDate?: Date): Date {
  if (!input) return defaultDate ? new Date(defaultDate) : new Date()
  if (input instanceof Date) {
    return isNaN(input.getTime()) ? (defaultDate ? new Date(defaultDate) : new Date()) : new Date(input)
  }
  const str = String(input).trim()
  const ymdMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10)
    const month = parseInt(ymdMatch[2], 10) - 1
    const day = parseInt(ymdMatch[3], 10)
    return new Date(year, month, day, 12, 0, 0)
  }
  const d = new Date(str)
  return isNaN(d.getTime()) ? (defaultDate ? new Date(defaultDate) : new Date()) : d
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
  const ref = parseLocalDate(referenceDate)
  const currentYear = ref.getFullYear()
  const currentMonth = ref.getMonth() // 0-indexed
  const currentDate = ref.getDate()

  // If tenant joined in the same month as referenceDate, their first upcoming rent is due NEXT month
  if (joiningDate) {
    const jd = parseLocalDate(joiningDate)
    if (!isNaN(jd.getTime()) && jd.getFullYear() === currentYear && jd.getMonth() === currentMonth) {
      // Tenant joined this month (e.g. joined on 10th). Next rent is due on 10th of following month.
      const nextMonth = currentMonth + 1
      const nextYear = currentYear + Math.floor(nextMonth / 12)
      const normNextMonth = nextMonth % 12
      const daysInNextMonth = new Date(nextYear, normNextMonth + 1, 0).getDate()
      const effectiveDueDayNext = Math.min(safeDay, daysInNextMonth)
      const nextDueDate = new Date(nextYear, normNextMonth, effectiveDueDayNext, 23, 59, 59)
      const msLeft = nextDueDate.getTime() - ref.getTime()
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

    if (ref < dueDateCurrentMonth) {
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
  dueDateIso?: string // YYYY-MM-DD alias
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
  const ref = parseLocalDate(referenceDate)
  const safeJoining = parseLocalDate(joiningDateStr, ref)
  const dueDay = rentDueDay && rentDueDay >= 1 && rentDueDay <= 31 ? rentDueDay : safeJoining.getDate()

  const refYear = ref.getFullYear()
  const refMonth = ref.getMonth()

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
  if (ref > currentMonthDueDate) {
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
  firstDueDate?: string | Date | null
  monthlyRent: number
  payments?: any[]
  referenceDate?: Date
  vacatedDate?: string | Date | null
  timeZone?: string
  locale?: 'en' | 'hi'
}): MonthlyRentSchedule[] {
  const {
    tenantId,
    joiningDate,
    rentDueDay,
    firstDueDate,
    monthlyRent,
    payments = [],
    referenceDate = new Date(),
    vacatedDate,
    timeZone = 'Asia/Kolkata',
    locale = 'en',
  } = params

  const ref = parseLocalDate(referenceDate)
  const safeJoining = parseLocalDate(joiningDate, ref)
  const dueDay = rentDueDay && rentDueDay >= 1 && rentDueDay <= 31 ? rentDueDay : safeJoining.getDate()

  // Filter payments for this tenant and of type 'rent' (ignoring soft-deleted and failed)
  const tenantRentPayments = payments.filter((p: any) => {
    if (!p) return false
    if (p.tenant_id !== tenantId && p.tenantId !== tenantId) return false
    if (p.deleted_at || p.deletedAt) return false
    if (p.status && (p.status === 'failed' || p.status === 'cancelled')) return false
    const type = (p.payment_type || p.paymentType || 'rent').toLowerCase()
    return type === 'rent'
  })

  const schedules: MonthlyRentSchedule[] = []

  const explicitFirstDue =
    firstDueDate ||
    (params as any).first_due_date ||
    (params as any).firstRentDueDate ||
    (params as any).first_rent_due_date ||
    null

  let curYear: number
  let curMonth: number
  let targetDay: number
  const isExplicit = Boolean(explicitFirstDue)

  if (isExplicit) {
    const safeFirstDue = parseLocalDate(explicitFirstDue, ref)
    curYear = safeFirstDue.getFullYear()
    curMonth = safeFirstDue.getMonth()
    targetDay = rentDueDay && rentDueDay >= 1 && rentDueDay <= 31 ? rentDueDay : safeFirstDue.getDate()
  } else {
    curYear = safeJoining.getFullYear()
    curMonth = safeJoining.getMonth()
    targetDay = dueDay
  }

  const targetYear = ref.getFullYear()
  const targetMonth = ref.getMonth()

  // Max cycles guard (up to 48 months to prevent runaway loops)
  let loopCount = 0
  const maxCycles = 48

  while (loopCount < maxCycles) {
    loopCount++

    let dueYear: number
    let dueMonthIndex: number

    if (isExplicit) {
      dueYear = curYear
      dueMonthIndex = curMonth
    } else {
      // Legacy fallback: cycle starts month after joining
      dueYear = curMonth === 11 ? curYear + 1 : curYear
      dueMonthIndex = (curMonth + 1) % 12
    }

    const daysInDueMonth = new Date(dueYear, dueMonthIndex + 1, 0).getDate()
    const effectiveDueDay = Math.min(targetDay, daysInDueMonth)
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
    const cycleStartMonth = dueMonthIndex === 0 ? 11 : dueMonthIndex - 1
    const cycleStartYear = dueMonthIndex === 0 ? dueYear - 1 : dueYear
    const daysInStartMonth = new Date(cycleStartYear, cycleStartMonth + 1, 0).getDate()
    const cycleStartDate = new Date(cycleStartYear, cycleStartMonth, Math.min(targetDay, daysInStartMonth))
    const cycleStartFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(cycleStartDate)
    const cycleLabel = `${cycleStartFmt} – ${dueDateFormatted}`

    // Stop if cycle starts strictly after tenant's move-out / vacate date
    if (vacatedDate) {
      const vDate = parseLocalDate(vacatedDate)
      if (!isNaN(vDate.getTime()) && cycleStartDate.getTime() > vDate.getTime()) {
        break
      }
    }

    // Match payment for this specific month
    const matchingPayment = tenantRentPayments.find((p: any) => {
      // 1. Exact match on month_covered column
      const mcVal = p.month_covered || p.monthCovered
      if (mcVal) {
        const mc = String(mcVal).trim().toLowerCase()
        if (mc === monthCovered.toLowerCase() || mc === monthKey.toLowerCase()) return true
      }
      // 2. Check notes field for "[Month: ...]" tag
      if (p.notes && typeof p.notes === 'string') {
        if (p.notes.toLowerCase().includes(monthCovered.toLowerCase())) return true
      }
      // 3. Fallback: payment was made within the cycle window (cycleStartDate - 5 days to cycleDueDate + 15 days)
      const paidAtVal = p.paid_at || p.paidAt
      if (paidAtVal) {
        const paidTime = new Date(paidAtVal).getTime()
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

      const paidAtStr = matchingPayment.paid_at || matchingPayment.paidAt
      let isLate = false
      if (paidAtStr) {
        const paidTime = new Date(paidAtStr).getTime()
        if (!isNaN(paidTime) && paidTime > cycleDueDate.getTime()) {
          isLate = true
        }
      }

      labelEn = isLate ? 'Paid Late' : 'Paid On Time'
      labelHi = isLate ? 'विलंबित भुगतान' : 'समय पर भुगतान'
      badgeColor = isLate
        ? 'bg-[#fff8e1] text-[#b45309] border-[#ffe082]'
        : 'bg-[#eaf5ea] text-[#2e7d32] border-[#c5e6c7]'
      paidAtFormatted = formatPaymentTimestamp(paidAtStr, timeZone, locale)
    } else {
      // Calculate real-time Due Today / Due Soon / Upcoming / Overdue relative to referenceDate
      const isToday =
        ref.getFullYear() === dueYear &&
        ref.getMonth() === dueMonthIndex &&
        ref.getDate() === effectiveDueDay

      const diffMs = cycleDueDate.getTime() - ref.getTime()
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

      // A future cycle is one where referenceDate has not yet reached cycleStartDate
      const isFutureCycle = ref.getTime() < cycleStartDate.getTime()

      if (isToday) {
        status = 'due_today'
        daysDiff = 0
        labelEn = 'Due Today'
        labelHi = 'आज देय है'
        badgeColor = 'bg-[#fff4e5] text-[#b46b1a] border-[#ffdcb0]'
      } else if (isFutureCycle) {
        status = 'due_soon'
        daysDiff = Math.max(1, diffDays)
        labelEn = 'Upcoming'
        labelHi = 'आगामी'
        badgeColor = 'bg-[#faf7f2] text-[#8c827a] border-[#e8dfd4]'
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
      dueDateIso: cycleDueDate.toISOString().slice(0, 10),
      dueDateFormatted,
      amount: monthlyRent,
      status,
      daysDiff,
      labelEn,
      labelHi,
      badgeColor,
      isPaid,
      paidAt: matchingPayment?.paid_at || matchingPayment?.paidAt || null,
      paidAtFormatted,
      paymentId: matchingPayment?.id || null,
      paymentMethod: matchingPayment?.payment_method || matchingPayment?.paymentMethod || null,
      notes: matchingPayment?.notes || null,
    })

    // Advance to next cycle
    if (isExplicit) {
      curYear = dueMonthIndex === 11 ? dueYear + 1 : dueYear
      curMonth = (dueMonthIndex + 1) % 12
    } else {
      curYear = dueYear
      curMonth = dueMonthIndex
    }

    // Automatic rent cycle continuation rule:
    // Once we reach or pass referenceDate, we stop ONLY IF we have at least one upcoming/unpaid cycle generated.
    // If the latest cycle is paid, we continue to generate/activate the next month (e.g. Nov -> Dec -> Jan).
    const isPastOrCurrentTarget = curYear > targetYear || (curYear === targetYear && curMonth > targetMonth)
    const hasUnpaidCycle = schedules.some((s) => !s.isPaid)

    if (isPastOrCurrentTarget && hasUnpaidCycle) {
      break
    }
  }

  return schedules
}

/**
 * Computes the first due date string (YYYY-MM-DD) from a joining date and due day.
 */
export function computeFirstDueDate(
  joiningDate?: string | Date | null,
  rentDueDay?: number | null
): string {
  const dueDay = rentDueDay && rentDueDay >= 1 && rentDueDay <= 31 ? rentDueDay : 5
  if (!joiningDate) {
    const now = new Date()
    const daysInCur = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    const d = Math.min(dueDay, daysInCur)
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }
  const jd = parseLocalDate(joiningDate)
  if (isNaN(jd.getTime())) {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(dueDay).padStart(2, '0')}`
  }
  const yr = jd.getFullYear()
  const mo = jd.getMonth()
  const daysInMo = new Date(yr, mo + 1, 0).getDate()
  const d = Math.min(dueDay, daysInMo)
  return `${yr}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/**
 * Calculates consecutive monthly rent due dates starting from a given first due date.
 * Accurately handles different month lengths (e.g. 31st -> 28th Feb -> 31st Mar)
 * and year boundaries (e.g. Dec 2026 -> Jan 2027).
 */
export function calculateNextMonthlyDueDates(
  firstDueDate: string | Date,
  count: number = 3,
  timeZone: string = 'Asia/Kolkata',
  locale: 'en' | 'hi' = 'en'
): Array<{ date: string; isoDate?: string; dateFormatted: string; label?: string; monthCovered: string; cycleNumber: number }> {
  const start = parseLocalDate(firstDueDate)
  if (isNaN(start.getTime())) return []

  const targetDay = start.getDate()
  let curYear = start.getFullYear()
  let curMonth = start.getMonth()

  const dates: Array<{ date: string; isoDate?: string; dateFormatted: string; label?: string; monthCovered: string; cycleNumber: number }> = []

  for (let i = 0; i <= count; i++) {
    const daysInMonth = new Date(curYear, curMonth + 1, 0).getDate()
    const effDay = Math.min(targetDay, daysInMonth)
    const cycleDate = new Date(curYear, curMonth, effDay, 23, 59, 59)

    const dateStr = `${curYear}-${String(curMonth + 1).padStart(2, '0')}-${String(effDay).padStart(2, '0')}`
    const dateFormatted = new Intl.DateTimeFormat(locale === 'hi' ? 'hi-IN' : 'en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone,
    }).format(cycleDate)

    const monthCovered = new Intl.DateTimeFormat(locale === 'hi' ? 'hi-IN' : 'en-IN', {
      month: 'long',
      year: 'numeric',
      timeZone,
    }).format(new Date(curYear, curMonth, 1))

    dates.push({
      date: dateStr,
      isoDate: dateStr,
      dateFormatted,
      label: dateFormatted,
      monthCovered,
      cycleNumber: i + 1,
    })

    // Advance to next month
    curYear = curMonth === 11 ? curYear + 1 : curYear
    curMonth = (curMonth + 1) % 12
  }

  return dates
}

export interface TenantRentStatusResult extends DueStatusResult {
  nextDueDate?: string
  nextDueDateFormatted?: string
  monthCovered?: string
  outstandingBalance: number
  overdueBalance: number
  schedules?: MonthlyRentSchedule[]
  firstDueDate?: string
  firstDueDateFormatted?: string
  nextDueDates?: Array<{ date: string; isoDate?: string; dateFormatted: string; label?: string; monthCovered: string; cycleNumber: number }>
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
    rentDueDay?: number | null
    first_due_date?: string | Date | null
    firstDueDate?: string | Date | null
    first_rent_due_date?: string | Date | null
    firstRentDueDate?: string | Date | null
    monthly_rent?: number | null
    monthlyRent?: number | null
    rent?: number | null
    status?: string | null
    full_name?: string | null
    name?: string | null
  }
  payments?: any[]
  referenceDate?: Date
  locale?: 'en' | 'hi'
  timeZone?: string
}): TenantRentStatusResult {
  const { tenant, payments = [], referenceDate = new Date(), locale = 'en', timeZone = 'Asia/Kolkata' } = params
  const ref = parseLocalDate(referenceDate)

  const effectiveStatus = (tenant.status || '').trim()
  if (effectiveStatus === 'Vacated') {
    return {
      status: 'vacated',
      days: 0,
      labelEn: 'Vacated',
      labelHi: 'खाली कर दिया',
      badgeColor: 'bg-[#f4f5f7] text-[#4b5563] border-[#d2d6dc]',
      outstandingBalance: 0,
      overdueBalance: 0,
      schedules: [],
      nextDueDates: [],
    }
  }

  const effectiveJoining = tenant.joining_date || tenant.joiningDate || referenceDate
  const effectiveDueDay =
    tenant.rent_due_day !== undefined && tenant.rent_due_day !== null
      ? tenant.rent_due_day
      : tenant.rentDueDay !== undefined && tenant.rentDueDay !== null
      ? tenant.rentDueDay
      : null
  const effectiveFirstDue =
    tenant.first_due_date ||
    tenant.firstDueDate ||
    (tenant as any).first_rent_due_date ||
    (tenant as any).firstRentDueDate ||
    null
  const effectiveRent = Number(
    tenant.monthly_rent !== undefined && tenant.monthly_rent !== null
      ? tenant.monthly_rent
      : tenant.monthlyRent !== undefined && tenant.monthlyRent !== null
      ? tenant.monthlyRent
      : tenant.rent || 0
  )

  const effectiveVacated =
    (tenant as any).vacated_at ||
    (tenant as any).vacatedDate ||
    (tenant as any).move_out_date ||
    (tenant as any).moveOutDate ||
    null

  const schedules = generateMonthlyRentSchedules({
    tenantId: tenant.id,
    joiningDate: effectiveJoining,
    rentDueDay: effectiveDueDay,
    firstDueDate: effectiveFirstDue,
    monthlyRent: effectiveRent,
    payments,
    referenceDate,
    vacatedDate: effectiveVacated,
    timeZone,
    locale,
  })

  // Compute first due date and multi-month projected due dates
  const baseFirstDue =
    effectiveFirstDue ||
    (schedules.length > 0 ? schedules[0].dueDate : computeFirstDueDate(effectiveJoining, effectiveDueDay))
  const parsedFirstDue = parseLocalDate(baseFirstDue, ref)
  const firstDueDateFormatted = new Intl.DateTimeFormat(locale === 'hi' ? 'hi-IN' : 'en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone,
  }).format(parsedFirstDue)
  const nextDueDates = calculateNextMonthlyDueDates(baseFirstDue, 3, timeZone, locale)

  if (schedules.length === 0) {
    const fallback = calculateRentDueStatus(effectiveDueDay || 5, effectiveStatus === 'Paid', referenceDate)
    const isPaid = fallback.status === 'paid'
    return {
      ...fallback,
      outstandingBalance: isPaid ? 0 : effectiveRent,
      overdueBalance: fallback.status === 'overdue' ? effectiveRent : 0,
      schedules: [],
      firstDueDate: baseFirstDue ? String(baseFirstDue).slice(0, 10) : undefined,
      firstDueDateFormatted,
      nextDueDates,
    }
  }

  // Calculate overdue balance (sum of all unpaid past cycles whose due date has passed)
  let overdueBalance = 0
  for (const s of schedules) {
    if (!s.isPaid && s.status === 'overdue') {
      overdueBalance += s.amount
    }
  }

  // Calculate current outstanding balance:
  let outstandingBalance = 0
  if (overdueBalance > 0) {
    const dueTodayAmount = schedules
      .filter((s) => !s.isPaid && s.status === 'due_today')
      .reduce((sum, s) => sum + s.amount, 0)
    outstandingBalance = overdueBalance + dueTodayAmount
  } else {
    const dueTodayEntry = schedules.find((s) => !s.isPaid && s.status === 'due_today')
    if (dueTodayEntry) {
      outstandingBalance = dueTodayEntry.amount
    } else {
      const nextDueSoon = schedules.find((s) => !s.isPaid && s.status === 'due_soon')
      if (nextDueSoon) {
        outstandingBalance = nextDueSoon.amount
      } else {
        outstandingBalance = 0
      }
    }
  }

  // Helper to attach metadata to all returns
  const attachMeta = (res: any) => ({
    ...res,
    firstDueDate: baseFirstDue ? String(baseFirstDue).slice(0, 10) : undefined,
    firstDueDateFormatted,
    nextDueDates,
  })

  // 1. Look for overdue schedule entries first (earliest unpaid overdue cycle)
  const overdueEntry = schedules.find((s) => s.status === 'overdue')
  if (overdueEntry) {
    return attachMeta({
      status: 'overdue',
      days: overdueEntry.daysDiff,
      labelEn: overdueEntry.labelEn,
      labelHi: overdueEntry.labelHi,
      badgeColor: overdueEntry.badgeColor,
      nextDueDate: overdueEntry.dueDate,
      nextDueDateFormatted: overdueEntry.dueDateFormatted,
      monthCovered: overdueEntry.monthCovered,
      outstandingBalance,
      overdueBalance,
      schedules,
    })
  }

  // 2. Look for due today
  const dueTodayEntry = schedules.find((s) => s.status === 'due_today')
  if (dueTodayEntry) {
    return attachMeta({
      status: 'due_today',
      days: 0,
      labelEn: dueTodayEntry.labelEn,
      labelHi: dueTodayEntry.labelHi,
      badgeColor: dueTodayEntry.badgeColor,
      nextDueDate: dueTodayEntry.dueDate,
      nextDueDateFormatted: dueTodayEntry.dueDateFormatted,
      monthCovered: dueTodayEntry.monthCovered,
      outstandingBalance,
      overdueBalance,
      schedules,
    })
  }

  // 3. Look for current calendar month cycle:
  // If the resident has not paid for the current calendar month, their status is due_soon
  const currentMonthKey = `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, '0')}`
  const currentMonthCycle = schedules.find((s) => !s.isPaid && s.monthKey === currentMonthKey)
  if (currentMonthCycle) {
    return attachMeta({
      status: currentMonthCycle.status,
      days: currentMonthCycle.daysDiff,
      labelEn: currentMonthCycle.labelEn,
      labelHi: currentMonthCycle.labelHi,
      badgeColor: currentMonthCycle.badgeColor,
      nextDueDate: currentMonthCycle.dueDate,
      nextDueDateFormatted: currentMonthCycle.dueDateFormatted,
      monthCovered: currentMonthCycle.monthCovered,
      outstandingBalance,
      overdueBalance,
      schedules,
    })
  }

  // 4. Check if past and current cycles are paid
  // If the tenant has already paid up to the current date/cycle, their status is "Paid On Time" / "Paid Late".
  const refIso = ref.toISOString().slice(0, 10)
  const pastAndCurrentCycles = schedules.filter((s) => s.isPaid || s.dueDate <= refIso || s.monthKey <= currentMonthKey)
  const isUpToDate = pastAndCurrentCycles.length > 0 && pastAndCurrentCycles.every((s) => s.isPaid)

  if (isUpToDate) {
    const nextUpcomingCycle = schedules.find((s) => !s.isPaid)
    const lastPaid = pastAndCurrentCycles[pastAndCurrentCycles.length - 1]
    return attachMeta({
      status: 'paid',
      days: 0,
      labelEn: lastPaid?.labelEn || 'Paid On Time',
      labelHi: lastPaid?.labelHi || 'समय पर भुगतान',
      badgeColor: 'bg-[#eaf5ea] text-[#2e7d32] border-[#c5e6c7]',
      nextDueDate: nextUpcomingCycle?.dueDate || lastPaid?.dueDate,
      nextDueDateFormatted: nextUpcomingCycle?.dueDateFormatted || lastPaid?.dueDateFormatted,
      monthCovered: nextUpcomingCycle ? nextUpcomingCycle.monthCovered : lastPaid?.monthCovered,
      outstandingBalance: 0,
      overdueBalance: 0,
      schedules,
    })
  }

  // 5. Look for next unpaid due soon entry (e.g. newly joined resident with first cycle in future)
  const dueSoonEntry = schedules.find((s) => s.status === 'due_soon')
  if (dueSoonEntry) {
    return attachMeta({
      status: 'due_soon',
      days: dueSoonEntry.daysDiff,
      labelEn: dueSoonEntry.labelEn,
      labelHi: dueSoonEntry.labelHi,
      badgeColor: dueSoonEntry.badgeColor,
      nextDueDate: dueSoonEntry.dueDate,
      nextDueDateFormatted: dueSoonEntry.dueDateFormatted,
      monthCovered: dueSoonEntry.monthCovered,
      outstandingBalance,
      overdueBalance,
      schedules,
    })
  }

  // 6. All past & current cycles are paid fallback
  const lastPaid = schedules[schedules.length - 1]
  const nextUnpaid = schedules.find((s) => !s.isPaid)
  return attachMeta({
    status: 'paid',
    days: 0,
    labelEn: lastPaid?.labelEn || 'Paid On Time',
    labelHi: lastPaid?.labelHi || 'समय पर भुगतान',
    badgeColor: 'bg-[#eaf5ea] text-[#2e7d32] border-[#c5e6c7]',
    nextDueDate: nextUnpaid?.dueDate || lastPaid?.dueDate,
    nextDueDateFormatted: nextUnpaid?.dueDateFormatted || lastPaid?.dueDateFormatted,
    monthCovered: nextUnpaid ? nextUnpaid.monthCovered : lastPaid?.monthCovered,
    outstandingBalance: 0,
    overdueBalance: 0,
  })
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

