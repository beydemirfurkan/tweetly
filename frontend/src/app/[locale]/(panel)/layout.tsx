'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { useAuth } from '@/lib/auth-context';
import { Sidebar } from '@/components/sidebar';
import { Bird } from 'lucide-react';

function LoadingScreen({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <div className="relative flex h-12 w-12 items-center justify-center">
          <div className="absolute inset-0 rounded-xl border border-primary/30 bg-primary/10" />
          <div className="absolute inset-[-4px] rounded-[14px] border border-primary/10 animate-spin-slow" />
          <Bird className="h-5 w-5 text-primary" />
        </div>
        <span className="text-xs tracking-widest text-muted-foreground uppercase">
          {message}
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
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
