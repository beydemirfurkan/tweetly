'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiFetch, type SecretsStatus } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
  Save,
  Check,
  KeyRound,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export default function SecretsPage() {
  const [status, setStatus] = useState<SecretsStatus | null>(null);
  const [openrouterKey, setOpenrouterKey] = useState('');
  const [adminToken, setAdminToken] = useState('');
  const [showOpenrouter, setShowOpenrouter] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    const s = await apiFetch<SecretsStatus>('/secrets');
    setStatus(s);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const body: Record<string, string> = {};
      if (openrouterKey) body.openrouterApiKey = openrouterKey;
      if (adminToken) body.adminToken = adminToken;
      if (Object.keys(body).length > 0) {
        await apiFetch('/secrets', {
          method: 'PUT',
          body: JSON.stringify(body),
        });
        setOpenrouterKey('');
        setAdminToken('');
        setSaved(true);
        load();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <h1
          className="text-2xl font-bold tracking-tight text-foreground"
          style={{ fontFamily: 'var(--font-syne)' }}
        >
          Gizli Anahtarlar
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          API anahtarlarını ve kimlik bilgilerini yönetin
        </p>
      </div>

      {/* Status */}
      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <KeyRound className="h-4 w-4 text-primary" />
            Mevcut Durum
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!status ? (
            <div className="space-y-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="skeleton h-10 rounded-md" />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {[
                {
                  label: 'OpenRouter API Key',
                  configured: status.openrouterApiKeyConfigured,
                },
                { label: 'Admin Token', configured: status.adminTokenConfigured },
              ].map(({ label, configured }) => (
                <div
                  key={label}
                  className="flex items-center justify-between rounded-lg border border-border/50 px-4 py-3"
                >
                  <div className="flex items-center gap-2.5 text-sm">
                    <div
                      className={cn(
                        'flex h-7 w-7 items-center justify-center rounded-md border',
                        configured
                          ? 'border-emerald-500/25 bg-emerald-500/10'
                          : 'border-destructive/25 bg-destructive/10',
                      )}
                    >
                      {configured ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-destructive" />
                      )}
                    </div>
                    <span className="font-medium">{label}</span>
                  </div>
                  <span
                    className={cn(
                      'text-xs font-medium',
                      configured ? 'text-emerald-400' : 'text-destructive',
                    )}
                  >
                    {configured ? 'Yapılandırıldı' : 'Eksik'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Update form */}
      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <span className="h-1 w-3 rounded-full bg-primary" />
            Güncelle
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              OpenRouter API Key
            </Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type={showOpenrouter ? 'text' : 'password'}
                  placeholder="Yeni anahtar girin..."
                  value={openrouterKey}
                  onChange={(e) => setOpenrouterKey(e.target.value)}
                  className="pr-10 font-mono text-sm"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowOpenrouter(!showOpenrouter)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showOpenrouter ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Admin Token
            </Label>
            <div className="relative">
              <Input
                type={showAdmin ? 'text' : 'password'}
                placeholder="Yeni token girin..."
                value={adminToken}
                onChange={(e) => setAdminToken(e.target.value)}
                className="pr-10 font-mono text-sm"
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowAdmin(!showAdmin)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showAdmin ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <Button
              onClick={save}
              disabled={saving || (!openrouterKey && !adminToken)}
              className="gap-1.5"
            >
              <Save className="h-3.5 w-3.5" />
              {saving ? 'Kaydediliyor...' : 'Kaydet'}
            </Button>
            {saved && (
              <span className="flex items-center gap-1.5 text-sm text-emerald-400">
                <Check className="h-4 w-4" />
                Kaydedildi
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
