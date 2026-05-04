'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { useAuth } from '@/lib/auth-context';
import { Sidebar } from '@/components/sidebar';
import { Bird, Menu } from 'lucide-react';

function LoadingScreen({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-foreground text-background">
          <Bird className="h-5 w-5" strokeWidth={2.5} />
        </div>
        <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          <span className="text-primary">●</span> {message}
        </span>
      </div>
    </div>
  );
}

export default function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = useTranslations('panel');
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setSidebarOpen(false), 0);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}` as '/login');
    }
  }, [isAuthenticated, isLoading, pathname, router]);

  if (isLoading) {
    return <LoadingScreen message={t('loading')} />;
  }

  if (!isAuthenticated) {
    return <LoadingScreen message={t('redirecting')} />;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="flex-1 overflow-y-auto">
        {/* Mobile top bar */}
        <div className="flex items-center gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur-sm lg:hidden">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" strokeWidth={2} />
          </button>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-foreground text-background">
              <Bird className="h-3.5 w-3.5" strokeWidth={2.5} />
            </div>
            <span className="text-[14px] font-extrabold tracking-tight">xtweetly</span>
          </div>
        </div>

        <div className="p-4 sm:p-6">{children}</div>
      </main>
    </div>
  );
}
