// Tests passwordStrength() pure function.
// Run: node tests/password-strength.test.mjs

function passwordStrength(password) {
  if (!password) return { score: 0, label: '', hint: '' }

  let charset = 0
  if (/[a-z]/.test(password)) charset += 26
  if (/[A-Z]/.test(password)) charset += 26
  if (/[0-9]/.test(password))  charset += 10
  if (/[^a-zA-Z0-9]/.test(password)) charset += 32

  const entropy = password.length * Math.log2(charset || 1)

  if (entropy < 40) return { score: 1, label: 'Weak',
    hint: 'Use 8+ characters with mixed case and numbers' }
  if (entropy < 60) return { score: 2, label: 'Fair',
    hint: 'Add symbols or increase length' }
  if (entropy < 72) return { score: 3, label: 'Strong',
    hint: 'Consider adding symbols for maximum strength' }
  return { score: 4, label: 'Very strong', hint: '✓ Excellent password' }
}

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

console.log('\nAll tests passed.')
