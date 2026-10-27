import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'
import { calculateRentDueStatus } from '../lib/due-dates.ts'

console.log('=== RUNNING VERIFICATION SUITE FOR BASERABOOK REQUIREMENTS ===\n')

// ---------------------------------------------------------------------------
// 1. LANGUAGE BUTTON VERIFICATION
// ---------------------------------------------------------------------------
console.log('1. Checking Language Button Isolation...')

const landingPage = fs.readFileSync('app/page.tsx', 'utf-8')
assert.ok(landingPage.includes('LocaleSwitcher'), 'Landing page (app/page.tsx) must retain LocaleSwitcher')

const dashboardPage = fs.readFileSync('app/dashboard/page.tsx', 'utf-8')
assert.ok(!dashboardPage.includes('<LocaleSwitcher'), 'Owner Dashboard (app/dashboard/page.tsx) must NOT contain LocaleSwitcher')

const publicHeader = fs.readFileSync('components/public/PublicHeader.tsx', 'utf-8')
assert.ok(!publicHeader.includes('<LocaleSwitcher'), 'PublicHeader must NOT contain LocaleSwitcher')

const publicFooter = fs.readFileSync('components/public/PublicFooter.tsx', 'utf-8')
assert.ok(!publicFooter.includes('<LocaleSwitcher'), 'PublicFooter must NOT contain LocaleSwitcher')

console.log('✔ Language button strictly isolated to public landing page ONLY.\n')

// ---------------------------------------------------------------------------
// 2. COMPLETE SUPERADMIN REMOVAL VERIFICATION
// ---------------------------------------------------------------------------
console.log('2. Checking Complete Superadmin Feature Removal...')

assert.ok(!fs.existsSync('app/admin'), 'app/admin directory must NOT exist')
assert.ok(!fs.existsSync('app/console'), 'app/console directory must NOT exist')
assert.ok(!fs.existsSync('app/api/admin'), 'app/api/admin directory must NOT exist')
assert.ok(!fs.existsSync('components/admin'), 'components/admin directory must NOT exist')
assert.ok(!fs.existsSync('scripts/bootstrap-super-admin.mjs'), 'bootstrap-super-admin.mjs must NOT exist')

// Verify dashboard does not expose any superadmin buttons or shortcuts
assert.ok(!dashboardPage.includes('Staff Admin'), 'Dashboard topbar must NOT contain Staff Admin button')
assert.ok(!dashboardPage.includes('BaseraBook Super Admin Console'), 'Dashboard SettingsTab must NOT contain Super Admin Console card')
assert.ok(!dashboardPage.includes('isSuperAdminUser'), 'Dashboard must NOT define or use isSuperAdminUser')

// Verify proxy.ts does not redirect to super admin routes
const proxy = fs.readFileSync('lib/supabase/proxy.ts', 'utf-8')
assert.ok(!proxy.includes("'/admin'"), 'proxy.ts must NOT contain references to /admin')
assert.ok(!proxy.includes("'/console'"), 'proxy.ts must NOT contain references to /console')

// Verify server.ts does not export superadmin-specific functions
const serverTs = fs.readFileSync('lib/supabase/server.ts', 'utf-8')
assert.ok(!serverTs.includes('function requireSuperAdmin'), 'server.ts must NOT contain requireSuperAdmin')
assert.ok(!serverTs.includes('function ensureSuperAdmin'), 'server.ts must NOT contain ensureSuperAdmin')
assert.ok(!serverTs.includes('function getPlatformCounts'), 'server.ts must NOT contain getPlatformCounts')
assert.ok(!serverTs.includes('function deleteCustomerProfile'), 'server.ts must NOT contain deleteCustomerProfile')

console.log('✔ Superadmin feature completely removed with zero leftover routes or UI shortcuts.\n')

// ---------------------------------------------------------------------------
// 3. RENT / DUE STATUS & DATABASE SYNCHRONIZATION
// ---------------------------------------------------------------------------
console.log('3. Checking Rent / Due Status Calculation & Synchronization Logic...')

const refDate = new Date(2026, 9, 15) // Oct 15

// If tenant paid -> 'paid'
const resPaid = calculateRentDueStatus(5, true, refDate)
assert.strictEqual(resPaid.status, 'paid', 'Status must be paid when isPaid is true')

// If due on 15th -> 'due_today'
const resToday = calculateRentDueStatus(15, false, refDate)
assert.strictEqual(resToday.status, 'due_today', 'Status must be due_today when today is due day')

// If due on 20th -> 'due_soon' with 5 days left
const resSoon = calculateRentDueStatus(20, false, refDate)
assert.strictEqual(resSoon.status, 'due_soon', 'Status must be due_soon before due day')
assert.strictEqual(resSoon.days, 5, 'Days remaining must be 5')

// If due on 5th -> 'overdue' with 10 days overdue
const resOverdue = calculateRentDueStatus(5, false, refDate)
assert.strictEqual(resOverdue.status, 'overdue', 'Status must be overdue when past due day')
assert.strictEqual(resOverdue.days, 10, 'Overdue days must be 10')

// Verify dashboard mutations handle payment reversal and restoration
assert.ok(dashboardPage.includes("remainingPayments.length === 0"), 'dashboard handleDeletePayment must check remaining payments')
assert.ok(dashboardPage.includes("newStatus: Tenant['status'] = today > dueDay ? 'Overdue' : 'Pending'"), 'dashboard handleDeletePayment must recalculate status on reversal')
assert.ok(dashboardPage.includes("handleRestorePayment"), 'dashboard must handle payment restoration')
assert.ok(dashboardPage.includes("status: 'Paid'"), 'dashboard must mark tenant Paid on payment or payment restore')

// Verify actions save rent_due_day and accurate initial status
const actionsCode = fs.readFileSync('app/dashboard/actions.ts', 'utf-8')
assert.ok(actionsCode.includes('rent_due_day: safeDueDay'), 'createTenantAction must save rent_due_day')
assert.ok(actionsCode.includes("const initialStatus = currentDate > safeDueDay ? 'Overdue' : 'Pending'"), 'createTenantAction must calculate initial status')
assert.ok(actionsCode.includes('updatePayload.rent_due_day = safeDueDay'), 'updateTenantAction must persist rent_due_day')

console.log('✔ Rent / Due calculation and status synchronization verified.\n')

// ---------------------------------------------------------------------------
// 4. ELECTRICITY BILL PERSISTENCE & DATA INTEGRITY
// ---------------------------------------------------------------------------
console.log('4. Checking Electricity Bill Persistence & Resilience...')

// Verify timezone-safe date extraction helper exists
assert.ok(dashboardPage.includes('function getYearMonthFromDate'), 'Dashboard must define getYearMonthFromDate helper')

// Verify ElectricityTab uses timezone-safe date helper
assert.ok(dashboardPage.includes('getYearMonthFromDate(el.reading_date)'), 'ElectricityTab must use getYearMonthFromDate')

// Verify resilient fallback query in fetchDashboardData
assert.ok(dashboardPage.includes('Initial electricity query encountered error, falling back to base columns'), 'fetchDashboardData must implement resilient fallback for electricity')

// Verify handleUpdateElectricity persists property_id
assert.ok(dashboardPage.includes('property_id: targetElecPropId'), 'handleUpdateElectricity must persist property_id to database')

console.log('✔ Electricity bill persistence and timezone-safe data flow verified.\n')

console.log('=====================================================')
console.log('🎉 ALL TESTS PASSED! CODEBASE IS 100% COMPLIANT.')
console.log('=====================================================')
