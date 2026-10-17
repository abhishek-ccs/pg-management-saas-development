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
      className={`inline-flex items-center justify-center rounded-xl border border-[#dcd3c5] bg-white px-2 py-1.5 sm:px-2.5 sm:py-1.5 text-xs font-semibold text-[#555a6c] shadow-2xs hover:bg-[#fbf8f3] hover:text-[#202536] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9a7651] shrink-0 min-h-[34px] cursor-pointer ${className}`}
    >
      {/* Mobile Compact View (<sm): Minimal pill */}
      <span className="sm:hidden inline-flex items-center gap-1 text-[11px] font-semibold tracking-tight">
        <Languages className="hidden min-[380px]:inline-block size-3 text-[#9a7651] shrink-0" />
        {locale === 'en' ? (
          <span>
            <strong className="text-[#8b5a2b] font-bold">EN</strong>
            <span className="text-[#c4b5a5] mx-0.5">/</span>
            <span className="text-[#8c7b6c]">हि</span>
          </span>
        ) : (
          <span>
            <span className="text-[#8c7b6c]">EN</span>
            <span className="text-[#c4b5a5] mx-0.5">/</span>
            <strong className="text-[#8b5a2b] font-bold">हि</strong>
          </span>
        )}
      </span>

      {/* Desktop View (sm+): Full text with icon */}
      <span className="hidden sm:inline-flex items-center gap-1.5">
        <Languages className="size-3.5 text-[#9a7651] shrink-0" />
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
      </span>
    </button>
  )
}

