import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(__dirname, '..')
const envPath = resolve(rootDir, '.env.local')

const env = { ...process.env }
if (existsSync(envPath)) {
  const lines = readFileSync(envPath, 'utf-8').split('\n')
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
}

const supabaseUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('[BACKUP] Error: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Cannot perform database backup.')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const TABLES_TO_BACKUP = [
  'profiles',
  'properties',
  'rooms',
  'beds',
  'tenants',
  'payments',
  'expenses',
  'electricity_readings',
  'complaints',
  'subscriptions',
  'platform_audit_logs',
  'tenant_electricity_shares',
  'tenant_access_tokens',
]

async function runBackup() {
  const startTime = Date.now()
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  console.log(`[BACKUP] Starting automated database backup for: ${supabaseUrl}`)
  console.log(`[BACKUP] Timestamp: ${timestamp}`)

  const backupData = {
    metadata: {
      generatedAt: new Date().toISOString(),
      host: supabaseUrl,
      version: '1.0.0',
      tablesIncluded: TABLES_TO_BACKUP,
    },
    tables: {},
  }

  let totalRecords = 0

  for (const tableName of TABLES_TO_BACKUP) {
    process.stdout.write(`[BACKUP] Exporting table '${tableName}'... `)
    const { data, error, count } = await supabase
      .from(tableName)
      .select('*', { count: 'exact' })

    if (error) {
      console.log(`SKIPPED (${error.message})`)
      backupData.tables[tableName] = []
    } else {
      const records = data || []
      backupData.tables[tableName] = records
      totalRecords += records.length
      console.log(`DONE (${records.length} records)`)
    }
  }

  const backupsDir = resolve(rootDir, 'backups')
  if (!existsSync(backupsDir)) {
    mkdirSync(backupsDir, { recursive: true })
  }

  const filename = `staynest-backup-${timestamp}.json`
  const targetPath = resolve(backupsDir, filename)

  writeFileSync(targetPath, JSON.stringify(backupData, null, 2), 'utf-8')

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2)
  console.log(`\n======================================================`)
  console.log(`[BACKUP] Database backup completed successfully in ${elapsed}s!`)
  console.log(`[BACKUP] Total records secured: ${totalRecords}`)
  console.log(`[BACKUP] Saved to: backups/${filename}`)
  console.log(`======================================================\n`)
}

runBackup().catch((err) => {
  console.error('[BACKUP] Fatal backup exception:', err)
  process.exit(1)
})
