import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies: { getAll: () => request.cookies.getAll(), setAll: (items) => { items.forEach(({ name, value }) => request.cookies.set(name, value)); response = NextResponse.next({ request }); items.forEach(({ name, value, options }) => response.cookies.set(name, value, options)) } } })
  const { data: { user } } = await supabase.auth.getUser()
  const pathname = request.nextUrl.pathname
  if (!user && pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(pathname)}`, request.url))
  }
  if (!user && pathname === '/admin') {
    return NextResponse.redirect(new URL('/admin/login', request.url))
  }
  if (user && (pathname === '/login' || pathname === '/signup')) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }
  if (user && pathname === '/admin/login') {
    const { data: profile } = await supabase.from('profiles').select('role,status').eq('id', user.id).maybeSingle()
    if (profile?.role === 'super_admin' && profile.status === 'active') return NextResponse.redirect(new URL('/admin', request.url))
  }
  return response
}
