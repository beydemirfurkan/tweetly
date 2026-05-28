'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ApiError, isLoginCooldownPayload, useApiFetch } from '@/lib/api';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { KeyRound } from 'lucide-react';
import { EMPTY_FORM, isAlreadyConnectedPayload, type FormState, type Mode } from './types';
import { sendLoginRequest } from './login-request';
import { useLoginJob } from './use-login-job';
import { FormPanel } from './panels/form-panel';
import { PollingPanel } from './panels/polling-panel';
import { CancelledPanel } from './panels/cancelled-panel';
import { SuccessPanel } from './panels/success-panel';
import { AlreadyConnectedPanel } from './panels/already-connected-panel';
import { CooldownPanel } from './panels/cooldown-panel';
import { FailurePanel } from './panels/failure-panel';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: Mode;
  /** Required when mode='reauth'. Not editable in the dialog. */
  targetAccountId?: string;
  /** Called after the login job reports success and accounts list should refresh. */
  onSuccess: () => void;
}

export function ConnectAccountDialog({ open, onOpenChange, mode, targetAccountId, onSuccess }: Props) {
  const apiFetch = useApiFetch();
  const t = useTranslations('connectDialog');
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitError, setSubmitError] = useState('');

  const job = useLoginJob({
    onSuccess: () => {
      onSuccess();
      onOpenChange(false);
    },
  });

  // Reset state every time the dialog opens; stop the poll loop on close.
  useEffect(() => {
    if (open) {
      job.resetForOpen();
      setForm(EMPTY_FORM);
      setSubmitError('');
    } else {
      job.stopOnClose();
    }
    // job has stable callback identities; including it would re-run on every
    // setPhase. We intentionally only react to `open` here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = async () => {
    setSubmitError('');
    if (mode === 'connect' && !form.username.trim()) {
      return setSubmitError(t('errorUsernameRequired'));
    }
    if (!form.password) return setSubmitError(t('errorPasswordRequired'));

    job.setPhase({ kind: 'submitting' });
    try {
      const accepted = await sendLoginRequest({ form, mode, targetAccountId, apiFetch });
      job.startPolling(accepted.jobId);
    } catch (err) {
      // 409: backend rejected because the same handle is already connected.
      // Steer the caller to the reauth flow instead of overwriting cookies.
      if (err instanceof ApiError && err.status === 409 && isAlreadyConnectedPayload(err.body)) {
        job.setPhase({ kind: 'alreadyConnected', existingAccountId: err.body.existingAccountId });
        return;
      }
      // 429: cooldown payload — surface as its own phase so the user sees
      // a live countdown.
      if (err instanceof ApiError && err.status === 429 && isLoginCooldownPayload(err.body)) {
        job.setPhase({ kind: 'cooldown', payload: err.body });
        return;
      }
      const msg = err instanceof Error ? err.message : t('errorUnknown');
      job.setPhase({ kind: 'idle' });
      setSubmitError(msg);
    }
  };

  const { phase } = job;
  // Cooldown is informational, not in-flight; the existing isBusy gate
  // already lets the user dismiss in that phase.
  const isBusy = phase.kind === 'submitting' || phase.kind === 'polling';

  const title =
    mode === 'connect'
      ? t('titleConnect')
      : t('titleReauth', { handle: targetAccountId ?? '' });

  return (
    <Dialog open={open} onOpenChange={(o) => !isBusy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4 text-primary" />
            {title}
          </DialogTitle>
        </DialogHeader>

        {phase.kind === 'success' ? (
          <SuccessPanel accountId={phase.targetAccountId} />
        ) : phase.kind === 'alreadyConnected' ? (
          <AlreadyConnectedPanel
            accountId={phase.existingAccountId}
            onClose={() => onOpenChange(false)}
          />
        ) : phase.kind === 'cooldown' ? (
          <CooldownPanel payload={phase.payload} onDone={() => job.setPhase({ kind: 'idle' })} />
        ) : phase.kind === 'failed' ? (
          <FailurePanel
            reason={phase.reason}
            detail={phase.detail}
            onRetry={() => job.setPhase({ kind: 'idle' })}
          />
        ) : phase.kind === 'cancelled' ? (
          <CancelledPanel onClose={() => onOpenChange(false)} />
        ) : phase.kind === 'polling' || phase.kind === 'submitting' ? (
          <PollingPanel
            status={phase.kind === 'polling' ? phase.status : 'queued'}
            cancelling={phase.kind === 'polling' && phase.cancelling}
            onCancel={
              phase.kind === 'polling' && !phase.cancelling
                ? () => job.requestCancel(phase.jobId)
                : undefined
            }
          />
        ) : (
          <FormPanel
            mode={mode}
            form={form}
            setForm={setForm}
            submit={submit}
            error={submitError}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
