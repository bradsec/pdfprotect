// Tests the pure conditional logic of encryption detection.
// Run: node tests/state-machine.test.mjs

function detectEncryptionState(isEncrypted, isAuthenticated) {
  if (isEncrypted && !isAuthenticated) return 'locked'
  return 'ready'
}

function assert(description, condition) {
  if (!condition) throw new Error(`FAIL: ${description}`)
  console.log(`PASS: ${description}`)
}

assert('unencrypted PDF goes to ready',
  detectEncryptionState(false, false) === 'ready')

assert('encrypted + authenticated goes to ready',
  detectEncryptionState(true, true) === 'ready')

assert('encrypted + unauthenticated goes to locked',
  detectEncryptionState(true, false) === 'locked')

console.log('\nAll tests passed.')
