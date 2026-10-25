/**
 * BaseraBook - Mid-Cycle Electricity Bill Sharing Engine
 * Calculates mathematically sound, proportional electricity charges when
 * residents join or vacate mid-cycle.
 * 
 * Rules:
 * 1. A new resident is NEVER charged for days prior to their move-in / joining date.
 * 2. If move-in meter readings are provided, calculate based on actual consumed units.
 * 3. Otherwise, calculate shares proportionally using day-by-day active resident density
 *    across each part of the billing period.
 */

export interface ResidentOccupancy {
  id: string
  name: string
  room?: string
  joiningDate?: string | null // YYYY-MM-DD
  vacatedDate?: string | null // YYYY-MM-DD
  moveInReading?: number | null // Opening meter reading (kWh)
  closingReading?: number | null // Closing meter reading (kWh)
}

export interface MidCycleSplitParams {
  periodStart: string // YYYY-MM-DD
  periodEnd: string   // YYYY-MM-DD
  totalAmount?: number // Total electricity bill (₹)
  totalUnits?: number  // Total units consumed (kWh)
  ratePerUnit?: number // ₹ per unit
  residents: ResidentOccupancy[]
  useMeterReadings?: boolean
}

export interface ResidentShareBreakdown {
  residentId: string
  residentName: string
  room?: string
  joiningDate: string
  vacatedDate?: string | null
  occupiedDays: number
  totalPeriodDays: number
  sharePercentage: number
  unitsConsumed?: number
  amountDue: number
  calculationExplanation: string
  calculationMethod: 'meter_readings' | 'proportional_daily_occupancy'
}

export interface MidCycleSplitResult {
  periodStart: string
  periodEnd: string
  totalPeriodDays: number
  totalAmount: number
  totalUnits: number
  ratePerUnit: number
  calculationMethod: 'meter_readings' | 'proportional_daily_occupancy'
  residentShares: ResidentShareBreakdown[]
  totalAllocatedAmount: number
  roundingDifference: number
  summaryText: string
}

export function parseUtcDate(dateStr: string): Date {
  const cleanStr = String(dateStr).split('T')[0]
  const [y, m, d] = cleanStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

export function formatUtcDate(date: Date): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function diffDays(startDate: Date, endDate: Date): number {
  const ms = endDate.getTime() - startDate.getTime()
  return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)) + 1)
}

/**
 * Suggests previous billing cycle based on existing readings or previous calendar month.
 */
export function suggestPreviousBillingCycle(
  existingReadings?: any[],
  referenceDate: Date = new Date()
): { periodStart: string; periodEnd: string } {
  const y = referenceDate.getFullYear()
  const m = referenceDate.getMonth() // 0-indexed (e.g. 9 for October)

  // Default: previous calendar month
  const prevMonthDate = new Date(y, m - 1, 1)
  const prevY = prevMonthDate.getFullYear()
  const prevM = prevMonthDate.getMonth() + 1
  const lastDayOfPrevMonth = new Date(prevY, prevM, 0).getDate()

  const defaultPrevMonthStart = `${prevY}-${String(prevM).padStart(2, '0')}-01`
  const defaultPrevMonthEnd = `${prevY}-${String(prevM).padStart(2, '0')}-${String(lastDayOfPrevMonth).padStart(2, '0')}`

  if (!existingReadings || existingReadings.length === 0) {
    return { periodStart: defaultPrevMonthStart, periodEnd: defaultPrevMonthEnd }
  }

  // Find most recent reading with period_end or reading_date
  const sorted = [...existingReadings].sort((a, b) => {
    const dateA = a.period_end || a.reading_date || ''
    const dateB = b.period_end || b.reading_date || ''
    return dateB.localeCompare(dateA)
  })

  const latest = sorted[0]
  if (!latest) {
    return { periodStart: defaultPrevMonthStart, periodEnd: defaultPrevMonthEnd }
  }

  // If latest reading already covered the previous month, suggest current month up to today or month end
  const latestEndDate = latest.period_end || latest.reading_date
  if (latestEndDate && latestEndDate >= defaultPrevMonthEnd) {
    const curMonthStart = `${y}-${String(m + 1).padStart(2, '0')}-01`
    const lastDayOfCurMonth = new Date(y, m + 1, 0).getDate()
    const curMonthEnd = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDayOfCurMonth).padStart(2, '0')}`
    return { periodStart: curMonthStart, periodEnd: curMonthEnd }
  }

  return { periodStart: defaultPrevMonthStart, periodEnd: defaultPrevMonthEnd }
}

/**
 * Suggests default rate per unit based on property history.
 */
export function getSuggestedRate(
  existingReadings?: any[],
  propertyId?: string | null
): number {
  if (existingReadings && existingReadings.length > 0) {
    const propReadings = existingReadings.filter(
      (r) => !propertyId || !r.property_id || r.property_id === propertyId
    )
    const sorted = [...propReadings].sort((a, b) => {
      const dateA = a.reading_date || ''
      const dateB = b.reading_date || ''
      return dateB.localeCompare(dateA)
    })
    for (const r of sorted) {
      const rate = Number(r.rate_per_unit)
      if (rate > 0) return rate
    }
  }
  return 10
}

/**
 * Validates mid-cycle split inputs and parameters.
 */
export function validateMidCycleInputs(params: MidCycleSplitParams): { valid: boolean; error?: string } {
  if (!params.periodStart || !params.periodEnd) {
    return { valid: false, error: 'Please specify both billing period start and end dates.' }
  }

  const startUtc = parseUtcDate(params.periodStart)
  const endUtc = parseUtcDate(params.periodEnd)

  if (isNaN(startUtc.getTime()) || isNaN(endUtc.getTime())) {
    return { valid: false, error: 'Invalid billing period date format. Expected YYYY-MM-DD.' }
  }

  if (endUtc.getTime() < startUtc.getTime()) {
    return { valid: false, error: 'Billing period end date cannot be earlier than start date.' }
  }

  if (params.ratePerUnit !== undefined && params.ratePerUnit <= 0) {
    return { valid: false, error: 'Rate per unit must be greater than zero.' }
  }

  if (params.totalUnits !== undefined && params.totalUnits < 0) {
    return { valid: false, error: 'Total units cannot be negative.' }
  }

  if (params.totalAmount !== undefined && params.totalAmount < 0) {
    return { valid: false, error: 'Total bill amount cannot be negative.' }
  }

  if (params.useMeterReadings) {
    if (!params.residents || params.residents.length === 0) {
      return { valid: false, error: 'At least one resident is required to split bill using meter readings.' }
    }
    for (const r of params.residents) {
      if (r.moveInReading === undefined || r.moveInReading === null || isNaN(Number(r.moveInReading))) {
        return { valid: false, error: `Please enter an opening meter reading for ${r.name}.` }
      }
      if (r.closingReading === undefined || r.closingReading === null || isNaN(Number(r.closingReading))) {
        return { valid: false, error: `Please enter a closing meter reading for ${r.name}.` }
      }
      if (Number(r.moveInReading) < 0 || Number(r.closingReading) < 0) {
        return { valid: false, error: `Meter readings for ${r.name} cannot be negative.` }
      }
      if (Number(r.closingReading) < Number(r.moveInReading)) {
        return { valid: false, error: `Closing reading cannot be lower than opening reading for ${r.name}.` }
      }
    }
  }

  return { valid: true }
}

/**
 * Calculates mid-cycle electricity split for a billing cycle.
 */
export function calculateMidCycleElectricitySplit(params: MidCycleSplitParams): MidCycleSplitResult {
  const validation = validateMidCycleInputs(params)
  if (!validation.valid) {
    throw new Error(validation.error || 'Invalid calculation parameters.')
  }

  const {
    periodStart,
    periodEnd,
    ratePerUnit = 10,
    residents = [],
    useMeterReadings = false,
  } = params

  const startUtc = parseUtcDate(periodStart)
  const endUtc = parseUtcDate(periodEnd)
  const totalPeriodDays = diffDays(startUtc, endUtc)

  // Determine total amount and units
  let totalUnits = params.totalUnits ?? 0
  let totalAmount = params.totalAmount ?? 0

  if (totalAmount <= 0 && totalUnits > 0) {
    totalAmount = Math.round(totalUnits * ratePerUnit * 100) / 100
  } else if (totalUnits <= 0 && totalAmount > 0 && ratePerUnit > 0) {
    totalUnits = Math.round((totalAmount / ratePerUnit) * 100) / 100
  } else if (totalAmount > 0 && totalUnits > 0) {
    // Both provided: ensure totalAmount = totalUnits * ratePerUnit
    totalAmount = Math.round(totalUnits * ratePerUnit * 100) / 100
  }

  // Handle empty residents safely
  if (residents.length === 0) {
    return {
      periodStart,
      periodEnd,
      totalPeriodDays,
      totalAmount,
      totalUnits,
      ratePerUnit,
      calculationMethod: useMeterReadings ? 'meter_readings' : 'proportional_daily_occupancy',
      residentShares: [],
      totalAllocatedAmount: 0,
      roundingDifference: totalAmount,
      summaryText: 'No residents found for the selected scope/room.',
    }
  }

  // Check if we can do meter-reading-based split
  const canUseMeterReadings =
    useMeterReadings &&
    residents.length > 0 &&
    residents.every(
      (r) =>
        r.moveInReading !== undefined &&
        r.moveInReading !== null &&
        r.closingReading !== undefined &&
        r.closingReading !== null
    )

  if (canUseMeterReadings) {
    let sumMeterUnits = 0
    const residentUnits = residents.map((r) => {
      const units = Math.max(0, (r.closingReading ?? 0) - (r.moveInReading ?? 0))
      sumMeterUnits += units
      return { resident: r, units }
    })

    const finalBillAmount = totalAmount > 0 ? totalAmount : sumMeterUnits * ratePerUnit

    let allocatedAmountSum = 0
    const shares: ResidentShareBreakdown[] = residentUnits.map(({ resident: r, units }, index) => {
      const sharePct = sumMeterUnits > 0 ? (units / sumMeterUnits) * 100 : 100 / residents.length
      const rawAmount = sumMeterUnits > 0 ? (units / sumMeterUnits) * finalBillAmount : finalBillAmount / residents.length
      let amountDue = Math.round(rawAmount * 100) / 100

      if (index === residentUnits.length - 1) {
        amountDue = Math.max(0, Math.round((finalBillAmount - allocatedAmountSum) * 100) / 100)
      } else {
        allocatedAmountSum += amountDue
      }

      // Compute days occupied
      const joinUtc = r.joiningDate ? parseUtcDate(r.joiningDate) : startUtc
      const vacateUtc = r.vacatedDate ? parseUtcDate(r.vacatedDate) : null
      const effectiveStart = joinUtc.getTime() > startUtc.getTime() ? joinUtc : startUtc
      const effectiveEnd = vacateUtc && vacateUtc.getTime() < endUtc.getTime() ? vacateUtc : endUtc
      const occupiedDays = effectiveStart.getTime() <= effectiveEnd.getTime()
        ? diffDays(effectiveStart, effectiveEnd)
        : 0

      return {
        residentId: r.id,
        residentName: r.name,
        room: r.room,
        joiningDate: r.joiningDate || periodStart,
        vacatedDate: r.vacatedDate,
        occupiedDays,
        totalPeriodDays,
        sharePercentage: Math.round(sharePct * 10) / 10,
        unitsConsumed: units,
        amountDue,
        calculationMethod: 'meter_readings',
        calculationExplanation: `Meter reading split: ${units} units consumed (${r.moveInReading} to ${r.closingReading} kWh). Share: ${Math.round(sharePct)}%.`,
      }
    })

    const totalAllocatedAmount = Math.round(shares.reduce((sum, s) => sum + s.amountDue, 0) * 100) / 100
    const roundingDifference = Math.round((finalBillAmount - totalAllocatedAmount) * 100) / 100

    return {
      periodStart,
      periodEnd,
      totalPeriodDays,
      totalAmount: finalBillAmount,
      totalUnits: sumMeterUnits > 0 ? sumMeterUnits : totalUnits,
      ratePerUnit,
      calculationMethod: 'meter_readings',
      residentShares: shares,
      totalAllocatedAmount,
      roundingDifference,
      summaryText: `Split calculated using individual meter readings across ${residents.length} resident(s).`,
    }
  }

  // Proportional day-by-day active resident density calculation
  // 1. First pass: count active residents on each day and compute total active days
  let totalActiveDays = 0
  const dailyActiveResidents: ResidentOccupancy[][] = []

  const currentDateForPass = new Date(startUtc.getTime())
  for (let d = 0; d < totalPeriodDays; d++) {
    const activeResidentsToday: ResidentOccupancy[] = []

    for (const r of residents) {
      const joinUtc = r.joiningDate ? parseUtcDate(r.joiningDate) : startUtc
      const vacateUtc = r.vacatedDate ? parseUtcDate(r.vacatedDate) : null

      const hasJoined = currentDateForPass.getTime() >= joinUtc.getTime()
      const hasNotVacated = !vacateUtc || currentDateForPass.getTime() <= vacateUtc.getTime()

      if (hasJoined && hasNotVacated) {
        activeResidentsToday.push(r)
      }
    }

    if (activeResidentsToday.length > 0) {
      totalActiveDays++
    }
    dailyActiveResidents.push(activeResidentsToday)
    currentDateForPass.setUTCDate(currentDateForPass.getUTCDate() + 1)
  }

  // 2. Second pass: allocate cost across active days
  // If at least one day had active residents, distribute totalAmount across active days
  // If all days had active residents (totalActiveDays === totalPeriodDays), dailyCost = totalAmount / totalPeriodDays (matches existing Test 35)
  const divisorDays = totalActiveDays > 0 ? (totalActiveDays === totalPeriodDays ? totalPeriodDays : totalActiveDays) : totalPeriodDays
  const dailyCost = divisorDays > 0 ? totalAmount / divisorDays : 0

  const residentDailyCost = new Map<string, number>()
  const residentActiveDays = new Map<string, number>()

  for (const r of residents) {
    residentDailyCost.set(r.id, 0)
    residentActiveDays.set(r.id, 0)
  }

  for (let d = 0; d < totalPeriodDays; d++) {
    const activeToday = dailyActiveResidents[d]
    const nToday = activeToday.length

    if (nToday > 0) {
      const costPerPersonToday = dailyCost / nToday
      for (const r of activeToday) {
        residentDailyCost.set(r.id, (residentDailyCost.get(r.id) || 0) + costPerPersonToday)
        residentActiveDays.set(r.id, (residentActiveDays.get(r.id) || 0) + 1)
      }
    }
  }

  // 3. Format resident shares
  let allocatedTotal = 0
  const shares: ResidentShareBreakdown[] = []

  for (let i = 0; i < residents.length; i++) {
    const r = residents[i]
    const activeDays = residentActiveDays.get(r.id) || 0
    const rawCost = residentDailyCost.get(r.id) || 0
    let amountDue = Math.round(rawCost * 100) / 100

    if (i === residents.length - 1 && totalAmount > 0 && totalActiveDays > 0) {
      // Reconcile rounding to match totalAmount exactly
      amountDue = Math.max(0, Math.round((totalAmount - allocatedTotal) * 100) / 100)
    } else {
      allocatedTotal += amountDue
    }

    const sharePercentage = totalAmount > 0 ? Math.round((amountDue / totalAmount) * 1000) / 10 : 0

    let explanation = ''
    if (activeDays === 0) {
      const joinUtc = r.joiningDate ? parseUtcDate(r.joiningDate) : startUtc
      if (joinUtc.getTime() > endUtc.getTime()) {
        explanation = `Moved in on ${r.joiningDate} (after billing cycle ended). Eligible days: 0. Zero charge.`
      } else if (r.vacatedDate && parseUtcDate(r.vacatedDate).getTime() < startUtc.getTime()) {
        explanation = `Vacated on ${r.vacatedDate} (before billing cycle started). Eligible days: 0. Zero charge.`
      } else {
        explanation = `Not occupied during billing cycle (${periodStart} to ${periodEnd}). Zero charge.`
      }
    } else if (activeDays === totalPeriodDays) {
      explanation = `Occupied full billing cycle (${totalPeriodDays} days). Share: ${sharePercentage}%.`
    } else {
      const joinUtc = r.joiningDate ? parseUtcDate(r.joiningDate) : startUtc
      const joinNote = r.joiningDate && joinUtc.getTime() > startUtc.getTime()
        ? `Joined mid-cycle on ${r.joiningDate} (not charged for days prior).`
        : ''
      const vacateNote = r.vacatedDate && parseUtcDate(r.vacatedDate).getTime() < endUtc.getTime()
        ? `Vacated on ${r.vacatedDate}.`
        : ''
      const notes = [joinNote, vacateNote].filter(Boolean).join(' ')
      explanation = `Occupied ${activeDays} of ${totalPeriodDays} days. ${notes} Share: ${sharePercentage}%.`
    }

    shares.push({
      residentId: r.id,
      residentName: r.name,
      room: r.room,
      joiningDate: r.joiningDate || periodStart,
      vacatedDate: r.vacatedDate,
      occupiedDays: activeDays,
      totalPeriodDays,
      sharePercentage,
      amountDue,
      calculationMethod: 'proportional_daily_occupancy',
      calculationExplanation: explanation,
    })
  }

  const totalAllocatedAmount = Math.round(shares.reduce((sum, s) => sum + s.amountDue, 0) * 100) / 100
  const roundingDifference = Math.round((totalAmount - totalAllocatedAmount) * 100) / 100

  return {
    periodStart,
    periodEnd,
    totalPeriodDays,
    totalAmount,
    totalUnits,
    ratePerUnit,
    calculationMethod: 'proportional_daily_occupancy',
    residentShares: shares,
    totalAllocatedAmount,
    roundingDifference,
    summaryText: `Split calculated proportionally by occupied days across ${residents.length} resident(s).`,
  }
}
