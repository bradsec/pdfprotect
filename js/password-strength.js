/**
 * password-strength.js — character-set entropy estimate for the strength meter.
 *
 * Entropy alone overrates dictionary passwords such as "Password1!", so a
 * password found in the common list is always reported as Weak.
 */

export function passwordStrength(password, { isCommon = false } = {}) {
  if (!password) return { score: 0, label: '', hint: '' }

  if (isCommon) return { score: 1, label: 'Weak',
    hint: 'Common password, easy to guess' }

  const hasSymbol = /[^a-zA-Z0-9]/.test(password)
  let charset = 0
  if (/[a-z]/.test(password)) charset += 26
  if (/[A-Z]/.test(password)) charset += 26
  if (/[0-9]/.test(password))  charset += 10
  if (hasSymbol) charset += 32

  const entropy = password.length * Math.log2(charset || 1)

  if (entropy < 40) return { score: 1, label: 'Weak',
    hint: 'Use 8+ characters with mixed case and numbers' }
  if (entropy < 60) return { score: 2, label: 'Fair',
    hint: hasSymbol ? 'Increase length' : 'Add symbols or increase length' }
  if (entropy < 72) return { score: 3, label: 'Strong',
    hint: hasSymbol ? 'Add length for maximum strength'
                    : 'Consider adding symbols for maximum strength' }
  return { score: 4, label: 'Very strong', hint: 'Excellent password' }
}
