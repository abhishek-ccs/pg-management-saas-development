import fs from 'node:fs'

const content = fs.readFileSync('.env.local', 'utf8')
const lines = content.split('\n')
const rzpVars = []

for (const line of lines) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue
  const [key, ...rest] = trimmed.split('=')
  const val = rest.join('=').replace(/^["']|["']$/g, '').trim()
  
  if (key.includes('RAZORPAY')) {
    let mode = 'Unknown'
    let prefix = 'N/A'
    if (val.startsWith('rzp_test_')) {
      mode = 'TEST MODE'
      prefix = 'rzp_test_...'
    } else if (val.startsWith('rzp_live_')) {
      mode = 'LIVE MODE'
      prefix = 'rzp_live_...'
    } else if (val.startsWith('plan_')) {
      mode = 'PLAN ID'
      prefix = 'plan_...'
    } else if (key.includes('SECRET')) {
      mode = 'SECRET'
      prefix = '[REDACTED SECRET]'
    }

    rzpVars.push({
      name: key,
      category: key.startsWith('NEXT_PUBLIC_') ? 'Client-exposed (Public)' : 'Server-only (Private)',
      format: mode,
      prefixMasked: prefix,
      isConfigured: val.length > 0,
      charLength: val.length
    })
  }
}

console.log(JSON.stringify(rzpVars, null, 2))
