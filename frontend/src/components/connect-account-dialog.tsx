'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocale } from 'next-intl';
import {
  useApiFetch,
  ApiError,
  failureReasonMessage,
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
import { Loader2, KeyRound, ShieldAlert, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';

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

type Phase =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'polling'; jobId: string; status: LoginJobResponse['status'] }
  | { kind: 'success'; targetAccountId: string }
  | { kind: 'failed'; reason: NonNullable<LoginJobResponse['failureReason']>; detail: string | null }
  | { kind: 'cooldown'; payload: LoginCooldownPayload };

export function ConnectAccountDialog({ open, onOpenChange, mode, targetAccountId, onSuccess }: Props) {
  const apiFetch = useApiFetch();
  const locale = useLocale();
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
      if (!form.username.trim()) return setSubmitError('Kullanıcı adı zorunlu.');
    }
    if (!form.password) return setSubmitError('Şifre zorunlu.');

    setPhase({ kind: 'submitting' });

    try {
      const accepted = await sendRequest({ form, mode, targetAccountId, apiFetch });
      if (cancelledRef.current) return;
      setPhase({ kind: 'polling', jobId: accepted.jobId, status: 'queued' });
      pollLoop(accepted.jobId);
    } catch (err) {
      // Cooldown 429 carries a structured payload (retryAt + manualReviewRequired).
      // Surface it as its own phase so the user sees a live countdown instead
      // of a generic "too many attempts" toast.
      if (err instanceof ApiError && err.status === 429 && isLoginCooldownPayload(err.body)) {
        setPhase({ kind: 'cooldown', payload: err.body });
        return;
      }
      const msg = err instanceof Error ? err.message : 'Bilinmeyen hata';
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
        const msg = err instanceof Error ? err.message : 'Sorgulama hatası';
        setPhase({ kind: 'failed', reason: 'unknown', detail: msg });
      }
    };
    setTimeout(tick, POLL_INTERVAL_MS);
  };

  // Cooldown is informational, not in-flight; the existing isBusy gate
  // already lets the user dismiss in that phase.
  const isBusy = phase.kind === 'submitting' || phase.kind === 'polling';

  return (
    <Dialog open={open} onOpenChange={(o) => !isBusy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4 text-primary" />
            {mode === 'connect' ? 'X Hesabı Bağla' : `Yeniden doğrula: @${targetAccountId}`}
          </DialogTitle>
        </DialogHeader>

        {phase.kind === 'success' ? (
          <SuccessPanel accountId={phase.targetAccountId} />
        ) : phase.kind === 'cooldown' ? (
          <CooldownPanel
            payload={phase.payload}
            locale={locale}
            onDone={() => setPhase({ kind: 'idle' })}
          />
        ) : phase.kind === 'failed' ? (
          <FailurePanel
            reason={phase.reason}
            detail={phase.detail}
            locale={locale}
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

  // Don't translate ApiErrors here — the caller handles 429 cooldown-with-
  // payload as its own phase, and other statuses surface their server message.
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
  const { mode, form, setForm, submit, error, onCancel } = props;
  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="space-y-4 pt-1">
      {mode === 'connect' && (
        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            Kullanıcı adı (@username)
          </Label>
          <Input
            placeholder="alice"
            value={form.username}
            onChange={(e) => update('username', e.target.value)}
            autoComplete="username"
          />
        </div>
      )}

      <div className="space-y-1.5">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          E-posta <span className="text-muted-foreground/60">(opsiyonel)</span>
        </Label>
        <Input
          type="email"
          placeholder="X ekstra doğrulama isterse gerekli olabilir"
          value={form.email}
          onChange={(e) => update('email', e.target.value)}
          autoComplete="email"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          Şifre
        </Label>
        <Input
          type="password"
          placeholder="••••••••"
          value={form.password}
          onChange={(e) => update('password', e.target.value)}
          autoComplete="current-password"
        />
        <p className="text-[11px] text-muted-foreground/80">
          Şifreniz AES-256-GCM ile şifrelenir; giriş tamamlanınca silinir.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          2FA secret (opsiyonel)
        </Label>
        <Input
          placeholder="JBSWY3DPEHPK3PXP..."
          value={form.totpSecret}
          onChange={(e) => update('totpSecret', e.target.value)}
          className="font-mono"
        />
        <p className="text-[11px] text-muted-foreground/80">
          X → Ayarlar → Güvenlik → 2FA → Authenticator app → &quot;QR&apos;ı tarayamıyorum&quot; altındaki
          base32 metni. <strong>6 haneli kod değil.</strong>
        </p>
      </div>

      {form.totpSecret && (
        <div className="flex items-start justify-between gap-3 rounded-md border border-border/60 bg-muted/30 px-3 py-2">
          <div className="space-y-0.5">
            <Label className="text-xs font-medium">2FA secret&apos;ini kaydet</Label>
            <p className="text-[11px] text-muted-foreground/80">
              Açıksa session düştüğünde otomatik yeniden bağlanabiliriz.
            </p>
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
          İptal
        </Button>
        <Button onClick={submit}>
          {props.mode === 'connect' ? 'Bağla' : 'Yeniden doğrula'}
        </Button>
      </div>
    </div>
  );
}

function PollingPanel({ status }: { status: LoginJobResponse['status'] }) {
  return (
    <div className="space-y-3 pt-2 text-center">
      <div className="flex justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">
          {status === 'queued' ? 'Sıraya alındı...' : 'X\'e giriş yapılıyor...'}
        </p>
        <p className="text-xs text-muted-foreground">
          Bu işlem 20-40 saniye sürer.
        </p>
      </div>
    </div>
  );
}

function SuccessPanel({ accountId }: { accountId: string }) {
  return (
    <div className="space-y-3 pt-2 text-center">
      <div className="flex justify-center">
        <CheckCircle2 className="h-10 w-10 text-emerald-400" />
      </div>
      <div>
        <p className="text-sm font-medium">Bağlandı</p>
        {accountId && (
          <p className="text-xs text-muted-foreground">
            <span className="font-mono">@{accountId}</span> hesabı kullanıma hazır.
          </p>
        )}
      </div>
    </div>
  );
}

function CooldownPanel({
  payload,
  locale,
  onDone,
}: {
  payload: LoginCooldownPayload;
  locale: string;
  onDone: () => void;
}) {
  const isEn = locale.toLowerCase().startsWith('en');
  const retryAtMs = useMemo(() => new Date(payload.retryAt).getTime(), [payload.retryAt]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);

  const remainingSec = Math.max(0, Math.ceil((retryAtMs - now) / 1000));
  const mm = Math.floor(remainingSec / 60).toString().padStart(2, '0');
  const ss = (remainingSec % 60).toString().padStart(2, '0');
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
            {requiresManual
              ? isEn
                ? 'Too many recent failures — manual review needed'
                : 'Çok fazla başarısız deneme — manuel inceleme gerekiyor'
              : isEn
                ? 'Login temporarily blocked'
                : 'Giriş geçici olarak engellendi'}
          </p>
          <p className="text-xs opacity-90">
            {requiresManual
              ? isEn
                ? `${payload.failureCount} failed attempts in a row. Try the manual cookie-paste path or wait at least ${mm}:${ss}.`
                : `Üst üste ${payload.failureCount} başarısız deneme. Manuel cookie yapıştırma yolunu deneyin veya en az ${mm}:${ss} bekleyin.`
              : isEn
                ? `Wait ${mm}:${ss} before trying again.`
                : `Tekrar denemek için ${mm}:${ss} kadar bekleyin.`}
          </p>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onDone} disabled={!expired}>
          {expired
            ? isEn ? 'Try again' : 'Tekrar dene'
            : `${mm}:${ss}`}
        </Button>
      </div>
    </div>
  );
}

function FailurePanel({
  reason,
  detail,
  locale,
  onRetry,
}: {
  reason: NonNullable<LoginJobResponse['failureReason']>;
  detail: string | null;
  locale: string;
  onRetry: () => void;
}) {
  const isEn = locale.toLowerCase().startsWith('en');
  return (
    <div className="space-y-3 pt-2">
      <div className="flex items-start gap-2 rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
        <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <div className="space-y-1">
          <p className="font-medium">{failureReasonMessage(reason, locale)}</p>
          {detail && (
            <p className="text-[11px] opacity-70">
              {isEn ? 'Technical detail' : 'Teknik detay'}: {detail}
            </p>
          )}
        </div>
      </div>
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={onRetry}>
          {isEn ? 'Try again' : 'Tekrar dene'}
        </Button>
      </div>
    </div>
  );
}
