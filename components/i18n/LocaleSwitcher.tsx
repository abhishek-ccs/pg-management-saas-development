'use client'

import { Languages } from 'lucide-react'
import { useI18n } from '@/lib/i18n'

export function LocaleSwitcher({ className = '' }: { className?: string }) {
  const { locale, toggleLocale } = useI18n()

  return (
    <button
      onClick={toggleLocale}
      type="button"
      aria-label={`Switch language to ${locale === 'en' ? 'Hindi' : 'English'}`}
      className={`inline-flex items-center gap-1.5 rounded-xl border border-[#dcd3c5] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#555a6c] shadow-2xs hover:bg-[#fbf8f3] hover:text-[#202536] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9a7651] ${className}`}
    >
      <Languages className="size-3.5 text-[#9a7651]" />
      <span className="font-medium">
        {locale === 'en' ? (
          <span>
            <strong className="text-[#9a7651]">EN</strong> / हिन्दी
          </span>
        ) : (
          <span>
            EN / <strong className="text-[#9a7651]">हिन्दी</strong>
          </span>
        )}
      </span>
    </button>
  )
}
