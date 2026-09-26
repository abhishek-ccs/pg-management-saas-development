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

  // 1. Unauthenticated guards
  if (!user && pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(pathname)}`, request.url))
  }

  if (!user && pathname.startsWith('/admin') && !pathname.startsWith('/admin/login')) {
    return NextResponse.redirect(new URL(`/admin/login?next=${encodeURIComponent(pathname)}`, request.url))
  }

  // 2. Authenticated guards & Role-Based Access Control
  if (user) {
    // Admin routes protection: Only super_admin accounts can access /admin and subroutes
    if (pathname.startsWith('/admin') && !pathname.startsWith('/admin/login')) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role,status')
        .eq('id', user.id)
        .maybeSingle()

      if (profile?.role !== 'super_admin' || profile?.status !== 'active') {
        return NextResponse.redirect(new URL('/dashboard', request.url))
      }
    }

    // Admin login page: If already logged in as super_admin, go directly to /admin
    if (pathname === '/admin/login') {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role,status')
        .eq('id', user.id)
        .maybeSingle()

      if (profile?.role === 'super_admin' && profile?.status === 'active') {
        return NextResponse.redirect(new URL('/admin', request.url))
      }
    }

    // Public auth pages (login / signup): Redirect already logged in users
    if (pathname === '/login' || pathname === '/signup') {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role,status')
        .eq('id', user.id)
        .maybeSingle()

      if (profile?.role === 'super_admin' && profile?.status === 'active') {
        return NextResponse.redirect(new URL('/admin', request.url))
      }
      return NextResponse.redirect(new URL('/dashboard', request.url))
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
        return NextResponse.redirect(new URL('/login?error=suspended', request.url))
      }
    }
  }

  return response
}
