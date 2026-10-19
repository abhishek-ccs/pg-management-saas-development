import Razorpay from 'razorpay'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const keyId = process.env.RAZORPAY_KEY_ID
const keySecret = process.env.RAZORPAY_KEY_SECRET

if (!keyId || !keySecret) {
  console.error('Missing Razorpay credentials')
  process.exit(1)
}

const razorpay = new Razorpay({
  key_id: keyId,
  key_secret: keySecret,
})

const EXPECTED_SPECS = {
  starter: {
    name: 'Starter',
    propertyLimit: '1–2 properties',
    monthly: { amount: 109900, priceInr: 1099, period: 'monthly' },
    yearly: { amount: 999900, priceInr: 9999, period: 'yearly' },
  },
  growth: {
    name: 'Growth',
    propertyLimit: '3–5 properties',
    monthly: { amount: 179900, priceInr: 1799, period: 'monthly' },
    yearly: { amount: 1799000, priceInr: 17990, period: 'yearly' },
  },
  business: {
    name: 'Business',
    propertyLimit: '6–9 properties',
    monthly: { amount: 279900, priceInr: 2799, period: 'monthly' },
    yearly: { amount: 2799000, priceInr: 27990, period: 'yearly' },
  },
}

async function auditPlans() {
  console.log('Querying Razorpay Test Mode Plans (Read-Only)...')
  const res = await razorpay.plans.all({ count: 50 })
  const plans = res.items || []

  console.log(`Total plans in Razorpay Test Mode: ${plans.length}\n`)

  const planAudit = []

  for (const [tier, spec] of Object.entries(EXPECTED_SPECS)) {
    for (const cycle of ['monthly', 'yearly']) {
      const targetSpec = spec[cycle]
      const envKey = `RAZORPAY_PLAN_${tier.toUpperCase()}_${cycle.toUpperCase()}`
      const configuredId = process.env[envKey]

      // Find in Razorpay
      const remotePlan = plans.find((p) => p.id === configuredId)

      let status = 'FAIL'
      let discrepancy = null

      if (!remotePlan) {
        status = 'FAIL: Plan ID not found on Razorpay'
        discrepancy = `ID ${configuredId} does not exist in account`
      } else {
        const amountMatch = remotePlan.item.amount === targetSpec.amount
        const periodMatch = remotePlan.period === targetSpec.period
        const intervalMatch = remotePlan.interval === 1
        const currencyMatch = remotePlan.item.currency === 'INR'

        if (amountMatch && periodMatch && intervalMatch && currencyMatch) {
          status = 'PASS'
        } else {
          status = 'FAIL: Specification Mismatch'
          discrepancy = {
            expected: { ...targetSpec, interval: 1, currency: 'INR' },
            actual: {
              amount: remotePlan.item.amount,
              period: remotePlan.period,
              interval: remotePlan.interval,
              currency: remotePlan.item.currency,
            },
          }
        }
      }

      planAudit.push({
        tier,
        cycle,
        expectedInr: targetSpec.priceInr,
        expectedPaise: targetSpec.amount,
        envVarName: envKey,
        configuredPlanId: configuredId,
        remotePlanName: remotePlan?.item?.name,
        remoteAmountPaise: remotePlan?.item?.amount,
        remotePeriod: remotePlan?.period,
        remoteInterval: remotePlan?.interval,
        status,
        discrepancy,
      })
    }
  }

  console.log(JSON.stringify(planAudit, null, 2))
}

auditPlans().catch((err) => {
  console.error('Audit failed:', err.message)
  process.exit(1)
})
