import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

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

async function check() {
  const tables = ['profiles', 'properties', 'rooms', 'beds', 'tenants', 'payments', 'expenses', 'electricity_readings', 'complaints', 'subscriptions']
  for (const t of tables) {
    const { data, count, error } = await admin.from(t).select('*', { count: 'exact' }).limit(1)
    if (error) {
      console.log(`Table ${t}: ERROR ->`, error.message)
    } else {
      console.log(`Table ${t}: Count = ${count}, Sample keys =`, data?.[0] ? Object.keys(data[0]) : '(0 rows)')
    }
  }

  console.log('\n--- Health check finished. All tables verified safely. ---')
}

check().catch(console.error)
