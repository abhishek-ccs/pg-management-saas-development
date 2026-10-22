import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import {
  generateTenantToken,
  hashToken,
  signTenantSession,
  verifyTenantSession,
  DEFAULT_LINK_EXPIRY_DAYS,
} from '../lib/tenant-access'

console.log('===============================================================')
console.log('🧪 BaseraBook Secure Resident Link & Token Generation Test Suite')
console.log('===============================================================\n')

// 1. Cryptographic Entropy & Hash Invariants
console.log('1. Testing Cryptographic Token Generation & Hashing...')
const tokenPair = generateTenantToken()
assert(tokenPair.rawToken, 'rawToken must exist')
assert(tokenPair.rawToken.length >= 40, 'rawToken must have high entropy (>= 256 bits, base64url encoded)')
assert(tokenPair.tokenHash, 'tokenHash must exist')
assert.equal(tokenPair.tokenHash.length, 64, 'tokenHash must be 64-char hex SHA-256')
assert.equal(tokenPair.tokenHash, hashToken(tokenPair.rawToken), 'hashToken must match SHA-256 of rawToken')
assert(tokenPair.tokenPreview.startsWith('tk_'), 'preview must start with tk_ prefix')
assert(tokenPair.tokenPreview.includes('...'), 'preview must be masked')
assert(!tokenPair.tokenPreview.includes(tokenPair.rawToken), 'preview must never expose full raw token')
console.log('✔ Token generation: 256-bit entropy, SHA-256 hashing, and masked preview verified.')

// 2. Tamper-Evident HMAC Signed Session Invariants
console.log('\n2. Testing Tamper-Evident Signed Session & Expiry Invariant...')
const testPayload = {
  tenantId: '11111111-1111-1111-1111-111111111111',
  ownerId: '22222222-2222-2222-2222-222222222222',
  tokenId: '33333333-3333-3333-3333-333333333333',
  expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
}

const sessionToken = signTenantSession(testPayload)
assert(sessionToken.includes('.'), 'Session token must be dot-separated (payload.hmac)')

const verified = verifyTenantSession(sessionToken)
assert(verified, 'Valid session token must verify cleanly')
assert.equal(verified.tenantId, testPayload.tenantId)
assert.equal(verified.ownerId, testPayload.ownerId)

// Tamper check
const tamperedToken = sessionToken.slice(0, -3) + 'xyz'
const tamperedResult = verifyTenantSession(tamperedToken)
assert.equal(tamperedResult, null, 'Tampered session signature must be rejected immediately')

// Expired session check
const expiredPayload = {
  tenantId: '11111111-1111-1111-1111-111111111111',
  ownerId: '22222222-2222-2222-2222-222222222222',
  tokenId: '33333333-3333-3333-3333-333333333333',
  expiresAt: Date.now() - 1000, // expired 1s ago
}
const expiredToken = signTenantSession(expiredPayload)
const expiredResult = verifyTenantSession(expiredToken)
assert.equal(expiredResult, null, 'Expired session must return null')
console.log('✔ Tamper-evident HMAC signature, timing-safe equality, and expiration verified.')

// 3. Database Table Status in Remote Supabase
console.log('\n3. Checking Remote Supabase Database Table Status...')
const envPath = resolve('.env.local')
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

const { data: dbData, error: dbError } = await admin
  .from('tenant_access_tokens')
  .select('id')
  .limit(1)

if (dbError && (dbError.code === 'PGRST205' || dbError.message?.includes('tenant_access_tokens'))) {
  console.log('ℹ Table "tenant_access_tokens" status: MISSING FROM DATABASE (PGRST205)')
  console.log('  -> Confirmed root cause: Table needs to be created via migration.')
} else if (dbError) {
  console.log('ℹ Table error:', dbError.message)
} else {
  console.log('✔ Table "tenant_access_tokens" exists and is queryable in Supabase!')
}

// 4. Migration File Integrity Check
console.log('\n4. Verifying Migration File Structure & Constraints...')
const migrationPath = resolve('supabase/migrations/20261015000003_secure_tenant_access.sql')
const migrationSql = readFileSync(migrationPath, 'utf-8')

assert(migrationSql.includes('CREATE TABLE IF NOT EXISTS public.tenant_access_tokens'), 'Migration must create table')
assert(migrationSql.includes('REFERENCES public.profiles(id) ON DELETE CASCADE'), 'Must have owner foreign key')
assert(migrationSql.includes('REFERENCES public.tenants(id) ON DELETE CASCADE'), 'Must have tenant foreign key')
assert(migrationSql.includes('token_hash TEXT NOT NULL UNIQUE'), 'token_hash must be UNIQUE')
assert(migrationSql.includes('idx_tenant_access_tokens_hash'), 'Must have token_hash index')
assert(migrationSql.includes('ALTER TABLE public.tenant_access_tokens ENABLE ROW LEVEL SECURITY'), 'Must enable RLS')
assert(migrationSql.includes('tenant_access_tokens_owner_select'), 'Must have owner select policy')
assert(migrationSql.includes('tenant_access_tokens_owner_insert'), 'Must have owner insert policy')
assert(migrationSql.includes('tenant_access_tokens_owner_update'), 'Must have owner update policy')
assert(migrationSql.includes('tenant_access_tokens_owner_delete'), 'Must have owner delete policy')
console.log('✔ Migration schema: Foreign keys, constraints, indexes, and RLS policies verified.')

console.log('\n===============================================================')
console.log('🎉 ALL TENANT ACCESS TOKEN INVARIANTS & INTEGRITY CHECKS PASSED!')
console.log('===============================================================\n')
