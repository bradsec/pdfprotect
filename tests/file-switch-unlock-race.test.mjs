import test from 'node:test'
import assert from 'node:assert/strict'
import { installDom, importRepo, stubFileReader, chooseFile, tick, deferred } from './harness.mjs'

test('unlock of file A submitted while file B loads must not replace B', async () => {
  const element = installDom()
  stubFileReader(() => Uint8Array.of(37, 80, 68, 70))
  const { PDFSession } = await importRepo('pdf-session.js')
  await importRepo('app.js')

  const protectedBy = []
  const lockedA = { isEncrypted: true, isAuthenticated: false, getSecurity: () => ({}), getSecurityHandler: () => ({}) }
  const sessionA = { hasOwnerAccess: () => true, protect: async () => { protectedBy.push('A'); return new Uint8Array(1) } }
  const sessionB = { isEncrypted: false, isAuthenticated: true, hasOwnerAccess: () => true,
    protect: async () => { protectedBy.push('B'); return new Uint8Array(1) } }

  // 1. File A loads and is locked.
  PDFSession.load = async () => lockedA
  chooseFile(element, 'A.pdf')
  await tick()
  assert.equal(element('card').dataset.state, 'locked')

  // 2. User drops file B; its parse is still running (large file).
  const loadB = deferred()
  PDFSession.load = () => loadB.promise
  chooseFile(element, 'B.pdf')
  await tick()

  // 3. An already queued submit event fires while B loads.
  const unlockA = deferred()
  PDFSession.loadWithCredentials = () => unlockA.promise
  element('unlock-password').value = 'a-secret'
  element('unlock-form').listeners.submit({ preventDefault() {} })

  // 4. B finishes loading, then A's unlock resolves.
  loadB.resolve(sessionB)
  await tick()
  assert.equal(element('ready-filename').textContent, 'B.pdf')
  unlockA.resolve(sessionA)
  await tick()

  // 5. User protects what the UI shows as B.pdf.
  element('user-password').value = 'pw'
  element('user-password-confirm').value = 'pw'
  element('protection-form').listeners.submit({ preventDefault() {} })
  await tick(); await tick()
  assert.equal(element('ready-filename').textContent, 'B.pdf')
  assert.deepEqual(protectedBy, ['B'], 'B-protected.pdf must contain B, not A')
})
