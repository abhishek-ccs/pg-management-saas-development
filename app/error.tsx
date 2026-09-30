'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { AlertTriangle, RotateCcw, Home } from 'lucide-react'
import { logger } from '@/lib/logger'
import { SUPPORT_EMAIL, getMailtoSupport } from '@/lib/constants'

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    logger.error('Application runtime exception caught by ErrorBoundary:', error, {
      digest: error.digest,
    })
  }, [error])

  return (
    <main id="main-content" className="min-h-screen bg-[#fbf8f3] text-[#403a34] flex flex-col justify-between">
      <header className="border-b border-[#eee4d7]/90 bg-[#fbf8f3]/95 px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <Link href="/" className="text-base font-bold tracking-tight text-[#9a7651]">
            StayNest
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-xl px-6 py-16 text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#fee2e2] text-[#dc2626]">
          <AlertTriangle className="size-6" />
        </div>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-[#3d3934] sm:text-3xl">
          Something went wrong
        </h1>
        <p className="mt-2 text-sm leading-6 text-[#595e70]">
          We encountered an unexpected error while processing your request. Your property data remains safe.
        </p>
        {error.digest && (
          <p className="mt-2 font-mono text-[11px] text-[#85899a]">
            Error Reference ID: {error.digest}
          </p>
        )}

        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={() => reset()}
            className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-[#9a7651] px-5 py-3 text-xs font-semibold text-white shadow-sm hover:bg-[#866342] transition-colors"
          >
            <RotateCcw className="size-4" />
            Try Again
          </button>
          <Link
            href="/"
            className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl border border-[#dcd3c5] bg-white px-5 py-3 text-xs font-semibold text-[#403a34] hover:bg-[#f7f3ed] transition-colors"
          >
            <Home className="size-4" />
            Return Home
          </Link>
        </div>

        <p className="mt-6 text-xs text-[#85899a]">
          If this issue persists, please report it to{' '}
          <a
            href={getMailtoSupport('StayNest Error Report')}
            className="font-semibold text-[#9a7651] underline"
          >
            {SUPPORT_EMAIL}
          </a>
        </p>
      </div>

      <footer className="border-t border-[#eee4d7] bg-[#fbf8f3] py-6 text-center text-xs text-[#776d62]">
        <p>&copy; {new Date().getFullYear()} StayNest. All rights reserved.</p>
      </footer>
    </main>
  )
}
