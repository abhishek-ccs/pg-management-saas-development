'use client'

import { useEffect } from 'react'
import { logger } from '@/lib/logger'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    logger.error('Critical Root Layout Exception caught by GlobalError:', error, {
      digest: error.digest,
    })
  }, [error])

  return (
    <html lang="en">
      <body className="min-h-screen bg-[#fbf8f3] text-[#403a34] flex items-center justify-center p-6">
        <main id="main-content" className="max-w-md text-center">
          <h1 className="text-2xl font-bold tracking-tight text-[#3d3934]">
            Application Error
          </h1>
          <p className="mt-2 text-sm leading-6 text-[#595e70]">
            A critical error prevented the application from loading. Please refresh or try again.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <button
              onClick={() => reset()}
              className="rounded-xl bg-[#9a7651] px-5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-[#866342]"
            >
              Reload Application
            </button>
          </div>
        </main>
      </body>
    </html>
  )
}
