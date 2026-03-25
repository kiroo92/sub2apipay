import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const response = NextResponse.next();

  // 自动从 SUB2API_BASE_URL 提取 origin，允许 Sub2API 主站 iframe 嵌入
  const sub2apiUrl = process.env.SUB2API_BASE_URL || '';
  const extraOrigins = process.env.IFRAME_ALLOW_ORIGINS || '';

  const origins = new Set<string>();

  if (sub2apiUrl) {
    try {
      origins.add(new URL(sub2apiUrl).origin);
    } catch {
      // ignore invalid URL
    }
  }

  for (const s of extraOrigins.split(',')) {
    const trimmed = s.trim();
    if (trimmed) origins.add(trimmed);
  }

  if (origins.size > 0) {
    response.headers.set('Content-Security-Policy', `frame-ancestors 'self' ${[...origins].join(' ')}`);
  }

  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'SAMEORIGIN');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
