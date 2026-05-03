'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw, ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function PanelError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    console.error('[Panel Error]', error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full border border-destructive/40 bg-destructive/10">
        <AlertTriangle className="h-6 w-6 text-destructive" />
      </div>
      <div className="space-y-2 max-w-md">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-destructive">
          <span className="animate-pulse-dot">●</span> Error
        </p>
        <h2 className="text-[28px] font-black leading-tight tracking-[-0.025em]">
          Bir şeyler ters gitti
        </h2>
        <p className="text-[14px] leading-[1.55] text-muted-foreground">
          {error.message || 'Beklenmedik bir hata oluştu. Lütfen tekrar deneyin.'}
        </p>
        {error.digest && (
          <p className="pt-1 font-mono text-[11px] text-muted-foreground/60">
            digest: {error.digest}
          </p>
        )}
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => router.back()} className="gap-1.5">
          <ArrowLeft className="h-3.5 w-3.5" />
          Geri
        </Button>
        <Button size="sm" onClick={unstable_retry} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" />
          Tekrar Dene
        </Button>
      </div>
    </div>
  );
}
