import test from 'node:test'
import assert from 'node:assert/strict'
import { importApp } from './import-app.mjs'

test('stale unlock results and errors cannot change a reset panel', async () => {
  const elements = new Map()
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      id, hidden: false, disabled: false, value: '', textContent: '', innerHTML: '',
      style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {} },
      listeners: {}, addEventListener(type, callback) { this.listeners[type] = callback },
      setAttribute() {}, removeAttribute() {}, querySelector: element, focus() { globalThis.document.activeElement = this },
    })
    return elements.get(id)
  }
  globalThis.document = {
    activeElement: null, documentElement: element('html'),
    getElementById: element, querySelectorAll: () => [], addEventListener() {},
  }
  globalThis.window = { matchMedia: () => ({ matches: false, addEventListener() {} }) }
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent: '', maxTouchPoints: 0 } })
  globalThis.localStorage = { getItem: () => null, removeItem() {} }
  const { PDFSession } = await importApp('pdf-session.js')
  await importApp('app.js')
  assert.equal(globalThis.document.activeElement, null, 'initial render keeps focus')

  const original = PDFSession.loadWithCredentials
  const originalLoad = PDFSession.load
  try {
    for (const [form, input] of [['unlock-form', 'unlock-password'], ['owner-unlock-form', 'owner-unlock-password']]) {
      let resolve, reject
      PDFSession.loadWithCredentials = () => new Promise((yes, no) => { resolve = yes; reject = no })
      element(input).value = 'secret'
      element(form).listeners.submit({ preventDefault() {} })
      element('reset-btn').listeners.click()
      resolve({ hasOwnerAccess: () => true })
      await new Promise(setImmediate)
      assert.equal(element('card').dataset.state, 'idle', `${form} resolved after reset`)

      element(input).value = 'secret'
      element(form).listeners.submit({ preventDefault() {} })
      element('reset-btn').listeners.click()
      reject(new Error('bad password'))
      await new Promise(setImmediate)
      assert.equal(element('card').dataset.state, 'idle', `${form} rejected after reset`)
      assert.equal(element(form === 'unlock-form' ? 'unlock-error' : 'owner-unlock-error').hidden, true)
    }

    globalThis.FileReader = class {
      readAsArrayBuffer() { this.result = Uint8Array.of(37, 80, 68, 70).buffer; this.onload() }
    }
    PDFSession.load = async () => ({ isEncrypted: true, isAuthenticated: false,
      getSecurity: () => ({}), getSecurityHandler: () => ({}) })
    element('file-input').files = [{ type: 'application/pdf', size: 4, name: 'locked.pdf' }]
    element('file-input').listeners.change()
    await new Promise(setImmediate)
    assert.equal(globalThis.document.activeElement, element('unlock-password'))

    PDFSession.loadWithCredentials = async () => ({ hasOwnerAccess: () => true })
    element('unlock-password').value = 'secret'
    element('unlock-form').listeners.submit({ preventDefault() {} })
    await new Promise(setImmediate)
    assert.equal(globalThis.document.activeElement, element('user-password'))
    element('reset-btn').listeners.click()
    assert.equal(globalThis.document.activeElement, element('browse-btn'))
  } finally {
    PDFSession.loadWithCredentials = original
    PDFSession.load = originalLoad
  }
})
