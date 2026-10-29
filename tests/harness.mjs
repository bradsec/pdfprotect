// Minimal DOM stub modeled on tests/unlock-race.test.mjs. Each node --test file
// runs in its own process, so app.js module state is fresh per file.
import { importApp } from './import-app.mjs'
export const importRepo = importApp

function makeNode() {
  const n = { style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {} }, children: [],
    setAttribute() {}, setAttributeNS() {}, removeAttribute() {}, addEventListener() {}, removeEventListener() {},
    append(...c) { this.children.push(...c) }, appendChild(c) { this.children.push(c); return c },
    prepend() {}, remove() {}, click() {}, querySelector: () => null, closest: () => null,
    getBoundingClientRect: () => ({ height: 0 }), animate: () => ({ finished: Promise.resolve(), cancel() {} }) }
  return n
}

export function installDom() {
  const elements = new Map()
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      id, hidden: false, disabled: false, checked: false, value: '', textContent: '', innerHTML: '',
      style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false } },
      listeners: {}, addEventListener(type, cb) { this.listeners[type] = cb },
      dispatchEvent(ev) { this.listeners[ev.type]?.(ev) },
      setAttribute() {}, removeAttribute() {}, querySelector: element, contains: () => false,
      children: [], append(...c) { this.children.push(...c) }, prepend() {}, firstElementChild: null,
      click() { this.listeners.click?.({ stopPropagation() {}, target: this }) },
      focus() { globalThis.document.activeElement = this },
    })
    return elements.get(id)
  }
  globalThis.document = {
    activeElement: null, documentElement: element('html'), body: { appendChild() {}, removeChild() {} },
    getElementById: element, querySelectorAll: () => [], addEventListener() {},
    createElement: () => makeNode(),
    createElementNS: () => makeNode(),
  }
  globalThis.window = { matchMedia: () => ({ matches: false, addEventListener() {} }), innerWidth: 1200, innerHeight: 900 }
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent: '', maxTouchPoints: 0 } })
  globalThis.localStorage = { getItem: () => null, removeItem() {} }
  return element
}

export function stubFileReader(getBytes) {
  globalThis.FileReader = class {
    readAsArrayBuffer() { const b = getBytes(); this.result = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); this.onload() }
  }
}

export function chooseFile(element, name, size = 4) {
  element('file-input').files = [{ type: 'application/pdf', size, name }]
  element('file-input').listeners.change()
}

export const tick = () => new Promise(setImmediate)
export function deferred() { let resolve, reject; const promise = new Promise((y, n) => { resolve = y; reject = n }); return { promise, resolve, reject } }
