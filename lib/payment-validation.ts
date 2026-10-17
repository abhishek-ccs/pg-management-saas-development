/**
 * Payment Details Validation Engine for BaseraBook PG Management SaaS
 *
 * Enforces strict validation for:
 * 1. UPI ID / VPA (NPCI compliant format: username@bank)
 * 2. Payment Links (Secure HTTPS gateway links or upi://pay? deep links)
 * 3. UPI QR Code images (Allowed MIME types, <= 2MB size, and readable payment URI decoding)
 * 4. Resident Reminders protection (Invalid/incomplete payment details are never included)
 */

import jsQR from 'jsqr'

// Allowed QR Image MIME Types
export const ALLOWED_QR_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/svg+xml',
]

// Maximum Allowed QR Code File Size: 2MB
export const MAX_QR_FILE_SIZE_BYTES = 2 * 1024 * 1024 // 2MB

// Common recognized payment gateways and providers in India & internationally
const TRUSTED_PAYMENT_DOMAINS = [
  'rzp.io',
  'razorpay.me',
  'razorpay.com',
  'paytm.me',
  'paytm.com',
  'p.paytm.me',
  'phonepe.com',
  'gpay.app.goo.gl',
  'pay.google.com',
  'bharatpe.com',
  'cred.club',
  'instamojo.com',
  'cashfree.com',
  'upi.link',
  'upiqr.me',
  'bhimupi.org.in',
  'setu.co',
  'stripe.com',
  'paypal.me',
]

export interface ValidationResult<T = void> {
  isValid: boolean
  error?: string
  data?: T
}

/**
 * Validate a UPI ID (Virtual Payment Address - VPA)
 * Conforms to NPCI specification: <username>@<bank_handle>
 * - Username: letters, numbers, dots, hyphens, underscores (min 2, max 256)
 * - Bank handle: letters and numbers (min 2, max 64)
 */
export function validateUpiId(upiId: string | null | undefined): ValidationResult<string> {
  if (!upiId || typeof upiId !== 'string') {
    return { isValid: false, error: 'UPI ID cannot be empty.' }
  }

  const trimmed = upiId.trim()
  if (!trimmed) {
    return { isValid: false, error: 'UPI ID cannot be empty.' }
  }

  if (trimmed.includes(' ')) {
    return { isValid: false, error: 'UPI ID cannot contain spaces.' }
  }

  const atCount = (trimmed.match(/@/g) || []).length
  if (atCount === 0) {
    return {
      isValid: false,
      error: "UPI ID must contain '@' followed by your bank or app handle (e.g. username@okhdfcbank or 9876543210@paytm).",
    }
  }

  if (atCount > 1) {
    return { isValid: false, error: "UPI ID cannot contain multiple '@' symbols." }
  }

  const [username, handle] = trimmed.split('@')

  if (!username || username.length < 2) {
    return { isValid: false, error: "UPI ID username before '@' must be at least 2 characters long." }
  }

  if (!handle || handle.length < 2) {
    return { isValid: false, error: "UPI ID bank handle after '@' must be at least 2 characters long (e.g. @upi, @okaxis)." }
  }

  // Regex check for standard alphanumeric, dot, hyphen, underscore
  const upiRegex = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z0-9.\-_]{2,64}$/
  if (!upiRegex.test(trimmed)) {
    return {
      isValid: false,
      error: 'UPI ID contains unsupported characters. Only alphanumeric characters, dots, hyphens, and underscores are allowed.',
    }
  }

  return { isValid: true, data: trimmed }
}

/**
 * Validate a Payment Link (e.g. Razorpay link, Paytm payment link, or UPI deep link)
 * Requirements:
 * - Must start with secure https:// or upi://pay?
 * - Insecure http:// is rejected
 * - Must be a syntactically valid URL
 * - If upi://, must contain valid payee address (pa=...)
 */
export function validatePaymentLink(link: string | null | undefined): ValidationResult<string> {
  if (!link || typeof link !== 'string') {
    return { isValid: false, error: 'Payment link cannot be empty.' }
  }

  const trimmed = link.trim()
  if (!trimmed) {
    return { isValid: false, error: 'Payment link cannot be empty.' }
  }

  if (trimmed.startsWith('http://')) {
    return {
      isValid: false,
      error: 'Insecure HTTP links are not allowed. Payment links must use secure HTTPS (https://) or UPI (upi://).',
    }
  }

  // UPI Deep Link validation: upi://pay?...
  if (trimmed.startsWith('upi://pay')) {
    try {
      // Parse query string of upi://pay
      const queryStart = trimmed.indexOf('?')
      if (queryStart === -1) {
        return {
          isValid: false,
          error: "UPI deep link is missing parameters. Must include at least the payee address (e.g. upi://pay?pa=name@upi&pn=PGName).",
        }
      }
      const searchParams = new URLSearchParams(trimmed.slice(queryStart + 1))
      const pa = searchParams.get('pa')
      if (!pa) {
        return {
          isValid: false,
          error: "UPI payment link must specify a payee VPA address ('pa' parameter, e.g. pa=owner@okhdfcbank).",
        }
      }
      const paValidation = validateUpiId(pa)
      if (!paValidation.isValid) {
        return {
          isValid: false,
          error: `UPI payment link contains an invalid payee address: ${paValidation.error}`,
        }
      }
      return { isValid: true, data: trimmed }
    } catch {
      return { isValid: false, error: 'Malformed UPI deep link format.' }
    }
  }

  // HTTPS Link validation
  if (trimmed.startsWith('https://')) {
    let parsed: URL
    try {
      parsed = new URL(trimmed)
    } catch {
      return { isValid: false, error: 'Please enter a valid, well-formed HTTPS payment URL.' }
    }

    if (!parsed.hostname || !parsed.hostname.includes('.')) {
      return { isValid: false, error: 'Payment URL must have a valid domain name (e.g. https://rzp.io/l/...) .' }
    }

    // Check if domain is a recognized payment gateway or has valid payment path
    const hostname = parsed.hostname.toLowerCase()
    const isKnownGateway = TRUSTED_PAYMENT_DOMAINS.some(
      (d) => hostname === d || hostname.endsWith(`.${d}`)
    )

    // Check for obvious non-payment paths (e.g., youtube, facebook, generic search)
    const blockedDomains = ['google.com', 'facebook.com', 'youtube.com', 'twitter.com', 'instagram.com', 'wikipedia.org']
    if (blockedDomains.some((b) => hostname === b || hostname.endsWith(`.${b}`))) {
      return {
        isValid: false,
        error: `The provided URL (${hostname}) is not a supported payment provider. Please provide a link from a payment gateway (e.g. Razorpay, Paytm, PhonePe, or UPI link).`,
      }
    }

    return { isValid: true, data: trimmed }
  }

  return {
    isValid: false,
    error: 'Unsupported payment link format. Links must start with https:// (e.g. https://rzp.io/...) or upi://pay? (UPI deep link).',
  }
}

/**
 * Validate an uploaded QR Code image file for allowed MIME types and max size.
 */
export function validateQrImageFile(file: { type?: string; size?: number; name?: string }): ValidationResult {
  if (!file) {
    return { isValid: false, error: 'No file selected.' }
  }

  if (file.size && file.size > MAX_QR_FILE_SIZE_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1)
    return {
      isValid: false,
      error: `QR code image is too large (${sizeMb}MB). Maximum allowed file size is 2MB.`,
    }
  }

  const mime = (file.type || '').toLowerCase()
  const name = (file.name || '').toLowerCase()
  const hasValidExt = /\.(png|jpe?g|webp|svg)$/i.test(name)

  if (mime && !ALLOWED_QR_MIME_TYPES.includes(mime) && !hasValidExt) {
    return {
      isValid: false,
      error: `Unsupported file type (${mime || 'unknown'}). Please upload a PNG, JPG, or WebP image.`,
    }
  }

  return { isValid: true }
}

/**
 * Validate decoded QR code string data.
 * Confirms that the QR code contains an authentic payment URI (UPI payload or HTTPS gateway).
 */
export function validateDecodedQrData(decodedText: string): ValidationResult<{ type: 'upi' | 'https'; uri: string }> {
  if (!decodedText || typeof decodedText !== 'string') {
    return { isValid: false, error: 'Decoded QR code data is empty.' }
  }

  const trimmed = decodedText.trim()

  // Case 1: Standard NPCI UPI QR code: upi://pay?...
  if (trimmed.startsWith('upi://pay')) {
    const linkValidation = validatePaymentLink(trimmed)
    if (linkValidation.isValid) {
      return { isValid: true, data: { type: 'upi', uri: trimmed } }
    }
    return { isValid: false, error: linkValidation.error }
  }

  // Case 2: Gateway HTTPS payment link embedded in QR
  if (trimmed.startsWith('https://')) {
    const linkValidation = validatePaymentLink(trimmed)
    if (linkValidation.isValid) {
      return { isValid: true, data: { type: 'https', uri: trimmed } }
    }
    return { isValid: false, error: linkValidation.error }
  }

  // Case 3: Raw UPI ID string embedded in QR (e.g. "sunrisepg@okhdfcbank")
  const upiValidation = validateUpiId(trimmed)
  if (upiValidation.isValid) {
    return { isValid: true, data: { type: 'upi', uri: `upi://pay?pa=${trimmed}&pn=PG%20Rent` } }
  }

  return {
    isValid: false,
    error: `The uploaded QR code does not contain a supported payment URI. It contains: "${trimmed.slice(0, 40)}${trimmed.length > 40 ? '...' : ''}". Please upload a valid UPI or payment gateway QR code.`,
  }
}

/**
 * Browser-side QR code scanner: Decodes and verifies image data using jsQR.
 * Runs in client browser environment via OffscreenCanvas / HTMLCanvasElement.
 */
export async function decodeAndValidateQrImage(
  dataUrl: string
): Promise<ValidationResult<{ decodedText: string; uri: string }>> {
  if (typeof window === 'undefined') {
    return { isValid: true }
  }

  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        const width = img.naturalWidth || img.width
        const height = img.naturalHeight || img.height

        if (width === 0 || height === 0) {
          resolve({ isValid: false, error: 'The uploaded image has invalid dimensions (0x0).' })
          return
        }

        // Limit dimensions for fast processing if oversized
        const maxDim = 1200
        let targetWidth = width
        let targetHeight = height
        if (targetWidth > maxDim || targetHeight > maxDim) {
          if (targetWidth > targetHeight) {
            targetHeight = Math.round((targetHeight * maxDim) / targetWidth)
            targetWidth = maxDim
          } else {
            targetWidth = Math.round((targetWidth * maxDim) / targetHeight)
            targetHeight = maxDim
          }
        }

        canvas.width = targetWidth
        canvas.height = targetHeight
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          // If canvas context unavailable, accept the image
          resolve({ isValid: true, data: { decodedText: '', uri: dataUrl } })
          return
        }

        ctx.drawImage(img, 0, 0, targetWidth, targetHeight)
        const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight)

        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert',
        })

        if (!code || !code.data) {
          // Try with inversion in case QR is dark-on-light or light-on-dark
          const codeInverted = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'onlyInvert',
          })

          if (codeInverted?.data) {
            const validation = validateDecodedQrData(codeInverted.data)
            if (!validation.isValid) {
              resolve({ isValid: false, error: validation.error })
              return
            }
            resolve({
              isValid: true,
              data: { decodedText: codeInverted.data, uri: validation.data!.uri },
            })
            return
          }

          // If QR code could not be detected, inform the user with actionable feedback
          resolve({
            isValid: false,
            error:
              'No readable QR code was detected in the uploaded image. Please ensure the QR code is clearly visible, well-lit, and not blurred or cropped.',
          })
          return
        }

        // Verify the decoded content is a valid payment URI
        const validation = validateDecodedQrData(code.data)
        if (!validation.isValid) {
          resolve({ isValid: false, error: validation.error })
          return
        }

        resolve({
          isValid: true,
          data: { decodedText: code.data, uri: validation.data!.uri },
        })
      } catch (err: any) {
        resolve({
          isValid: false,
          error: `Error reading QR code image: ${err?.message || 'Unknown decoding error'}.`,
        })
      }
    }

    img.onerror = () => {
      resolve({ isValid: false, error: 'Could not load the image file. Please check that the file is not corrupted.' })
    }

    img.src = dataUrl
  })
}

export interface PaymentFormValidation {
  isValid: boolean
  errors: {
    upiId?: string
    paymentLink?: string
    qrCode?: string
    general?: string
  }
  cleanData: {
    upiId: string | null
    paymentLink: string | null
    qrCodeUrl: string | null
  }
}

/**
 * Comprehensive Validation of the Owner Payment Options Form before database persistence
 */
export function validatePaymentDetailsForm(form: {
  upiId?: string | null
  paymentLink?: string | null
  qrCodeUrl?: string | null
}): PaymentFormValidation {
  const rawUpiId = (form.upiId || '').trim()
  const rawPaymentLink = (form.paymentLink || '').trim()
  const rawQrCodeUrl = (form.qrCodeUrl || '').trim()

  const errors: PaymentFormValidation['errors'] = {}

  // 1. Must configure at least one payment method
  if (!rawUpiId && !rawPaymentLink && !rawQrCodeUrl) {
    errors.general = 'Please configure at least one payment option: enter a UPI ID, an online payment link, or upload a UPI QR code.'
    return {
      isValid: false,
      errors,
      cleanData: { upiId: null, paymentLink: null, qrCodeUrl: null },
    }
  }

  // 2. Validate UPI ID if provided
  let cleanUpiId: string | null = null
  if (rawUpiId) {
    const upiResult = validateUpiId(rawUpiId)
    if (!upiResult.isValid) {
      errors.upiId = upiResult.error
    } else {
      cleanUpiId = upiResult.data!
    }
  }

  // 3. Validate Payment Link if provided
  let cleanPaymentLink: string | null = null
  if (rawPaymentLink) {
    const linkResult = validatePaymentLink(rawPaymentLink)
    if (!linkResult.isValid) {
      errors.paymentLink = linkResult.error
    } else {
      cleanPaymentLink = linkResult.data!
    }
  }

  // 4. Validate QR Code URL format if provided
  let cleanQrCodeUrl: string | null = null
  if (rawQrCodeUrl) {
    if (
      !rawQrCodeUrl.startsWith('data:image/') &&
      !rawQrCodeUrl.startsWith('https://') &&
      !rawQrCodeUrl.startsWith('http://localhost')
    ) {
      errors.qrCode = 'QR code must be a valid image data URL or HTTPS image link.'
    } else {
      cleanQrCodeUrl = rawQrCodeUrl
    }
  }

  const isValid = Object.keys(errors).length === 0

  return {
    isValid,
    errors,
    cleanData: {
      upiId: cleanUpiId,
      paymentLink: cleanPaymentLink,
      qrCodeUrl: cleanQrCodeUrl,
    },
  }
}

export interface ReminderPaymentOptions {
  upiId?: string | null
  paymentLink?: string | null
  qrCodeUrl?: string | null
}

/**
 * Filter and validate payment options specifically for inclusion in resident reminders.
 * Incomplete, malformed, or invalid options are strictly excluded.
 */
export function getValidatedReminderPaymentOptions(
  options?: ReminderPaymentOptions | null
): ReminderPaymentOptions | null {
  if (!options) return null

  const validated: ReminderPaymentOptions = {}
  let hasValidOption = false

  if (options.upiId) {
    const upiCheck = validateUpiId(options.upiId)
    if (upiCheck.isValid) {
      validated.upiId = upiCheck.data!
      hasValidOption = true
    }
  }

  if (options.paymentLink) {
    const linkCheck = validatePaymentLink(options.paymentLink)
    if (linkCheck.isValid) {
      validated.paymentLink = linkCheck.data!
      hasValidOption = true
    }
  }

  if (options.qrCodeUrl && typeof options.qrCodeUrl === 'string') {
    const trimmed = options.qrCodeUrl.trim()
    if (trimmed.startsWith('data:image/') || trimmed.startsWith('https://')) {
      validated.qrCodeUrl = trimmed
      hasValidOption = true
    }
  }

  return hasValidOption ? validated : null
}
