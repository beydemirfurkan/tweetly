'use client';

import { useTranslations } from 'next-intl';
import { Ban } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function CancelledPanel({ onClose }: { onClose: () => void }) {
  const t = useTranslations('connectDialog');
  return (
    <div className="space-y-3 pt-2">
      <div className="flex items-start gap-2 rounded-md border border-border/60 bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
        <Ban className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="space-y-1">
          <p className="font-medium text-foreground">{t('cancelledTitle')}</p>
          <p className="text-xs opacity-90">{t('cancelledBody')}</p>
        </div>
      </div>
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={onClose}>
          {t('close')}
        </Button>
      </div>
    </div>
  );
}
