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

