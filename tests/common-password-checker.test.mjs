// Run: node tests/common-password-checker.test.mjs
//
// Regression test for P-C12: a transient fetch failure must not permanently
// disable the common-password check. loadCommonPasswords rejects on failure
// and a later call retries the download.

import { loadCommonPasswords, isCommonPassword } from '../js/common-password-checker.js'

function assert(description, condition) {
  if (!condition) throw new Error(`FAIL: ${description}`)
  console.log(`PASS: ${description}`)
}

let fetchCalls = 0

// First attempt: network failure
globalThis.fetch = () => { fetchCalls++; return Promise.reject(new Error('network down')) }

const failed = await loadCommonPasswords().then(() => false, () => true)
assert('rejects when the fetch fails', failed)
assert('no match reported before the list loads', !isCommonPassword('password'))

// Second attempt: fetch works again
globalThis.fetch = () => {
  fetchCalls++
  return Promise.resolve({ ok: true, text: () => Promise.resolve('password\n123456\n') })
}

const set = await loadCommonPasswords()
assert('retry after failure loads the list', set.size === 2)
assert('common password detected after retry', isCommonPassword('PASSWORD'))
assert('uncommon password not flagged', !isCommonPassword('xK9#mQ2v'))

// Third attempt: memoized, no further fetch
await loadCommonPasswords()
assert('successful load is cached (fetch called twice total)', fetchCalls === 2)

console.log('\nAll tests passed.')
