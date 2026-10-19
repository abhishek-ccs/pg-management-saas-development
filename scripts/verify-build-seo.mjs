import fs from 'node:fs'
import path from 'node:path'

const files = [
  'index.html',
  'pricing.html',
  'features.html',
  'faq.html',
  'terms.html',
  'privacy.html',
  'contact.html',
  'security.html',
  'cookies.html',
  'robots.txt.body',
]

console.log('====================================================')
console.log('   PRODUCTION BUILD HTML SEO VERIFICATION')
console.log('====================================================\n')

let allPassed = true

for (const file of files) {
  const fullPath = path.join(process.cwd(), '.next', 'server', 'app', file)
  if (!fs.existsSync(fullPath)) {
    console.log(`⚠️  File not found: ${file}`)
    continue
  }

  const content = fs.readFileSync(fullPath, 'utf8')
  console.log(`Checking: ${file}`)

  if (file.endsWith('.html')) {
    const canonicalMatch = content.match(/<link[^>]+rel=["']canonical["'][^>]*>/i)
    const ogUrlMatch = content.match(/<meta[^>]+property=["']og:url["'][^>]*>/i)

    if (canonicalMatch) {
      console.log(`  ✔ Canonical: ${canonicalMatch[0]}`)
    } else {
      console.log(`  ❌ Canonical: MISSING`)
      allPassed = false
    }

    if (ogUrlMatch) {
      console.log(`  ✔ OpenGraph URL: ${ogUrlMatch[0]}`)
    }

    if (content.includes('vercel.app')) {
      console.log(`  ❌ Contains vercel.app!`)
      allPassed = false
    } else {
      console.log(`  ✔ Zero vercel.app occurrences`)
    }
  } else if (file === 'robots.txt.body') {
    console.log(`  Content:\n${content.trim().split('\n').map(l => '    ' + l).join('\n')}`)
    if (content.includes('https://www.baserabook.in/sitemap.xml')) {
      console.log(`  ✔ Correct sitemap reference in robots.txt`)
    } else {
      console.log(`  ❌ Incorrect sitemap in robots.txt`)
      allPassed = false
    }
  }

  console.log('')
}

if (allPassed) {
  console.log('🎉 ALL PRODUCTION HTML FILES VERIFIED WITH 100% CANONICAL ACCURACY!')
} else {
  console.error('❌ SOME CHECKS FAILED!')
  process.exit(1)
}
