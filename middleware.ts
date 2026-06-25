import { NextResponse, type NextRequest } from 'next/server'

// Middleware runs in Edge Runtime — no Node.js APIs available.
// We do a lightweight cookie check here for routing; actual token
// validation happens in server component layouts via createClient().
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isAuthRoute = pathname.startsWith('/login')
  const isPublicRoute = pathname === '/'
  const isApiRoute = pathname.startsWith('/api/')

  // Supabase stores the session in cookies prefixed with the project ref.
  // Checking existence is enough for routing; layouts verify the token server-side.
  const cookies = request.cookies.getAll()
  const hasSession = cookies.some(c => c.name.startsWith('sb-') && c.name.endsWith('-auth-token'))

  if (!hasSession && !isAuthRoute && !isPublicRoute && !isApiRoute) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (hasSession && isAuthRoute) {
    return NextResponse.redirect(new URL('/pos', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.json|icon-|.*\\.png$).*)'],
}
