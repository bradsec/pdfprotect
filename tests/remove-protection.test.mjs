// Run: node tests/remove-protection.test.mjs

import { PDF } from '../js/vendor/libpdf-core.js'
import { PDFSession } from '../js/pdf-session.js'

function assert(description, condition) {
  if (!condition) throw new Error(`FAIL: ${description}`)
  console.log(`PASS: ${description}`)
}

async function createProtectedPdf({ userPassword, ownerPassword, permissions }) {
  const pdf = PDF.create()
  pdf.addPage({ size: 'letter' })
  pdf.setProtection({
    userPassword,
    ownerPassword,
    algorithm: 'AES-256',
    permissions,
  })
  return pdf.save()
}

async function canLoadWithoutPassword(bytes) {
  const pdf = await PDF.load(bytes)
  return !pdf.isEncrypted || pdf.isAuthenticated
}

async function main() {
  const bytes = await createProtectedPdf({
    userPassword: 'same-secret',
    ownerPassword: 'same-secret',
    permissions: {
      print: true,
      copy: true,
      modify: false,
      annotate: true,
      fillForms: true,
      assemble: true,
    },
  })

  const session = await PDFSession.loadWithCredentials(bytes, 'same-secret')
  assert('same user/owner password prefers owner access',
    session.hasOwnerAccess())

  const unprotectedBytes = await session.removeProtection('same-secret')
  assert('owner-password removal yields an unencrypted PDF',
    await canLoadWithoutPassword(unprotectedBytes))

  console.log('\nAll tests passed.')
}

main().catch(err => {
  console.error(err.message)
  process.exit(1)
})
