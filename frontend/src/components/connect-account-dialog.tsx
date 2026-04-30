'use client';

import { useEffect, useRef, useState } from 'react';
import {
  apiFetch,
  ApiError,
  FAILURE_REASON_TR,
  type AccountConnectBody,
  type AccountReauthBody,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Loader2, KeyRound, ShieldAlert, CheckCircle2 } from 'lucide-react';

const POLL_INTERVAL_MS = 2000;
const PROXY_OPTIONS = [
  { value: '', label: 'Otomatik (sunucu IP)' },
  { value: 'TR', label: 'Türkiye' },
  { value: 'US', label: 'ABD' },
  { value: 'DE', label: 'Almanya' },
  { value: 'GB', label: 'Birleşik Krallık' },
];

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
  proxyCountry: string;
}

const EMPTY_FORM: FormState = {
  username: '',
  email: '',
  password: '',
  totpSecret: '',
  saveTotpSecret: false,
  proxyCountry: '',
};

type Phase =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'polling'; jobId: string; status: LoginJobResponse['status']; startedAt: number }
  | { kind: 'success'; targetAccountId: string }
  | { kind: 'failed'; reason: NonNullable<LoginJobResponse['failureReason']>; detail: string | null };

export function ConnectAccountDialog({ open, onOpenChange, mode, targetAccountId, onSuccess }: Props) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [submitError, setSubmitError] = useState('');
  const cancelledRef = useRef(false);

  // Reset state every time the dialog opens.
  useEffect(() => {
    if (open) {
      cancelledRef.current = false;
      setForm(EMPTY_FORM);
      setPhase({ kind: 'idle' });
      setSubmitError('');
    } else {
      // Stop the poll loop on close.
      cancelledRef.current = true;
    }
  }, [open]);

  const submit = async () => {
    setSubmitError('');
    if (mode === 'connect') {
      if (!form.username.trim()) return setSubmitError('Kullanıcı adı zorunlu.');
      if (!form.email.trim()) return setSubmitError('E-posta zorunlu.');
    }
    if (!form.password) return setSubmitError('Şifre zorunlu.');

    setPhase({ kind: 'submitting' });

    try {
      const accepted = await sendRequest({ form, mode, targetAccountId });
      if (cancelledRef.current) return;
      const startedAt = Date.now();
      setPhase({ kind: 'polling', jobId: accepted.jobId, status: 'queued', startedAt });
      pollLoop(accepted.jobId, startedAt);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Bilinmeyen hata';
      setPhase({ kind: 'idle' });
      setSubmitError(msg);
    }
  };

  const pollLoop = (jobId: string, startedAt: number) => {
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
        setPhase({ kind: 'polling', jobId, status: job.status, startedAt });
        setTimeout(tick, POLL_INTERVAL_MS);
      } catch (err) {
        if (cancelledRef.current) return;
        const msg = err instanceof Error ? err.message : 'Sorgulama hatası';
        setPhase({ kind: 'failed', reason: 'unknown', detail: msg });
      }
    };
    setTimeout(tick, POLL_INTERVAL_MS);
  };

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
        ) : phase.kind === 'failed' ? (
          <FailurePanel
            reason={phase.reason}
            detail={phase.detail}
            onRetry={() => setPhase({ kind: 'idle' })}
          />
        ) : phase.kind === 'polling' || phase.kind === 'submitting' ? (
          <PollingPanel
            elapsedMs={phase.kind === 'polling' ? Date.now() - phase.startedAt : 0}
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
}): Promise<LoginJobAccepted> {
  const payload =
    args.mode === 'connect'
      ? ({
          username: args.form.username.trim(),
          email: args.form.email.trim(),
          password: args.form.password,
          totpSecret: args.form.totpSecret.trim() || null,
          saveTotpSecret: args.form.saveTotpSecret,
          proxyCountry: args.form.proxyCountry || null,
        } satisfies AccountConnectBody)
      : ({
          password: args.form.password,
          totpSecret: args.form.totpSecret.trim() || null,
          saveTotpSecret: args.form.saveTotpSecret,
          email: args.form.email.trim() || null,
          proxyCountry: args.form.proxyCountry || null,
        } satisfies AccountReauthBody);

  const path =
    args.mode === 'connect'
      ? '/api/v1/accounts/connect'
      : `/api/v1/accounts/${encodeURIComponent(args.targetAccountId ?? '')}/reauth`;

  try {
    return await apiFetch<LoginJobAccepted>(path, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  } catch (err) {
    if (err instanceof ApiError && err.status === 429) {
      throw new Error('Çok fazla deneme yapıldı. 15 dakika sonra tekrar deneyin.');
    }
    throw err;
  }
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
          E-posta {mode === 'reauth' && <span className="text-muted-foreground/60">(opsiyonel)</span>}
        </Label>
        <Input
          type="email"
          placeholder="alice@example.com"
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
          X → Ayarlar → Güvenlik → 2FA → Authenticator app → "QR'ı tarayamıyorum" altındaki
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

      <div className="space-y-1.5">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          Proxy bölgesi
        </Label>
        <Select
          value={form.proxyCountry || '__none'}
          onValueChange={(v: string | null) =>
            setForm((f) => ({ ...f, proxyCountry: v === '__none' || !v ? '' : v }))
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROXY_OPTIONS.map((o) => (
              <SelectItem key={o.value || '__none'} value={o.value || '__none'}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[11px] text-muted-foreground/80">
          X farklı bölgeden girişi şüpheli görebilir; hesabın olağan bölgesini seçin.
        </p>
      </div>

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

function PollingPanel({ elapsedMs, status }: { elapsedMs: number; status: LoginJobResponse['status'] }) {
  const seconds = Math.floor(elapsedMs / 1000);
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
          Bu işlem 20-40 saniye sürer. {seconds > 0 && `(${seconds}sn geçti)`}
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

function FailurePanel({
  reason,
  detail,
  onRetry,
}: {
  reason: NonNullable<LoginJobResponse['failureReason']>;
  detail: string | null;
  onRetry: () => void;
}) {
  return (
    <div className="space-y-3 pt-2">
      <div className="flex items-start gap-2 rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
        <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <div className="space-y-1">
          <p className="font-medium">{FAILURE_REASON_TR[reason]}</p>
          {detail && <p className="text-[11px] opacity-70">Teknik detay: {detail}</p>}
        </div>
      </div>
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={onRetry}>
          Tekrar dene
        </Button>
      </div>
    </div>
  );
}
