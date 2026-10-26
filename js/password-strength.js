/**
 * password-strength.js — pattern-aware estimate for the strength meter.
 *
 * Entropy alone overrates dictionary passwords such as "Password1!", so a
 * password found in the common list is always reported as Weak.
 */

export function passwordStrength(password, { isCommon = false, isCommonPassword = () => false } = {}) {
  if (!password) return { score: 0, label: '', hint: '' }

  if (isCommon) return { score: 1, label: 'Weak',
    hint: 'Common password, easy to guess' }

  const normalise = value => value.toLowerCase()
    .replace(/[@4]/g, 'a').replace(/0/g, 'o').replace(/1/g, 'i')
    .replace(/3/g, 'e').replace(/[5$]/g, 's').replace(/7/g, 't')
  const base = password.replace(/^[^a-z]+|[^a-z]+$/gi, '')
  const candidates = [password, normalise(password), base, normalise(base)]
  if (candidates.some(value => value && (isCommonPassword(value) || isCommonPassword(value.replace(/i/g, 'l'))))) {
    return { score: 1, label: 'Weak', hint: 'Common word with predictable changes' }
  }

  let remaining = password
    .replace(/(?:19|20)\d{2}(?:[01]\d[0-3]\d)?/g, '')
    .replace(/qwerty|asdf|zxcv|poiuy|lkjh|mnbv/gi, '')
    .replace(/(.)\1{2,}/g, '$1')
    .replace(/(.{2,8}?)\1+/g, '$1')
  remaining = remaining.replace(/[a-z]+|\d+/gi, part => {
    let result = ''
    for (let i = 0; i < part.length;) {
      const step = part.charCodeAt(i + 1) - part.charCodeAt(i)
      let end = i + 1
      if (step === 1 || step === -1) {
        while (end + 1 < part.length && part.charCodeAt(end + 1) - part.charCodeAt(end) === step) end++
      }
      if (end - i + 1 >= 4) i = end + 1
      else result += part[i++]
    }
    return result
  })

  const hasSymbol = /[^a-zA-Z0-9]/.test(remaining)
  let charset = 0
  if (/[a-z]/.test(remaining)) charset += 26
  if (/[A-Z]/.test(remaining)) charset += 26
  if (/[0-9]/.test(remaining))  charset += 10
  if (hasSymbol) charset += 32

  const entropy = remaining.length * Math.log2(charset || 1)

  if (entropy < 40) return { score: 1, label: 'Weak',
    hint: remaining.length < password.length ? 'Avoid sequences, repeats, and dates'
      : 'Use 8+ characters with mixed case and numbers' }
  if (entropy < 60) return { score: 2, label: 'Fair',
    hint: hasSymbol ? 'Increase length' : 'Add symbols or increase length' }
  if (entropy < 72) return { score: 3, label: 'Strong',
    hint: hasSymbol ? 'Add length for maximum strength'
                    : 'Consider adding symbols for maximum strength' }
  return { score: 4, label: 'Very strong', hint: 'Excellent password' }
}
