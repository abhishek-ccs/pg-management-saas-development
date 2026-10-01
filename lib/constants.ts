/**
 * StayBook Global Constants
 * Single source of truth for platform configuration and support contact.
 */

export const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'getstaynest@gmail.com'

/**
 * Generates a pre-filled, properly encoded mailto URL for customer support.
 */
export function getMailtoSupport(
  subject: string = 'StayBook Support Inquiry',
  body?: string
): string {
  const params = new URLSearchParams()
  if (subject) params.set('subject', subject)
  if (body) params.set('body', body)
  const query = params.toString()
  return `mailto:${SUPPORT_EMAIL}${query ? `?${query}` : ''}`
}

export const APP_NAME = 'StayBook'
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://staybook.in'

