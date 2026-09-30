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
 * Calculates real-time rent due and overdue status for a tenant
 * @param rentDueDay Day of month rent is due (1-31, defaults to 5)
 * @param isPaid Whether tenant is marked Paid for current billing cycle
 * @param referenceDate Optional date to evaluate against (defaults to now)
 */
export function calculateRentDueStatus(
  rentDueDay: number = 5,
  isPaid: boolean = false,
  referenceDate: Date = new Date(),
  customOverdueDays?: number
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
}): string {
  const { tenantName, phone, amount, dueDay, propertyName, locale = 'en' } = params
  const cleanPhone = (phone || '').replace(/[^\d]/g, '')
  const formattedPhone = cleanPhone.startsWith('91') && cleanPhone.length === 12 ? cleanPhone : cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone

  const amountStr = `₹${amount.toLocaleString('en-IN')}`
  const messageEn = `Hello ${tenantName},\n\nThis is a friendly rent reminder from ${propertyName || 'StayNest PG'}. Your monthly rent of ${amountStr} is due on the ${dueDay}th of this month.\n\nPlease complete your payment at your earliest convenience. Thank you!`
  const messageHi = `नमस्ते ${tenantName},\n\n${propertyName || 'StayNest PG'} से आपके मासिक किराए का स्मरण पत्र। आपका मासिक किराया ${amountStr} इस महीने की ${dueDay} तारीख को देय है।\n\nकृपया समय पर भुगतान सुनिश्चित करें। धन्यवाद!`

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
}): string {
  const { tenantName, phone, amount, dueDay, propertyName, locale = 'en' } = params
  const cleanPhone = (phone || '').replace(/[^\d]/g, '')
  const amountStr = `₹${amount.toLocaleString('en-IN')}`
  const message =
    locale === 'hi'
      ? `नमस्ते ${tenantName}, ${propertyName || 'StayNest PG'} का किराया ${amountStr} देय तारीख (${dueDay}) तक अवश्य जमा करें।`
      : `Dear ${tenantName}, kindly note your rent of ${amountStr} for ${propertyName || 'StayNest PG'} is due on the ${dueDay}th. Thank you.`

  return `sms:${cleanPhone}?body=${encodeURIComponent(message)}`
}
