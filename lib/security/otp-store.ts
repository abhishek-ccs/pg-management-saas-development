import crypto from 'node:crypto'
import { logger } from '../logger'

/**
 * Purpose of the OTP
 */
export type OtpPurpose = 'signup_verification' | 'password_reset'

/**
 * Structure of a stored OTP record
 */
export interface StoredOtpRecord {
  email: string
  otpHash: string
  salt: string
  purpose: OtpPurpose
  expiresAt: number // Unix timestamp (ms)
  attempts: number
  maxAttempts: number
  consumed: boolean
  createdAt: number
}

// In-memory atomic store for active OTPs across warm serverless invocations.
// Keys are formatted as `${purpose}:${email.toLowerCase().trim()}`
const otpStore = new Map<string, StoredOtpRecord>()

// Cooldown tracking for resend attempts: `${purpose}:${email}` => lastSentAt (ms)
const resendCooldownStore = new Map<string, number>()

// Expiration duration: strictly 5 minutes (300,000 ms)
export const OTP_EXPIRY_MS = 5 * 60 * 1000

// Maximum failed verification attempts before invalidating OTP
export const OTP_MAX_ATTEMPTS = 5

// Resend cooldown duration: 60 seconds
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000

/**
 * Cryptographically hashes an OTP using SHA-256 and a random salt
 */
export function hashOtp(otp: string, salt: string): string {
  return crypto.createHash('sha256').update(`${salt}:${otp.trim()}`).digest('hex')
}

/**
 * Generates a cryptographically random 6-digit numeric OTP string (100000 - 999999)
 */
export function generateNumericOtp(): string {
  return crypto.randomInt(100000, 1000000).toString()
}

/**
 * Checks if a resend request is currently on cooldown
 */
export function checkResendCooldown(email: string, purpose: OtpPurpose): { allowed: boolean; remainingSec: number } {
  const key = `${purpose}:${email.toLowerCase().trim()}`
  const lastSent = resendCooldownStore.get(key)
  if (!lastSent) return { allowed: true, remainingSec: 0 }

  const elapsed = Date.now() - lastSent
  if (elapsed < OTP_RESEND_COOLDOWN_MS) {
    const remainingSec = Math.ceil((OTP_RESEND_COOLDOWN_MS - elapsed) / 1000)
    return { allowed: false, remainingSec }
  }

  return { allowed: true, remainingSec: 0 }
}

/**
 * Stores a hashed OTP record with a strict 5-minute expiry
 */
export function storeOtp(email: string, rawOtp: string, purpose: OtpPurpose): { expiresAt: number } {
  const normalizedEmail = email.toLowerCase().trim()
  const key = `${purpose}:${normalizedEmail}`
  const salt = crypto.randomBytes(16).toString('hex')
  const otpHash = hashOtp(rawOtp, salt)
  const now = Date.now()
  const expiresAt = now + OTP_EXPIRY_MS

  const record: StoredOtpRecord = {
    email: normalizedEmail,
    otpHash,
    salt,
    purpose,
    expiresAt,
    attempts: 0,
    maxAttempts: OTP_MAX_ATTEMPTS,
    consumed: false,
    createdAt: now,
  }

  otpStore.set(key, record)
  resendCooldownStore.set(key, now)

  // Clean up expired OTPs periodically to prevent memory growth
  cleanupExpiredOtps()

  return { expiresAt }
}

/**
 * Result of OTP verification
 */
export type VerifyOtpResult =
  | { success: true; message: string }
  | { success: false; code: 'EXPIRED' | 'MAX_ATTEMPTS' | 'INVALID' | 'ALREADY_USED' | 'NOT_FOUND'; message: string; remainingAttempts?: number }

/**
 * Verifies an OTP against the stored record
 */
export function verifyOtp(email: string, rawOtp: string, purpose: OtpPurpose): VerifyOtpResult {
  const normalizedEmail = email.toLowerCase().trim()
  const key = `${purpose}:${normalizedEmail}`
  const record = otpStore.get(key)

  if (!record) {
    return {
      success: false,
      code: 'NOT_FOUND',
      message: 'No verification code found. Please request a new code.',
    }
  }

  if (record.consumed) {
    return {
      success: false,
      code: 'ALREADY_USED',
      message: 'This verification code has already been used. Please request a new code.',
    }
  }

  const now = Date.now()
  if (now > record.expiresAt) {
    otpStore.delete(key)
    return {
      success: false,
      code: 'EXPIRED',
      message: 'Verification code has expired. Codes are only valid for 5 minutes. Please request a new code.',
    }
  }

  if (record.attempts >= record.maxAttempts) {
    otpStore.delete(key)
    return {
      success: false,
      code: 'MAX_ATTEMPTS',
      message: 'Too many incorrect attempts. For your security, this code has been invalidated. Please request a new code.',
    }
  }

  const computedHash = hashOtp(rawOtp, record.salt)
  const isMatch = crypto.timingSafeEqual(Buffer.from(computedHash), Buffer.from(record.otpHash))

  if (!isMatch) {
    record.attempts += 1
    const remainingAttempts = Math.max(0, record.maxAttempts - record.attempts)

    if (remainingAttempts === 0) {
      otpStore.delete(key)
      return {
        success: false,
        code: 'MAX_ATTEMPTS',
        message: 'Too many incorrect attempts. This code has been invalidated. Please request a new code.',
        remainingAttempts: 0,
      }
    }

    return {
      success: false,
      code: 'INVALID',
      message: `Invalid verification code. You have ${remainingAttempts} attempt${remainingAttempts === 1 ? '' : 's'} remaining.`,
      remainingAttempts,
    }
  }

  // Mark single-use consumption and delete from active store
  record.consumed = true
  otpStore.delete(key)

  logger.info(`OTP successfully verified for ${purpose}:`, { email: normalizedEmail })
  return {
    success: true,
    message: 'Verification code confirmed successfully.',
  }
}

/**
 * Invalidates and removes an OTP record manually
 */
export function invalidateOtp(email: string, purpose: OtpPurpose): void {
  const key = `${purpose}:${email.toLowerCase().trim()}`
  otpStore.delete(key)
}

/**
 * Removes expired records from memory
 */
function cleanupExpiredOtps(): void {
  const now = Date.now()
  for (const [key, record] of otpStore.entries()) {
    if (now > record.expiresAt || record.consumed) {
      otpStore.delete(key)
    }
  }
}
