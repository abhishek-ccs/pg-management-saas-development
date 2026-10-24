import test from 'node:test'
import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'
import { resolveCustomerEntitlements, PLAN_PROPERTY_LIMITS } from '../lib/subscription.ts'

test('CENTRALIZATION SUITE: Property Limit Centralization & Enforcement', async (t) => {
  const dashboardCode = fs.readFileSync(path.resolve('app/dashboard/page.tsx'), 'utf-8')
  const actionsCode = fs.readFileSync(path.resolve('app/dashboard/actions.ts'), 'utf-8')
  const apiRouteCode = fs.readFileSync(path.resolve('app/api/properties/route.ts'), 'utf-8')

  await t.test('Scenario 1: User has available property slots', () => {
    // Starter tier: 2 max properties. With 1 active property, 1 slot remains.
    const entitlement = resolveCustomerEntitlements(
      {
        hasPaidAccess: true,
        status: 'active',
        plan: 'starter',
      },
      1
    )
    assert.strictEqual(entitlement.canCreateProperty, true)
    assert.strictEqual(entitlement.maxProperties, 2)
    assert.strictEqual(entitlement.activePropertyCount, 1)
    assert.strictEqual(entitlement.remainingPropertySlots, 1)
    assert.strictEqual(entitlement.isOverLimit, false)
    assert.strictEqual(entitlement.reason, undefined)
  })

  await t.test('Scenario 2: User has reached maximum property limit', () => {
    // Starter tier: 2 max properties. With 2 active properties, limit is reached.
    const entitlement = resolveCustomerEntitlements(
      {
        hasPaidAccess: true,
        status: 'active',
        plan: 'starter',
      },
      2
    )
    assert.strictEqual(entitlement.canCreateProperty, false)
    assert.strictEqual(entitlement.maxProperties, 2)
    assert.strictEqual(entitlement.activePropertyCount, 2)
    assert.strictEqual(entitlement.remainingPropertySlots, 0)
    assert.strictEqual(entitlement.isOverLimit, false)
    assert.ok(entitlement.reason && entitlement.reason.includes('Please upgrade your plan'))
  })

  await t.test('Scenario 3: User attempts to add a property beyond allowance (Blocked + Essential Feedback)', () => {
    // 1. Client-side blocking in page.tsx
    assert.ok(
      dashboardCode.includes('if (!editingPropertyId && !entitlement.canCreateProperty)'),
      'Client form submission must block property creation if over limit'
    )
    assert.ok(
      dashboardCode.includes('Cannot add property: subscription property limit reached. Please visit Subscription or Settings to upgrade your plan.'),
      'Essential validation feedback must be given when add property is blocked'
    )

    // 2. Server Action verification in actions.ts
    assert.ok(
      actionsCode.includes('const entitlement = await getOwnerEntitlements(supabase, user.id)') &&
      actionsCode.includes('if (!entitlement.canCreateProperty)') &&
      actionsCode.includes("code: 'PROPERTY_LIMIT_REACHED'"),
      'createPropertyAction must verify authoritative entitlement on server and return error'
    )

    // 3. API route verification in app/api/properties/route.ts
    assert.ok(
      apiRouteCode.includes('if (!entitlement.canCreateProperty)') &&
      apiRouteCode.includes('status: 403'),
      'POST /api/properties must return 403 Forbidden when over entitlement limit'
    )
  })

  await t.test('Scenario 4: User upgrades or changes their subscription', () => {
    // Upgrading from Starter (2 props) to Growth (5 props)
    const starterState = { hasPaidAccess: true, status: 'active', plan: 'starter' }
    const growthState = { hasPaidAccess: true, status: 'active', plan: 'growth' }
    const businessState = { hasPaidAccess: true, status: 'active', plan: 'business' }

    const atLimitInStarter = resolveCustomerEntitlements(starterState, 2)
    assert.strictEqual(atLimitInStarter.canCreateProperty, false)

    const upgradedToGrowth = resolveCustomerEntitlements(growthState, 2)
    assert.strictEqual(upgradedToGrowth.canCreateProperty, true)
    assert.strictEqual(upgradedToGrowth.maxProperties, 5)
    assert.strictEqual(upgradedToGrowth.remainingPropertySlots, 3)

    const atLimitInGrowth = resolveCustomerEntitlements(growthState, 5)
    assert.strictEqual(atLimitInGrowth.canCreateProperty, false)

    const upgradedToBusiness = resolveCustomerEntitlements(businessState, 5)
    assert.strictEqual(upgradedToBusiness.canCreateProperty, true)
    assert.strictEqual(upgradedToBusiness.maxProperties, 9)
    assert.strictEqual(upgradedToBusiness.remainingPropertySlots, 4)
  })

  await t.test('Scenario 5: Property-limit information restricted strictly to Subscription & Settings sections', () => {
    // SECTION A: Subscription Section
    assert.ok(
      dashboardCode.includes('Total Property Allowance:'),
      'Subscription Section must show total property allowance'
    )
    assert.ok(
      dashboardCode.includes('Properties Used') && dashboardCode.includes('Remaining Slots'),
      'Subscription Section must show properties used and remaining property slots'
    )
    assert.ok(
      dashboardCode.includes('PRICING_PLANS.map') && dashboardCode.includes('plan.propertyLimit'),
      'Subscription Section must clearly explain property limits of available plans'
    )

    // SECTION B: Settings Section
    assert.ok(
      dashboardCode.includes('id="settings-subscription"'),
      'Settings Section must have dedicated #settings-subscription hub'
    )
    assert.ok(
      dashboardCode.includes('Property Quota') && dashboardCode.includes('Quota Limit Reached'),
      'Settings Section must display current plan, property quota, and usage'
    )
    assert.ok(
      dashboardCode.includes('Change / Upgrade Plan') || dashboardCode.includes('Upgrade Plan'),
      'Settings Section must provide subscription management and upgrade options'
    )
  })

  await t.test('Scenario 6: Absence of property-limit messages from all other pages and components', () => {
    // 1. Dashboard Overview
    assert.ok(
      !dashboardCode.includes('properties used`'),
      'Overview MetricCard must not display properties used or property limit notes'
    )

    // 2. PropertyTab
    assert.ok(
      !dashboardCode.includes('Subscription Property Limit:'),
      'PropertyTab must not contain subscription property limit warning/info banner'
    )
    assert.ok(
      !dashboardCode.includes('Limit Reached</span>'),
      'PropertyTab header must not display property limit reached badge'
    )

    // 3. Navigation Header Dropdown
    assert.ok(
      !dashboardCode.includes('+ Add Property (${entitlement.activePropertyCount}/${entitlement.maxProperties})'),
      'Navigation dropdown must not append (X/Y) property limits to Add Property option'
    )

    // 4. Add Property Modal
    assert.ok(
      !dashboardCode.includes('Plan Property Limit Reached</span>'),
      'Add Property modal form must not display persistent limit reached banner'
    )
    assert.ok(
      !dashboardCode.includes('Property Limit Reached (Upgrade Plan)'),
      'Add Property modal button must not display promotional limit text'
    )

    // 5. Settings Properties Card Header
    assert.ok(
      !dashboardCode.includes('{entitlement.activePropertyCount} / {entitlement.maxProperties} Used'),
      'Settings Properties & Locations header must not display redundant property quota badge'
    )
  })
})
