// Tests passwordStrength() pure function.
// Run: node tests/password-strength.test.mjs

import { passwordStrength } from '../js/password-strength.js'

function assert(description, condition) {
  if (!condition) throw new Error(`FAIL: ${description}`)
  console.log(`PASS: ${description}`)
}

assert('empty string returns score 0', passwordStrength('').score === 0)
assert('"ab" is weak', passwordStrength('ab').score === 1)
assert('"password" is weak (no mixed case/numbers)', passwordStrength('password').score === 1)
assert('"Password1" is fair', passwordStrength('Password1').score === 2)
assert('"Correct1Horse!" is strong', passwordStrength('Correct1Horse!').score >= 3)
assert('"xK9#mP2@vL5$nQ8!" is very strong', passwordStrength('xK9#mP2@vL5$nQ8!').score === 4)
assert('score 1 has hint text', passwordStrength('ab').hint.length > 0)
assert('score 4 has hint text', passwordStrength('xK9#mP2@vL5$nQ8!').hint.length > 0)

assert('a common password is weak regardless of entropy',
  passwordStrength('xK9#mP2@vL5$nQ8!', { isCommon: true }).score === 1)
const strongWithSymbol = passwordStrength('Corr1Hor!e')
assert('strong password with symbols is not told to add symbols',
  strongWithSymbol.score === 3 && !/symbol/i.test(strongWithSymbol.hint))
const strongNoSymbol = passwordStrength('CorrHorse12')
assert('strong password without symbols is told to add symbols',
  strongNoSymbol.score === 3 && /symbol/i.test(strongNoSymbol.hint))

console.log('\nAll tests passed.')
