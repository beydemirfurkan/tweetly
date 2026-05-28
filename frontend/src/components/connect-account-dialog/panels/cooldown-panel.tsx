'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Clock, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { LoginCooldownPayload } from '@/lib/api';

export function CooldownPanel({
  payload,
  onDone,
}: {
  payload: LoginCooldownPayload;
  onDone: () => void;
}) {
  const t = useTranslations('connectDialog');
  const retryAtMs = useMemo(() => new Date(payload.retryAt).getTime(), [payload.retryAt]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);

  const remainingSec = Math.max(0, Math.ceil((retryAtMs - now) / 1000));
  const mm = Math.floor(remainingSec / 60).toString().padStart(2, '0');
  const ss = (remainingSec % 60).toString().padStart(2, '0');
  const countdown = `${mm}:${ss}`;
  const expired = remainingSec === 0;
  const requiresManual = payload.manualReviewRequired;

  return (
    <div className="space-y-3 pt-2">
      <div
        className={`flex items-start gap-2 rounded-md border px-3 py-2.5 text-sm ${
          requiresManual
            ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
            : 'border-primary/40 bg-primary/10 text-primary'
        }`}
      >
        {requiresManual ? (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        ) : (
          <Clock className="mt-0.5 h-4 w-4 shrink-0" />
        )}
        <div className="space-y-1.5 flex-1">
          <p className="font-medium">
            {requiresManual ? t('cooldownManualTitle') : t('cooldownTitle')}
          </p>
          <p className="text-xs opacity-90">
            {requiresManual
              ? t('cooldownManualBody', { count: payload.failureCount, countdown })
              : t('cooldownBody', { countdown })}
          </p>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onDone} disabled={!expired}>
          {expired ? t('tryAgain') : countdown}
        </Button>
      </div>
    </div>
  );
}
