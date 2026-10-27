// Run: node tests/password-form-markup.test.mjs

import { readFileSync } from 'node:fs'

function assert(description, condition) {
  if (!condition) throw new Error(`FAIL: ${description}`)
  console.log(`PASS: ${description}`)
}

const html = readFileSync('index.html', 'utf8')

const requiredTokens = [
  'id="unlock-form"',
  'id="protection-form"',
  'id="remove-form"',
  'id="unlock-username"',
  'id="protection-username"',
  'id="remove-username"',
  'id="unlock-password"',
  'id="user-password"',
  'id="user-password-confirm"',
  'id="owner-password"',
  'id="owner-password-confirm"',
  'id="remove-owner-password"',
]

for (const token of requiredTokens) {
  assert(`markup contains ${token}`, html.includes(token))
}

assert('unlock button submits through a form',
  html.includes('id="unlock-btn"') && html.includes('type="submit"'))
assert('protect button submits through a form',
  html.includes('id="protect-btn"') && html.includes('type="submit"'))
assert('remove button submits through a form',
  html.includes('id="confirm-remove-btn"') && html.includes('type="submit"'))
assert('forms include autocomplete username fields',
  html.includes('autocomplete="username"'))
assert('hero has the two distinct benefit chips',
  [...html.matchAll(/<li class="hero-point">([^<]+)<\/li>/g)].map(match => match[1]).join('|') === 'No uploads|AES-256 protection')
assert('ready actions put the secondary remove action before the primary apply action',
  html.indexOf('id="remove-btn"') < html.indexOf('id="protect-btn"'))

console.log('\nAll tests passed.')
