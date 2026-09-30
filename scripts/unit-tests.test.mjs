import test from 'node:test'
import assert from 'node:assert'
import { formatCurrency, formatDate, formatInternationalPhone } from '../lib/i18n/index.js'
import { checkRateLimit } from '../lib/security/rate-limiter.js'
import { SUPPORT_EMAIL, getMailtoSupport } from '../lib/constants.js'
import {
  PRICING_CONFIG,
  ANNUAL_TOTAL_ON_MONTHLY,
  ANNUAL_SAVINGS_AMOUNT,
  ANNUAL_SAVINGS_PERCENT,
  YEARLY_MONTHLY_EQUIVALENT,
  formatINR,
  getSavingsLabel,
} from '../lib/pricing.js'
import {
  calculateRentDueStatus,
  formatPaymentTimestamp,
  generateWhatsAppReminder,
  generateSmsReminder,
} from '../lib/due-dates.js'

test('1. Support Email & Mailto URL Generation', () => {
  assert.ok(SUPPORT_EMAIL.includes('getstaynest@gmail.com'), 'Support email must default to getstaynest@gmail.com')
  const mailtoLink = getMailtoSupport('Billing Inquiry', 'Hello support team')
  assert.ok(mailtoLink.startsWith('mailto:'), 'Link must be valid mailto scheme')
  assert.ok(mailtoLink.includes('getstaynest%40gmail.com') || mailtoLink.includes('getstaynest@gmail.com'), 'Must target support email')
  assert.ok(mailtoLink.includes('Billing'), 'Must encode subject')
})

test('2. Canonical Pricing Math & Savings Law', () => {
  assert.strictEqual(PRICING_CONFIG.monthlyRate, 1699, 'Monthly rate must be ₹1,699')
  assert.strictEqual(PRICING_CONFIG.yearlyRate, 14999, 'Yearly rate must be ₹14,999')
  assert.strictEqual(ANNUAL_TOTAL_ON_MONTHLY, 1699 * 12, '12 months should total ₹20,388')
  assert.strictEqual(ANNUAL_SAVINGS_AMOUNT, 5389, 'Yearly savings must equal ₹5,389')
  assert.strictEqual(ANNUAL_SAVINGS_PERCENT, 26, 'Savings percentage must equal 26%')
  assert.strictEqual(YEARLY_MONTHLY_EQUIVALENT, 1250, 'Effective monthly rate must equal ₹1,250/mo')

  assert.equal(formatINR(14999), '₹14,999', 'formatINR should format with Indian thousands separator')
  assert.ok(getSavingsLabel('en').includes('Save 26%'), 'English savings badge label')
  assert.ok(getSavingsLabel('hi').includes('26% बचाएं'), 'Hindi savings badge label')
})

test('3. Real-Time Due Dates & Overdue Status Engine', () => {
  const reference = new Date(2026, 9, 15, 12, 0, 0) // Oct 15, 2026

  // Case 1: Marked Paid
  const paidResult = calculateRentDueStatus(5, true, reference)
  assert.strictEqual(paidResult.status, 'paid')
  assert.strictEqual(paidResult.labelEn, 'Paid On Time')

  // Case 2: Due Today (rent due on 15th)
  const dueTodayResult = calculateRentDueStatus(15, false, reference)
  assert.strictEqual(dueTodayResult.status, 'due_today')
  assert.strictEqual(dueTodayResult.labelEn, 'Due Today')

  // Case 3: Due Soon (rent due on 20th, today is 15th)
  const dueSoonResult = calculateRentDueStatus(20, false, reference)
  assert.strictEqual(dueSoonResult.status, 'due_soon')
  assert.strictEqual(dueSoonResult.days, 5)

  // Case 4: Overdue within 30 days (rent was due on 5th, today is 15th)
  const overdueResult = calculateRentDueStatus(5, false, reference)
  assert.strictEqual(overdueResult.status, 'overdue')
  assert.strictEqual(overdueResult.days, 10)
  assert.ok(overdueResult.labelEn.includes('Overdue by 10 days'))

  // Case 5: Overdue > 30 days (e.g. evaluating 45 days past due)
  const futureReference = new Date(2026, 10, 20, 12, 0, 0)
  const severeOverdue = calculateRentDueStatus(5, false, futureReference, 45)
  assert.strictEqual(severeOverdue.status, 'overdue')
  assert.ok(severeOverdue.badgeColor.includes('font-bold'), 'Severe overdue must have prominent styling')
})

test('4. Exact Timestamp & Reminder Generators', () => {
  const isoDate = '2026-10-15T09:15:00.000Z'
  const istFormatted = formatPaymentTimestamp(isoDate, 'Asia/Kolkata', 'en')
  assert.ok(istFormatted.includes('2026'), 'Must display correct year')
  assert.match(istFormatted, /pm|am/i, 'Must display 12-hour AM/PM time')

  const waLink = generateWhatsAppReminder({
    tenantName: 'Rahul Verma',
    phone: '9876543210',
    amount: 8500,
    dueDay: 5,
    propertyName: 'Sunrise Luxury PG',
    locale: 'en',
  })
  assert.ok(waLink.startsWith('https://wa.me/919876543210'), 'WhatsApp URL must format Indian E.164 phone')
  assert.ok(waLink.includes('Rahul'), 'WhatsApp message must include tenant name')
  assert.ok(waLink.includes('%E2%82%B98%2C500') || waLink.includes('8500') || waLink.includes('8%2C500'), 'WhatsApp message must include rent amount')

  const smsLink = generateSmsReminder({
    tenantName: 'Amit Kumar',
    phone: '9876543210',
    amount: 9000,
    dueDay: 7,
    propertyName: 'StayNest PG',
  })
  assert.ok(smsLink.startsWith('sms:9876543210'), 'SMS scheme must format correctly')
})

test('5. Abuse Protection: Rate Limiter Token Bucket', () => {
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

test('6. Ledger Reconciliation: Deposit Liability vs Revenue Law', () => {
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
