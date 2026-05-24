// Run: node tests/password-confirm.test.mjs

function validatePasswordConfirm(pw, confirm) {
  if (!pw && confirm) return { valid: false, reason: 'enter-first' }
  if (pw && confirm && pw !== confirm) return { valid: false, reason: 'mismatch' }
  return { valid: true }
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

console.log('\nAll tests passed.')
