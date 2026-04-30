'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, type ApiKey, type CreatedApiKey } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { KeyRound, Plus, RefreshCw, Trash2, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [createdKey, setCreatedKey] = useState<CreatedApiKey | null>(null);
  const [copied, setCopied] = useState(false);

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
  }, []);

  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  const submitCreate = async () => {
    if (!newKeyName.trim()) return;
    setCreating(true);
    try {
      const created = await apiFetch<CreatedApiKey>('/auth/api-keys', {
        method: 'POST',
        body: JSON.stringify({ name: newKeyName.trim() }),
      });
      setCreatedKey(created);
      setNewKeyName('');
      loadKeys();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const revokeKey = async (id: string) => {
    if (!confirm('Bu API anahtarını iptal etmek istediğinizden emin misiniz?')) return;
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
      <div className="flex items-center justify-between">
        <div>
          <h1
            className="text-2xl font-bold tracking-tight text-foreground"
            style={{ fontFamily: 'var(--font-syne)' }}
          >
            API Anahtarları
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            MCP ve REST API erişimi için anahtarlarınızı yönetin
          </p>
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
            Yenile
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
            Yeni Anahtar
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <KeyRound className="h-4 w-4 text-primary" />
            Anahtarlar
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
              Henüz API anahtarınız yok. Üst sağdan yeni bir tane oluşturun.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/40">
                    {['Ad', 'Önek', 'Son Kullanım', 'Oluşturulma', 'Durum', ''].map((h) => (
                      <th
                        key={h}
                        className="pb-2 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground last:text-right"
                      >
                        {h}
                      </th>
                    ))}
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
                          {k.lastUsedAt
                            ? new Date(k.lastUsedAt).toLocaleString('tr-TR')
                            : '—'}
                        </td>
                        <td className="py-3 pr-4 font-mono text-xs text-muted-foreground">
                          {new Date(k.createdAt).toLocaleString('tr-TR')}
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
                            {revoked ? 'İptal' : 'Aktif'}
                          </span>
                        </td>
                        <td className="py-3 text-right">
                          {!revoked && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => revokeKey(k.id)}
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
            <DialogTitle>
              {createdKey ? 'Yeni anahtar oluşturuldu' : 'Yeni API anahtarı'}
            </DialogTitle>
          </DialogHeader>
          {createdKey ? (
            <div className="space-y-4 pt-1">
              <p className="text-xs text-muted-foreground">
                Bu anahtar sadece bir kez gösterilir. Güvenli bir yere kopyalayın.
              </p>
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
              <div className="flex justify-end pt-2">
                <Button onClick={closeCreated}>Tamam</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 pt-1">
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Ad
                </Label>
                <Input
                  placeholder="ör. Claude Code"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  disabled={creating}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setCreateOpen(false)}>
                  İptal
                </Button>
                <Button onClick={submitCreate} disabled={creating || !newKeyName.trim()}>
                  {creating ? 'Oluşturuluyor...' : 'Oluştur'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
