// Run: node tests/seo-markup.test.mjs

import { readFileSync } from 'node:fs'

function assert(description, condition) {
  if (!condition) throw new Error(`FAIL: ${description}`)
  console.log(`PASS: ${description}`)
}

const html = readFileSync('index.html', 'utf8')

assert('page includes a descriptive meta description',
  html.includes('meta name="description"'))
assert('page includes robots directives',
  html.includes('meta name="robots"'))
assert('page includes canonical url for pdfprotect.me',
  html.includes('rel="canonical" href="https://pdfprotect.me/"'))
assert('page includes Open Graph title metadata',
  html.includes('property="og:title"'))
assert('page includes Open Graph url metadata',
  html.includes('property="og:url" content="https://pdfprotect.me/"'))
assert('page includes a primary h1 heading',
  html.includes('<h1'))
assert('footer links to pdfmerge.me',
  html.includes('https://pdfmerge.me'))

console.log('\nAll tests passed.')
