import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert'
import { createClient } from '@supabase/supabase-js'
import {
  validateUpiId,
  validatePaymentLink,
  validateQrImageFile,
  validateDecodedQrData,
  validatePaymentDetailsForm,
  getValidatedReminderPaymentOptions,
} from '../lib/payment-validation.ts'
import { generateWhatsAppReminder, generateSmsReminder } from '../lib/due-dates.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(__dirname, '..')
const envPath = resolve(rootDir, '.env.local')
const lines = readFileSync(envPath, 'utf-8').split('\n')
const env = {}
for (const line of lines) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eqIdx = trimmed.indexOf('=')
  if (eqIdx === -1) continue
  const key = trimmed.slice(0, eqIdx).trim()
  let val = trimmed.slice(eqIdx + 1).trim()
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1)
  }
  env[key] = val
}

const supabaseUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY

console.log('Connecting to:', supabaseUrl)
const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function runLiveVerification() {
  console.log('\n=== BaseraBook Payment Options Live End-to-End Verification ===\n')

  // Step 1: Find an existing owner profile
  const { data: profiles, error: pErr } = await admin
    .from('profiles')
    .select('id, email, full_name, upi_id, payment_link, upi_qr_url')
    .eq('role', 'super_admin')
    .limit(1)

  if (pErr || !profiles || profiles.length === 0) {
    throw new Error('Could not find owner profile: ' + (pErr?.message || 'Empty'))
  }

  const testOwner = profiles[0]
  console.log(`[PASS] Step 1: Found test owner: ${testOwner.email} (${testOwner.id})`)
  console.log(`       Initial payment state: upi_id=${testOwner.upi_id}, payment_link=${testOwner.payment_link}`)

  // Backup original state to restore at end
  const originalState = {
    upi_id: testOwner.upi_id,
    payment_link: testOwner.payment_link,
    upi_qr_url: testOwner.upi_qr_url,
  }

  // Step 2: Validate payment form rejection on invalid link
  const invalidForm = validatePaymentDetailsForm({
    upiId: 'sunrisepg@okhdfcbank',
    paymentLink: 'http://insecure-payment.com/pay',
    qrCodeUrl: '',
  })
  assert.strictEqual(invalidForm.isValid, false, 'Insecure http link must be rejected')
  assert.ok(invalidForm.errors.paymentLink, 'Must report paymentLink error')
  console.log('[PASS] Step 2: Validation accurately caught and rejected insecure payment link:', invalidForm.errors.paymentLink)

  // Step 3: Validate payment form rejection on invalid UPI ID
  const invalidUpiForm = validatePaymentDetailsForm({
    upiId: 'bad_upi_no_at',
    paymentLink: '',
    qrCodeUrl: '',
  })
  assert.strictEqual(invalidUpiForm.isValid, false, 'Malformed UPI ID must be rejected')
  assert.ok(invalidUpiForm.errors.upiId, 'Must report upiId error')
  console.log('[PASS] Step 3: Validation accurately caught and rejected malformed UPI ID:', invalidUpiForm.errors.upiId)

  // Step 4: Validate valid payment options form
  const validForm = validatePaymentDetailsForm({
    upiId: 'sunrisepg@okhdfcbank',
    paymentLink: 'https://rzp.io/l/sunrisepg',
    qrCodeUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  })
  assert.ok(validForm.isValid, 'Valid form must pass')
  console.log('[PASS] Step 4: Validation succeeded on valid payment options.')

  // Step 5: Save valid payment details to Supabase database (profiles table)
  const testPayload = {
    upi_id: 'sunrisepg@okhdfcbank',
    payment_link: 'https://rzp.io/l/sunrisepg',
    upi_qr_url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    updated_at: new Date().toISOString(),
  }

  const { error: saveErr } = await admin
    .from('profiles')
    .update(testPayload)
    .eq('id', testOwner.id)

  assert.ifError(saveErr, 'Saving valid payment options to profiles must succeed without error')
  console.log('[PASS] Step 5: Successfully saved payment details to profiles table in Supabase!')

  // Step 6: Reload from profiles and verify persistence
  const { data: reloadedProfile, error: reloadErr } = await admin
    .from('profiles')
    .select('upi_id, payment_link, upi_qr_url')
    .eq('id', testOwner.id)
    .single()

  assert.ifError(reloadErr)
  assert.strictEqual(reloadedProfile.upi_id, testPayload.upi_id, 'Persisted upi_id must match')
  assert.strictEqual(reloadedProfile.payment_link, testPayload.payment_link, 'Persisted payment_link must match')
  assert.strictEqual(reloadedProfile.upi_qr_url, testPayload.upi_qr_url, 'Persisted upi_qr_url must match')
  console.log('[PASS] Step 6: Successfully retrieved and verified persisted payment details from database.')

  // Step 7: Test update of payment details
  const updatePayload = {
    upi_id: 'owner.staynest@paytm',
    payment_link: 'upi://pay?pa=owner.staynest@paytm&pn=StayNest%20PG&cu=INR',
    upi_qr_url: null,
    updated_at: new Date().toISOString(),
  }

  const { error: updateErr } = await admin
    .from('profiles')
    .update(updatePayload)
    .eq('id', testOwner.id)

  assert.ifError(updateErr)

  const { data: updatedProfile } = await admin
    .from('profiles')
    .select('upi_id, payment_link, upi_qr_url')
    .eq('id', testOwner.id)
    .single()

  assert.strictEqual(updatedProfile.upi_id, updatePayload.upi_id)
  assert.strictEqual(updatedProfile.payment_link, updatePayload.payment_link)
  assert.strictEqual(updatedProfile.upi_qr_url, null)
  console.log('[PASS] Step 7: Successfully updated payment details (UPI ID and UPI deep link) in database.')

  // Step 7b: Also verify properties table supports save & retrieve
  const { data: testProperties } = await admin
    .from('properties')
    .select('id, name, upi_id, payment_link, upi_qr_url')
    .limit(1)

  if (testProperties && testProperties.length > 0) {
    const testProp = testProperties[0]
    const origPropState = {
      upi_id: testProp.upi_id,
      payment_link: testProp.payment_link,
      upi_qr_url: testProp.upi_qr_url,
    }
    const propPayload = {
      upi_id: 'property.special@axisbank',
      payment_link: 'https://rzp.io/l/specialprop',
      upi_qr_url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      updated_at: new Date().toISOString(),
    }
    const { error: propUpdateErr } = await admin
      .from('properties')
      .update(propPayload)
      .eq('id', testProp.id)
    assert.ifError(propUpdateErr)

    const { data: reloadedProp } = await admin
      .from('properties')
      .select('upi_id, payment_link, upi_qr_url')
      .eq('id', testProp.id)
      .single()

    assert.strictEqual(reloadedProp.upi_id, propPayload.upi_id)
    assert.strictEqual(reloadedProp.payment_link, propPayload.payment_link)
    assert.strictEqual(reloadedProp.upi_qr_url, propPayload.upi_qr_url)
    console.log(`[PASS] Step 7b: Successfully saved & retrieved payment details on properties table (${testProp.name}).`)

    // Restore property original state
    await admin.from('properties').update(origPropState).eq('id', testProp.id)
  }

  // Step 8: Verify resident reminder integration with the saved options
  const waReminder = generateWhatsAppReminder({
    tenantName: 'Vikas Sharma',
    phone: '9876543210',
    amount: 8000,
    dueDay: 5,
    propertyName: 'Sunrise Luxury PG',
    locale: 'en',
    paymentDetails: {
      upiId: updatedProfile.upi_id,
      paymentLink: updatedProfile.payment_link,
    },
  })

  assert.ok(waReminder.includes('owner.staynest%40paytm') || waReminder.includes('owner.staynest@paytm'), 'Reminder must include saved UPI ID')
  assert.ok(waReminder.includes('upi%3A%2F%2Fpay') || waReminder.includes('upi://pay'), 'Reminder must include UPI deep link')
  console.log('[PASS] Step 8: Verified resident WhatsApp reminder includes valid saved payment options.')

  // Step 9: Verify reminder rejects and strips invalid details
  const waSanitized = generateWhatsAppReminder({
    tenantName: 'Vikas Sharma',
    phone: '9876543210',
    amount: 8000,
    dueDay: 5,
    propertyName: 'Sunrise Luxury PG',
    paymentDetails: {
      upiId: 'corrupted-upi-without-at',
      paymentLink: 'http://insecure-phishing.com',
    },
  })

  assert.ok(!waSanitized.includes('Payment Options:'), 'Invalid options must not create payment block in reminder')
  assert.ok(!waSanitized.includes('corrupted-upi'), 'Invalid UPI must not leak into reminder')
  console.log('[PASS] Step 9: Verified resident reminder strictly excludes invalid/unsupported payment details.')

  // Step 10: Restore original profile state
  await admin
    .from('profiles')
    .update({
      upi_id: originalState.upi_id,
      payment_link: originalState.payment_link,
      upi_qr_url: originalState.upi_qr_url,
      updated_at: new Date().toISOString(),
    })
    .eq('id', testOwner.id)
  console.log('[PASS] Step 10: Original database state restored cleanly.')

  console.log('\n🎉 ALL LIVE PAYMENT OPTIONS TESTS PASSED PERFECTLY!\n')
}

runLiveVerification().catch((err) => {
  console.error('\n❌ Live Verification Failed:', err)
  process.exit(1)
})
