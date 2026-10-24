/**
 * Shared Validation Utilities for StayNest PG Management SaaS
 * Enforces consistent phone and email formats across signup, property, tenant, and contact workflows.
 */

/**
 * Validates whether an email address adheres to standard RFC-compliant format.
 * Requires a valid local part, '@' symbol, domain name, and at least a 2-character TLD.
 */
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false
  const trimmed = email.trim()
  if (trimmed.length < 5 || trimmed.length > 254) return false
  
  // RFC 5322 compatible regex checking standard email structure
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
  return emailRegex.test(trimmed)
}

/**
 * Validates whether a phone number adheres to professional Indian or international standards.
 * - Supports standard 10-digit mobile numbers (e.g. 9876543210)
 * - Supports country code prefixes (e.g. +91 9876543210, +1 555-0199)
 * - Rejects non-numeric noise, short inputs (< 10 digits), and obviously fake dummy inputs (e.g. 0000000000)
 */
export function isValidPhone(phone: string): boolean {
  if (!phone || typeof phone !== 'string') return false
  const cleaned = phone.replace(/[\s\-\(\)\.]/g, '')

  // Reject empty or invalid length (must be 10 to 15 digits, optionally with leading '+')
  if (!/^\+?\d{10,15}$/.test(cleaned)) return false

  // Reject dummy sequences where digits are all identical (e.g. 0000000000, 1111111111, 9999999999)
  const digitsOnly = cleaned.replace(/\+/, '')
  const firstChar = digitsOnly[0]
  if (digitsOnly.split('').every((c) => c === firstChar)) {
    return false
  }

  // Common Indian mobile check: if 10 digits without country code, usually starts with 6-9
  if (digitsOnly.length === 10) {
    return /^[6-9]\d{9}$/.test(digitsOnly)
  }

  // With +91 country code (12 digits total starting with 91)
  if (digitsOnly.length === 12 && digitsOnly.startsWith('91')) {
    return /^91[6-9]\d{9}$/.test(digitsOnly)
  }

  // Other international formats with 10-15 digits
  return digitsOnly.length >= 10 && digitsOnly.length <= 15
}

/**
 * Validates that a redirect path is a safe, relative, same-origin local path.
 * Strict safeguards against Open Redirect (CWE-601):
 * - Rejects absolute external URLs (e.g. 'https://evil.com', 'http://evil.com')
 * - Rejects protocol-relative URLs (e.g. '//evil.com', '///evil.com')
 * - Rejects backslash-based browser bypasses (e.g. '/\evil.com', '\\evil.com')
 * - Rejects control characters, newlines, carriage returns, and tabs (CRLF header injection)
 * - Rejects alternative schemes (e.g. 'javascript:', 'data:', 'mailto:')
 * - Rejects non-path strings without leading slash (e.g. 'evil.com')
 */
export function isSafeRedirectPath(url: unknown): url is string {
  if (typeof url !== 'string') return false
  const trimmed = url.trim()
  if (!trimmed) return false

  // Must start with exactly one forward slash, followed by a non-slash, non-backslash character (or be exactly '/')
  // Reject protocol-relative ('//'), backslash ('/\\', '\\')
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.startsWith('/\\') || trimmed.includes('\\')) {
    return false
  }

  // Reject control characters, newlines, carriage returns, and tabs (prevent CRLF header injection)
  if (/[\u0000-\u001F\u007F]/.test(trimmed)) {
    return false
  }

  // Validate with WHATWG URL parser against a dummy local base origin
  try {
    const parsed = new URL(trimmed, 'http://localhost')
    // Ensure origin is strictly http://localhost (no scheme or host override)
    if (parsed.origin !== 'http://localhost') {
      return false
    }
    // Ensure protocol is http (cannot be javascript:, data:, etc.)
    if (parsed.protocol !== 'http:') {
      return false
    }
    // Double-check pathname starts with '/' and does not contain protocol-relative or backslashes
    if (!parsed.pathname.startsWith('/') || parsed.pathname.startsWith('//') || parsed.pathname.includes('\\')) {
      return false
    }
    return true
  } catch {
    return false
  }
}

/**
 * Returns a validated safe redirect destination. If the input is unsafe or invalid,
 * safely defaults to the provided fallback path (defaulting to '/').
 */
export function getSafeRedirectPath(url: unknown, fallback: string = '/'): string {
  if (isSafeRedirectPath(url)) {
    return url.trim()
  }
  return fallback
}

export interface PasswordValidationRules {
  minLength: boolean // >= 8
  maxLength: boolean // <= 128
  hasUppercase: boolean // [A-Z]
  hasLowercase: boolean // [a-z]
  hasNumber: boolean // [0-9]
  hasSpecial: boolean // [^A-Za-z0-9]
  notCommon: boolean // not in common/compromised dictionary
}

export interface PasswordValidationResult {
  valid: boolean
  error?: string
  rules: PasswordValidationRules
}

/**
 * Top known common/compromised passwords and easily-guessable dictionary entries.
 * Case-insensitive comparison is enforced.
 */
export const COMMON_COMPROMISED_PASSWORDS = new Set([
  'password1234',
  'password12345',
  'password123456',
  'admin12345678',
  'administrator1',
  'welcome123456',
  'baserabook123',
  'baserabook2026',
  '123456789012',
  'qwertyuiop12',
  'iloveyou1234',
  'letmein12345',
  'passw0rd123!',
  'p@ssw0rd1234',
  'p@ssword1234',
  'password123!',
  'password123@',
  'password123#',
  'password@1234',
  'admin@123456',
  'welcome@12345',
  'welcome@123456',
  'qwerty@123456',
  'changeit1234!',
  'changeme1234!',
  'testing12345!',
  'staynest1234!',
  'staynest2026!',
])

export const COMMON_COMPROMISED_ROOTS = [
  'password',
  'welcome',
  'admin',
  'administrator',
  'qwerty',
  'staynest',
  'baserabook',
  'letmein',
  'testing',
  'changeme',
  'changeit',
  'iloveyou',
  '123456',
]

/**
 * Authoritative Password Policy Validator for BaseraBook.
 * 
 * Rules enforced:
 * 1. Minimum 8 characters, Maximum 128 characters
 * 2. At least one uppercase letter (A–Z)
 * 3. At least one lowercase letter (a–z)
 * 4. At least one numeric digit (0–9)
 * 5. At least one special symbol (!@#$%^&*()_+-=[]{}|;:,.<>?)
 * 6. Rejection of known common, compromised, and trivially repetitive passwords
 */
export function validatePassword(password: unknown): PasswordValidationResult {
  if (typeof password !== 'string') {
    return {
      valid: false,
      error: 'Password must be a valid string.',
      rules: {
        minLength: false,
        maxLength: false,
        hasUppercase: false,
        hasLowercase: false,
        hasNumber: false,
        hasSpecial: false,
        notCommon: false,
      },
    }
  }

  const length = password.length
  const minLength = length >= 8
  const maxLength = length <= 128
  const hasUppercase = /[A-Z]/.test(password)
  const hasLowercase = /[a-z]/.test(password)
  const hasNumber = /[0-9]/.test(password)
  const hasSpecial = /[^A-Za-z0-9]/.test(password)

  // Rejection of compromised or trivial repetitions (e.g. 'AAAAAAAAAAAA!' or dictionary words)
  const clean = password.toLowerCase().trim()
  const isDirectlyCommon = COMMON_COMPROMISED_PASSWORDS.has(clean)
  const isAllSameChar = /^(.)\1+$/.test(password)
  const isTrivialCompromised = COMMON_COMPROMISED_ROOTS.some((root) => {
    const pattern = new RegExp(`^${root}[0-9!@#$%^&*()_+\\-=\\[\\]{}|;:,.<>?]*$`, 'i')
    return pattern.test(clean)
  })
  const notCommon = !isDirectlyCommon && !isAllSameChar && !isTrivialCompromised

  const allValid =
    minLength &&
    maxLength &&
    hasUppercase &&
    hasLowercase &&
    hasNumber &&
    hasSpecial &&
    notCommon

  let error: string | undefined = undefined
  if (!minLength) {
    error = 'Password must be at least 8 characters long.'
  } else if (!maxLength) {
    error = 'Password cannot exceed 128 characters.'
  } else if (!hasUppercase) {
    error = 'Password must contain at least one uppercase letter (A–Z).'
  } else if (!hasLowercase) {
    error = 'Password must contain at least one lowercase letter (a–z).'
  } else if (!hasNumber) {
    error = 'Password must contain at least one number (0–9).'
  } else if (!hasSpecial) {
    error = 'Password must contain at least one special character (!@#$%^&* etc.).'
  } else if (!notCommon) {
    error = 'This password is too common or easily guessed. Please choose a stronger password.'
  }

  return {
    valid: allValid,
    error,
    rules: {
      minLength,
      maxLength,
      hasUppercase,
      hasLowercase,
      hasNumber,
      hasSpecial,
      notCommon,
    },
  }
}


