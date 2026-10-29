import test from 'node:test'
import assert from 'node:assert/strict'
import { importRepo } from './harness.mjs'

const { PDF } = await importRepo('vendor/libpdf-core.js')
const { PDFSession } = await importRepo('pdf-session.js')

// A whitespace-only owner field must use the session's existing owner access.
test('whitespace-only owner field behaves like a blank field for an owner session', async () => {
  const src = PDF.create(); src.addPage({ size: 'letter' })
  const bytes = await (await PDFSession.load(await src.save())).protect({ userPassword: 'open-secret' })
  const session = await PDFSession.loadWithCredentials(bytes, 'open-secret')
  assert.equal(session.hasOwnerAccess(), true)
  await session.removeProtection(null, false) // blank field: succeeds
  await assert.doesNotReject(session.removeProtection('   ', false))
})
