import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { importApp } from './import-app.mjs'

const list = readFileSync(new URL('../passwords/10k-most-common.txt', import.meta.url), 'utf8')
globalThis.fetch = async () => ({ ok: true, text: async () => list })

const { loadCommonPasswords, isCommonPassword } = await importApp('common-password-checker.js')
const { passwordStrength } = await importApp('password-strength.js')
await loadCommonPasswords()

const weakPasswords = [
  'password1234', 'Password1234!', 'password', 'passw0rd', 'P@ssw0rd123',
  'qwerty123456', 'letmein2024', 'aaaaaaaaaaaa', '123456789012',
  'abcdefghijkl', 'iloveyou1!', 'admin12345678', 'dragon',
  'abcabcabcabc', 'zyxwvutsrqpo', 'asdf1234', '202410262024',
  'A1!A1!A1!A1!', '20301231Aa!!', 'Abcd1234!Abcd',
]

for (const password of weakPasswords) {
  test(`${password} rates weak`, () => {
    const { score } = passwordStrength(password, { isCommonPassword })
    assert.ok(score <= 2, `expected Weak or Fair, got score ${score}`)
  })
}

for (const password of ['vT9#qL2!xR7m', 'copper-violin-harbor-lantern']) {
  test(`${password} rates strong`, () => {
    const { score } = passwordStrength(password, { isCommonPassword })
    assert.ok(score >= 3, `expected Strong or Very strong, got score ${score}`)
  })
}
