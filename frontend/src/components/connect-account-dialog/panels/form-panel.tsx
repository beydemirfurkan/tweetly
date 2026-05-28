'use client';

import type { Dispatch, SetStateAction } from 'react';
import { useTranslations } from 'next-intl';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { FormState, Mode } from '../types';

interface FormPanelProps {
  mode: Mode;
  form: FormState;
  setForm: Dispatch<SetStateAction<FormState>>;
  submit: () => void;
  error: string;
  onCancel: () => void;
}

export function FormPanel(props: FormPanelProps) {
  const t = useTranslations('connectDialog');
  const { mode, form, setForm, submit, error, onCancel } = props;
  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="space-y-4 pt-1">
      <div className="rounded-md border border-primary/20 bg-primary/10 px-3 py-2 text-xs text-primary">
        {t('passwordLoginBody')}
      </div>

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
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="outline" onClick={onCancel}>
          {t('cancel')}
        </Button>
        <Button onClick={submit}>
          {mode === 'connect' ? t('submitConnect') : t('submitReauth')}
        </Button>
      </div>
    </div>
  );
}
