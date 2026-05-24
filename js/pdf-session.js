import { PDF } from './vendor/libpdf-core.js'

const textEncoder = new TextEncoder()

function restoreMetadata(pdf, meta) {
  const clean = Object.fromEntries(Object.entries(meta).filter(([, v]) => v != null))
  if (Object.keys(clean).length > 0) pdf.setMetadata(clean)
}

async function loadWithOwnerCredentials(bytes, password) {
  const pdf = await PDF.load(bytes)
  const handler = pdf?.ctx?.info?.securityHandler

  // libpdf authenticates as user before owner when both passwords are the
  // same string, so force an owner-only check for the remove-protection flow.
  if (handler?.tryOwnerPassword) {
    const result = handler.tryOwnerPassword(textEncoder.encode(password))
    if (result?.authenticated && result?.isOwner) return pdf
  }

  const auth = pdf.authenticate(password)
  if (!auth.authenticated) throw new Error('Incorrect owner password')
  throw new Error('Owner password required to remove protection')
}

async function loadPreferringOwnerCredentials(bytes, password) {
  const pdf = await PDF.load(bytes)
  const handler = pdf?.ctx?.info?.securityHandler

  // Prefer owner auth when the same string is valid for both roles so users
  // retain full control over files protected with a shared password.
  if (handler?.tryOwnerPassword) {
    const result = handler.tryOwnerPassword(textEncoder.encode(password))
    if (result?.authenticated && result?.isOwner) return pdf
  }

  const authenticatedPdf = await PDF.load(bytes, { credentials: password })
  if (!authenticatedPdf.isAuthenticated) throw new Error('Incorrect password')
  return authenticatedPdf
}

export class PDFSession {
  #bytes       // Uint8Array — original file bytes, never exposed or mutated
  #pdf         // authenticated PDF instance
  #credentials // trimmed password used to open (null for unprotected)

  constructor(bytes, pdf, credentials = null) {
    this.#bytes = bytes
    this.#pdf = pdf
    this.#credentials = credentials
  }

  static async load(bytes) {
    const pdf = await PDF.load(bytes)
    return new PDFSession(bytes, pdf, null)
  }

  static async loadWithCredentials(bytes, password) {
    if (!password) throw new Error('Password is required')
    const trimmed = password.trim()
    const pdf = await loadPreferringOwnerCredentials(bytes, trimmed)
    return new PDFSession(bytes, pdf, trimmed)
  }

  get isEncrypted() { return this.#pdf.isEncrypted }
  get isAuthenticated() { return this.#pdf.isAuthenticated }
  hasOwnerAccess() { return this.#pdf.hasOwnerAccess() }
  getSecurity() { return this.#pdf.getSecurity() }
  getSecurityHandler() { return this.#pdf?.ctx?.info?.securityHandler ?? null }

  // Always reloads from original bytes so setProtection is called on a
  // fresh, unmodified instance — eliminates the double-protect mutation bug.
  async protect(options) {
    const userPassword = options?.userPassword?.trim?.() ?? ''
    const ownerPassword = options?.ownerPassword?.trim?.() ?? ''
    const effectiveOwnerPassword = ownerPassword || userPassword
    if (!userPassword && !ownerPassword) {
      throw new Error('A user or owner password is required for protection')
    }
    const pdf = this.#credentials
      ? await loadPreferringOwnerCredentials(this.#bytes, this.#credentials)
      : await PDF.load(this.#bytes)
    pdf.setProtection({
      ...options,
      userPassword: userPassword || undefined,
      ownerPassword: effectiveOwnerPassword || undefined,
    })
    return pdf.save()
  }

  async removeProtection(ownerPassword = null) {
    if (!this.isEncrypted) throw new Error('Document is not protected')
    if (ownerPassword) {
      const trimmed = ownerPassword.trim()
      const pdf = await loadWithOwnerCredentials(this.#bytes, trimmed)
      const meta = pdf.getMetadata()
      pdf.removeProtection()
      restoreMetadata(pdf, meta)
      return pdf.save()
    }

    // No owner password supplied — only allowed if the session was opened
    // with owner-level credentials. Rejects user-only auth (bug fix #1).
    if (!this.hasOwnerAccess()) {
      throw new Error('Owner password required to remove protection')
    }

    const pdf = this.#credentials
      ? await PDF.load(this.#bytes, { credentials: this.#credentials })
      : await PDF.load(this.#bytes)
    const meta = pdf.getMetadata()
    pdf.removeProtection()
    restoreMetadata(pdf, meta)
    return pdf.save()
  }
}
