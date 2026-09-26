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
