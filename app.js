import { PDFSession } from './pdf-session.js'

const MAX_FILE_BYTES = 50 * 1024 * 1024  // 50 MB

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
  session: null,      // PDFSession — set when 'ready'
  pdfBytes: null,     // raw bytes — kept only during 'locked' state for unlock retry
  fileName: '',
  wasEncrypted: false,
  securityInfo: null,
  blobUrl: null,      // fallback download URL — revoked on reset
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
const readyFilename     = document.getElementById('ready-filename')
const encryptionBadge   = document.getElementById('encryption-badge')
const userPassword      = document.getElementById('user-password')
const userPasswordConfirm = document.getElementById('user-password-confirm')
const matchIndicator    = document.getElementById('match-indicator')
const ownerPassword     = document.getElementById('owner-password')
const ownerPasswordConfirm = document.getElementById('owner-password-confirm')
const ownerConfirmField = document.getElementById('owner-confirm-field')
const ownerMatchIndicator = document.getElementById('owner-match-indicator')
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
const resetBtn          = document.getElementById('reset-btn')
const successBanner      = document.getElementById('success-banner')
const successFilename    = document.getElementById('success-filename')
const successRedownload  = document.getElementById('success-redownload')
const themeToggle       = document.getElementById('theme-toggle')

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
  if (state.wasEncrypted) {
    encryptionBadge.innerHTML =
      '<div class="badge-label unlocked">Unlocked</div>'
  } else {
    encryptionBadge.innerHTML =
      '<div class="badge-label unprotected">Unprotected</div>'
  }
}

function resetToIdle() {
  fileLoadSerial++
  state.session = null
  state.pdfBytes = null
  state.fileName = ''
  state.wasEncrypted = false
  state.securityInfo = null
  if (state.blobUrl) { URL.revokeObjectURL(state.blobUrl); state.blobUrl = null }
  fileInput.value = ''
  userPassword.value = ''
  userPasswordConfirm.value = ''
  ownerPassword.value = ''
  ownerPasswordConfirm.value = ''
  strengthBar.hidden = true
  ownerStrengthBar.hidden = true
  ownerConfirmField.hidden = true
  matchIndicator.hidden = true
  ownerMatchIndicator.hidden = true
  transition('idle')
}

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

async function loadPDF(bytes) {
  try {
    const session = await PDFSession.load(bytes)

    if (session.isEncrypted && !session.isAuthenticated) {
      state.pdfBytes = bytes
      state.session = null
      state.wasEncrypted = true
      state.securityInfo = session.getSecurity()
      transition('locked')
      return
    }

    state.session = session
    state.pdfBytes = null
    state.wasEncrypted = session.isEncrypted
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
    state.session = session
    state.pdfBytes = null
    state.wasEncrypted = true
    transition('ready')
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
