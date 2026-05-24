// Run: node tests/file-validator.test.mjs

const MAX_FILE_BYTES = 100 * 1024 * 1024

function validateFile(mimeType, size) {
  if (mimeType !== 'application/pdf') return 'Please select a PDF file.'
  if (size > MAX_FILE_BYTES) {
    return `File too large (${(size / 1024 / 1024).toFixed(1)} MB). Maximum is 100 MB.`
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
assert('rejects file over 100 MB',
  validateFile('application/pdf', 101 * 1024 * 1024) !== null)
assert('accepts file at exactly 100 MB',
  validateFile('application/pdf', 100 * 1024 * 1024) === null)
assert('valid %PDF magic bytes pass',
  validatePdfMagic(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])))
assert('PNG magic bytes rejected',
  !validatePdfMagic(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d])))
assert('empty buffer rejected',
  !validatePdfMagic(new Uint8Array([])))
assert('3-byte buffer rejected',
  !validatePdfMagic(new Uint8Array([0x25, 0x50, 0x44])))

console.log('\nAll tests passed.')
