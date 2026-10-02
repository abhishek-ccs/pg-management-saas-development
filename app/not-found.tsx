import Link from 'next/link'
import { Building2, Home, ArrowLeft } from 'lucide-react'
import { SUPPORT_EMAIL, getMailtoSupport } from '@/lib/constants'

export default function NotFound() {
  return (
    <main id="main-content" className="min-h-screen bg-[#fbf8f3] text-[#403a34] flex flex-col justify-between">
      <header className="border-b border-[#eee4d7]/90 bg-[#fbf8f3]/95 px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-[#9a7651] text-white">
              <Building2 className="size-5" />
            </span>
            <span className="text-base font-bold tracking-tight">StayBook</span>
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-xl px-6 py-16 text-center">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#9a7651]">404 Not Found</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-[#3d3934] sm:text-4xl">
          Page not found
        </h1>
        <p className="mt-3 text-sm leading-6 text-[#595e70]">
          The page you are looking for does not exist, has been removed, or the link may have expired.
        </p>

        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/"
            className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-[#9a7651] px-5 py-3 text-xs font-semibold text-white shadow-sm hover:bg-[#866342] transition-colors"
          >
            <Home className="size-4" />
            Return to Homepage
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl border border-[#dcd3c5] bg-white px-5 py-3 text-xs font-semibold text-[#403a34] hover:bg-[#f7f3ed] transition-colors"
          >
            <ArrowLeft className="size-4" />
            Owner Dashboard
          </Link>
        </div>

        <p className="mt-6 text-xs text-[#85899a]">
          Need help? Reach out to{' '}
          <a
            href={getMailtoSupport('StayBook 404 Page Assistance')}
            className="font-semibold text-[#9a7651] underline"
          >
            {SUPPORT_EMAIL}
          </a>
        </p>
      </div>

      <footer className="border-t border-[#eee4d7] bg-[#fbf8f3] py-6 text-center text-xs text-[#776d62]">
        <p>&copy; {new Date().getFullYear()} StayBook. All rights reserved.</p>
      </footer>
    </main>
  )
}
