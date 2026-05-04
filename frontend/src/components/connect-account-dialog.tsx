'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import {
  useApiFetch,
  ApiError,
  isLoginCooldownPayload,
  type ApiFetch,
  type AccountConnectBody,
  type AccountReauthBody,
  type LoginCooldownPayload,
  type LoginJobAccepted,
  type LoginJobResponse,
} from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Loader2,
  KeyRound,
  ShieldAlert,
  CheckCircle2,
  Clock,
  AlertTriangle,
  UserCheck,
  ArrowRight,
} from 'lucide-react';

const POLL_INTERVAL_MS = 2000;

type Mode = 'connect' | 'reauth';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: Mode;
  /** Required when mode='reauth'. Not editable in the dialog. */
  targetAccountId?: string;
  /** Called after the login job reports success and accounts list should refresh. */
  onSuccess: () => void;
}

interface FormState {
  username: string;
  email: string;
  password: string;
  totpSecret: string;
  saveTotpSecret: boolean;
}

const EMPTY_FORM: FormState = {
  username: '',
  email: '',
  password: '',
  totpSecret: '',
  saveTotpSecret: false,
};

interface AlreadyConnectedPayload {
  code: 'account_already_connected';
  existingAccountId: string;
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'polling'; jobId: string; status: LoginJobResponse['status'] }
  | { kind: 'success'; targetAccountId: string }
  | { kind: 'failed'; reason: NonNullable<LoginJobResponse['failureReason']>; detail: string | null }
  | { kind: 'cooldown'; payload: LoginCooldownPayload }
  | { kind: 'alreadyConnected'; existingAccountId: string };

export function ConnectAccountDialog({ open, onOpenChange, mode, targetAccountId, onSuccess }: Props) {
  const apiFetch = useApiFetch();
  const t = useTranslations('connectDialog');
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [submitError, setSubmitError] = useState('');
  const cancelledRef = useRef(false);

  // Reset state every time the dialog opens.
  useEffect(() => {
    if (open) {
      cancelledRef.current = false;
      queueMicrotask(() => {
        if (cancelledRef.current) return;
        setForm(EMPTY_FORM);
        setPhase({ kind: 'idle' });
        setSubmitError('');
      });
    } else {
      // Stop the poll loop on close.
      cancelledRef.current = true;
    }
  }, [open]);

  const submit = async () => {
    setSubmitError('');
    if (mode === 'connect') {
      if (!form.username.trim()) return setSubmitError(t('errorUsernameRequired'));
    }
    if (!form.password) return setSubmitError(t('errorPasswordRequired'));

    setPhase({ kind: 'submitting' });

    try {
      const accepted = await sendRequest({ form, mode, targetAccountId, apiFetch });
      if (cancelledRef.current) return;
      setPhase({ kind: 'polling', jobId: accepted.jobId, status: 'queued' });
      pollLoop(accepted.jobId);
    } catch (err) {
      // 409: backend rejected because the same handle is already connected
      // for this user. Steer the caller to the reauth flow instead of
      // silently overwriting cookies via upsertAccountWithCookies.
      if (err instanceof ApiError && err.status === 409 && isAlreadyConnectedPayload(err.body)) {
        setPhase({ kind: 'alreadyConnected', existingAccountId: err.body.existingAccountId });
        return;
      }
      // 429: cooldown payload (retryAt + manualReviewRequired). Surface as
      // its own phase so the user sees a live countdown.
      if (err instanceof ApiError && err.status === 429 && isLoginCooldownPayload(err.body)) {
        setPhase({ kind: 'cooldown', payload: err.body });
        return;
      }
      const msg = err instanceof Error ? err.message : t('errorUnknown');
      setPhase({ kind: 'idle' });
      setSubmitError(msg);
    }
  };

  const pollLoop = (jobId: string) => {
    const tick = async () => {
      if (cancelledRef.current) return;
      try {
        const job = await apiFetch<LoginJobResponse>(`/api/v1/accounts/login-jobs/${jobId}`);
        if (cancelledRef.current) return;

        if (job.status === 'success') {
          setPhase({ kind: 'success', targetAccountId: job.targetAccountId ?? '' });
          // small grace so the success state is visible before close
          setTimeout(() => {
            if (cancelledRef.current) return;
            onSuccess();
            onOpenChange(false);
          }, 800);
          return;
        }
        if (job.status === 'failed') {
          setPhase({
            kind: 'failed',
            reason: job.failureReason ?? 'unknown',
            detail: job.failureDetail,
          });
          return;
        }
        // queued | running — keep polling
        setPhase({ kind: 'polling', jobId, status: job.status });
        setTimeout(tick, POLL_INTERVAL_MS);
      } catch (err) {
        if (cancelledRef.current) return;
        const msg = err instanceof Error ? err.message : t('errorUnknown');
        setPhase({ kind: 'failed', reason: 'unknown', detail: msg });
      }
    };
    setTimeout(tick, POLL_INTERVAL_MS);
  };

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
          <CooldownPanel
            payload={phase.payload}
            onDone={() => setPhase({ kind: 'idle' })}
          />
        ) : phase.kind === 'failed' ? (
          <FailurePanel
            reason={phase.reason}
            detail={phase.detail}
            onRetry={() => setPhase({ kind: 'idle' })}
          />
        ) : phase.kind === 'polling' || phase.kind === 'submitting' ? (
          <PollingPanel
            status={phase.kind === 'polling' ? phase.status : 'queued'}
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

function isAlreadyConnectedPayload(value: unknown): value is AlreadyConnectedPayload {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return v.code === 'account_already_connected' && typeof v.existingAccountId === 'string';
}

async function sendRequest(args: {
  form: FormState;
  mode: Mode;
  targetAccountId?: string;
  apiFetch: ApiFetch;
}): Promise<LoginJobAccepted> {
  const payload =
    args.mode === 'connect'
      ? ({
          username: args.form.username.trim(),
          email: args.form.email.trim() || null,
          password: args.form.password,
          totpSecret: args.form.totpSecret.trim() || null,
          saveTotpSecret: args.form.saveTotpSecret,
        } satisfies AccountConnectBody)
      : ({
          password: args.form.password,
          totpSecret: args.form.totpSecret.trim() || null,
          saveTotpSecret: args.form.saveTotpSecret,
          email: args.form.email.trim() || null,
        } satisfies AccountReauthBody);

  const path =
    args.mode === 'connect'
      ? '/api/v1/accounts/connect'
      : `/api/v1/accounts/${encodeURIComponent(args.targetAccountId ?? '')}/reauth`;

  // Don't translate ApiErrors here — the caller handles 409 already-connected,
  // 429 cooldown, and surfaces other server errors verbatim.
  return args.apiFetch<LoginJobAccepted>(path, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

function FormPanel(props: {
  mode: Mode;
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  submit: () => void;
  error: string;
  onCancel: () => void;
}) {
  const t = useTranslations('connectDialog');
  const { mode, form, setForm, submit, error, onCancel } = props;
  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="space-y-4 pt-1">
      <div className="rounded-md border border-primary/20 bg-primary/10 px-3 py-2 text-xs text-primary">
        {t('passwordLoginBody')}
      </div>
      <PasswordLoginForm
        mode={mode}
        form={form}
        update={update}
        submit={submit}
        error={error}
        onCancel={onCancel}
      />
    </div>
  );
}

function PasswordLoginForm(props: {
  mode: Mode;
  form: FormState;
  update: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  submit: () => void;
  error: string;
  onCancel: () => void;
}) {
  const t = useTranslations('connectDialog');
  const { mode, form, update, submit, error, onCancel } = props;

  return (
    <>
      {mode === 'connect' && (
        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            {t('usernameLabel')}
          </Label>
          <Input
            placeholder={t('usernamePlaceholder')}
            value={form.username}
            onChange={(e) => update('username', e.target.value)}
            autoComplete="username"
          />
        </div>
      )}

      <div className="space-y-1.5">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          {t('emailLabel')} <span className="text-muted-foreground/60">{t('emailOptional')}</span>
        </Label>
        <Input
          type="email"
          placeholder={t('emailPlaceholder')}
          value={form.email}
          onChange={(e) => update('email', e.target.value)}
          autoComplete="email"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          {t('passwordLabel')}
        </Label>
        <Input
          type="password"
          placeholder={t('passwordPlaceholder')}
          value={form.password}
          onChange={(e) => update('password', e.target.value)}
          autoComplete="current-password"
        />
        <p className="text-[11px] text-muted-foreground/80">{t('passwordHint')}</p>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          {t('totpLabel')}
        </Label>
        <Input
          placeholder={t('totpPlaceholder')}
          value={form.totpSecret}
          onChange={(e) => update('totpSecret', e.target.value)}
          className="font-mono"
        />
        <p className="text-[11px] text-muted-foreground/80">
          {t.rich('totpHint', {
            strong: (chunks) => <strong>{chunks}</strong>,
          })}
        </p>
      </div>

      {form.totpSecret && (
        <div className="flex items-start justify-between gap-3 rounded-md border border-border/60 bg-muted/30 px-3 py-2">
          <div className="space-y-0.5">
            <Label className="text-xs font-medium">{t('saveTotpLabel')}</Label>
            <p className="text-[11px] text-muted-foreground/80">{t('saveTotpHint')}</p>
          </div>
          <Switch
            checked={form.saveTotpSecret}
            onCheckedChange={(v) => update('saveTotpSecret', v)}
          />
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="outline" onClick={onCancel}>
          {t('cancel')}
        </Button>
        <Button onClick={submit}>
          {props.mode === 'connect' ? t('submitConnect') : t('submitReauth')}
        </Button>
      </div>
    </>
  );
}

function PollingPanel({ status }: { status: LoginJobResponse['status'] }) {
  const t = useTranslations('connectDialog');
  return (
    <div className="space-y-3 pt-2 text-center">
      <div className="flex justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">
          {status === 'queued' ? t('queued') : t('running')}
        </p>
        <p className="text-xs text-muted-foreground">{t('durationHint')}</p>
      </div>
    </div>
  );
}

function SuccessPanel({ accountId }: { accountId: string }) {
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

function AlreadyConnectedPanel({
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
        <UserCheck className="mt-0.5 h-4 w-4 flex-shrink-0" />
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

function CooldownPanel({
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
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
        ) : (
          <Clock className="mt-0.5 h-4 w-4 flex-shrink-0" />
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

function FailurePanel({
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
        <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
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
