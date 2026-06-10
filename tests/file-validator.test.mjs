// Run: node tests/file-validator.test.mjs
//
// Mirrors the validateFile / validatePdfMagic contract in js/app.js. The app
// module has DOM side effects on import, so the pure logic is duplicated here;
// keep MAX_FILE_BYTES and the message text in sync with js/app.js.

const MAX_FILE_BYTES = 50 * 1024 * 1024

function validateFile(mimeType, size, fileName = '') {
  // Some platforms report no MIME type (or a generic one) for PDFs; accept
  // those when the name says .pdf and let the magic-byte check verify content.
  const ambiguousMime = mimeType === '' || mimeType === 'application/octet-stream'
  const looksLikePdf = mimeType === 'application/pdf' ||
    (ambiguousMime && fileName.toLowerCase().endsWith('.pdf'))
  if (!looksLikePdf) return 'Please select a PDF file.'
  if (size > MAX_FILE_BYTES) {
    return `File too large (${(size / 1024 / 1024).toFixed(1)} MB). Maximum is 50 MB.`
  }
  return null
}

function validatePdfMagic(bytes) {
  return bytes.length >= 4 &&
    bytes[0] === 0x25 && bytes[1] === 0x50 &&
    bytes[2] === 0x44 && bytes[3] === 0x46
}

function assert(description, condition) {
  if (!condition) throw new Error(`FAIL: ${description}`)
  console.log(`PASS: ${description}`)
}

assert('accepts valid PDF mime + small size',
  validateFile('application/pdf', 1024) === null)
assert('rejects non-PDF mime type',
  validateFile('image/jpeg', 1024) !== null)
assert('accepts empty mime when filename ends .pdf',
  validateFile('', 1024, 'report.pdf') === null)
assert('accepts octet-stream mime when filename ends .pdf',
  validateFile('application/octet-stream', 1024, 'report.pdf') === null)
assert('extension match is case-insensitive',
  validateFile('', 1024, 'REPORT.PDF') === null)
assert('rejects empty mime when filename is not .pdf',
  validateFile('', 1024, 'report.txt') !== null)
assert('rejects octet-stream mime when filename is not .pdf',
  validateFile('application/octet-stream', 1024, 'report.exe') !== null)
assert('rejects clearly wrong mime even with .pdf filename',
  validateFile('image/jpeg', 1024, 'report.pdf') !== null)
assert('size limit still applies to ambiguous mime',
  validateFile('', 51 * 1024 * 1024, 'report.pdf') !== null)
assert('rejects file over 50 MB',
  validateFile('application/pdf', 51 * 1024 * 1024) !== null)
assert('accepts file at exactly 50 MB',
  validateFile('application/pdf', 50 * 1024 * 1024) === null)
assert('over-limit message states the real 50 MB limit',
  validateFile('application/pdf', 51 * 1024 * 1024).includes('Maximum is 50 MB'))
assert('valid %PDF magic bytes pass',
  validatePdfMagic(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])))
assert('PNG magic bytes rejected',
  !validatePdfMagic(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d])))
assert('empty buffer rejected',
  !validatePdfMagic(new Uint8Array([])))
assert('3-byte buffer rejected',
  !validatePdfMagic(new Uint8Array([0x25, 0x50, 0x44])))

console.log('\nAll tests passed.')
