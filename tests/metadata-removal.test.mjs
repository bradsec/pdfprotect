import assert from 'node:assert/strict'
import test from 'node:test'
import { importApp } from './import-app.mjs'

const { PDF, PdfDict, PdfStream } = await importApp('vendor/libpdf-core.js')
const { PDFSession } = await importApp('pdf-session.js')

async function source() {
  const pdf = PDF.create()
  pdf.addPage({ size: 'letter' })
  pdf.setMetadata({ title: 'Secret title', author: 'Secret author', subject: 'Secret subject', keywords: ['secret'], creator: 'Secret creator', producer: 'Secret producer', creationDate: new Date('2020-01-01'), modificationDate: new Date('2020-01-02') })
  pdf.getCatalog().set('Metadata', pdf.ctx.registry.register(new PdfStream(new PdfDict(), new TextEncoder().encode('<xmp>secret-xmp</xmp>'))))
  return pdf.save()
}

function assertStripped(pdf, bytes) {
  assert.equal(pdf.ctx.info.trailer.has('Info'), false)
  assert.equal(pdf.getCatalog().has('Metadata'), false)
  assert.equal(new TextDecoder().decode(bytes).includes('secret-xmp'), false)
}

test('protected output removes Info and XMP and still opens with password', async () => {
  const session = await PDFSession.load(await source())
  const bytes = await session.protect({ userPassword: 'open-secret', removeMetadata: true })
  const pdf = await PDF.load(bytes, { credentials: 'open-secret' })
  assert.equal(pdf.isAuthenticated, true)
  assertStripped(pdf, bytes)
})

test('unlocked output removes Info and XMP when enabled', async () => {
  const protectedBytes = await (await PDFSession.load(await source())).protect({ userPassword: 'open-secret', removeMetadata: false })
  const session = await PDFSession.loadWithCredentials(protectedBytes, 'open-secret')
  const bytes = await session.removeProtection(null, true)
  const pdf = await PDF.load(bytes)
  assert.equal(pdf.isEncrypted, false)
  assertStripped(pdf, bytes)
})
