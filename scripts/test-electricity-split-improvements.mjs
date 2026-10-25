import assert from 'node:assert'
import {
  calculateMidCycleElectricitySplit,
  suggestPreviousBillingCycle,
  getSuggestedRate,
  validateMidCycleInputs,
  diffDays,
} from '../lib/electricity-split.ts'

console.log('=== RUNNING TESTS FOR IMPROVED ELECTRICITY BILL SPLIT FEATURE ===\n')

let passed = 0

function runTest(name, fn) {
  try {
    fn()
    console.log(`✔ [PASS] ${name}`)
    passed++
  } catch (err) {
    console.error(`✖ [FAIL] ${name}:`, err.message)
    throw err
  }
}

// 1. Resident Joining Mid-Cycle
runTest('1. Resident Joining Mid-Cycle (Fair Allocation & Zero Charge Prior to Move-In)', () => {
  // Scenario: 30-day month (2026-09-01 to 2026-09-30), total ₹1200
  // Alice: Joined 2026-08-01 (Full 30 days present)
  // Bob: Joined 2026-09-16 (15 days present)
  const result = calculateMidCycleElectricitySplit({
    periodStart: '2026-09-01',
    periodEnd: '2026-09-30',
    totalAmount: 1200,
    ratePerUnit: 10,
    residents: [
      { id: 'alice', name: 'Alice', room: '101', joiningDate: '2026-08-01' },
      { id: 'bob', name: 'Bob', room: '101', joiningDate: '2026-09-16' },
    ],
  })

  assert.strictEqual(result.totalPeriodDays, 30)
  assert.strictEqual(result.totalAmount, 1200)

  const alice = result.residentShares.find((s) => s.residentId === 'alice')
  const bob = result.residentShares.find((s) => s.residentId === 'bob')

  assert.strictEqual(alice.occupiedDays, 30, 'Alice must have 30 active days')
  assert.strictEqual(bob.occupiedDays, 15, 'Bob must have 15 active days')
  assert.strictEqual(alice.amountDue, 900, 'Alice must pay ₹900 (Days 1-15 solo: ₹600 + Days 16-30 shared: ₹300)')
  assert.strictEqual(bob.amountDue, 300, 'Bob must pay ₹300 (Days 16-30 shared only, ₹0 for days 1-15)')
  assert.strictEqual(alice.amountDue + bob.amountDue, 1200, 'Shares must sum to ₹1200')
  assert.strictEqual(result.totalAllocatedAmount, 1200)
  assert.strictEqual(result.roundingDifference, 0)
  assert.ok(bob.calculationExplanation.includes('not charged for days prior'))
})

// 2. Resident Vacating Mid-Cycle
runTest('2. Resident Vacating Mid-Cycle (Zero Charge After Move-Out)', () => {
  // Scenario: 30-day month (2026-09-01 to 2026-09-30), total ₹1200
  // Charlie: Present full cycle (days 1-30)
  // Dave: Vacated on 2026-09-10 (present days 1-10 = 10 days)
  const result = calculateMidCycleElectricitySplit({
    periodStart: '2026-09-01',
    periodEnd: '2026-09-30',
    totalAmount: 1200,
    ratePerUnit: 10,
    residents: [
      { id: 'charlie', name: 'Charlie', room: '102', joiningDate: '2026-01-01' },
      { id: 'dave', name: 'Dave', room: '102', joiningDate: '2026-01-01', vacatedDate: '2026-09-10' },
    ],
  })

  const charlie = result.residentShares.find((s) => s.residentId === 'charlie')
  const dave = result.residentShares.find((s) => s.residentId === 'dave')

  assert.strictEqual(charlie.occupiedDays, 30)
  assert.strictEqual(dave.occupiedDays, 10)

  // Days 1-10 (10 days, 2 residents): daily cost ₹40 -> ₹20 each/day = ₹200 Charlie, ₹200 Dave
  // Days 11-30 (20 days, Charlie only): daily cost ₹40 -> ₹40/day = ₹800 Charlie
  // Total Charlie: ₹1000, Total Dave: ₹200. Sum: ₹1200
  assert.strictEqual(charlie.amountDue, 1000)
  assert.strictEqual(dave.amountDue, 200)
  assert.strictEqual(charlie.amountDue + dave.amountDue, 1200)
  assert.ok(dave.calculationExplanation.includes('Vacated on 2026-09-10'))
})

// 3. Staggered Multiple Residents
runTest('3. Multiple Residents with Staggered Joining and Vacating', () => {
  // Scenario: 30-day month (2026-09-01 to 2026-09-30), total ₹1800 (₹60/day)
  // R1: days 1-30 (30 days)
  // R2: days 1-15 (15 days, vacates on day 15)
  // R3: days 16-30 (15 days, joins on day 16)
  const result = calculateMidCycleElectricitySplit({
    periodStart: '2026-09-01',
    periodEnd: '2026-09-30',
    totalAmount: 1800,
    ratePerUnit: 10,
    residents: [
      { id: 'r1', name: 'R1', joiningDate: '2026-08-01' },
      { id: 'r2', name: 'R2', joiningDate: '2026-08-01', vacatedDate: '2026-09-15' },
      { id: 'r3', name: 'R3', joiningDate: '2026-09-16' },
    ],
  })

  const r1 = result.residentShares.find((s) => s.residentId === 'r1')
  const r2 = result.residentShares.find((s) => s.residentId === 'r2')
  const r3 = result.residentShares.find((s) => s.residentId === 'r3')

  assert.strictEqual(r1.occupiedDays, 30)
  assert.strictEqual(r2.occupiedDays, 15)
  assert.strictEqual(r3.occupiedDays, 15)

  // Days 1-15 (2 residents: R1, R2): daily ₹60 -> ₹30 each * 15 = ₹450 R1, ₹450 R2
  // Days 16-30 (2 residents: R1, R3): daily ₹60 -> ₹30 each * 15 = ₹450 R1, ₹450 R3
  // Total: R1 = ₹900, R2 = ₹450, R3 = ₹450. Sum = ₹1800
  assert.strictEqual(r1.amountDue, 900)
  assert.strictEqual(r2.amountDue, 450)
  assert.strictEqual(r3.amountDue, 450)
  assert.strictEqual(r1.amountDue + r2.amountDue + r3.amountDue, 1800)
})

// 4. Empty Room & Residents Outside Billing Period
runTest('4. Empty Room and Residents Moving In/Out Outside Cycle', () => {
  // Scenario A: 0 residents
  const emptyResult = calculateMidCycleElectricitySplit({
    periodStart: '2026-09-01',
    periodEnd: '2026-09-30',
    totalAmount: 500,
    ratePerUnit: 10,
    residents: [],
  })
  assert.strictEqual(emptyResult.residentShares.length, 0)
  assert.strictEqual(emptyResult.totalAllocatedAmount, 0)

  // Scenario B: Resident moved in after cycle ended
  const outsideResult = calculateMidCycleElectricitySplit({
    periodStart: '2026-09-01',
    periodEnd: '2026-09-30',
    totalAmount: 1000,
    ratePerUnit: 10,
    residents: [
      { id: 'future', name: 'Future Resident', joiningDate: '2026-10-05' },
    ],
  })
  const future = outsideResult.residentShares[0]
  assert.strictEqual(future.occupiedDays, 0)
  assert.strictEqual(future.amountDue, 0)
  assert.ok(future.calculationExplanation.includes('Zero charge'))

  // Scenario C: Resident vacated before cycle started
  const pastResult = calculateMidCycleElectricitySplit({
    periodStart: '2026-09-01',
    periodEnd: '2026-09-30',
    totalAmount: 1000,
    ratePerUnit: 10,
    residents: [
      { id: 'past', name: 'Past Resident', joiningDate: '2026-05-01', vacatedDate: '2026-08-20' },
    ],
  })
  const past = pastResult.residentShares[0]
  assert.strictEqual(past.occupiedDays, 0)
  assert.strictEqual(past.amountDue, 0)
})

// 5. Billing Period Suggestion
runTest('5. Automatic Billing Period Suggestion', () => {
  // Test reference date: 2026-10-15
  const refDate = new Date(2026, 9, 15) // Month index 9 = October
  const cycle = suggestPreviousBillingCycle([], refDate)

  // Previous month should be September 2026: 2026-09-01 to 2026-09-30
  assert.strictEqual(cycle.periodStart, '2026-09-01')
  assert.strictEqual(cycle.periodEnd, '2026-09-30')

  // When latest reading exists up to 2026-09-30, next suggested is October 2026
  const existing = [{ period_end: '2026-09-30' }]
  const nextCycle = suggestPreviousBillingCycle(existing, refDate)
  assert.strictEqual(nextCycle.periodStart, '2026-10-01')
  assert.strictEqual(nextCycle.periodEnd, '2026-10-31')
})

// 6. Rate Suggestion from Property History
runTest('6. Remember & Suggest Previous Rate for Selected Property', () => {
  const readings = [
    { property_id: 'prop-1', rate_per_unit: 12.5, reading_date: '2026-10-01' },
    { property_id: 'prop-2', rate_per_unit: 8.0, reading_date: '2026-10-01' },
  ]

  assert.strictEqual(getSuggestedRate(readings, 'prop-1'), 12.5)
  assert.strictEqual(getSuggestedRate(readings, 'prop-2'), 8.0)
  assert.strictEqual(getSuggestedRate(readings, 'prop-unknown'), 10)
  assert.strictEqual(getSuggestedRate([], null), 10)
})

// 7. Individual Meter Readings & Validation
runTest('7. Meter Readings Split & Validation', () => {
  // Valid readings: R1 consumed 60 units (100 to 160), R2 consumed 40 units (50 to 90)
  // Total units: 100. Rate: ₹10. Total bill: ₹1000.
  // R1: 60%, ₹600. R2: 40%, ₹400.
  const meterResult = calculateMidCycleElectricitySplit({
    periodStart: '2026-09-01',
    periodEnd: '2026-09-30',
    ratePerUnit: 10,
    useMeterReadings: true,
    residents: [
      { id: 'm1', name: 'Meter 1', moveInReading: 100, closingReading: 160 },
      { id: 'm2', name: 'Meter 2', moveInReading: 50, closingReading: 90 },
    ],
  })

  assert.strictEqual(meterResult.calculationMethod, 'meter_readings')
  assert.strictEqual(meterResult.totalUnits, 100)
  assert.strictEqual(meterResult.totalAmount, 1000)
  assert.strictEqual(meterResult.residentShares[0].amountDue, 600)
  assert.strictEqual(meterResult.residentShares[1].amountDue, 400)
  assert.strictEqual(meterResult.totalAllocatedAmount, 1000)
  assert.strictEqual(meterResult.roundingDifference, 0)

  // Validation: closing reading < opening reading must throw
  assert.throws(() => {
    calculateMidCycleElectricitySplit({
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
      ratePerUnit: 10,
      useMeterReadings: true,
      residents: [
        { id: 'bad', name: 'Bad Meter', moveInReading: 200, closingReading: 150 },
      ],
    })
  }, /Closing reading cannot be lower than opening reading/)
})

// 8. Rounding Reconciliation Law
runTest('8. Rounding Reconciliation to Exact Paisa', () => {
  // Scenario: 3 residents splitting ₹1000 equally
  // 1000 / 3 = 333.3333...
  // R1: ₹333.33, R2: ₹333.33, R3: ₹333.34
  // Sum must be EXACTLY ₹1000.00
  const result = calculateMidCycleElectricitySplit({
    periodStart: '2026-09-01',
    periodEnd: '2026-09-30',
    totalAmount: 1000,
    ratePerUnit: 10,
    residents: [
      { id: 'u1', name: 'User 1' },
      { id: 'u2', name: 'User 2' },
      { id: 'u3', name: 'User 3' },
    ],
  })

  const sum = result.residentShares.reduce((acc, s) => acc + s.amountDue, 0)
  assert.strictEqual(sum, 1000, 'Sum of shares must reconcile exactly to ₹1000')
  assert.strictEqual(result.totalAllocatedAmount, 1000)
  assert.strictEqual(result.roundingDifference, 0)
})

// 9. Input Validation
runTest('9. Strict Input Validation Rules', () => {
  // Invalid date range (end before start)
  const v1 = validateMidCycleInputs({
    periodStart: '2026-09-30',
    periodEnd: '2026-09-01',
    residents: [],
  })
  assert.strictEqual(v1.valid, false)
  assert.ok(v1.error.includes('cannot be earlier'))

  // Negative rate
  const v2 = validateMidCycleInputs({
    periodStart: '2026-09-01',
    periodEnd: '2026-09-30',
    ratePerUnit: -5,
    residents: [],
  })
  assert.strictEqual(v2.valid, false)
  assert.ok(v2.error.includes('greater than zero'))

  // Negative units
  const v3 = validateMidCycleInputs({
    periodStart: '2026-09-01',
    periodEnd: '2026-09-30',
    totalUnits: -10,
    residents: [],
  })
  assert.strictEqual(v3.valid, false)
  assert.ok(v3.error.includes('cannot be negative'))
})

// 10. Metadata Serialization & Refresh Preservation
runTest('10. Metadata JSON Storage in meter_number for 100% Reload Resilience', () => {
  const result = calculateMidCycleElectricitySplit({
    periodStart: '2026-09-01',
    periodEnd: '2026-09-30',
    totalAmount: 1200,
    ratePerUnit: 10,
    residents: [
      { id: 't1', name: 'Alice', room: '101', joiningDate: '2026-08-01' },
      { id: 't2', name: 'Bob', room: '101', joiningDate: '2026-09-16' },
    ],
  })

  // Simulated metadata stored in meter_number
  const serialized = JSON.stringify({
    type: 'mid_cycle_split',
    period_start: result.periodStart,
    period_end: result.periodEnd,
    calculation_type: result.calculationMethod,
    split_breakdown: result.residentShares,
  })

  assert.ok(serialized.includes('"split_breakdown"'))
  assert.ok(serialized.includes('Alice'))
  assert.ok(serialized.includes('Bob'))

  // Simulated dashboard page refresh parsing
  const reloadedMeta = JSON.parse(serialized)
  assert.strictEqual(reloadedMeta.period_start, '2026-09-01')
  assert.strictEqual(reloadedMeta.period_end, '2026-09-30')
  assert.strictEqual(reloadedMeta.split_breakdown.length, 2)
  assert.strictEqual(reloadedMeta.split_breakdown[0].amountDue, 900)
  assert.strictEqual(reloadedMeta.split_breakdown[1].amountDue, 300)
})

console.log(`\n======================================================`)
console.log(`🎉 ALL ${passed}/10 ELECTRICITY SPLIT IMPROVEMENT TESTS PASSED!`)
console.log(`======================================================\n`)
