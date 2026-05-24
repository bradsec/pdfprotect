/**
 * password-scanner.js — dictionary attack against a PDF security handler.
 *
 * Iterates a local word list calling the synchronous
 * securityHandler.authenticateWithString() (or tryOwnerPassword() for
 * owner-only scans) and yields control to the browser every CHUNK
 * iterations so the UI stays responsive and cancellation is instant.
 *
 * Uses a generation counter (#gen) so that when a new scan supersedes an
 * old one, any pending callbacks from the old scan's last yield are silently
 * dropped — preventing the "jumping counter" race condition.
 */

const CHUNK = 150  // passwords per event-loop tick

const LISTS = {
  '10k':  './passwords/10k-most-common.txt',
  '100k': './passwords/100k-most-used.txt',
}

export class PasswordScanner {
  /** @type {Record<string,string[]>} cached word lists keyed by list name */
  #cache = {}
  #gen = 0     // incremented on every new scan; old scans bail when they see a mismatch
  #running = false

  /** Pre-fetch and cache a word list. */
  async loadList(listKey) {
    if (this.#cache[listKey]) return this.#cache[listKey]
    const url = LISTS[listKey]
    if (!url) throw new Error(`Unknown list key: ${listKey}`)
    const resp = await fetch(url)
    if (!resp.ok) throw new Error(`Failed to load password list (${resp.status})`)
    const text = await resp.text()
    const words = text.split('\n').map(l => l.trim()).filter(Boolean)
    this.#cache[listKey] = words
    return words
  }

  get isRunning() { return this.#running }

  /** Stop any running scan immediately. */
  cancel() { this.#gen++; this.#running = false }

  /**
   * Run a dictionary scan.
   *
   * @param {object}   opts
   * @param {object}   opts.securityHandler  libpdf StandardSecurityHandler instance
   * @param {boolean}  opts.ownerOnly        true → only try tryOwnerPassword()
   * @param {string}   opts.listKey          '10k' | '100k'
   * @param {function} opts.onProgress       (tried, total) => void
   * @param {function} opts.onFound          (password, result) => void
   * @param {function} opts.onComplete       () => void  — called when list exhausted, not found
   * @param {function} opts.onError          (err) => void
   */
  async scan({ securityHandler, ownerOnly = false, listKey = '10k',
               onProgress, onFound, onComplete, onError } = {}) {
    // Increment generation — any scan that was running will bail at its next
    // yield point because its captured `gen` no longer matches `#gen`.
    const gen = ++this.#gen

    // One tick gap lets a superseded scan's final yield-resume detect the new
    // generation and exit before we start touching shared DOM state.
    await new Promise(r => setTimeout(r, 0))
    if (gen !== this.#gen) return  // another scan already started

    this.#running = true
    try {
      const passwords = await this.loadList(listKey)
      if (gen !== this.#gen) { this.#running = false; return }  // cancelled while fetching list

      const total = passwords.length
      const enc = new TextEncoder()

      for (let i = 0; i < total; i++) {
        if (gen !== this.#gen) return  // superseded

        const pw = passwords[i]
        let result

        try {
          if (ownerOnly) {
            result = securityHandler.tryOwnerPassword(enc.encode(pw))
          } else {
            result = securityHandler.authenticateWithString(pw)
          }
        } catch {
          // malformed password or handler error — skip
          continue
        }

        if (result?.authenticated) {
          if (gen !== this.#gen) { this.#running = false; return }
          this.#running = false
          onFound?.(pw, result)
          return
        }

        // Yield to the browser every CHUNK iterations
        if ((i + 1) % CHUNK === 0 || i === total - 1) {
          onProgress?.(i + 1, total)
          await new Promise(r => setTimeout(r, 0))
          // Critical: check generation AFTER resuming from yield.
          // This is the window where a new scan may have started.
          if (gen !== this.#gen) return
        }
      }
    } catch (err) {
      this.#running = false
      if (gen !== this.#gen) return
      onError?.(err)
      return
    }

    this.#running = false
    if (gen === this.#gen) onComplete?.()
  }
}
