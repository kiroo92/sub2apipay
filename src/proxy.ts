import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

function isAllowedPath(pathname: string) {
  return (
    pathname === '/' ||
    pathname === '/lottery' ||
    pathname === '/admin' ||
    pathname.startsWith('/admin/') ||
    pathname === '/api/lottery' ||
    pathname.startsWith('/api/lottery/') ||
    pathname === '/api/admin/lottery' ||
    pathname === '/favicon.ico' ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/icons/') ||
    /\.(?:png|jpe?g|webp|gif|ico|svg|css|js|map|woff2?)$/i.test(pathname)
  );
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (!isAllowedPath(pathname)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/lottery';
    return NextResponse.redirect(redirectUrl);
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-pathname', pathname);
  requestHeaders.set('x-search', search.replace(/^\?/, ''));
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  const origins = new Set<string>();
  const sub2apiUrl = process.env.SUB2API_BASE_URL;
  if (sub2apiUrl) {
    try {
      origins.add(new URL(sub2apiUrl).origin);
    } catch {
      // Invalid configuration is reported by config.ts when the app handles a request.
    }
  }
  for (const origin of (process.env.IFRAME_ALLOW_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)) {
    origins.add(origin);
  }
  if (origins.has('*')) {
    response.headers.set('Content-Security-Policy', 'frame-ancestors *');
  } else if (origins.size > 0) {
    response.headers.set('Content-Security-Policy', `frame-ancestors 'self' ${[...origins].join(' ')}`);
  } else {
    response.headers.set('X-Frame-Options', 'SAMEORIGIN');
  }
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  return response;
}

export const config = { matcher: ['/((?!_next/static|_next/image).*)'] };
