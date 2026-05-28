'use client';

import { useTranslations } from 'next-intl';
import { Loader2, Ban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { LoginJobResponse } from '@/lib/api';

export function PollingPanel({
  status,
  cancelling,
  onCancel,
}: {
  status: LoginJobResponse['status'];
  cancelling: boolean;
  onCancel?: () => void;
}) {
  const t = useTranslations('connectDialog');
  const headline = cancelling
    ? t('cancelling')
    : status === 'queued'
      ? t('queued')
      : t('running');
  return (
    <div className="space-y-3 pt-2">
      <div className="space-y-3 text-center">
        <div className="flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium">{headline}</p>
          <p className="text-xs text-muted-foreground">
            {cancelling ? t('cancellingHint') : t('durationHint')}
          </p>
        </div>
      </div>
      {onCancel && (
        <div className="flex justify-center pt-1">
          <Button variant="outline" size="sm" onClick={onCancel}>
            <Ban className="h-3.5 w-3.5" />
            {t('cancelLogin')}
          </Button>
        </div>
      )}
    </div>
  );
}
