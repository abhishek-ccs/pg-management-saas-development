import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { generateTenantToken } from '../lib/tenant-access.js'

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

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function getOrCreateToken() {
  const { data: tenant } = await admin
    .from('tenants')
    .select('id, owner_id, full_name')
    .is('deleted_at', null)
    .limit(1)
    .single()

  if (!tenant) throw new Error('No tenant found')

  const { rawToken, tokenHash, tokenPreview } = generateTenantToken()
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

  // Revoke existing
  await admin.from('tenant_access_tokens').update({ revoked_at: new Date().toISOString() }).eq('tenant_id', tenant.id)

  const { data: tokenRecord, error } = await admin
    .from('tenant_access_tokens')
    .insert({
      owner_id: tenant.owner_id,
      tenant_id: tenant.id,
      token_hash: tokenHash,
      token_preview: tokenPreview,
      expires_at: expiresAt,
    })
    .select()
    .single()

  if (error) throw error
  console.log('TOKEN_URL:', `http://localhost:3000/portal?token=${encodeURIComponent(rawToken)}`)
  console.log('RESIDENT:', tenant.full_name)
}

getOrCreateToken().catch(console.error)
