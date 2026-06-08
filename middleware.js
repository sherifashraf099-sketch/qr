import { NextResponse } from 'next/server';

export function middleware(request) {
  const { pathname } = request.nextUrl;

  // Let the login page through — that's where we redirect unauthenticated users
  if (pathname === '/admin/login') {
    return NextResponse.next();
  }

  const session = request.cookies.get('admin_session');

  if (!session || session.value !== process.env.ADMIN_PASSWORD) {
    return NextResponse.redirect(new URL('/admin/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin', '/admin/:path*'],
};
