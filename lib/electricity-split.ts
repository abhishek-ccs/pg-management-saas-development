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
  summaryText: string
}

function parseUtcDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

function formatUtcDate(date: Date): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function diffDays(startDate: Date, endDate: Date): number {
  const ms = endDate.getTime() - startDate.getTime()
  return Math.round(ms / (1000 * 60 * 60 * 24)) + 1
}

/**
 * Calculates mid-cycle electricity split for a billing cycle.
 */
export function calculateMidCycleElectricitySplit(params: MidCycleSplitParams): MidCycleSplitResult {
  const {
    periodStart,
    periodEnd,
    ratePerUnit = 10,
    residents = [],
    useMeterReadings = false,
  } = params

  const startUtc = parseUtcDate(periodStart)
  const endUtc = parseUtcDate(periodEnd)

  if (endUtc.getTime() < startUtc.getTime()) {
    throw new Error('Billing period end date cannot be earlier than start date.')
  }

  const totalPeriodDays = diffDays(startUtc, endUtc)

  // Determine total amount and units
  let totalUnits = params.totalUnits ?? 0
  let totalAmount = params.totalAmount ?? 0

  if (totalAmount <= 0 && totalUnits > 0) {
    totalAmount = Math.round(totalUnits * ratePerUnit * 100) / 100
  } else if (totalUnits <= 0 && totalAmount > 0 && ratePerUnit > 0) {
    totalUnits = Math.round((totalAmount / ratePerUnit) * 100) / 100
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
      let rawAmount = sumMeterUnits > 0 ? (units / sumMeterUnits) * finalBillAmount : finalBillAmount / residents.length
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

    return {
      periodStart,
      periodEnd,
      totalPeriodDays,
      totalAmount: finalBillAmount,
      totalUnits: sumMeterUnits > 0 ? sumMeterUnits : totalUnits,
      ratePerUnit,
      calculationMethod: 'meter_readings',
      residentShares: shares,
      summaryText: `Split calculated using individual meter readings across ${residents.length} resident(s).`,
    }
  }

  // Proportional day-by-day active resident density calculation
  // 1. Build day-by-day active mapping
  const dailyCost = totalPeriodDays > 0 ? totalAmount / totalPeriodDays : 0
  const residentDailyCost = new Map<string, number>()
  const residentActiveDays = new Map<string, number>()

  for (const r of residents) {
    residentDailyCost.set(r.id, 0)
    residentActiveDays.set(r.id, 0)
  }

  const currentDate = new Date(startUtc.getTime())
  for (let d = 0; d < totalPeriodDays; d++) {
    const activeResidentsToday: ResidentOccupancy[] = []

    for (const r of residents) {
      const joinUtc = r.joiningDate ? parseUtcDate(r.joiningDate) : startUtc
      const vacateUtc = r.vacatedDate ? parseUtcDate(r.vacatedDate) : null

      const hasJoined = currentDate.getTime() >= joinUtc.getTime()
      const hasNotVacated = !vacateUtc || currentDate.getTime() <= vacateUtc.getTime()

      if (hasJoined && hasNotVacated) {
        activeResidentsToday.push(r)
      }
    }

    const nToday = activeResidentsToday.length
    if (nToday > 0) {
      const costPerPersonToday = dailyCost / nToday
      for (const r of activeResidentsToday) {
        residentDailyCost.set(r.id, (residentDailyCost.get(r.id) || 0) + costPerPersonToday)
        residentActiveDays.set(r.id, (residentActiveDays.get(r.id) || 0) + 1)
      }
    }

    currentDate.setUTCDate(currentDate.getUTCDate() + 1)
  }

  // 2. Format resident shares
  let allocatedTotal = 0
  const shares: ResidentShareBreakdown[] = []

  for (let i = 0; i < residents.length; i++) {
    const r = residents[i]
    const activeDays = residentActiveDays.get(r.id) || 0
    const rawCost = residentDailyCost.get(r.id) || 0
    let amountDue = Math.round(rawCost * 100) / 100

    if (i === residents.length - 1 && totalAmount > 0) {
      // Reconcile rounding to match totalAmount exactly
      amountDue = Math.max(0, Math.round((totalAmount - allocatedTotal) * 100) / 100)
    } else {
      allocatedTotal += amountDue
    }

    const sharePercentage = totalAmount > 0 ? Math.round((amountDue / totalAmount) * 1000) / 10 : 0

    let explanation = ''
    if (activeDays === 0) {
      explanation = `Not occupied during billing cycle (${periodStart} to ${periodEnd}). Zero charge.`
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

  return {
    periodStart,
    periodEnd,
    totalPeriodDays,
    totalAmount,
    totalUnits,
    ratePerUnit,
    calculationMethod: 'proportional_daily_occupancy',
    residentShares: shares,
    summaryText: `Split calculated proportionally by occupied days across ${residents.length} resident(s).`,
  }
}
