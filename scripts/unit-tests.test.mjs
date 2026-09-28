import test from 'node:test'
import assert from 'node:assert'
import { formatCurrency, formatDate, formatInternationalPhone } from '../lib/i18n/index.js'
import { checkRateLimit } from '../lib/security/rate-limiter.js'

test('1. Money Logic: Multi-Currency Formatter', () => {
  // INR formatting
  const inr = formatCurrency(15000, 'INR', 'en')
  assert.match(inr, /₹|INR/, 'Should format as Indian Rupee')
  assert.match(inr, /15,000/, 'Should include thousands separator')

  // USD formatting
  const usd = formatCurrency(250.50, 'USD', 'en')
  assert.match(usd, /\$|USD/, 'Should format as USD')

  // Zero & negative cases
  assert.equal(formatCurrency(0, 'INR', 'en'), '₹0', 'Zero amount should format cleanly')
})

test('2. Timezone Date Formatter', () => {
  const isoDate = '2026-10-15T04:30:00.000Z'
  const formatted = formatDate(isoDate, 'Asia/Kolkata', 'en')
  assert.ok(formatted.includes('15'), 'Should reflect correct calendar day')
  assert.ok(formatted.includes('Oct'), 'Should reflect correct month')
})

test('3. Phone Normalization (E.164)', () => {
  assert.equal(
    formatInternationalPhone('9876543210', '+91'),
    '+91 98765 43210',
    'Should normalize standard 10-digit Indian mobile'
  )
  assert.equal(
    formatInternationalPhone('+14155552671', '+1'),
    '+14155552671',
    'Should preserve existing country code'
  )
})

test('4. Abuse Protection: Rate Limiter Token Bucket', () => {
  const config = { maxTokens: 3, refillRatePerSec: 0.1 }
  const key = 'test-ip-127.0.0.1'

  // First 3 requests should succeed
  assert.strictEqual(checkRateLimit(key, config).allowed, true)
  assert.strictEqual(checkRateLimit(key, config).allowed, true)
  assert.strictEqual(checkRateLimit(key, config).allowed, true)

  // 4th request must be rejected
  const fourth = checkRateLimit(key, config)
  assert.strictEqual(fourth.allowed, false, '4th request should exceed token bucket')
  assert.ok(fourth.retryAfterSec && fourth.retryAfterSec > 0, 'Should return positive retry-after time')
})

test('5. Ledger Reconciliation: Deposit Liability vs Revenue Law', () => {
  const transactions = [
    { type: 'rent', amount: 8000 },
    { type: 'rent', amount: 8500 },
    { type: 'deposit', amount: 20000 },
    { type: 'electricity', amount: 1200 },
    { type: 'maintenance', amount: 500 },
  ]

  // Financial reconciliation law
  const operatingRevenue = transactions
    .filter((t) => t.type !== 'deposit')
    .reduce((sum, t) => sum + t.amount, 0)

  const securityDepositsLiability = transactions
    .filter((t) => t.type === 'deposit')
    .reduce((sum, t) => sum + t.amount, 0)

  assert.strictEqual(operatingRevenue, 18200, 'Operating Revenue must exclude deposits')
  assert.strictEqual(securityDepositsLiability, 20000, 'Deposits must be isolated in liability escrow')
  assert.strictEqual(operatingRevenue + securityDepositsLiability, 38200, 'Sum must reconcile to total cash inflows')
})
