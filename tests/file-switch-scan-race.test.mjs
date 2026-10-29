import test from 'node:test'
import assert from 'node:assert/strict'
import { installDom, importRepo, stubFileReader, chooseFile, tick, deferred } from './harness.mjs'

test('scan started while file B loads must not report file A password on B', async () => {
  const element = installDom()
  stubFileReader(() => Uint8Array.of(37, 80, 68, 70))
  const words = Array.from({ length: 2000 }, (_, i) => `w${i}`)
  words[1500] = 'a-secret'
  globalThis.fetch = async () => ({ ok: true, text: async () => words.join('\n') })
  const { PDFSession } = await importRepo('pdf-session.js')
  await importRepo('app.js')

  const locked = authPw => ({ isEncrypted: true, isAuthenticated: false, getSecurity: () => ({}),
    getSecurityHandler: () => ({ authenticateWithString: pw => ({ authenticated: pw === authPw }) }) })

  PDFSession.load = async () => locked('a-secret')
  chooseFile(element, 'A.pdf')
  await tick()
  assert.equal(element('card').dataset.state, 'locked')

  // File B is dropped; while it parses, the user starts "Forgot password? -> 10k".
  const loadB = deferred()
  PDFSession.load = () => loadB.promise
  chooseFile(element, 'B.pdf')
  await tick()
  element('forgot-password-btn').listeners.click()
  element('scan-trigger-10k').listeners.click()
  await new Promise(r => setTimeout(r, 5))

  // B finishes loading and is locked with a password that is not in the list.
  loadB.resolve(locked('b-secret-not-in-list'))
  await new Promise(r => setTimeout(r, 100))

  assert.equal(element('locked-filename').textContent, 'B.pdf')
  assert.equal(element('scan-found-banner').hidden, true, 'found banner shown on B')
  assert.notEqual(element('unlock-password').value, 'a-secret', "A's password auto-filled into B's form")
})
