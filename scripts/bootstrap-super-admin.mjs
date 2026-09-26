#!/usr/bin/env node
/**
 * StayNest SaaS - Secure Server-Side Super Admin Bootstrap
 *
 * This script runs strictly on the server/CLI and uses the Supabase Service Role Key.
 * It is NEVER bundled or exposed to the client browser.
 *
 * Usage:
 *   node scripts/bootstrap-super-admin.mjs <admin_email> <admin_password> [full_name]
 *
 * Example:
 *   node scripts/bootstrap-super-admin.mjs admin@staynest.in "StrongP@ssw0rd123!" "Platform Administrator"
 */

import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(__dirname, '..')

// Simple .env parser to avoid external dependencies
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

// Load .env.local then .env
const localEnv = loadEnvFile('.env.local')
const baseEnv = loadEnvFile('.env')
const env = { ...baseEnv, ...localEnv, ...process.env }

const supabaseUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('\n❌ ERROR: Missing Supabase credentials.')
  console.error('Make sure SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY')
  console.error('are defined in your .env.local file.\n')
  process.exit(1)
}

const args = process.argv.slice(2)
const email = args[0] || env.SUPER_ADMIN_EMAILS?.split(',')[0]?.trim() || 'sharmavn258@gmail.com'
const password = args[1]
const fullName = args[2] || 'Super Administrator'

if (!email) {
  console.error('\n❌ ERROR: Super Admin email is required.')
  console.error('Usage: node scripts/bootstrap-super-admin.mjs <admin_email> <password> [full_name]\n')
  process.exit(1)
}

if (!password) {
  console.error('\n❌ ERROR: Super Admin password is required.')
  console.error('Usage: node scripts/bootstrap-super-admin.mjs <admin_email> <password> [full_name]\n')
  process.exit(1)
}

if (password.length < 8) {
  console.error('\n❌ ERROR: Password must be at least 8 characters long.\n')
  process.exit(1)
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function bootstrap() {
  console.log(`\n🚀 Initializing Super Admin bootstrap for: ${email}`)

  // 1. Search existing users
  const { data: usersData, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (listError) {
    console.error('❌ Failed to query auth users:', listError.message)
    process.exit(1)
  }

  let user = usersData.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())

  if (!user) {
    console.log('👤 User not found in auth.users. Creating new verified admin user...')
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    })

    if (createError) {
      console.error('❌ Failed to create user:', createError.message)
      process.exit(1)
    }
    user = created.user
    console.log(`✅ Created auth user with ID: ${user.id}`)
  } else {
    console.log(`👤 User found in auth.users (ID: ${user.id}). Updating password and email confirmation...`)
    const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    })
    if (updateError) {
      console.error('❌ Failed to update user credentials:', updateError.message)
      process.exit(1)
    }
  }

  // 2. Upsert profile with role = 'super_admin' and status = 'active'
  console.log('🔐 Assigning role: super_admin in public.profiles...')
  const { error: profileError } = await admin.from('profiles').upsert(
    {
      id: user.id,
      email,
      full_name: fullName,
      role: 'super_admin',
      status: 'active',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  )

  if (profileError) {
    console.error('❌ Failed to update profile role:', profileError.message)
    process.exit(1)
  }

  // 3. Record audit log
  await admin.from('platform_audit_logs').insert({
    actor_id: user.id,
    action: 'bootstrap_super_admin',
    target_type: 'profile',
    target_id: user.id,
    metadata: {
      email,
      bootstrapped_at: new Date().toISOString(),
      method: 'server_script',
    },
  })

  console.log('\n=============================================================')
  console.log('🎉 Super Admin successfully configured!')
  console.log(`   Email: ${email}`)
  console.log('   Role:  super_admin')
  console.log('   Status: active')
  console.log('   Login:  http://localhost:3000/admin/login')
  console.log('=============================================================\n')
}

bootstrap().catch((err) => {
  console.error('\n❌ Unexpected error during bootstrap:', err)
  process.exit(1)
})
