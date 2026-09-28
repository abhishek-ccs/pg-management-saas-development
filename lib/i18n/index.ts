import { enDictionary } from './dictionaries/en'
import { hiDictionary } from './dictionaries/hi'
import type { Dictionary, SupportedCurrency, SupportedLocale } from './types'

export * from './types'

const dictionaries: Record<SupportedLocale, Dictionary> = {
  en: enDictionary,
  hi: hiDictionary,
}

export function getDictionary(locale: SupportedLocale = 'en'): Dictionary {
  return dictionaries[locale] || dictionaries.en
}

/**
 * Enterprise Multi-Currency Formatter
 * Formats amounts according to property currency and user locale.
 */
export function formatCurrency(
  amount: number | string,
  currency: SupportedCurrency = 'INR',
  locale: SupportedLocale = 'en'
): string {
  const numericAmount = typeof amount === 'number' ? amount : Number(amount || 0)

  const localeCode = locale === 'hi' ? 'hi-IN' : currency === 'INR' ? 'en-IN' : 'en-US'

  try {
    return new Intl.NumberFormat(localeCode, {
      style: 'currency',
      currency,
      maximumFractionDigits: currency === 'INR' ? 0 : 2,
    }).format(numericAmount)
  } catch {
    const symbolMap: Record<SupportedCurrency, string> = {
      INR: '₹',
      USD: '$',
      EUR: '€',
      GBP: '£',
      AED: 'AED ',
    }
    return `${symbolMap[currency] || '₹'}${numericAmount.toLocaleString()}`
  }
}

/**
 * Timezone-Aware Date Formatter
 */
export function formatDate(
  dateInput: string | Date | null | undefined,
  timeZone: string = 'Asia/Kolkata',
  locale: SupportedLocale = 'en',
  options: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }
): string {
  if (!dateInput) return '—'
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput
  if (isNaN(date.getTime())) return '—'

  try {
    return new Intl.DateTimeFormat(locale === 'hi' ? 'hi-IN' : 'en-IN', {
      timeZone,
      ...options,
    }).format(date)
  } catch {
    return date.toLocaleDateString()
  }
}

/**
 * E.164 International Phone Formatter & Normalizer
 */
export function formatInternationalPhone(rawPhone: string, defaultCountryCode = '+91'): string {
  if (!rawPhone) return ''
  const cleaned = rawPhone.replace(/[^\d+]/g, '')
  if (cleaned.startsWith('+')) return cleaned
  if (cleaned.length === 10) return `${defaultCountryCode} ${cleaned.slice(0, 5)} ${cleaned.slice(5)}`
  return cleaned
}
