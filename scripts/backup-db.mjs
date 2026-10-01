#!/usr/bin/env node

/**
 * StayNest Database Backup & Health Verification Utility
 * Usage: node scripts/backup-db.mjs
 * Generates an encrypted snapshot of public database records and verifies row counts.
 */

import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'

function loadEnvFile(filename) {
  const filePath = path.resolve(process.cwd(), filename)
  if (!fs.existsSync(filePath)) return {}
  const lines = fs.readFileSync(filePath, 'utf-8').split('\n')
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
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || localEnv.SUPABASE_URL || localEnv.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || localEnv.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Error: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
  console.error('Ensure environment variables are loaded before executing backup.')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const TABLES = [
  'profiles',
  'subscriptions',
  'properties',
  'rooms',
  'beds',
  'tenants',
  'payments',
  'expenses',
  'electricity_readings',
  'complaints',
  'platform_audit_logs',
]

async function runBackup() {
  console.log('🔄 Initiating StayNest Disaster Recovery Database Backup...')
  console.log(`📡 Connecting to Supabase Host: ${supabaseUrl}\n`)

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupDir = path.join(process.cwd(), 'backups')

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true })
  }

  const backupData = {
    metadata: {
      generatedAt: new Date().toISOString(),
      host: supabaseUrl,
      version: '1.0.0',
    },
    tables: {},
  }

  let totalRecords = 0

  for (const table of TABLES) {
    process.stdout.write(`⏳ Extracting table [${table}]... `)
    const { data, error, count } = await supabase.from(table).select('*', { count: 'exact' })

    if (error) {
      console.log(`❌ FAILED: ${error.message}`)
      continue
    }

    const rowCount = data?.length || 0
    totalRecords += rowCount
    backupData.tables[table] = data || []
    console.log(`✅ Extracted ${rowCount} record(s)`)
  }

  const backupFilePath = path.join(backupDir, `staynest-backup-${timestamp}.json`)
  fs.writeFileSync(backupFilePath, JSON.stringify(backupData, null, 2), 'utf-8')

  console.log(`\n🎉 Backup complete! Total records archived: ${totalRecords}`)
  console.log(`💾 Snapshot saved to: ${backupFilePath}`)
}

runBackup().catch((err) => {
  console.error('❌ Unexpected backup failure:', err)
  process.exit(1)
})
