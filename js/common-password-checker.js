/**
 * common-password-checker.js — lazy-loads the 10 k common-passwords list
 * and provides a synchronous O(1) membership test via a Set.
 *
 * The list is fetched at most once and cached.  All comparisons are
 * case-insensitive (list entries are already lowercase).
 */

const LIST_URL = './passwords/10k-most-common.txt'

/** @type {Set<string> | null} */
let _set = null

/** @type {Promise<Set<string>> | null} */
let _loadPromise = null

/**
 * Fetch and cache the common-password list.
 * Safe to call multiple times — returns the same Promise after the first call.
 * @returns {Promise<Set<string>>}
 */
export function loadCommonPasswords() {
  if (_set) return Promise.resolve(_set)
  if (_loadPromise) return _loadPromise
  _loadPromise = fetch(LIST_URL)
    .then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.text()
    })
    .then(text => {
      _set = new Set(
        text.split('\n').map(l => l.trim().toLowerCase()).filter(Boolean)
      )
      return _set
    })
    .catch(err => {
      _loadPromise = null  // allow retry next time
      console.warn('common-password-checker: failed to load list', err)
      return new Set()    // degrade gracefully — no checks performed
    })
  return _loadPromise
}

/**
 * Synchronous O(1) check.  Returns false if the list hasn't loaded yet
 * (non-blocking — the caller should have called loadCommonPasswords() earlier).
 * @param {string} password
 * @returns {boolean}
 */
export function isCommonPassword(password) {
  if (!_set || !password) return false
  return _set.has(password.toLowerCase())
}
