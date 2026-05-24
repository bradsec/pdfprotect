import { PDFSession } from './pdf-session.js'
import { PasswordScanner } from './js/password-scanner.js'
import { loadCommonPasswords, isCommonPassword } from './js/common-password-checker.js'

const MAX_FILE_BYTES = 50 * 1024 * 1024  // 50 MB

// ── Protection type constants ────────────────────────────────
const PROT = Object.freeze({ USER: 'user', OWNER: 'owner', BOTH: 'user+owner' })

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function isMobile() {
  const mobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
  const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0
  const small = window.innerWidth <= 768 || window.innerHeight <= 768
  return mobileUA.test(navigator.userAgent) || (touch && small) || isIOS
}

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

// ── Flash banner ──────────────────────────────────────────────
const flashBanner = document.getElementById('flash-banner')
let _flashTimer = null

function showFlash(message, type = 'info', duration = 6000) {
  if (_flashTimer) { clearTimeout(_flashTimer); _flashTimer = null }
  flashBanner.className = `flash-banner-container flash-banner-${type} flash-visible`
  flashBanner.textContent = message
  _flashTimer = setTimeout(() => {
    flashBanner.classList.remove('flash-visible')
    _flashTimer = null
  }, duration)
}

let fileLoadSerial = 0

// ── State ────────────────────────────────────────────────────
const state = {
  current: 'idle',
  session: null,           // PDFSession — set when 'ready'
  pdfBytes: null,          // raw bytes — kept during 'locked'/'owner-locked' for unlock retry
  fileName: '',
  wasEncrypted: false,
  protectionType: null,    // 'user' | 'owner' | 'user+owner' — set on load, used in ready badge
  userAuthenticated: false,// true when user pw was accepted but owner pw is still needed
  securityInfo: null,
  securityHandler: null,   // libpdf StandardSecurityHandler — used for password scanning
  blobUrl: null,           // fallback download URL — revoked on reset
}

// ── DOM refs ─────────────────────────────────────────────────
const card              = document.getElementById('card')
const dropZone          = document.getElementById('drop-zone')
const browseBtn         = document.getElementById('browse-btn')
const fileInput         = document.getElementById('file-input')
const lockedFilename    = document.getElementById('locked-filename')
const lockedAlgo        = document.getElementById('locked-algo')
const unlockForm        = document.getElementById('unlock-form')
const unlockPassword    = document.getElementById('unlock-password')
const unlockBtn         = document.getElementById('unlock-btn')
const unlockError       = document.getElementById('unlock-error')
const changeFileLocked  = document.getElementById('change-file-locked-btn')
const ownerLockedFilename  = document.getElementById('owner-locked-filename')
const ownerLockedAlgo      = document.getElementById('owner-locked-algo')
const ownerLockedNote      = document.getElementById('owner-locked-note')
const ownerLockedPills     = document.getElementById('owner-locked-pills')
const ownerUnlockForm      = document.getElementById('owner-unlock-form')
const ownerUnlockPassword  = document.getElementById('owner-unlock-password')
const ownerUnlockBtn       = document.getElementById('owner-unlock-btn')
const ownerUnlockError     = document.getElementById('owner-unlock-error')
const changeFileOwnerLocked = document.getElementById('change-file-owner-locked-btn')
const readyFilename     = document.getElementById('ready-filename')
const encryptionBadge   = document.getElementById('encryption-badge')
const userPassword      = document.getElementById('user-password')
const userPasswordConfirm = document.getElementById('user-password-confirm')
const matchIndicator    = document.getElementById('match-indicator')
const ownerPassword     = document.getElementById('owner-password')
const ownerPasswordConfirm = document.getElementById('owner-password-confirm')
const ownerConfirmField = document.getElementById('owner-confirm-field')
const ownerMatchIndicator = document.getElementById('owner-match-indicator')
const userPwWarning     = document.getElementById('user-pw-warning')
const ownerPwWarning    = document.getElementById('owner-pw-warning')
const ENCRYPTION_ALGO   = 'AES-256'
const strengthBar       = document.getElementById('strength-bar')
const strengthSegments  = document.querySelectorAll('#strength-segments .segment')
const strengthHint      = document.getElementById('strength-hint')
const ownerStrengthBar  = document.getElementById('owner-strength-bar')
const ownerStrengthSegs = document.querySelectorAll('#owner-strength-segments .segment')
const ownerStrengthHint = document.getElementById('owner-strength-hint')
const permPrint         = document.getElementById('perm-print')
const permCopy          = document.getElementById('perm-copy')
const permModify        = document.getElementById('perm-modify')
const permAnnotate      = document.getElementById('perm-annotate')
const permFill          = document.getElementById('perm-fill')
const permAssemble      = document.getElementById('perm-assemble')
const protectionForm    = document.getElementById('protection-form')
const protectBtn        = document.getElementById('protect-btn')
const removeBtn         = document.getElementById('remove-btn')
const ownerPwRow        = document.getElementById('owner-pw-row')
const removeForm        = document.getElementById('remove-form')
const removeOwnerPw     = document.getElementById('remove-owner-password')
const confirmRemoveBtn  = document.getElementById('confirm-remove-btn')
const removeError       = document.getElementById('remove-error')
// ── Scan UI refs ──────────────────────────────────────────────
const scanPanel         = document.getElementById('scan-panel')
const scanLabel         = document.getElementById('scan-label')
const scanFill          = document.getElementById('scan-fill')
const scanCounter       = document.getElementById('scan-counter')
const scanCancelBtn     = document.getElementById('scan-cancel-btn')
const scanFoundBanner   = document.getElementById('scan-found-banner')
const scanFoundPw       = document.getElementById('scan-found-pw')
const scanNotFound      = document.getElementById('scan-not-found')
const scanBtn10k        = document.getElementById('scan-btn-10k')
const scanBtn100k       = document.getElementById('scan-btn-100k')

const ownerScanPanel       = document.getElementById('owner-scan-panel')
const ownerScanLabel       = document.getElementById('owner-scan-label')
const ownerScanFill        = document.getElementById('owner-scan-fill')
const ownerScanCounter     = document.getElementById('owner-scan-counter')
const ownerScanCancelBtn   = document.getElementById('owner-scan-cancel-btn')
const ownerScanFoundBanner = document.getElementById('owner-scan-found-banner')
const ownerScanFoundPw     = document.getElementById('owner-scan-found-pw')
const ownerScanNotFound    = document.getElementById('owner-scan-not-found')
const ownerScanBtn10k      = document.getElementById('owner-scan-btn-10k')
const ownerScanBtn100k     = document.getElementById('owner-scan-btn-100k')

const forgotPasswordSection       = document.getElementById('forgot-password-section')
const forgotPasswordBtn           = document.getElementById('forgot-password-btn')
const scanChoices                 = document.getElementById('scan-choices')
const scanTrigger10k              = document.getElementById('scan-trigger-10k')
const scanTrigger100k             = document.getElementById('scan-trigger-100k')
const ownerForgotPasswordSection  = document.getElementById('owner-forgot-password-section')
const ownerForgotPasswordBtn      = document.getElementById('owner-forgot-password-btn')
const ownerScanChoices            = document.getElementById('owner-scan-choices')
const ownerScanTrigger10k         = document.getElementById('owner-scan-trigger-10k')
const ownerScanTrigger100k        = document.getElementById('owner-scan-trigger-100k')
const ownerUnlockErrorText        = document.getElementById('owner-unlock-error-text')

const resetBtn          = document.getElementById('reset-btn')
const successBanner      = document.getElementById('success-banner')
const successFilename    = document.getElementById('success-filename')
const successRedownload  = document.getElementById('success-redownload')
const themeToggle       = document.getElementById('theme-toggle')

// ── Password scanner ──────────────────────────────────────────
const scanner = new PasswordScanner()

/** Which list is currently selected for each panel. */
const scanListKey = { locked: '10k', 'owner-locked': '10k' }

/** Reset scan UI for a given mode ('locked' | 'owner-locked'). */
function resetScanUI(mode) {
  const isOwner   = mode === 'owner-locked'
  const panel     = isOwner ? ownerScanPanel             : scanPanel
  const found     = isOwner ? ownerScanFoundBanner       : scanFoundBanner
  const nf        = isOwner ? ownerScanNotFound          : scanNotFound
  const fill      = isOwner ? ownerScanFill              : scanFill
  const counter   = isOwner ? ownerScanCounter           : scanCounter
  const label     = isOwner ? ownerScanLabel             : scanLabel
  const fpBtn     = isOwner ? ownerForgotPasswordBtn     : forgotPasswordBtn
  const choices   = isOwner ? ownerScanChoices           : scanChoices
  panel.hidden         = true
  found.hidden         = true
  nf.hidden            = true
  fill.style.width     = '0%'
  counter.textContent  = '0'
  label.textContent    = 'Scanning…'
  label.classList.remove('scanning')
  fpBtn.hidden         = false
  choices.hidden       = true
}

function updateScanListButtons(mode, listKey) {
  const isOwner = mode === 'owner-locked'
  const btn10k  = isOwner ? ownerScanBtn10k  : scanBtn10k
  const btn100k = isOwner ? ownerScanBtn100k : scanBtn100k
  btn10k.classList.toggle('active', listKey === '10k')
  btn100k.classList.toggle('active', listKey === '100k')
}

/**
 * Start a dictionary scan for the given mode.
 * Cancels any in-progress scan first.
 */
function startScan(mode) {
  const isOwner    = mode === 'owner-locked'
  const handler    = state.securityHandler
  if (!handler) return

  const listKey = scanListKey[mode]
  const panel   = isOwner ? ownerScanPanel       : scanPanel
  const label   = isOwner ? ownerScanLabel       : scanLabel
  const fill    = isOwner ? ownerScanFill        : scanFill
  const counter = isOwner ? ownerScanCounter     : scanCounter
  const found   = isOwner ? ownerScanFoundBanner : scanFoundBanner
  const foundPw = isOwner ? ownerScanFoundPw     : scanFoundPw
  const nf      = isOwner ? ownerScanNotFound    : scanNotFound
  const pwInput = isOwner ? ownerUnlockPassword  : unlockPassword
  const total   = listKey === '100k' ? 99840 : 10000
  const fpBtn     = isOwner ? ownerForgotPasswordBtn : forgotPasswordBtn
  const choices   = isOwner ? ownerScanChoices       : scanChoices

  // Reset UI
  found.hidden = true
  nf.hidden    = true
  fill.style.width = '0%'
  counter.textContent = `0 / ${total.toLocaleString()}`
  label.textContent = 'Scanning…'
  label.classList.add('scanning')
  panel.hidden = false

  scanner.scan({
    securityHandler: handler,
    ownerOnly: isOwner,
    listKey,

    onProgress(tried, tot) {
      const pct = (tried / tot) * 100
      fill.style.width = `${pct.toFixed(1)}%`
      counter.textContent = `${tried.toLocaleString()} / ${tot.toLocaleString()}`
    },

    onFound(pw) {
      label.textContent = 'Found!'
      label.classList.remove('scanning')
      fill.style.width = '100%'
      panel.hidden = true
      foundPw.textContent = pw
      found.hidden = false
      fpBtn.hidden = true; choices.hidden = true
      // Auto-fill the password input
      pwInput.value = pw
      pwInput.dispatchEvent(new Event('input'))
    },

    onComplete() {
      panel.hidden = true
      label.classList.remove('scanning')
      nf.hidden = false
      fpBtn.hidden = false; choices.hidden = true
    },

    onError(err) {
      console.warn('Password scan error:', err)
      panel.hidden = true
      label.classList.remove('scanning')
      fpBtn.hidden = false; choices.hidden = true
    },
  })
}

/** Wire up list-toggle buttons for a given mode. */
function bindScanListButtons(mode) {
  const isOwner = mode === 'owner-locked'
  const btn10k  = isOwner ? ownerScanBtn10k  : scanBtn10k
  const btn100k = isOwner ? ownerScanBtn100k : scanBtn100k
  const found   = isOwner ? ownerScanFoundBanner : scanFoundBanner
  const nf      = isOwner ? ownerScanNotFound    : scanNotFound

  function select(key) {
    if (scanListKey[mode] === key && scanner.isRunning) return
    scanListKey[mode] = key
    updateScanListButtons(mode, key)
    found.hidden = true
    nf.hidden    = true
    scanner.cancel()
    startScan(mode)
  }

  btn10k.addEventListener('click',  () => select('10k'))
  btn100k.addEventListener('click', () => select('100k'))
}

// ── State transitions ─────────────────────────────────────────
function transition(newState) {
  state.current = newState
  render()
}

function render() {
  card.dataset.state = state.current

  if (state.current === 'locked') {
    lockedFilename.textContent = state.fileName
    unlockError.hidden = true
    unlockPassword.value = ''
    if (state.securityInfo?.algorithm) {
      lockedAlgo.textContent = state.securityInfo.algorithm
      lockedAlgo.hidden = false
    } else {
      lockedAlgo.hidden = true
    }
  }

  if (state.current === 'owner-locked') {
    ownerLockedFilename.textContent = state.fileName
    ownerUnlockError.hidden = true
    ownerUnlockPassword.value = ''
    if (state.securityInfo?.algorithm) {
      ownerLockedAlgo.textContent = state.securityInfo.algorithm
      ownerLockedAlgo.hidden = false
    } else {
      ownerLockedAlgo.hidden = true
    }
    ownerLockedNote.textContent = state.userAuthenticated
      ? 'Open password accepted — you can view this PDF. Enter the owner password to add or change protection settings.'
      : 'This PDF is readable but has an owner password that restricts modifications. Enter the owner password to add or change protection settings.'
    // Show open+owner pills when both passwords are known; owner-only otherwise
    ownerLockedPills.innerHTML = state.userAuthenticated
      ? '<span class="protection-pill user">Open Password</span><span class="protection-pill owner">Owner Password</span>'
      : '<span class="protection-pill owner">Owner Password</span>'
  }

  if (state.current === 'ready') {
    readyFilename.textContent = state.fileName
    renderEncryptionBadge()
    removeBtn.hidden = !state.wasEncrypted
    ownerPwRow.hidden = true
    removeError.hidden = true
    successBanner.hidden = true
    successRedownload.hidden = true
  }
}

function renderEncryptionBadge() {
  if (!state.wasEncrypted) {
    encryptionBadge.innerHTML = '<div class="badge-label unprotected">Unprotected</div>'
    return
  }
  const pt = state.protectionType
  let pills = ''
  if (pt === PROT.USER || pt === PROT.BOTH) {
    pills += '<span class="protection-pill user">Open Password</span>'
  }
  if (pt === PROT.OWNER || pt === PROT.BOTH) {
    pills += '<span class="protection-pill owner">Owner Password</span>'
  }
  if (!pills) {
    pills = '<span class="protection-pill user">Password Protected</span>'
  }
  encryptionBadge.innerHTML =
    `<div class="badge-label unlocked">Unlocked</div>` +
    `<div class="protection-pills">${pills}</div>`
}

function resetToIdle() {
  scanner.cancel()
  fileLoadSerial++
  state.session = null
  state.pdfBytes = null
  state.fileName = ''
  state.wasEncrypted = false
  state.protectionType = null
  state.userAuthenticated = false
  state.securityInfo = null
  state.securityHandler = null
  // Reset scan list selections back to default
  scanListKey['locked'] = '10k'
  scanListKey['owner-locked'] = '10k'
  updateScanListButtons('locked', '10k')
  updateScanListButtons('owner-locked', '10k')
  if (state.blobUrl) { URL.revokeObjectURL(state.blobUrl); state.blobUrl = null }
  fileInput.value = ''
  ownerUnlockPassword.value = ''
  userPassword.value = ''
  userPasswordConfirm.value = ''
  ownerPassword.value = ''
  ownerPasswordConfirm.value = ''
  strengthBar.hidden = true
  ownerStrengthBar.hidden = true
  ownerConfirmField.hidden = true
  matchIndicator.hidden = true
  ownerMatchIndicator.hidden = true
  userPwWarning.hidden = true
  ownerPwWarning.hidden = true
  transition('idle')
}

// ── Scan event wiring ─────────────────────────────────────────
bindScanListButtons('locked')
bindScanListButtons('owner-locked')

scanCancelBtn.addEventListener('click', () => {
  scanner.cancel()
  scanPanel.hidden = true
  scanLabel.classList.remove('scanning')
  forgotPasswordBtn.hidden = false
  scanChoices.hidden = true
})

ownerScanCancelBtn.addEventListener('click', () => {
  scanner.cancel()
  ownerScanPanel.hidden = true
  ownerScanLabel.classList.remove('scanning')
  ownerForgotPasswordBtn.hidden = false
  ownerScanChoices.hidden = true
})

// ── Init ─────────────────────────────────────────────────────
render()

// ── File I/O ──────────────────────────────────────────────────
function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsArrayBuffer(file)
  })
}

async function saveBytes(bytes, filename) {
  const blob = new Blob([bytes], { type: 'application/pdf' })
  const size = formatFileSize(blob.size)

  if ('showSaveFilePicker' in window) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: 'PDF files', accept: { 'application/pdf': ['.pdf'] } }],
      })
      const writable = await handle.createWritable()
      await writable.write(blob)
      await writable.close()
      return { filename: handle.name, size, usedPicker: true }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.warn('showSaveFilePicker failed, falling back to download:', err)
      }
      // AbortError or API failure — fall through to traditional download
    }
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  return { filename, size, usedPicker: false, blobUrl: url }
}

function showSaveResult(result) {
  if (state.blobUrl) { URL.revokeObjectURL(state.blobUrl); state.blobUrl = null }

  successFilename.textContent = `${result.filename} (${result.size})`

  if (result.usedPicker) {
    successRedownload.hidden = true
    showFlash(`Saved "${result.filename}" (${result.size})`, 'success')
  } else {
    state.blobUrl = result.blobUrl
    successRedownload.href = result.blobUrl
    successRedownload.download = result.filename
    successRedownload.textContent = isMobile() ? 'Tap to save again' : 'Download again'
    successRedownload.hidden = false
    const msg = isMobile()
      ? `PDF ready — tap the link to save "${result.filename}" (${result.size})`
      : `"${result.filename}" (${result.size}) — check your downloads`
    showFlash(msg, 'success')
  }

  successBanner.hidden = false
}

function handleFileSelected(file) {
  const error = validateFile(file?.type ?? '', file?.size ?? 0)
  if (error) { alert(error); return }

  const serial = ++fileLoadSerial

  readFileAsArrayBuffer(file).then(buffer => {
    if (serial !== fileLoadSerial) return
    const bytes = new Uint8Array(buffer)
    if (!validatePdfMagic(bytes)) {
      alert('Invalid file — content does not appear to be a PDF.')
      return
    }
    state.fileName = file.name
    loadPDF(bytes)
  }).catch(err => {
    if (serial !== fileLoadSerial) return
    alert(`Failed to read file: ${err.message}`)
    resetToIdle()
  })
}

// ── Upload event listeners ────────────────────────────────────
browseBtn.addEventListener('click', e => {
  e.stopPropagation()
  fileInput.click()
})
dropZone.addEventListener('click', e => {
  if (e.target !== browseBtn && !browseBtn.contains(e.target)) fileInput.click()
})
fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) handleFileSelected(fileInput.files[0])
})

let dragDepth = 0

dropZone.addEventListener('dragenter', e => {
  e.preventDefault()
  dragDepth++
  dropZone.classList.add('drag-over')
})
dropZone.addEventListener('dragover', e => {
  e.preventDefault()
})
dropZone.addEventListener('dragleave', () => {
  dragDepth--
  if (dragDepth === 0) dropZone.classList.remove('drag-over')
})
dropZone.addEventListener('drop', e => {
  e.preventDefault()
  dragDepth = 0
  dropZone.classList.remove('drag-over')
  const file = e.dataTransfer?.files?.[0]
  if (file) handleFileSelected(file)
})

resetBtn.addEventListener('click', resetToIdle)
changeFileLocked.addEventListener('click', resetToIdle)

/**
 * Prepare shared state fields when transitioning to locked/owner-locked.
 * Called by both loadPDF and attemptUnlock to guarantee symmetry.
 */
function prepareLockedState(bytes, session, protType, userAuthed) {
  state.pdfBytes          = bytes
  state.session           = null
  state.wasEncrypted      = true
  state.protectionType    = protType
  state.userAuthenticated = userAuthed
  state.securityInfo      = session.getSecurity()
  state.securityHandler   = session.getSecurityHandler()
}

async function loadPDF(bytes) {
  try {
    const session = await PDFSession.load(bytes)

    if (session.isEncrypted && !session.isAuthenticated) {
      prepareLockedState(bytes, session, PROT.USER, false)
      resetScanUI('locked')
      transition('locked')
      return
    }

    // Encrypted but authenticated only via empty user password — owner pw still needed.
    if (session.isEncrypted && session.isAuthenticated && !session.hasOwnerAccess()) {
      prepareLockedState(bytes, session, PROT.OWNER, false)
      resetScanUI('owner-locked')
      transition('owner-locked')
      return
    }

    state.session        = session
    state.pdfBytes       = null
    state.securityHandler = null
    state.wasEncrypted   = session.isEncrypted
    if (session.isEncrypted) state.protectionType ??= PROT.USER
    transition('ready')
  } catch (err) {
    alert(`Failed to load PDF: ${err.message}`)
    resetToIdle()
  }
}

// ── Unlock ────────────────────────────────────────────────────
async function attemptUnlock(password) {
  unlockBtn.disabled = true
  unlockBtn.textContent = 'Unlocking…'
  unlockError.hidden = true

  try {
    const session = await PDFSession.loadWithCredentials(state.pdfBytes, password)
    if (!session.hasOwnerAccess()) {
      // User password accepted but owner password also exists.
      prepareLockedState(state.pdfBytes, session, PROT.BOTH, true)
      resetScanUI('owner-locked')
      transition('owner-locked')
    } else {
      state.session = session
      state.pdfBytes = null
      state.wasEncrypted = true
      transition('ready')
    }
  } catch {
    unlockError.hidden = false
    unlockPassword.focus()
  } finally {
    unlockBtn.disabled = false
    unlockBtn.textContent = 'Unlock'
  }
}

unlockForm.addEventListener('submit', e => {
  e.preventDefault()
  const pw = unlockPassword.value.trim()
  if (!pw) { unlockPassword.focus(); return }
  attemptUnlock(pw)
})

// ── Owner unlock ──────────────────────────────────────────
let ownerUnlockInFlight = false

async function attemptOwnerUnlock(password) {
  if (ownerUnlockInFlight) return
  ownerUnlockInFlight = true
  ownerUnlockBtn.disabled = true
  ownerUnlockBtn.textContent = 'Unlocking…'
  ownerUnlockError.hidden = true

  try {
    const session = await PDFSession.loadWithCredentials(state.pdfBytes, password)
    if (!session.hasOwnerAccess()) {
      ownerUnlockErrorText.textContent = 'Incorrect owner password — try again'
      ownerUnlockError.hidden = false
      ownerUnlockPassword.focus()
      return
    }
    state.session = session
    state.pdfBytes = null
    state.wasEncrypted = true
    transition('ready')
  } catch (err) {
    const isAuthErr = /password|decrypt|crypt/i.test(err?.message ?? '')
    ownerUnlockErrorText.textContent = isAuthErr
      ? 'Incorrect owner password — try again'
      : 'Could not read file — it may be corrupted'
    ownerUnlockError.hidden = false
    ownerUnlockPassword.focus()
  } finally {
    ownerUnlockInFlight = false
    ownerUnlockBtn.disabled = false
    ownerUnlockBtn.textContent = 'Unlock'
  }
}

ownerUnlockForm.addEventListener('submit', e => {
  e.preventDefault()
  const pw = ownerUnlockPassword.value.trim()
  if (!pw) { ownerUnlockPassword.focus(); return }
  attemptOwnerUnlock(pw)
})

changeFileOwnerLocked.addEventListener('click', resetToIdle)

// ── Forgot password wiring ────────────────────────────────────
function triggerForgotPasswordScan(mode, listKey) {
  const isOwner   = mode === 'owner-locked'
  const choices   = isOwner ? ownerScanChoices           : scanChoices
  const fpSection = isOwner ? ownerForgotPasswordSection : forgotPasswordSection
  choices.hidden   = true
  fpSection.hidden = true
  scanListKey[mode] = listKey
  updateScanListButtons(mode, listKey)
  startScan(mode)
}

forgotPasswordBtn.addEventListener('click', () => {
  forgotPasswordBtn.hidden = true
  scanChoices.hidden = false
})

scanTrigger10k.addEventListener('click',  () => triggerForgotPasswordScan('locked', '10k'))
scanTrigger100k.addEventListener('click', () => triggerForgotPasswordScan('locked', '100k'))

ownerForgotPasswordBtn.addEventListener('click', () => {
  ownerForgotPasswordBtn.hidden = true
  ownerScanChoices.hidden = false
})

ownerScanTrigger10k.addEventListener('click',  () => triggerForgotPasswordScan('owner-locked', '10k'))
ownerScanTrigger100k.addEventListener('click', () => triggerForgotPasswordScan('owner-locked', '100k'))

// ── Common password warning ───────────────────────────────────
let _commonPwLoading = false

/**
 * Trigger a lazy load of the common-password list (first call only),
 * then show/hide the warning element based on whether the password matches.
 * @param {string}      password
 * @param {HTMLElement} warningEl
 */
function updateCommonPwWarning(password, warningEl) {
  // Kick off background fetch on first use — subsequent calls hit the cache
  if (!_commonPwLoading) {
    _commonPwLoading = true
    loadCommonPasswords().then(() => {
      // Re-evaluate both fields once the list arrives in case the user
      // already has text in them when the fetch completes
      updateCommonPwWarning(userPassword.value,  userPwWarning)
      updateCommonPwWarning(ownerPassword.value, ownerPwWarning)
    })
  }

  if (!password || !isCommonPassword(password)) {
    warningEl.hidden = true
    return
  }
  warningEl.textContent = '⚠ Commonly known password — consider choosing something more unique'
  warningEl.hidden = false
}

// ── Password strength ─────────────────────────────────────────
function passwordStrength(password) {
  if (!password) return { score: 0, label: '', hint: '' }

  let charset = 0
  if (/[a-z]/.test(password)) charset += 26
  if (/[A-Z]/.test(password)) charset += 26
  if (/[0-9]/.test(password))  charset += 10
  if (/[^a-zA-Z0-9]/.test(password)) charset += 32

  const entropy = password.length * Math.log2(charset || 1)

  if (entropy < 40) return { score: 1, label: 'Weak',
    hint: 'Use 8+ characters with mixed case and numbers' }
  if (entropy < 60) return { score: 2, label: 'Fair',
    hint: 'Add symbols or increase length' }
  if (entropy < 72) return { score: 3, label: 'Strong',
    hint: 'Consider adding symbols for maximum strength' }
  return { score: 4, label: 'Very strong', hint: 'Excellent password' }
}

const STRENGTH_COLOURS = ['', 'score-1', 'score-2', 'score-3', 'score-4']

function applyStrength(password, bar, segments, hint) {
  if (!password) {
    bar.hidden = true
    return
  }
  const { score, label, hint: hintText } = passwordStrength(password)
  bar.hidden = false
  hint.textContent = `${label}${hintText ? ' — ' + hintText : ''}`
  segments.forEach((seg, i) => {
    seg.className = 'segment'
    if (i < score) seg.classList.add(STRENGTH_COLOURS[score])
  })
}

userPassword.addEventListener('input', () => {
  applyStrength(userPassword.value, strengthBar, strengthSegments, strengthHint)
  updateMatchIndicator(userPassword, userPasswordConfirm, matchIndicator)
  updateCommonPwWarning(userPassword.value, userPwWarning)
})

// ── Owner password confirm visibility ────────────────────────
ownerPassword.addEventListener('input', () => {
  applyStrength(ownerPassword.value, ownerStrengthBar, ownerStrengthSegs, ownerStrengthHint)
  const hasValue = ownerPassword.value.length > 0
  ownerConfirmField.hidden = !hasValue
  if (!hasValue) {
    ownerPasswordConfirm.value = ''
    ownerMatchIndicator.hidden = true
  }
  updateMatchIndicator(ownerPassword, ownerPasswordConfirm, ownerMatchIndicator)
  updateCommonPwWarning(ownerPassword.value, ownerPwWarning)
})

// ── Password match indicators ─────────────────────────────────
function updateMatchIndicator(pwField, confirmField, indicator) {
  const pw      = pwField.value
  const confirm = confirmField.value
  if (!confirm || !pw) {
    indicator.hidden = true
    return
  }
  indicator.hidden = false
  if (pw === confirm) {
    indicator.textContent = '✓ Passwords match'
    indicator.className = 'match-indicator match-ok'
  } else {
    indicator.textContent = '✗ Passwords do not match'
    indicator.className = 'match-indicator match-fail'
  }
}

userPasswordConfirm.addEventListener('input', () =>
  updateMatchIndicator(userPassword, userPasswordConfirm, matchIndicator))

ownerPasswordConfirm.addEventListener('input', () =>
  updateMatchIndicator(ownerPassword, ownerPasswordConfirm, ownerMatchIndicator))

// ── Protect ───────────────────────────────────────────────────
function getPermissions() {
  return {
    print:     permPrint.checked,
    copy:      permCopy.checked,
    modify:    permModify.checked,
    annotate:  permAnnotate.checked,
    fillForms: permFill.checked,
    assemble:  permAssemble.checked,
  }
}

function outputFilename(original, suffix) {
  const base = original.replace(/\.pdf$/i, '')
  return `${base}-${suffix}.pdf`
}

async function applyProtection() {
  const userPw  = userPassword.value
  const confirmPw = userPasswordConfirm.value
  const ownerPw = ownerPassword.value.trim()
  const ownerConfirmPw = ownerPasswordConfirm.value
  const algo    = ENCRYPTION_ALGO
  const hasUserPw = userPw.trim().length > 0
  const hasOwnerPw = ownerPw.length > 0

  function flashError(field) {
    field.classList.add('input-error')
    setTimeout(() => field.classList.remove('input-error'), 1500)
  }

  if (!hasUserPw && !hasOwnerPw) {
    flashError(userPassword)
    userPassword.focus()
    return
  }

  if (!hasUserPw && confirmPw) {
    matchIndicator.hidden = false
    matchIndicator.textContent = '✗ Enter the user password above first'
    matchIndicator.className = 'match-indicator match-fail'
    userPassword.focus()
    return
  }

  if (hasUserPw && userPw !== confirmPw) {
    flashError(userPasswordConfirm)
    matchIndicator.hidden = false
    matchIndicator.textContent = '✗ Passwords do not match'
    matchIndicator.className = 'match-indicator match-fail'
    userPasswordConfirm.focus()
    return
  }

  if (!ownerPw && ownerConfirmPw) {
    flashError(ownerPassword)
    ownerMatchIndicator.hidden = false
    ownerMatchIndicator.textContent = '✗ Enter the owner password above first'
    ownerMatchIndicator.className = 'match-indicator match-fail'
    ownerPassword.focus()
    return
  }

  if (ownerPw && ownerPw !== ownerConfirmPw) {
    flashError(ownerPasswordConfirm)
    ownerMatchIndicator.hidden = false
    ownerMatchIndicator.textContent = '✗ Passwords do not match'
    ownerMatchIndicator.className = 'match-indicator match-fail'
    ownerPasswordConfirm.focus()
    return
  }

  const originalHTML = protectBtn.innerHTML
  protectBtn.disabled = true
  protectBtn.textContent = 'Processing…'
  successBanner.hidden = true

  try {
    const bytes = await state.session.protect({
      userPassword: hasUserPw ? userPw : undefined,
      ownerPassword: hasOwnerPw ? ownerPw : undefined,
      algorithm: algo,
      permissions: getPermissions(),
    })
    const filename = outputFilename(state.fileName, 'protected')
    const result = await saveBytes(bytes, filename)
    userPassword.value = ''
    userPasswordConfirm.value = ''
    ownerPassword.value = ''
    ownerPasswordConfirm.value = ''
    strengthBar.hidden = true
    ownerStrengthBar.hidden = true
    ownerConfirmField.hidden = true
    matchIndicator.hidden = true
    ownerMatchIndicator.hidden = true
    showSaveResult(result)
  } catch (err) {
    showFlash(`Failed to protect PDF: ${err.message}`, 'danger')
  } finally {
    protectBtn.disabled = false
    protectBtn.innerHTML = originalHTML
  }
}

protectionForm.addEventListener('submit', e => {
  e.preventDefault()
  if (protectBtn.disabled) return
  applyProtection()
})

// ── Remove protection ─────────────────────────────────────────
removeBtn.addEventListener('click', () => {
  ownerPwRow.hidden = !ownerPwRow.hidden
  if (!ownerPwRow.hidden) removeOwnerPw.focus()
})

async function doRemoveProtection(ownerPw) {
  const originalText = confirmRemoveBtn.textContent
  confirmRemoveBtn.disabled = true
  confirmRemoveBtn.textContent = 'Removing…'
  removeError.hidden = true

  try {
    const bytes = await state.session.removeProtection(ownerPw || null)
    const filename = outputFilename(state.fileName, 'unlocked')
    const result = await saveBytes(bytes, filename)
    showSaveResult(result)
    ownerPwRow.hidden = true
  } catch (err) {
    const isAuthError =
      err.message === 'Incorrect owner password' ||
      err.message === 'Owner password required to remove protection'
    if (isAuthError) {
      removeError.hidden = false
      removeOwnerPw.focus()
    } else {
      showFlash(`Failed to remove protection: ${err.message}`, 'danger')
    }
  } finally {
    confirmRemoveBtn.disabled = false
    confirmRemoveBtn.textContent = originalText
  }
}

removeForm.addEventListener('submit', e => {
  e.preventDefault()
  if (confirmRemoveBtn.disabled) return
  doRemoveProtection(removeOwnerPw.value)
})

// ── Theme ─────────────────────────────────────────────────────
function applyTheme(theme) {
  if (theme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark')
  } else {
    document.documentElement.removeAttribute('data-theme')
  }
}

function initTheme() {
  const stored = localStorage.getItem('theme')
  if (stored === 'dark' || stored === 'light') {
    applyTheme(stored)
    return
  }
  if (stored !== null) localStorage.removeItem('theme')
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  applyTheme(prefersDark ? 'dark' : 'light')
}

function toggleTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
  const next   = isDark ? 'light' : 'dark'
  applyTheme(next)
  localStorage.setItem('theme', next)
}

themeToggle.addEventListener('click', toggleTheme)

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
  if (!localStorage.getItem('theme')) {
    applyTheme(e.matches ? 'dark' : 'light')
  }
})

initTheme()
