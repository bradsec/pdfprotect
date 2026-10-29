import test from 'node:test'
import assert from 'node:assert/strict'
import { installDom, importRepo, stubFileReader, chooseFile } from './harness.mjs'

// Same-length edit keeps xref offsets valid: a Standard R6 dict relabelled with a
// non-Standard /Filter (e.g. certificate encryption, /Adobe.PubSec). libpdf turns
// the EncryptionDictError into a warning and returns securityHandler = null.
async function unsupportedHandlerPdf(PDF, PDFSession) {
  const src = PDF.create(); src.addPage({ size: 'letter' })
  const bytes = await (await PDFSession.load(await src.save())).protect({ userPassword: 'right-pw' })
  const text = Buffer.from(bytes).toString('latin1')
  const from = '/Filter /Standard\n/V 5\n/R 6\n', to = '/Filter/Adobe.PubSec/V 5/R 6'
  assert.equal(from.length, to.length); assert.ok(text.includes(from))
  return new Uint8Array(Buffer.from(text.replace(from, to), 'latin1'))
}

test('unsupported security handler is not reported as an incorrect password', async () => {
  const element = installDom()
  const { PDF } = await importRepo('vendor/libpdf-core.js')
  const { PDFSession } = await importRepo('pdf-session.js')
  const bytes = await unsupportedHandlerPdf(PDF, PDFSession)
  stubFileReader(() => bytes)
  await importRepo('app.js')

  chooseFile(element, 'cert.pdf', bytes.length)
  await new Promise(r => setTimeout(r, 50))
  const state = element('card').dataset.state
  assert.match(element('toasts').children.at(-1).children[1].textContent, /encryption method PDFProtect does not support/)

  element('unlock-password').value = 'right-pw'
  element('unlock-form').listeners.submit({ preventDefault() {} })
  await new Promise(r => setTimeout(r, 50))
  const unlockMsg = element('unlock-error').hidden ? null : element('unlock-error-text').textContent

  element('forgot-password-btn').listeners.click()
  element('scan-trigger-10k').listeners.click()
  await new Promise(r => setTimeout(r, 50))
  const scanUiVisible = !element('scan-panel').hidden || !element('forgot-password-btn').hidden || !element('scan-choices').hidden

  assert.deepEqual({ state, unlockMsg, scanUiVisible },
    { state: 'idle', unlockMsg: null, scanUiVisible: true },
    'expected an "unsupported encryption" rejection, not a password prompt')
})
