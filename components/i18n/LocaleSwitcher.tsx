'use client'

import { useEffect, useState } from 'react'
import { Languages } from 'lucide-react'
import type { SupportedLocale } from '@/lib/i18n'

export function LocaleSwitcher() {
  const [currentLocale, setCurrentLocale] = useState<SupportedLocale>('en')

  useEffect(() => {
    const saved = localStorage.getItem('staynest_locale') as SupportedLocale
    if (saved && (saved === 'en' || saved === 'hi')) {
      setCurrentLocale(saved)
    }
  }, [])

  function handleToggle() {
    const nextLocale: SupportedLocale = currentLocale === 'en' ? 'hi' : 'en'
    setCurrentLocale(nextLocale)
    localStorage.setItem('staynest_locale', nextLocale)
    document.cookie = `staynest_locale=${nextLocale}; path=/; max-age=31536000; SameSite=Lax`
    window.location.reload()
  }

  return (
    <button
      onClick={handleToggle}
      type="button"
      aria-label={`Switch language to ${currentLocale === 'en' ? 'Hindi' : 'English'}`}
      className="inline-flex items-center gap-1.5 rounded-xl border border-[#dcd3c5] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#555a6c] shadow-2xs hover:bg-[#fbf8f3] hover:text-[#202536] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9a7651]"
    >
      <Languages className="size-3.5 text-[#9a7651]" />
      <span>{currentLocale === 'en' ? 'EN' : 'हिन्दी'}</span>
    </button>
  )
}
