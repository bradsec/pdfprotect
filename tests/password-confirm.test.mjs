// Run: node tests/password-confirm.test.mjs

function validatePasswordConfirm(pw, confirm) {
  if (!pw && confirm) return { valid: false, reason: 'enter-first' }
  if (pw && confirm && pw !== confirm) return { valid: false, reason: 'mismatch' }
  return { valid: true }
}

// Mirrors applyProtection in js/app.js: raw input values are trimmed once at
// the boundary, so the compared values are exactly what protect() encrypts.
function validateRawPasswordConfirm(rawPw, rawConfirm) {
  return validatePasswordConfirm(rawPw.trim(), rawConfirm.trim())
}

function assert(description, condition) {
  if (!condition) throw new Error(`FAIL: ${description}`)
  console.log(`PASS: ${description}`)
}

assert('both empty — valid (optional field)',
  validatePasswordConfirm('', '').valid)
assert('matching passwords — valid',
  validatePasswordConfirm('secret', 'secret').valid)
assert('mismatching passwords — invalid',
  !validatePasswordConfirm('secret', 'wrong').valid)
assert('confirm filled, main empty — invalid',
  !validatePasswordConfirm('', 'anything').valid)
assert('confirm filled, main empty — enter-first reason',
  validatePasswordConfirm('', 'anything').reason === 'enter-first')
assert('mismatch — mismatch reason',
  validatePasswordConfirm('abc', 'xyz').reason === 'mismatch')
assert('main filled, confirm empty — valid (waiting for confirm)',
  validatePasswordConfirm('secret', '').valid)

// Trim-at-boundary cases (P-C5): space padding must not cause a false
// mismatch, and a spaces-only confirm must not trip the enter-first error.
assert('trailing space on main — matches after canonicalization',
  validateRawPasswordConfirm('secret ', 'secret').valid)
assert('leading/trailing spaces on confirm — matches after canonicalization',
  validateRawPasswordConfirm('secret', ' secret ').valid)
assert('spaces-only confirm with empty main — valid (both canonicalize empty)',
  validateRawPasswordConfirm('', '   ').valid)
assert('padded but genuinely different passwords — still mismatch',
  validateRawPasswordConfirm(' secret ', ' wrong ').reason === 'mismatch')

console.log('\nAll tests passed.')
