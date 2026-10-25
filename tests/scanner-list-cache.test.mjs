import { importApp } from './import-app.mjs';
// Run: node tests/scanner-list-cache.test.mjs
//
// Regression test: concurrent loadList() calls (e.g. a quick 10k/100k toggle
// while the first fetch is in flight) must share one download, and a failed
// download must not be cached so the next call can retry.

const { PasswordScanner } = await importApp('password-scanner.js');

function assert(description, condition) {
  if (!condition) throw new Error(`FAIL: ${description}`)
  console.log(`PASS: ${description}`)
}

let fetchCount = 0
let failNext = false
globalThis.fetch = async () => {
  fetchCount++
  if (failNext) { failNext = false; return { ok: false, status: 503 } }
  await new Promise(r => setTimeout(r, 10))
  return { ok: true, status: 200, text: async () => 'alpha\nbeta\n' }
}

const scanner = new PasswordScanner()
const [a, b] = await Promise.all([scanner.loadList('10k'), scanner.loadList('10k')])
assert('concurrent loads fetch the list once', fetchCount === 1)
assert('concurrent loads resolve to the same list', a === b && a.length === 2)

fetchCount = 0
failNext = true
let failed = false
try { await scanner.loadList('100k') } catch { failed = true }
assert('failed download rejects', failed)
const retried = await scanner.loadList('100k')
assert('failed download is retried on the next call', fetchCount === 2 && retried.length === 2)

console.log('\nAll tests passed.')
