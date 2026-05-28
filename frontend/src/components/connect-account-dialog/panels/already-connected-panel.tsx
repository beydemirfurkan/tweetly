'use client';

import { useTranslations } from 'next-intl';
import { UserCheck, ArrowRight } from 'lucide-react';
import { Link } from '@/i18n/navigation';

export function AlreadyConnectedPanel({
  accountId,
  onClose,
}: {
  accountId: string;
  onClose: () => void;
}) {
  const t = useTranslations('connectDialog');
  return (
    <div className="space-y-3 pt-2">
      <div className="flex items-start gap-2 rounded-md border border-emerald-500/25 bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-300">
        <UserCheck className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="space-y-1.5 flex-1">
          <p className="font-medium">{t('alreadyConnectedTitle')}</p>
          <p className="text-xs opacity-90">
            {t.rich('alreadyConnectedBody', {
              accountId,
              handle: (chunks) => <span className="font-mono">{chunks}</span>,
            })}
          </p>
        </div>
      </div>
      <div className="flex justify-end">
        <Link
          href={'/accounts' as const}
          onClick={onClose}
          className="pill inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-semibold text-background transition-colors hover:opacity-90"
        >
          {t('alreadyConnectedCta')}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
