'use client';

import { useTranslations } from 'next-intl';
import { ErrorState } from '@/components/error-state';

export default function AuthError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const t = useTranslations('errorBoundaries.auth');
  return (
    <ErrorState
      error={error}
      retry={unstable_retry}
      segmentLabel="Auth"
      title={t('title')}
      description={t('description')}
    />
  );
}
