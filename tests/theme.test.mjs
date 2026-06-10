// Run: node tests/theme.test.mjs

function resolveTheme(stored, prefersDark) {
  if (stored === 'dark' || stored === 'light') return stored
  return prefersDark ? 'dark' : 'light'
}

function assert(description, condition) {
  if (!condition) throw new Error(`FAIL: ${description}`)
  console.log(`PASS: ${description}`)
}

assert('stored dark wins over system light', resolveTheme('dark', false) === 'dark')
assert('stored light wins over system dark', resolveTheme('light', true) === 'light')
assert('no stored + prefers dark = dark',    resolveTheme(null, true) === 'dark')
assert('no stored + prefers light = light',  resolveTheme(null, false) === 'light')
assert('arbitrary value falls back to system pref', resolveTheme('evil"><script>', false) === 'light')
assert('undefined falls back to system pref', resolveTheme(undefined, true) === 'dark')

console.log('\nAll tests passed.')
