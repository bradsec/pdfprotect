// Run: node tests/scanner-owner-match.test.mjs
//
// Regression test for the owner-only scan match bug: a password that
// authenticates as the USER must NOT be reported as the owner password.
// Owner-only scans require result.authenticated && result.isOwner.

import { PasswordScanner } from '../js/password-scanner.js'

function assert(description, condition) {
  if (!condition) throw new Error(`FAIL: ${description}`)
  console.log(`PASS: ${description}`)
}

// Mock the network: every list fetch returns the same three-word list.
globalThis.fetch = async () => ({
  ok: true,
  status: 200,
  text: async () => 'alpha\nbeta\nsecret\n',
})

const dec = new TextDecoder()

// Fake libpdf security handler:
//   'beta'   authenticates but is only the USER password (isOwner: false)
//   'secret' authenticates AND is the owner password (isOwner: true)
const handler = {
  tryOwnerPassword(bytes) {
    const pw = dec.decode(bytes)
    if (pw === 'secret') return { authenticated: true, isOwner: true }
    if (pw === 'beta') return { authenticated: true, isOwner: false }
    return { authenticated: false }
  },
  authenticateWithString(pw) {
    return { authenticated: pw === 'beta' }
  },
}

function runScan(opts) {
  return new Promise((resolve, reject) => {
    const scanner = new PasswordScanner()
    scanner.scan({
      securityHandler: handler,
      listKey: '10k',
      onFound: pw => resolve({ outcome: 'found', pw }),
      onComplete: () => resolve({ outcome: 'complete' }),
      onError: err => reject(err),
      ...opts,
    })
  })
}

const owner = await runScan({ ownerOnly: true })
assert('owner-only scan skips the user-only password "beta"', owner.pw !== 'beta')
assert('owner-only scan reports the true owner password "secret"',
  owner.outcome === 'found' && owner.pw === 'secret')

const user = await runScan({ ownerOnly: false })
assert('user scan reports the user password "beta"',
  user.outcome === 'found' && user.pw === 'beta')

console.log('\nAll tests passed.')
