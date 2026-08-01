'use client';

import { Suspense } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

function AdminLayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const params = new URLSearchParams();
  for (const key of ['token', 'theme', 'ui_mode', 'lang']) {
    const value = searchParams.get(key);
    if (value) params.set(key, value);
  }
  return (
    <div>
      <nav className="admin-activity-nav">
        <a className={pathname.startsWith('/admin/lottery') ? 'is-active' : ''} href={`/admin/lottery?${params}`}>
          大转盘
        </a>
      </nav>
      {children}
    </div>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense>
      <AdminLayoutInner>{children}</AdminLayoutInner>
    </Suspense>
  );
}
