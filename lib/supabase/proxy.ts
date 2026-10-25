import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    return response
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseKey,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (items) => {
          items.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          items.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const pathname = request.nextUrl.pathname

  // Helper: preserve updated session cookies across redirects
  function redirectWithCookies(targetUrl: URL | string, status: number = 307) {
    const redirectResponse = NextResponse.redirect(targetUrl, status)
    response.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie.name, cookie.value, cookie)
    })
    return redirectResponse
  }

  // 1. Unauthenticated guards
  if (!user && pathname.startsWith('/dashboard')) {
    return redirectWithCookies(new URL(`/login?next=${encodeURIComponent(pathname)}`, request.url))
  }

  // 2. Authenticated guards & Role-Based Access Control
  if (user) {
    // Returning User Experience: Direct access to customer dashboard when a valid session exists
    // (Preserves ability to view public marketing landing page if explicit ?stay=true is requested)
    if (pathname === '/' && !request.nextUrl.searchParams.has('stay') && !request.nextUrl.searchParams.has('preview')) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role,status')
        .eq('id', user.id)
        .maybeSingle()

      if (profile?.status !== 'suspended') {
        return redirectWithCookies(new URL('/dashboard', request.url))
      }
    }

    // Public auth pages (login / signup / forgot-password): Redirect already logged in users
    if (pathname === '/login' || pathname === '/signup' || pathname === '/forgot-password') {
      return redirectWithCookies(new URL('/dashboard', request.url))
    }

    // Email verification guard: users must verify their email before accessing features that require a verified account
    if (pathname.startsWith('/dashboard') && !user.email_confirmed_at) {
      await supabase.auth.signOut()
      return redirectWithCookies(new URL('/login?error=unverified', request.url))
    }

    // Suspended account guard for dashboard
    if (pathname.startsWith('/dashboard')) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('status')
        .eq('id', user.id)
        .maybeSingle()

      if (profile?.status === 'suspended') {
        await supabase.auth.signOut()
        return redirectWithCookies(new URL('/login?error=suspended', request.url))
      }
    }
  }

  return response
}
