import { importApp } from './import-app.mjs';
// Run: node tests/remove-protection.test.mjs

const { PDF } = await importApp('vendor/libpdf-core.js');
const { PDFSession } = await importApp('pdf-session.js');

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

  // Remove form submitted with the owner field blank: the session already
  // holds owner access, so removal must not fall back to user-only auth.
  const blankFieldBytes = await session.removeProtection(null)
  assert('removal without re-entering the shared password yields an unencrypted PDF',
    await canLoadWithoutPassword(blankFieldBytes))

  console.log('\nAll tests passed.')
}

main().catch(err => {
  console.error(err.message)
  process.exit(1)
})
