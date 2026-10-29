import test from 'node:test'
import assert from 'node:assert/strict'
import { importRepo } from './harness.mjs'

const { PDF, PdfString } = await importRepo('vendor/libpdf-core.js')
const { PDFSession } = await importRepo('pdf-session.js')

// Typical app output: only an open password, so owner == user and the session
// authenticates through loadPreferringOwnerCredentials -> tryOwnerPassword.
async function protectedWithTitle(opts) {
  const src = PDF.create()
  src.addPage({ size: 'letter' })
  src.setMetadata({ title: 'Quarterly Report', author: 'Alice' })
  src.getCatalog().set('Lang', PdfString.fromString('en-AU'))
  return (await PDFSession.load(await src.save())).protect({ ...opts, removeMetadata: false })
}

test('remove protection with "keep metadata" preserves the document title', async () => {
  const bytes = await protectedWithTitle({ userPassword: 'open-secret' })
  const session = await PDFSession.loadWithCredentials(bytes, 'open-secret')
  const out = await PDF.load(await session.removeProtection(null, false))
  assert.equal(out.getMetadata().title, 'Quarterly Report')
  assert.equal(out.getCatalog().get('Lang').asString(), 'en-AU')
})

test('re-protect with "keep metadata" preserves the document title', async () => {
  const bytes = await protectedWithTitle({ userPassword: 'u1', ownerPassword: 'o1' })
  const session = await PDFSession.loadWithCredentials(bytes, 'o1')
  const out = await PDF.load(await session.protect({ userPassword: 'new', removeMetadata: false }), { credentials: 'new' })
  assert.equal(out.getMetadata().author, 'Alice')
  assert.equal(out.getCatalog().get('Lang').asString(), 'en-AU')
})
