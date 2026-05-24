// Run: node tests/owner-only-protection.test.mjs

import { PDF } from '../vendor/libpdf-core.js'
import { PDFSession } from '../pdf-session.js'

function assert(description, condition) {
  if (!condition) throw new Error(`FAIL: ${description}`)
  console.log(`PASS: ${description}`)
}

async function createPdfBytes() {
  const pdf = PDF.create()
  pdf.addPage({ size: 'letter' })
  return pdf.save()
}

async function main() {
  const sourceBytes = await createPdfBytes()
  const session = await PDFSession.load(sourceBytes)

  const ownerOnlyBytes = await session.protect({
    ownerPassword: 'owner-secret',
    algorithm: 'AES-256',
    permissions: {
      print: true,
      copy: false,
      modify: false,
      annotate: false,
      fillForms: false,
      assemble: false,
    },
  })

  const protectedPdf = await PDF.load(ownerOnlyBytes)
  const security = protectedPdf.getSecurity()

  assert('owner-only protection creates an encrypted PDF', protectedPdf.isEncrypted)
  assert('owner-only protection can load without an open password', protectedPdf.isAuthenticated)
  assert('owner-only protection preserves restricted copy permission', security.permissions.copy === false)

  const userOnlyBytes = await session.protect({
    userPassword: 'user-secret',
    algorithm: 'AES-256',
    permissions: {
      print: true,
      copy: false,
      modify: false,
      annotate: false,
      fillForms: false,
      assemble: false,
    },
  })

  const userOnlySession = await PDFSession.loadWithCredentials(userOnlyBytes, 'user-secret')
  assert('user-only protection reuses the user password for owner access',
    userOnlySession.hasOwnerAccess())

  const whitespaceOwnerBytes = await session.protect({
    userPassword: 'trimmed-secret',
    ownerPassword: '   ',
    algorithm: 'AES-256',
    permissions: {
      print: true,
      copy: false,
      modify: false,
      annotate: false,
      fillForms: false,
      assemble: false,
    },
  })

  const whitespaceOwnerSession = await PDFSession.loadWithCredentials(whitespaceOwnerBytes, 'trimmed-secret')
  assert('whitespace-only owner passwords fall back to the user password',
    whitespaceOwnerSession.hasOwnerAccess())

  console.log('\nAll tests passed.')
}

main().catch(err => {
  console.error(err.message)
  process.exit(1)
})
