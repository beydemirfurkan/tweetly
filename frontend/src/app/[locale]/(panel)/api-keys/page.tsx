'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useApiFetch, type ApiKey, type CreatedApiKey } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogKicker,
  DialogTitle,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { KeyRound, Plus, RefreshCw, Trash2, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ApiKeysPage() {
  const t = useTranslations('apiKeys');
  const apiFetch = useApiFetch();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyScope, setNewKeyScope] = useState<'full' | 'read' | 'write'>('full');
  const [createdKey, setCreatedKey] = useState<CreatedApiKey | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokeId, setRevokeId] = useState<string | null>(null);

  const loadKeys = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const list = await apiFetch<ApiKey[]>('/auth/api-keys');
      setKeys(Array.isArray(list) ? list : []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  const submitCreate = async () => {
    if (!newKeyName.trim()) return;
    setCreating(true);
    try {
      const scopes =
        newKeyScope === 'full' ? ['*'] : newKeyScope === 'read' ? ['read'] : ['write'];
      const created = await apiFetch<CreatedApiKey>('/auth/api-keys', {
        method: 'POST',
        body: JSON.stringify({ name: newKeyName.trim(), scopes }),
      });
      setCreatedKey(created);
      setNewKeyName('');
      setNewKeyScope('full');
      loadKeys();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const revokeKey = async (id: string) => {
    try {
      await apiFetch(`/auth/api-keys/${id}`, { method: 'DELETE' });
      loadKeys();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const copyKey = async () => {
    if (!createdKey) return;
    await navigator.clipboard.writeText(createdKey.key);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const closeCreated = () => {
    setCreatedKey(null);
    setCreateOpen(false);
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <header className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            <span className="text-primary">●</span> Auth
          </p>
          <h1 className="mt-2 text-[32px] font-black leading-tight tracking-[-0.025em]">
            {t('title')}
          </h1>
          <p className="mt-1 text-[14px] text-muted-foreground">{t('subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadKeys}
            disabled={loading}
            className="gap-1.5"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin-slow')} />
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setCreatedKey(null);
              setNewKeyName('');
              setCreateOpen(true);
            }}
            className="gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            {t('newKey')}
          </Button>
        </div>
      </header>

      {error && (
        <div className="rounded-lg border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {t('serverError')}: {error}
        </div>
      )}

      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <KeyRound className="h-4 w-4 text-primary" />
            {t('title')}
            {!loading && (
              <span className="ml-1 rounded-full bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
                {keys.length}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="skeleton h-10 rounded-md" />
              ))}
            </div>
          ) : keys.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {t('noKeys')}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/40">
                    {[t('nameCol'), t('prefixCol'), t('lastUsedCol'), t('createdAtCol'), t('statusCol'), ''].map(
                      (h, i) => (
                        <th
                          key={i}
                          className="pb-2 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground last:text-right"
                        >
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {keys.map((k) => {
                    const revoked = Boolean(k.revokedAt);
                    return (
                      <tr
                        key={k.id}
                        className={cn(
                          'group border-b border-border/20 last:border-0 transition-colors',
                          revoked ? 'opacity-50' : 'hover:bg-accent/30',
                        )}
                      >
                        <td className="py-3 pr-4 text-xs font-medium">{k.name}</td>
                        <td className="py-3 pr-4 font-mono text-xs text-muted-foreground">
                          {k.prefix}…
                        </td>
                        <td className="py-3 pr-4 font-mono text-xs text-muted-foreground">
                          {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : t('never')}
                        </td>
                        <td className="py-3 pr-4 font-mono text-xs text-muted-foreground">
                          {new Date(k.createdAt).toLocaleString()}
                        </td>
                        <td className="py-3 pr-4">
                          <span
                            className={cn(
                              'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
                              revoked
                                ? 'border-muted-foreground/25 bg-muted text-muted-foreground'
                                : 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400',
                            )}
                          >
                            {revoked ? t('statusRevoked') : t('statusActive')}
                          </span>
                        </td>
                        <td className="py-3 text-right">
                          {!revoked && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setRevokeId(k.id)}
                              className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity hover:text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={(open) => !open && closeCreated()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogKicker>API Key</DialogKicker>
            <DialogTitle>
              {createdKey ? t('keyCreatedTitle') : t('createTitle')}
            </DialogTitle>
          </DialogHeader>
          {createdKey ? (
            <div className="space-y-4 pt-1">
              <p className="text-xs text-muted-foreground">{t('keyCreatedWarning')}</p>
              <div className="flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-2 font-mono text-xs">
                <span className="flex-1 truncate">{createdKey.key}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={copyKey}
                  className="h-7 w-7 shrink-0 p-0"
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
              <DialogFooter>
                <Button onClick={closeCreated}>{t('close')}</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4 pt-1">
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  {t('keyName')}
                </Label>
                <Input
                  placeholder={t('keyNamePlaceholder')}
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  disabled={creating}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  {t('permissions')}
                </Label>
                <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
                  {(
                    [
                      ['full', t('fullAccess'), t('fullDesc')],
                      ['read', t('readOnly'), t('readDesc')],
                      ['write', t('writeOnly'), t('writeDesc')],
                    ] as const
                  ).map(([value, label, desc]) => (
                    <label
                      key={value}
                      className={cn(
                        'flex cursor-pointer items-start gap-2.5 rounded-md p-2 transition-colors hover:bg-accent/50',
                        newKeyScope === value && 'bg-accent/40',
                      )}
                    >
                      <input
                        type="radio"
                        name="scope"
                        value={value}
                        checked={newKeyScope === value}
                        onChange={() => setNewKeyScope(value)}
                        disabled={creating}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="text-sm font-medium">{label}</div>
                        <div className="text-xs text-muted-foreground">{desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>
                  {t('cancel')}
                </Button>
                <Button onClick={submitCreate} disabled={creating || !newKeyName.trim()}>
                  {creating ? t('creating') : t('create')}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!revokeId}
        onOpenChange={(o) => !o && setRevokeId(null)}
        kicker="API Key"
        title={t('revokeTitle')}
        description={t('revokeConfirm')}
        confirmLabel={t('revokeAction')}
        cancelLabel={t('cancel')}
        onConfirm={async () => {
          if (revokeId) await revokeKey(revokeId);
        }}
      />
    </div>
  );
}
