import { logger } from '@/lib/logger'

export interface SendEmailOptions {
  to: string
  subject: string
  html: string
  text?: string
}

export interface SendEmailResult {
  success: boolean
  messageId?: string
  error?: string
}

const RESEND_API_KEY = process.env.RESEND_API_KEY
const EMAIL_FROM = process.env.EMAIL_FROM || 'StayNest <notifications@staynest.in>'

/**
 * Universal Transactional Email Sender
 * Sends via Resend if RESEND_API_KEY is configured, or logs safely in development/staging.
 */
export async function sendEmail({ to, subject, html, text }: SendEmailOptions): Promise<SendEmailResult> {
  if (RESEND_API_KEY) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: EMAIL_FROM,
          to,
          subject,
          html,
          text,
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        logger.error('Resend API delivery error:', data)
        return { success: false, error: data?.message || 'Email delivery failed' }
      }

      logger.info('Transactional email dispatched via Resend:', { to, subject, id: data.id })
      return { success: true, messageId: data.id }
    } catch (err: any) {
      logger.error('Failed to dispatch email via Resend:', err)
      return { success: false, error: err?.message || 'Network error' }
    }
  }

  // Development & fallback simulated delivery
  logger.info('[DEV EMAIL EMULATOR] Simulated transactional email:', {
    from: EMAIL_FROM,
    to,
    subject,
  })
  return {
    success: true,
    messageId: `dev-simulated-${Date.now()}`,
  }
}

// ----------------------------------------------------------------------------
// Pre-built High-Deliverability Responsive HTML Templates
// ----------------------------------------------------------------------------

export async function sendWelcomeEmail(to: string, ownerName: string) {
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 20px; color: #2c2926; background-color: #fbf8f3;">
      <div style="background-color: #ffffff; border: 1px solid #e8dfd4; border-radius: 16px; padding: 32px;">
        <h1 style="color: #9a7651; font-size: 22px; margin-top: 0;">Welcome to StayNest, ${ownerName}!</h1>
        <p style="font-size: 14px; line-height: 22px; color: #555a6c;">
          Your 7-day unrestricted free trial is now active. You can immediately set up your property profile, configure rooms and beds, and onboard residents.
        </p>
        <div style="margin: 28px 0;">
          <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://staynest.in'}/dashboard" style="display: inline-block; background-color: #9a7651; color: #ffffff; font-weight: 600; font-size: 13px; text-decoration: none; padding: 12px 24px; border-radius: 10px;">
            Open Your Dashboard →
          </a>
        </div>
        <p style="font-size: 12px; color: #85899a; border-top: 1px solid #eee4d7; padding-top: 16px; margin-bottom: 0;">
          StayNest Technologies · Global PG & Property Management SaaS
        </p>
      </div>
    </div>
  `
  return sendEmail({ to, subject: 'Welcome to StayNest — Your 7-Day Trial is Ready', html })
}

export async function sendReceiptEmail(
  to: string,
  tenantName: string,
  receiptId: string,
  amount: number,
  method: string,
  propertyName: string
) {
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 20px; color: #2c2926; background-color: #fbf8f3;">
      <div style="background-color: #ffffff; border: 1px solid #e8dfd4; border-radius: 16px; padding: 32px;">
        <div style="border-bottom: 1px solid #eee4d7; padding-bottom: 16px; margin-bottom: 20px;">
          <p style="text-transform: uppercase; font-size: 10px; font-weight: 700; color: #9a7651; margin: 0;">Official Payment Receipt</p>
          <h2 style="font-size: 18px; margin: 4px 0 0 0; color: #2c2926;">${propertyName}</h2>
        </div>
        <p style="font-size: 14px; color: #555a6c;">Dear ${tenantName},</p>
        <p style="font-size: 14px; color: #555a6c;">
          We have recorded your payment of <strong>₹${amount.toLocaleString('en-IN')}</strong> via ${method.toUpperCase()}.
        </p>
        <div style="background-color: #faf7f2; border: 1px solid #eee4d7; border-radius: 12px; padding: 16px; margin: 20px 0; font-size: 13px;">
          <p style="margin: 0 0 8px 0;"><strong>Receipt ID:</strong> REC-${receiptId.slice(0, 8).toUpperCase()}</p>
          <p style="margin: 0 0 8px 0;"><strong>Date:</strong> ${new Date().toLocaleDateString('en-IN')}</p>
          <p style="margin: 0;"><strong>Status:</strong> <span style="color: #328d68; font-weight: 700;">PAID</span></p>
        </div>
        <p style="font-size: 12px; color: #85899a; margin-bottom: 0;">
          This is an automated formal receipt generated by StayNest on behalf of ${propertyName}.
        </p>
      </div>
    </div>
  `
  return sendEmail({ to, subject: `Payment Receipt: REC-${receiptId.slice(0, 8).toUpperCase()} from ${propertyName}`, html })
}
