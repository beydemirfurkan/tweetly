'use client';

import { ErrorState } from '@/components/error-state';

export default function PanelError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return <ErrorState error={error} retry={unstable_retry} segmentLabel="Panel" />;
}
