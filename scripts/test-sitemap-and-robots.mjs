import assert from 'node:assert/strict'
import sitemap from '../app/sitemap.ts'
import robots from '../app/robots.ts'
import { getSiteUrl } from '../lib/site.ts'

console.log('=== TEST SUITE: SITEMAP & ROBOTS.TXT DOMAIN VERIFICATION ===\n')

// 1. Test sitemap.xml entries
console.log('1. Verifying sitemap() output...')
const sitemapFn = typeof sitemap === 'function' ? sitemap : sitemap?.default
const sitemapEntries = sitemapFn()
assert(Array.isArray(sitemapEntries), 'sitemap() must return an array')
assert(sitemapEntries.length >= 9, 'sitemap() must contain all public routes')

const EXPECTED_DOMAIN = 'https://www.baserabook.in'
const FORBIDDEN_DOMAINS = [
  'pg-management-saas-development-rose.vercel.app',
  'vercel.app',
  'localhost',
]

for (const entry of sitemapEntries) {
  assert(typeof entry.url === 'string', 'Every sitemap entry must have a url')
  assert(entry.url.startsWith(EXPECTED_DOMAIN), `URL "${entry.url}" must start with "${EXPECTED_DOMAIN}"`)

  for (const forbidden of FORBIDDEN_DOMAINS) {
    assert(!entry.url.includes(forbidden), `URL "${entry.url}" must NOT contain "${forbidden}"`)
  }
}
console.log(`✔ All ${sitemapEntries.length} sitemap entries strictly use ${EXPECTED_DOMAIN}. Zero old domains detected.`)

// 2. Test robots.txt output
console.log('\n2. Verifying robots() output...')
const robotsFn = typeof robots === 'function' ? robots : robots?.default
const robotsOutput = robotsFn()
assert(robotsOutput.sitemap, 'robots() must define a sitemap')
assert.equal(
  robotsOutput.sitemap,
  'https://www.baserabook.in/sitemap.xml',
  'robots.txt sitemap reference must be exactly "https://www.baserabook.in/sitemap.xml"'
)

for (const forbidden of FORBIDDEN_DOMAINS) {
  assert(!robotsOutput.sitemap.includes(forbidden), `robots.txt sitemap must NOT contain "${forbidden}"`)
}

// Verify disallows
const rules = Array.isArray(robotsOutput.rules) ? robotsOutput.rules : [robotsOutput.rules]
const allDisallows = rules.flatMap((r) => (Array.isArray(r.disallow) ? r.disallow : [r.disallow]))
assert(allDisallows.includes('/dashboard'), 'robots must disallow /dashboard')
assert(allDisallows.includes('/admin'), 'robots must disallow /admin')
assert(allDisallows.includes('/console'), 'robots must disallow /console')
assert(allDisallows.includes('/api/'), 'robots must disallow /api/')
console.log('✔ robots.txt correctly points to https://www.baserabook.in/sitemap.xml and enforces privacy rules.')

// 3. Test getSiteUrl resilience against Vercel auto-injected subdomains
console.log('\n3. Verifying getSiteUrl() resolution...')
const originalVercelProd = process.env.VERCEL_PROJECT_PRODUCTION_URL
const originalVercelUrl = process.env.VERCEL_URL
const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL
const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL

try {
  delete process.env.NEXT_PUBLIC_SITE_URL
  delete process.env.NEXT_PUBLIC_APP_URL
  process.env.VERCEL_PROJECT_PRODUCTION_URL = 'pg-management-saas-development-rose.vercel.app'
  process.env.VERCEL_URL = 'pg-management-saas-development-rose.vercel.app'

  const resolved = getSiteUrl()
  assert.equal(
    resolved,
    'https://www.baserabook.in',
    'getSiteUrl() must default to https://www.baserabook.in even when Vercel env vars are injected'
  )
  console.log('✔ getSiteUrl() resists Vercel internal subdomain overrides.')
} finally {
  if (originalVercelProd) process.env.VERCEL_PROJECT_PRODUCTION_URL = originalVercelProd
  else delete process.env.VERCEL_PROJECT_PRODUCTION_URL

  if (originalVercelUrl) process.env.VERCEL_URL = originalVercelUrl
  else delete process.env.VERCEL_URL

  if (originalSiteUrl) process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl
  if (originalAppUrl) process.env.NEXT_PUBLIC_APP_URL = originalAppUrl
}

console.log('\n=============================================================')
console.log('🎉 SITEMAP & ROBOTS.TXT VERIFIED WITH 100% SUCCESS!')
console.log('=============================================================')
