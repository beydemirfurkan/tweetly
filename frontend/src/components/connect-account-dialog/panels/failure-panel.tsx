'use client';

import { useTranslations } from 'next-intl';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { LoginJobResponse } from '@/lib/api';

export function FailurePanel({
  reason,
  detail,
  onRetry,
}: {
  reason: NonNullable<LoginJobResponse['failureReason']>;
  detail: string | null;
  onRetry: () => void;
}) {
  const t = useTranslations('connectDialog');
  return (
    <div className="space-y-3 pt-2">
      <div className="flex items-start gap-2 rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="space-y-1">
          <p className="font-medium">{t(`failureReasons.${reason}`)}</p>
          {detail && (
            <p className="text-[11px] opacity-70">
              {t('techDetail')}: {detail}
            </p>
          )}
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onRetry}>
          {t('tryAgain')}
        </Button>
      </div>
    </div>
  );
}
