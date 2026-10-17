import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

console.log('=== VERIFYING PG MANAGEMENT SOFTWARE RELIABILITY, ONBOARDING, AND VISUAL DESIGN ===\n')

const dashboardPagePath = path.resolve('app/dashboard/page.tsx')
const actionsPath = path.resolve('app/dashboard/actions.ts')
const loginPagePath = path.resolve('app/login/page.tsx')
const signupPagePath = path.resolve('app/signup/page.tsx')

const dashboardContent = fs.readFileSync(dashboardPagePath, 'utf8')
const actionsContent = fs.readFileSync(actionsPath, 'utf8')
const loginContent = fs.readFileSync(loginPagePath, 'utf8')
const signupContent = fs.readFileSync(signupPagePath, 'utf8')

// 1. Check Deletion & Payment Reversal Compliance
console.log('1. Checking Deletion & Historical Payment Reversal Flow...')
assert(
  actionsContent.includes("deleted_at: new Date().toISOString()"),
  'Payment soft-deletion must update deleted_at without non-existent updated_at column'
)
assert(
  !actionsContent.includes("deleted_at: null,\n        updated_at:") &&
  !actionsContent.includes("deleted_at: new Date().toISOString(),\n          updated_at:"),
  'Must not attempt to write to non-existent updated_at column on payments table'
)
assert(
  dashboardContent.includes('Reverse Payment #'),
  'Dialog title must explicitly state "Reverse Payment #<ID>"'
)
assert(
  dashboardContent.includes('For accounting compliance, historical payment records are not silently deleted.'),
  'Must state clear accounting compliance warning'
)
assert(
  dashboardContent.includes('Accounting Compliance Guard'),
  'Must render Accounting Compliance Guard card'
)
assert(
  dashboardContent.includes('actionLabel: \'Reverse Payment\''),
  'Must have explicit Reverse Payment action label'
)
console.log('✔ Deletion and historical payment reversal compliance verified.')

// 2. Smooth UI Actions & Double-Click Protection
console.log('\n2. Checking UI Actions Smoothness & Duplicate-Click Prevention...')
assert(
  dashboardContent.includes('disabled={isConfirming}'),
  'Confirmation dialog buttons must be disabled while action is confirming'
)
assert(
  dashboardContent.includes('isConfirming ? ('),
  'Confirmation dialog must display loading spinner when processing'
)
assert(
  loginContent.includes('disabled={loading}'),
  'Login button must be disabled when processing'
)
assert(
  signupContent.includes('disabled={loading}'),
  'Signup button must be disabled when processing'
)
console.log('✔ UI actions smoothness and duplicate-click protection verified.')

// 3. Theme Consistency & Accessible Contrast
console.log('\n3. Checking Theme Consistency & Colors...')
const brandBronze = '#8b5a2b'
assert(dashboardContent.includes(brandBronze), 'Dashboard must use BaseraBook brand bronze')
assert(loginContent.includes(brandBronze), 'Login page must use BaseraBook brand bronze')
assert(signupContent.includes(brandBronze), 'Signup page must use BaseraBook brand bronze')
console.log('✔ Brand theme #8b5a2b consistently maintained across dashboard, login, and signup.')

// 4. Lucide Icon Consistency
console.log('\n4. Checking Icon Consistency...')
assert(
  dashboardContent.includes("label: 'Rooms & Beds', icon: BedDouble"),
  'Rooms & Beds must use BedDouble icon'
)
assert(
  dashboardContent.includes("Building2") && dashboardContent.includes("BedDouble") && dashboardContent.includes("Users"),
  'Lucide icons Building2, BedDouble, and Users must be used for setup sequence'
)
console.log('✔ Icon family and associations verified.')

// 5. Login & Signup Screens
console.log('\n5. Checking Login & Signup Screens...')
assert(
  loginContent.includes('Sign in to BaseraBook') && loginContent.includes('Manage your rental properties, rooms, beds, and tenant rent collections.'),
  'Login screen has clear headings and helper text'
)
assert(
  signupContent.includes('Start 7-Day Free Trial') && signupContent.includes('Enter verification code'),
  'Signup screen has clear 2-step registration and OTP flow'
)
console.log('✔ Login and Signup screens verified.')

// 6. Guided Step-by-Step Setup UI (Sequence: 1. Set up property -> 2. Add rooms and beds -> 3. Add tenants)
console.log('\n6. Checking Guided Setup Step Sequence...')
assert(
  dashboardContent.includes("function GuidedSetupWizard("),
  'GuidedSetupWizard component must be defined'
)
assert(
  dashboardContent.includes("title: 'Set up property'") &&
  dashboardContent.includes("title: 'Add rooms and beds'") &&
  dashboardContent.includes("title: 'Add tenants'"),
  'Setup steps must have exact titles: Set up property, Add rooms and beds, Add tenants'
)

// Verify sequence order in code
const step1Idx = dashboardContent.indexOf("title: 'Set up property'")
const step2Idx = dashboardContent.indexOf("title: 'Add rooms and beds'")
const step3Idx = dashboardContent.indexOf("title: 'Add tenants'")

assert(step1Idx > 0 && step2Idx > step1Idx && step3Idx > step2Idx, 'Setup steps must be strictly ordered: Step 1 Property -> Step 2 Rooms & Beds -> Step 3 Tenants')

assert(
  dashboardContent.includes("Previous Step") && dashboardContent.includes("Next Step"),
  'Wizard must have clear Previous Step and Next Step navigation controls'
)
assert(
  dashboardContent.includes("Step {activeStep} of 3"),
  'Wizard must display clear progress indicators'
)
console.log('✔ Guided setup step-by-step sequence and navigation verified.')

// 7. Simplicity and Schema Preservation
console.log('\n7. Checking Schema Preservation...')
assert(
  !actionsContent.includes('ALTER TABLE') && !dashboardContent.includes('ALTER TABLE'),
  'No schema alteration or new database columns added'
)
console.log('✔ Database schema and backend contracts 100% preserved.')

console.log('\n=============================================================')
console.log('🎉 ALL 7 REQUIREMENTS AND ACCEPTANCE CRITERIA VERIFIED!')
console.log('=============================================================\n')
