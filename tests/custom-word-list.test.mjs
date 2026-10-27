import assert from 'node:assert/strict'
import test from 'node:test'
import { importApp } from './import-app.mjs'

const { PasswordScanner, parseCustomWordList } = await importApp('password-scanner.js')

test('text and Markdown lists trim, dedupe, and skip Markdown structure', () => {
  assert.deepEqual(parseCustomWordList(' alpha\r\n beta \nalpha\n \n', 'txt'), ['alpha', 'beta'])
  assert.deepEqual(parseCustomWordList('# Heading\n- alpha\n* beta\n1. gamma\n```\nsecret\n```\n2. alpha\n', 'md'), ['alpha', 'beta', 'gamma'])
})

test('CSV cells handle quoted commas, quotes, and line breaks', () => {
  assert.deepEqual(parseCustomWordList('alpha," two,three ","say ""hi"""\n"line\nbreak",alpha,', 'csv'),
    ['alpha', 'two,three', 'say "hi"', 'line\nbreak'])
})

test('custom list rejects unsupported, oversized, empty, and excessive files', async () => {
  const scanner = new PasswordScanner()
  const file = (name, size, content) => ({ name, size, text: async () => content })
  await assert.rejects(scanner.setCustomList(file('list.json', 2, 'a')), /\.txt, \.csv, or \.md/)
  await assert.rejects(scanner.setCustomList(file('list.txt', 5 * 1024 * 1024 + 1, 'a')), /5 MB/)
  await assert.rejects(scanner.setCustomList(file('list.txt', 1, ' \n')), /no candidates/i)
  await assert.rejects(scanner.setCustomList(file('list.txt', 100001, Array.from({ length: 100001 }, (_, i) => `pw${i}`).join('\n'))), /100,000/)
})

test('scanner tries custom candidates before bundled list and deduplicates overlaps', async () => {
  const scanner = new PasswordScanner()
  await scanner.setCustomList({ name: 'words.txt', size: 14, text: async () => 'special\nshared' })
  const attempts = []
  globalThis.fetch = async () => ({ ok: true, text: async () => 'shared\nbundled' })
  await new Promise((resolve, reject) => scanner.scan({
    securityHandler: { authenticateWithString(password) { attempts.push(password); return { authenticated: false } } },
    onComplete: resolve,
    onError: reject,
  }))
  assert.deepEqual(attempts, ['special', 'shared', 'bundled'])
})
