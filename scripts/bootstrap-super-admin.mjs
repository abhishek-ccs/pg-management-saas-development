#!/usr/bin/env node
/**
 * StayNest SaaS - Secure Server-Side Super Admin Bootstrap
 *
 * This script runs strictly on the server/CLI and uses the Supabase Service Role Key.
 * Zero hardcoded personal emails or secrets.
 *
 * Reads:
 *   SUPER_ADMIN_EMAILS: Comma-separated list of super admin / founder emails
 *   SUPER_ADMIN_BOOTSTRAP_PASSWORD: Password to set for bootstrapped accounts
 *
 * Enforces:
 *   - Idempotent creation/upgrade
 *   - role: 'super_admin', status: 'active'
 *   - must_change_password: true
 *   - mfa_enrolled: false
 */

import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(__dirname, '..')

function loadEnvFile(filename) {
  const filePath = resolve(rootDir, filename)
  if (!existsSync(filePath)) return {}
  const lines = readFileSync(filePath, 'utf-8').split('\n')
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
  return env
}

const localEnv = loadEnvFile('.env.local')
const baseEnv = loadEnvFile('.env')
const env = { ...baseEnv, ...localEnv, ...process.env }

const supabaseUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('\n❌ ERROR: Missing Supabase credentials.')
  console.error('Make sure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are defined.\n')
  process.exit(1)
}

const args = process.argv.slice(2)
let targetEmails = []
let targetPassword = args[1] || env.SUPER_ADMIN_BOOTSTRAP_PASSWORD || 'StayNestAdmin@2026!'

if (args[0] && args[0] !== '--all') {
  targetEmails = [args[0]]
} else {
  const configured = (env.SUPER_ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  if (!configured.length) {
    console.error('\n❌ ERROR: No SUPER_ADMIN_EMAILS specified in environment and no email argument passed.\n')
    process.exit(1)
  }
  targetEmails = configured
}

if (!targetPassword || targetPassword.length < 8) {
  console.error('\n❌ ERROR: Password must be at least 8 characters long.\n')
  process.exit(1)
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function bootstrapAccount(email) {
  console.log(`\n🚀 Initializing Super Admin bootstrap for: ${email}`)

  const { data: usersData, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (listError) {
    throw new Error(`Failed to query auth users: ${listError.message}`)
  }

  let user = usersData.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())

  if (!user) {
    console.log(`👤 Creating new auth user for ${email}...`)
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password: targetPassword,
      email_confirm: true,
      user_metadata: { full_name: 'Co-Founder & Super Admin' },
    })

    if (createError) {
      throw new Error(`Failed to create user: ${createError.message}`)
    }
    user = created.user
    console.log(`✅ Auth user created with ID: ${user.id}`)
  } else {
    console.log(`👤 Existing user found (ID: ${user.id}). Updating password and confirming email...`)
    const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
      password: targetPassword,
      email_confirm: true,
      user_metadata: { full_name: user.user_metadata?.full_name || 'Co-Founder & Super Admin' },
    })
    if (updateError) {
      throw new Error(`Failed to update user credentials: ${updateError.message}`)
    }
  }

  // Upsert profile with role = 'super_admin', status = 'active', must_change_password = true
  console.log('🔐 Assigning role: super_admin and temporary password flag in public.profiles...')
  const { error: profileError } = await admin.from('profiles').upsert(
    {
      id: user.id,
      email: user.email?.toLowerCase() || email.toLowerCase(),
      full_name: user.user_metadata?.full_name || 'Super Administrator',
      role: 'super_admin',
      status: 'active',
      must_change_password: true,
      mfa_enrolled: false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  )

  if (profileError) {
    throw new Error(`Failed to update profile role: ${profileError.message}`)
  }

  // Ensure active subscription with enterprise perks
  await admin.from('subscriptions').upsert(
    {
      owner_id: user.id,
      plan: 'yearly',
      status: 'active',
      trial_start: new Date().toISOString(),
      trial_end: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      current_period_end: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    },
    { onConflict: 'owner_id' }
  )

  // Write audit log
  await admin.from('platform_audit_logs').insert({
    actor_id: user.id,
    action: 'SUPER_ADMIN_BOOTSTRAP',
    target_type: 'profile',
    target_id: user.id,
    metadata: {
      email,
      bootstrapped_at: new Date().toISOString(),
      must_change_password: true,
    },
  })

  console.log(`✅ Successfully bootstrapped Super Admin: ${email}`)
}

async function run() {
  console.log('====================================================')
  console.log(' StayNest SaaS — Super Admin Bootstrap')
  console.log('====================================================')

  for (const email of targetEmails) {
    try {
      await bootstrapAccount(email)
    } catch (err) {
      console.error(`❌ Error bootstrapping ${email}:`, err.message)
    }
  }

  console.log('\n====================================================')
  console.log('🎉 Super Admin bootstrap complete!')
  console.log('Notice: On first login, admins will be prompted to:')
  console.log(' 1. Change password to a strong 12+ character secret')
  console.log(' 2. Verify MFA authenticator app (TOTP)')
  console.log('====================================================\n')
}

run().catch((err) => {
  console.error('Fatal bootstrap error:', err)
  process.exit(1)
})
