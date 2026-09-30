'use client'

import React, { createContext, useContext, useEffect, useState, useMemo } from 'react'
import type { Dictionary, SupportedCurrency, SupportedLocale } from './types'
import { getDictionary, formatCurrency as baseFormatCurrency, formatDate as baseFormatDate } from './index'
import { createClient } from '@/lib/supabase/client'

interface I18nContextType {
  locale: SupportedLocale
  setLocale: (locale: SupportedLocale) => void
  toggleLocale: () => void
  t: Dictionary
  formatCurrency: (amount: number | string, currency?: SupportedCurrency) => string
  formatDate: (
    dateInput: string | Date | null | undefined,
    timeZone?: string,
    options?: Intl.DateTimeFormatOptions
  ) => string
}

const I18nContext = createContext<I18nContextType | null>(null)

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<SupportedLocale>('en')
  const [isInitialized, setIsInitialized] = useState(false)

  // Initialize from storage or cookies on client mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('staynest_locale') as SupportedLocale | null
      let activeLocale: SupportedLocale = 'en'
      if (stored === 'en' || stored === 'hi') {
        activeLocale = stored
      } else {
        const match = document.cookie.match(/staynest_locale=(en|hi)/)
        if (match && (match[1] === 'en' || match[1] === 'hi')) {
          activeLocale = match[1] as SupportedLocale
        }
      }
      setLocaleState(activeLocale)
      document.documentElement.lang = activeLocale
    } catch {
      // Fallback gracefully
    } finally {
      setIsInitialized(true)
    }
  }, [])

  const setLocale = (newLocale: SupportedLocale) => {
    setLocaleState(newLocale)
    try {
      localStorage.setItem('staynest_locale', newLocale)
      document.cookie = `staynest_locale=${newLocale}; path=/; max-age=31536000; SameSite=Lax`
      document.documentElement.lang = newLocale
    } catch {
      // Storage access blocked or restricted
    }

    // Persist to user profile in Supabase if logged in
    try {
      const supabase = createClient()
      supabase.auth.getUser().then((res: any) => {
        const user = res?.data?.user
        if (user) {
          supabase
            .from('profiles')
            .update({ preferred_language: newLocale })
            .eq('id', user.id)
            .then(() => {})
        }
      })
    } catch {
      // Ignore background persistence failure
    }
  }

  const toggleLocale = () => {
    setLocale(locale === 'en' ? 'hi' : 'en')
  }

  const t = useMemo(() => getDictionary(locale), [locale])

  const formatCurrency = (amount: number | string, currency: SupportedCurrency = 'INR') => {
    return baseFormatCurrency(amount, currency, locale)
  }

  const formatDate = (
    dateInput: string | Date | null | undefined,
    timeZone: string = 'Asia/Kolkata',
    options?: Intl.DateTimeFormatOptions
  ) => {
    return baseFormatDate(dateInput, timeZone, locale, options)
  }

  return (
    <I18nContext.Provider
      value={{
        locale,
        setLocale,
        toggleLocale,
        t,
        formatCurrency,
        formatDate,
      }}
    >
      {children}
    </I18nContext.Provider>
  )
}

export function useI18n(): I18nContextType {
  const context = useContext(I18nContext)
  if (!context) {
    // Graceful fallback outside provider
    const fallbackDictionary = getDictionary('en')
    return {
      locale: 'en',
      setLocale: () => {},
      toggleLocale: () => {},
      t: fallbackDictionary,
      formatCurrency: (amt) => baseFormatCurrency(amt, 'INR', 'en'),
      formatDate: (dt) => baseFormatDate(dt, 'Asia/Kolkata', 'en'),
    }
  }
  return context
}

export const useTranslation = useI18n
