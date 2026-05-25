'use client';

import { useTranslations } from 'next-intl';
import { ErrorState } from '@/components/error-state';

export default function OAuthError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const t = useTranslations('errorBoundaries.oauth');
  return (
    <ErrorState
      error={error}
      retry={unstable_retry}
      segmentLabel="OAuth"
      title={t('title')}
      description={t('description')}
    />
  );
}
