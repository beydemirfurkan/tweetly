'use client';

import { useAuth } from '@/lib/auth-context';
import { Sidebar } from '@/components/sidebar';

export default function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-sm text-muted-foreground">Yukleniyor...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    if (typeof window !== 'undefined') {
      window.location.href = '/panel/login';
    }
    return null;
  }

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}
