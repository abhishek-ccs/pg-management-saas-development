import { logger } from '../logger'

export interface SendEmailOptions {
  to: string
  subject: string
  html: string
  text?: string
  from?: string
  replyTo?: string
}

export interface SendEmailResult {
  success: boolean
  messageId?: string
  error?: string
}

export const DEFAULT_SENDER_EMAIL = 'support@baserabook.in'
export const DEFAULT_EMAIL_FROM = 'BaseraBook Support <support@baserabook.in>'
export const DEFAULT_EMAIL_REPLY_TO = 'support@baserabook.in'

const RESEND_API_KEY = process.env.RESEND_API_KEY

/**
 * Resolves the authorized sender address for Resend.
 * Rejects unverified domains like gmail.com to prevent Resend 403 API errors.
 */
export function resolveSender(customFrom?: string): string {
  if (customFrom && !customFrom.includes('@gmail.com')) {
    return customFrom
  }
  const envFrom = process.env.EMAIL_FROM
  if (envFrom && !envFrom.includes('@gmail.com')) {
    return envFrom
  }
  return DEFAULT_EMAIL_FROM
}

/**
 * Resolves the reply-to address for emails.
 */
export function resolveReplyTo(customReplyTo?: string): string {
  if (customReplyTo) return customReplyTo
  return process.env.EMAIL_REPLY_TO || DEFAULT_EMAIL_REPLY_TO
}

/**
 * Universal Transactional Email Sender
 * Sends via Resend if RESEND_API_KEY is configured, or logs safely in development/staging.
 */
export async function sendEmail({
  to,
  subject,
  html,
  text,
  from,
  replyTo,
}: SendEmailOptions): Promise<SendEmailResult> {
  const sender = resolveSender(from)
  const reply = resolveReplyTo(replyTo)

  if (RESEND_API_KEY) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: sender,
          to,
          reply_to: reply,
          subject,
          html,
          text,
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        logger.error('Resend API delivery error:', data)
        return { success: false, error: data?.message || `Resend delivery failed (${response.status})` }
      }

      logger.info('Transactional email dispatched via Resend:', { to, subject, id: data.id, from: sender })
      return { success: true, messageId: data.id }
    } catch (err: any) {
      logger.error('Failed to dispatch email via Resend:', err)
      return { success: false, error: err?.message || 'Network error dispatching email' }
    }
  }

  // Development & fallback simulated delivery
  logger.info('[DEV EMAIL EMULATOR] Simulated transactional email:', {
    from: sender,
    to,
    reply_to: reply,
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
        <h1 style="color: #9a7651; font-size: 22px; margin-top: 0;">Welcome to BaseraBook, ${ownerName}!</h1>
        <p style="font-size: 14px; line-height: 22px; color: #555a6c;">
          Your 7-day unrestricted free trial is now active. You can immediately set up your property profile, configure rooms and units, and onboard residents.
        </p>
        <div style="margin: 28px 0;">
          <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://www.baserabook.in'}/dashboard" style="display: inline-block; background-color: #9a7651; color: #ffffff; font-weight: 600; font-size: 13px; text-decoration: none; padding: 12px 24px; border-radius: 10px;">
            Open Your Dashboard →
          </a>
        </div>
        <p style="font-size: 12px; color: #85899a; border-top: 1px solid #eee4d7; padding-top: 16px; margin-bottom: 0;">
          BaseraBook Technologies · Global Property & Rental Management SaaS
        </p>
      </div>
    </div>
  `
  return sendEmail({
    to,
    from: DEFAULT_EMAIL_FROM,
    replyTo: DEFAULT_EMAIL_REPLY_TO,
    subject: 'Welcome to BaseraBook — Your 7-Day Trial is Ready',
    html,
  })
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
          This is an automated formal receipt generated by BaseraBook on behalf of ${propertyName}.
        </p>
      </div>
    </div>
  `
  return sendEmail({
    to,
    from: DEFAULT_EMAIL_FROM,
    replyTo: DEFAULT_EMAIL_REPLY_TO,
    subject: `Payment Receipt: REC-${receiptId.slice(0, 8).toUpperCase()} from ${propertyName}`,
    html,
  })
}

export interface SendOtpEmailOptions {
  to: string
  otp: string
  purpose: 'signup' | 'password_reset'
  name?: string
  from?: string
  replyTo?: string
}

export async function sendOtpEmail({ to, otp, purpose, name, from, replyTo }: SendOtpEmailOptions) {
  const isReset = purpose === 'password_reset'
  const title = isReset ? 'Reset Your BaseraBook Password' : 'Verify Your BaseraBook Email'
  const greeting = name ? `Hello ${name},` : 'Hello,'
  const sender = from || DEFAULT_EMAIL_FROM
  const supportContact = replyTo || DEFAULT_EMAIL_REPLY_TO

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #faf7f2; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #2c221e;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #faf7f2; padding: 40px 16px;">
        <tr>
          <td align="center">
            <table role="presentation" width="100%" style="max-width: 540px; background-color: #ffffff; border: 1px solid #e8dfd4; border-radius: 20px; overflow: hidden; box-shadow: 0 4px 20px rgba(70, 50, 30, 0.04);">
              <!-- Brand Header -->
              <tr>
                <td style="background-color: #8b5a2b; padding: 24px 32px; text-align: left;">
                  <span style="font-size: 20px; font-weight: 700; color: #ffffff; letter-spacing: -0.02em;">BaseraBook</span>
                  <span style="display: block; font-size: 11px; text-transform: uppercase; letter-spacing: 0.14em; color: #f4e8dc; margin-top: 2px;">Your Property. Smartly Managed.</span>
                </td>
              </tr>

              <!-- Content Body -->
              <tr>
                <td style="padding: 32px 32px 24px 32px;">
                  <h1 style="font-size: 20px; font-weight: 700; color: #2c221e; margin: 0 0 12px 0;">
                    ${title}
                  </h1>
                  <p style="font-size: 14px; line-height: 22px; color: #555a6c; margin: 0 0 20px 0;">
                    ${greeting}
                  </p>
                  <p style="font-size: 14px; line-height: 22px; color: #555a6c; margin: 0 0 24px 0;">
                    ${isReset
                      ? 'We received a request to reset your password. Enter the 6-digit verification code below to set a new password:'
                      : 'Thank you for signing up for BaseraBook. Enter this 6-digit verification code to confirm your email and activate your workspace:'}
                  </p>

                  <!-- 6-Digit OTP Box -->
                  <div style="background-color: #faf7f2; border: 2px dashed #dec2a5; border-radius: 14px; padding: 20px; text-align: center; margin: 0 0 24px 0;">
                    <span style="font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace; font-size: 32px; font-weight: 800; letter-spacing: 10px; color: #8b5a2b; display: inline-block;">
                      ${otp}
                    </span>
                    <p style="font-size: 12px; font-weight: 600; color: #b46b1a; margin: 8px 0 0 0;">
                      ⏳ Valid for 5 minutes only
                    </p>
                  </div>

                  <!-- Security Advisory Card -->
                  <div style="background-color: #fbf8f4; border-left: 4px solid #8b5a2b; border-radius: 6px; padding: 12px 16px; margin: 0 0 24px 0;">
                    <p style="font-size: 12px; line-height: 18px; color: #6d655e; margin: 0;">
                      <strong>Security Notice:</strong> Never share this code with anyone. BaseraBook representatives will never ask for your verification code. If you did not request this code, no changes have been made to your account.
                    </p>
                  </div>

                  <p style="font-size: 13px; line-height: 20px; color: #7d756d; margin: 0;">
                    Need help? Reach out to our support team at <a href="mailto:${supportContact}" style="color: #8b5a2b; text-decoration: underline;">${supportContact}</a>.
                  </p>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="background-color: #faf7f2; border-top: 1px solid #ebe4da; padding: 20px 32px; text-align: center;">
                  <p style="font-size: 11px; color: #9c8e80; margin: 0 0 4px 0;">
                    © ${new Date().getFullYear()} BaseraBook Technologies · All rights reserved.
                  </p>
                  <p style="font-size: 10px; color: #b0a498; margin: 0;">
                    This is an automated security transmission. Please do not reply directly to this email.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `

  const subject = isReset
    ? `Your BaseraBook Password Reset Code: ${otp}`
    : `Your BaseraBook Verification Code: ${otp}`

  return sendEmail({
    to,
    from: sender,
    replyTo: supportContact,
    subject,
    html,
    text: `${title}\n\nYour 6-digit verification code is: ${otp}\n\nThis code expires in 5 minutes.\n\nSecurity Notice: If you did not make this request, please disregard this email.`,
  })
}

export interface SendSubscriptionEmailOptions {
  to: string
  customerName?: string
  planName: string
  billingInterval: 'month' | 'year' | 'monthly' | 'yearly'
  amount: number
  isTrial: boolean
  trialEnd?: string | null
  subscriptionId?: string
  from?: string
  replyTo?: string
}

/**
 * Sends a direct customer-facing subscription confirmation email to the authenticated user's email.
 * Dispatched immediately upon verified subscription or trial mandate authorization.
 */
export async function sendSubscriptionActivatedEmail({
  to,
  customerName,
  planName,
  billingInterval,
  amount,
  isTrial,
  trialEnd,
  subscriptionId,
  from,
  replyTo,
}: SendSubscriptionEmailOptions) {
  const sender = from || DEFAULT_EMAIL_FROM
  const supportContact = replyTo || DEFAULT_EMAIL_REPLY_TO
  const greeting = customerName ? `Hello ${customerName},` : 'Hello,'
  const intervalLabel =
    billingInterval === 'yearly' || billingInterval === 'year' ? 'Yearly' : 'Monthly'
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.baserabook.in'

  const formattedTrialDate = trialEnd
    ? new Date(trialEnd).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : null

  const subject = isTrial
    ? `🎉 Welcome to BaseraBook 7-Day Free Trial — ${planName} Plan Active`
    : `🎉 BaseraBook Subscription Confirmed — ${planName} Plan Active`

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${subject}</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #faf7f2; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #2c221e;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #faf7f2; padding: 40px 16px;">
        <tr>
          <td align="center">
            <table role="presentation" width="100%" style="max-width: 580px; background-color: #ffffff; border: 1px solid #e8dfd4; border-radius: 20px; overflow: hidden; box-shadow: 0 4px 20px rgba(70, 50, 30, 0.04);">
              <!-- Brand Header -->
              <tr>
                <td style="background-color: #8b5a2b; padding: 24px 32px; text-align: left;">
                  <span style="font-size: 22px; font-weight: 700; color: #ffffff; letter-spacing: -0.02em;">BaseraBook</span>
                  <span style="display: block; font-size: 11px; text-transform: uppercase; letter-spacing: 0.14em; color: #f4e8dc; margin-top: 2px;">Your Property. Smartly Managed.</span>
                </td>
              </tr>

              <!-- Content Body -->
              <tr>
                <td style="padding: 32px 32px 24px 32px;">
                  <h1 style="font-size: 20px; font-weight: 700; color: #2c221e; margin: 0 0 12px 0;">
                    ${isTrial ? 'Your 7-Day Free Trial is Active!' : 'Your Subscription is Active!'}
                  </h1>
                  <p style="font-size: 14px; line-height: 22px; color: #555a6c; margin: 0 0 20px 0;">
                    ${greeting}
                  </p>
                  <p style="font-size: 14px; line-height: 22px; color: #555a6c; margin: 0 0 24px 0;">
                    ${isTrial
                      ? `Thank you for activating your 7-day free trial on the <strong>${planName}</strong> plan. You have unrestricted access to all features included in your plan until <strong>${formattedTrialDate}</strong>.`
                      : `Thank you for subscribing to BaseraBook on the <strong>${planName}</strong> plan. Your payment has been authorized and your workspace is fully unlocked.`}
                  </p>

                  <!-- Plan Details Box -->
                  <div style="background-color: #faf7f2; border: 1px solid #dec2a5; border-radius: 14px; padding: 20px; margin: 0 0 24px 0;">
                    <table role="presentation" width="100%" style="font-size: 13px; color: #4a4038; border-collapse: collapse;">
                      <tr>
                        <td style="padding: 6px 0; color: #7d756d;">Plan Tier</td>
                        <td style="padding: 6px 0; text-align: right; font-weight: 700; color: #2c221e;">${planName} (${intervalLabel})</td>
                      </tr>
                      <tr>
                        <td style="padding: 6px 0; color: #7d756d;">Status</td>
                        <td style="padding: 6px 0; text-align: right; font-weight: 700; color: #166534;">
                          ${isTrial ? '7-Day Free Trial (Active)' : 'Active Subscriber'}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 6px 0; color: #7d756d;">Plan Price</td>
                        <td style="padding: 6px 0; text-align: right; font-weight: 700; color: #2c221e;">₹${amount.toLocaleString('en-IN')}/${intervalLabel.toLowerCase()}</td>
                      </tr>
                      ${isTrial && formattedTrialDate ? `
                      <tr>
                        <td style="padding: 6px 0; color: #7d756d;">Trial Ends On</td>
                        <td style="padding: 6px 0; text-align: right; font-weight: 700; color: #8b5a2b;">${formattedTrialDate}</td>
                      </tr>
                      <tr>
                        <td style="padding: 6px 0; color: #7d756d;">First Charge</td>
                        <td style="padding: 6px 0; text-align: right; font-weight: 600; color: #7d756d;">Only after trial ends</td>
                      </tr>
                      ` : ''}
                      ${subscriptionId ? `
                      <tr style="border-top: 1px solid #ebd8c5;">
                        <td style="padding: 10px 0 0 0; color: #9c8e80; font-size: 11px;">Subscription ID</td>
                        <td style="padding: 10px 0 0 0; text-align: right; font-family: monospace; font-size: 11px; color: #7d756d;">${subscriptionId}</td>
                      </tr>
                      ` : ''}
                    </table>
                  </div>

                  <!-- CTA Button -->
                  <div style="text-align: center; margin: 28px 0;">
                    <a href="${appUrl}/dashboard" style="display: inline-block; background-color: #8b5a2b; color: #ffffff; font-weight: 600; font-size: 14px; text-decoration: none; padding: 14px 28px; border-radius: 12px; box-shadow: 0 2px 8px rgba(139, 90, 43, 0.25);">
                      Open Your BaseraBook Dashboard →
                    </a>
                  </div>

                  <p style="font-size: 13px; line-height: 20px; color: #7d756d; margin: 0;">
                    Have questions or need assistance setting up your properties? Contact our support team anytime at <a href="mailto:${supportContact}" style="color: #8b5a2b; text-decoration: underline;">${supportContact}</a>.
                  </p>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="background-color: #faf7f2; border-top: 1px solid #ebe4da; padding: 20px 32px; text-align: center;">
                  <p style="font-size: 11px; color: #9c8e80; margin: 0 0 4px 0;">
                    © ${new Date().getFullYear()} BaseraBook Technologies · All rights reserved.
                  </p>
                  <p style="font-size: 10px; color: #b0a498; margin: 0;">
                    This is an automated customer confirmation. You are receiving this because of your subscription to BaseraBook.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `

  const plainText = `${subject}\n\n${greeting}\n\n` +
    (isTrial
      ? `Your 7-day free trial on the ${planName} plan (${intervalLabel}) is now active until ${formattedTrialDate || '7 days'}.\n` +
        `Plan Price: ₹${amount.toLocaleString('en-IN')}/${intervalLabel.toLowerCase()}.\n` +
        `No charge will be made until your trial period concludes.`
      : `Your ${planName} plan (${intervalLabel}) subscription is now active.\n` +
        `Amount: ₹${amount.toLocaleString('en-IN')}/${intervalLabel.toLowerCase()}.`) +
    (subscriptionId ? `\nSubscription ID: ${subscriptionId}` : '') +
    `\n\nAccess your dashboard: ${appUrl}/dashboard\n\nSupport: ${supportContact}`

  return sendEmail({
    to,
    from: sender,
    replyTo: supportContact,
    subject,
    html,
    text: plainText,
  })
}

