'use client';

import { useTranslations } from 'next-intl';
import { CheckCircle2 } from 'lucide-react';

export function SuccessPanel({ accountId }: { accountId: string }) {
  const t = useTranslations('connectDialog');
  return (
    <div className="space-y-3 pt-2 text-center">
      <div className="flex justify-center">
        <CheckCircle2 className="h-10 w-10 text-emerald-400" />
      </div>
      <div>
        <p className="text-sm font-medium">{t('successTitle')}</p>
        {accountId && (
          <p className="text-xs text-muted-foreground">
            {t.rich('successDesc', {
              accountId,
              handle: (chunks) => <span className="font-mono">{chunks}</span>,
            })}
          </p>
        )}
      </div>
    </div>
  );
}
