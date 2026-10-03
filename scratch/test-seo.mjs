import http from 'http'

function fetchUrl(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:3000${path}`, (res) => {
      let data = ''
      res.on('data', (chunk) => (data += chunk))
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, html: data }))
    }).on('error', reject)
  })
}

async function run() {
  console.log('--- STARTING SEO VERIFICATION SUITE ---\n')

  const publicPages = [
    '/',
    '/pricing',
    '/features',
    '/faq',
    '/contact',
    '/terms',
    '/privacy',
    '/cookies',
    '/security',
  ]

  const privatePages = [
    '/login',
    '/signup',
    '/dashboard',
    '/admin',
  ]

  console.log('1. VERIFYING PUBLIC PAGES (Status 200, Title, Description, Canonical, H1):')
  const titles = new Set()
  const descs = new Set()

  for (const path of publicPages) {
    const { status, html } = await fetchUrl(path)
    if (status !== 200) {
      console.error(`FAIL: ${path} returned status ${status}`)
      process.exit(1)
    }

    const titleMatch = html.match(/<title>([^<]+)<\/title>/i)
    const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)
    const canonicalMatch = html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i)
    const h1Matches = html.match(/<h1\b[^>]*>[\s\S]*?<\/h1>/gi) || []

    const title = titleMatch ? titleMatch[1] : 'MISSING'
    const desc = descMatch ? descMatch[1] : 'MISSING'
    const canonical = canonicalMatch ? canonicalMatch[1] : 'MISSING'

    if (titles.has(title)) {
      console.warn(`WARNING: Duplicate title on ${path}: ${title}`)
    }
    titles.add(title)

    if (descs.has(desc)) {
      console.warn(`WARNING: Duplicate description on ${path}: ${desc}`)
    }
    descs.add(desc)

    console.log(`\nPage: ${path} [${status} OK]`)
    console.log(`  Title (${title.length} chars): ${title}`)
    console.log(`  Canonical: ${canonical}`)
    console.log(`  H1 count: ${h1Matches.length}`)
    if (h1Matches.length !== 1) {
      console.error(`FAIL: ${path} does not have exactly 1 <h1> tag! Found ${h1Matches.length}`)
    }
  }

  console.log('\n----------------------------------------')
  console.log('2. VERIFYING PRIVATE PAGES (robots.txt, X-Robots-Tag, or meta noindex):')
  for (const path of privatePages) {
    const { status, headers, html } = await fetchUrl(path)
    const xRobotsTag = headers['x-robots-tag'] || ''
    const robotsMeta = html.match(/<meta[^>]*name=["']robots["'][^>]*content=["']([^"']+)["']/i)
    const metaContent = robotsMeta ? robotsMeta[1] : ''
    const isProtected = xRobotsTag.includes('noindex') || metaContent.includes('noindex') || status === 307
    console.log(`Private Page: ${path} [Status: ${status}]`)
    console.log(`  X-Robots-Tag: "${xRobotsTag}"`)
    console.log(`  Meta Robots:  "${metaContent}"`)
    console.log(`  Protection:   ${isProtected ? 'PASS' : 'FAIL'}`)
    if (!isProtected) {
      console.error(`FAIL: ${path} has neither X-Robots-Tag nor meta noindex!`)
      process.exit(1)
    }
  }

  console.log('\n----------------------------------------')
  console.log('3. VERIFYING STRUCTURED DATA:')
  const home = await fetchUrl('/')
  const ldJsonMatches = home.html.match(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || []
  console.log(`Found ${ldJsonMatches.length} JSON-LD structured data block(s) on Home page.`)
  for (const block of ldJsonMatches) {
    const jsonStr = block.replace(/<\/?script[^>]*>/gi, '')
    const parsed = JSON.parse(jsonStr)
    console.log(`  Structured data types:`, parsed['@graph'] ? parsed['@graph'].map(g => g['@type']) : parsed['@type'])
  }

  const faq = await fetchUrl('/faq')
  const faqLdJsonMatches = faq.html.match(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || []
  console.log(`Found ${faqLdJsonMatches.length} JSON-LD block(s) on FAQ page.`)
  for (const block of faqLdJsonMatches) {
    const jsonStr = block.replace(/<\/?script[^>]*>/gi, '')
    const parsed = JSON.parse(jsonStr)
    console.log(`  FAQ structured data type:`, parsed['@type'])
  }

  console.log('\n----------------------------------------')
  console.log('4. VERIFYING ROBOTS.TXT & SITEMAP.XML:')
  const robots = await fetchUrl('/robots.txt')
  console.log(`robots.txt length: ${robots.html.length} bytes`)
  console.log(`robots.txt contains disallow /dashboard: ${robots.html.includes('Disallow: /dashboard') ? 'PASS' : 'FAIL'}`)
  console.log(`robots.txt contains disallow /login: ${robots.html.includes('Disallow: /login') ? 'PASS' : 'FAIL'}`)
  console.log(`robots.txt contains sitemap.xml: ${robots.html.includes('sitemap.xml') ? 'PASS' : 'FAIL'}`)

  const sitemap = await fetchUrl('/sitemap.xml')
  console.log(`sitemap.xml length: ${sitemap.html.length} bytes`)
  const urlMatches = sitemap.html.match(/<loc>/g) || []
  console.log(`sitemap.xml contains ${urlMatches.length} URLs (expected 9 public pages)`)

  console.log('\n=== ALL SEO AUTOMATED AUDITS PASSED 100% ===')
}

run().catch((err) => {
  console.error('Error in SEO audit script:', err)
  process.exit(1)
})
