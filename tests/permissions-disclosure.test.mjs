// Run: node tests/permissions-disclosure.test.mjs

import { readFileSync } from 'node:fs'

function assert(description, condition) {
  if (!condition) throw new Error(`FAIL: ${description}`)
  console.log(`PASS: ${description}`)
}

const html = readFileSync('index.html', 'utf8')
const readme = readFileSync('README.md', 'utf8')

assert('UI explains that PDF permissions depend on viewer support',
  html.includes('Permissions depend on viewer support'))
assert('README explains that PDF permissions are best-effort viewer restrictions',
  readme.includes('best-effort') && readme.includes('viewer'))
assert('UI no longer advertises unsupported legacy encryption options',
  !html.includes('RC4-128') && !html.includes('RC4-40') && !html.includes('AES-128'))
assert('README explains blank owner passwords reuse the user password',
  readme.includes('reuse the user password'))

console.log('\nAll tests passed.')
