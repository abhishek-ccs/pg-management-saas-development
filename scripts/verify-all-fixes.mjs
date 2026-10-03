import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'
import { calculateRentDueStatus } from '../lib/due-dates.js'

console.log('=== RUNNING VERIFICATION SUITE FOR STAYBOOK REQUIREMENTS ===\n')

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

const adminPage = fs.readFileSync('app/admin/page.tsx', 'utf-8')
assert.ok(!adminPage.includes('<LocaleSwitcher'), 'Super Admin (app/admin/page.tsx) must NOT contain LocaleSwitcher')

const consolePage = fs.readFileSync('app/console/page.tsx', 'utf-8')
assert.ok(!consolePage.includes('<LocaleSwitcher'), 'Super Admin Console (app/console/page.tsx) must NOT contain LocaleSwitcher')

console.log('✔ Language button strictly isolated to public landing page ONLY.\n')

// ---------------------------------------------------------------------------
// 2. PUBLIC SITE CLEANLINESS & DISCREET /console ROUTE
// ---------------------------------------------------------------------------
console.log('2. Checking Clean Public Navigation & Discreet /console Route...')

assert.ok(!publicHeader.includes('Staff Login') && !publicHeader.includes('Admin Login'), 'PublicHeader must not mention Staff/Admin Login')
assert.ok(!publicFooter.includes('Staff Login') && !publicFooter.includes('Admin Login'), 'PublicFooter must not mention Staff/Admin Login')
assert.ok(!landingPage.includes('Staff Login') && !landingPage.includes('Admin Login'), 'Landing page must not expose Staff/Admin Login')

assert.ok(fs.existsSync('app/console/page.tsx'), 'app/console/page.tsx must exist')
assert.ok(fs.existsSync('app/console/layout.tsx'), 'app/console/layout.tsx must exist')

const consoleLayout = fs.readFileSync('app/console/layout.tsx', 'utf-8')
assert.ok(consoleLayout.includes('index: false'), 'Console layout must specify noindex')
assert.ok(consoleLayout.includes('follow: false'), 'Console layout must specify nofollow')

const robotsTxt = fs.readFileSync('app/robots.ts', 'utf-8')
assert.ok(robotsTxt.includes("'/console'"), 'Robots.ts must disallow /console')

const securityHeaders = fs.readFileSync('lib/security/headers.ts', 'utf-8')
assert.ok(securityHeaders.includes("pathname.startsWith('/console')"), 'Security headers must tag /console as noindex')
assert.ok(securityHeaders.includes("no-store, no-cache, must-revalidate"), 'Security headers must set no-store for admin, console, and dashboard')

const proxy = fs.readFileSync('lib/supabase/proxy.ts', 'utf-8')
assert.ok(proxy.includes("pathname === '/console'"), 'proxy.ts must handle /console')
assert.ok(proxy.includes("profile?.role !== 'super_admin'"), 'proxy.ts must enforce super_admin role check')
assert.ok(proxy.includes("new URL('/dashboard?error=unauthorized'"), 'proxy.ts must deny non-super_admins and redirect to dashboard')

assert.ok(adminPage.includes('AdminSignOutButton'), 'Admin page must have AdminSignOutButton in header')

const signOutBtn = fs.readFileSync('components/admin/AdminSignOutButton.tsx', 'utf-8')
assert.ok(signOutBtn.includes('supabase.auth.signOut()'), 'AdminSignOutButton must call supabase.auth.signOut()')
assert.ok(signOutBtn.includes('/console?logout=true'), 'AdminSignOutButton must redirect to /console?logout=true')

console.log('✔ Discreet /console route verified with strict role-based isolation & clean public navigation.\n')

// ---------------------------------------------------------------------------
// 3. RENT / DUE STATUS & DATABASE SYNCHRONIZATION
// ---------------------------------------------------------------------------
console.log('3. Checking Rent / Due Status Calculation & Synchronization Logic...')

// Overdue vs Due Today vs Due Soon vs Paid tests
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
// 4. SUPER ADMIN LIVE STATS
// ---------------------------------------------------------------------------
console.log('4. Checking Super Admin Live Stats & API...')

assert.ok(fs.existsSync('app/api/admin/stats/route.ts'), 'app/api/admin/stats/route.ts must exist')
const statsRoute = fs.readFileSync('app/api/admin/stats/route.ts', 'utf-8')
assert.ok(statsRoute.includes('requireSuperAdmin()'), 'Stats API must verify requireSuperAdmin()')
assert.ok(statsRoute.includes('getPlatformCounts()'), 'Stats API must query real database counts via getPlatformCounts()')
assert.ok(statsRoute.includes('totalRevenue'), 'Stats API must compute real total revenue from payments')

assert.ok(fs.existsSync('components/admin/AdminLiveOverview.tsx'), 'AdminLiveOverview component must exist')
const liveOverview = fs.readFileSync('components/admin/AdminLiveOverview.tsx', 'utf-8')
assert.ok(liveOverview.includes("fetch('/api/admin/stats'"), 'AdminLiveOverview must poll /api/admin/stats')
assert.ok(liveOverview.includes('setInterval'), 'AdminLiveOverview must auto-refresh via timer')
assert.ok(liveOverview.includes('Refresh Stats'), 'AdminLiveOverview must include manual refresh button')

assert.ok(adminPage.includes('AdminLiveOverview'), 'app/admin/page.tsx must render AdminLiveOverview')

console.log('✔ Super Admin live stats verified.\n')

console.log('=====================================================')
console.log('🎉 ALL TESTS PASSED! CODEBASE IS 100% COMPLIANT.')
console.log('=====================================================')
