'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiFetch, type Monitor, type MonitorsResponse, type MonitorDetailResponse } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RefreshCw, Plus, Trash2, Pause, Radio, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

function StatusBadge({ enabled }: { enabled: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium',
        enabled
          ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400'
          : 'border-border bg-muted/50 text-muted-foreground',
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', enabled ? 'bg-emerald-400' : 'bg-muted-foreground')} />
      {enabled ? 'Aktif' : 'Duraklatıldı'}
    </span>
  );
}

function DeliveryBadge({ status }: { status: 'delivered' | 'failed' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium',
        status === 'delivered'
          ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400'
          : 'border-rose-500/25 bg-rose-500/10 text-rose-400',
      )}
    >
      {status === 'delivered' ? 'İletildi' : 'Başarısız'}
    </span>
  );
}

function MonitorRow({ monitor, onDelete, onPause, onExpand, expanded }: {
  monitor: Monitor;
  onDelete: (id: string) => void;
  onPause: (id: string) => void;
  onExpand: (id: string) => void;
  expanded: boolean;
}) {
  const [detail, setDetail] = useState<MonitorDetailResponse | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const handleExpand = async () => {
    onExpand(monitor.id);
    if (!detail) {
      setLoadingDetail(true);
      try {
        const res = await apiFetch<MonitorDetailResponse>(`/monitors/${monitor.id}`);
        setDetail(res);
      } catch {
        // ignore
      } finally {
        setLoadingDetail(false);
      }
    }
  };

  return (
    <>
      <tr
        className="border-b border-border/20 last:border-0 hover:bg-accent/30 transition-colors cursor-pointer"
        onClick={handleExpand}
      >
        <td className="py-3 pr-4">
          <span className="font-mono font-medium text-foreground">@{monitor.targetHandle}</span>
        </td>
        <td className="max-w-48 truncate py-3 pr-4 text-xs text-muted-foreground">
          <a
            href={monitor.webhookUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 hover:text-foreground transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="truncate">{monitor.webhookUrl}</span>
            <ExternalLink className="h-2.5 w-2.5 shrink-0" />
          </a>
        </td>
        <td className="py-3 pr-4">
          <StatusBadge enabled={monitor.enabled} />
        </td>
        <td className="py-3 pr-4 text-xs text-muted-foreground">
          {monitor.lastCheckAt
            ? new Date(monitor.lastCheckAt).toLocaleString('tr-TR')
            : '—'}
        </td>
        <td className="py-3 pr-4">
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            {monitor.enabled && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-amber-400"
                title="Duraklat"
                onClick={() => onPause(monitor.id)}
              >
                <Pause className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
              title="Sil"
              onClick={() => onDelete(monitor.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </td>
        <td className="py-3 text-muted-foreground">
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </td>
      </tr>

      {expanded && (
        <tr className="border-b border-border/20 bg-accent/10">
          <td colSpan={6} className="px-4 py-3">
            {loadingDetail ? (
              <div className="skeleton h-16 rounded" />
            ) : detail && detail.recentDeliveries.length > 0 ? (
              <div className="space-y-1">
                <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Son Webhook İletimleri
                </p>
                <table className="w-full text-xs">
                  <tbody>
                    {detail.recentDeliveries.map((d) => (
                      <tr key={d.id} className="text-xs">
                        <td className="py-1 pr-4"><DeliveryBadge status={d.status} /></td>
                        <td className="py-1 pr-4 font-mono text-muted-foreground">{d.eventType}</td>
                        <td className="py-1 pr-4 text-muted-foreground">
                          {d.lastError ?? '—'}
                        </td>
                        <td className="py-1 text-muted-foreground">
                          {d.createdAt ? new Date(d.createdAt).toLocaleString('tr-TR') : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Henüz webhook iletimi yok.</p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

export default function MonitoringPage() {
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ targetHandle: '', webhookUrl: '', accountId: '' });
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch<MonitorsResponse>('/monitors');
      setMonitors(res.monitors);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.targetHandle.trim()) { setFormError('Hedef kullanıcı adı zorunlu'); return; }
    if (!form.webhookUrl.trim()) { setFormError('Webhook URL zorunlu'); return; }
    setCreating(true);
    setFormError('');
    try {
      await apiFetch('/monitors', {
        method: 'POST',
        body: JSON.stringify({
          targetHandle: form.targetHandle.trim().replace(/^@/, ''),
          webhookUrl: form.webhookUrl.trim(),
          accountId: form.accountId.trim() || undefined,
          eventTypes: ['tweet.new'],
        }),
      });
      setForm({ targetHandle: '', webhookUrl: '', accountId: '' });
      setShowForm(false);
      load();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Bu monitörü silmek istediğinizden emin misiniz?')) return;
    try {
      await apiFetch(`/monitors/${id}`, { method: 'DELETE' });
      setMonitors((prev) => prev.filter((m) => m.id !== id));
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const handlePause = async (id: string) => {
    try {
      await apiFetch(`/monitors/${id}/pause`, { method: 'PATCH' });
      setMonitors((prev) =>
        prev.map((m) => (m.id === id ? { ...m, enabled: false } : m)),
      );
    } catch (err) {
      alert((err as Error).message);
    }
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1
            className="text-2xl font-bold tracking-tight text-foreground"
            style={{ fontFamily: 'var(--font-syne)' }}
          >
            Monitoring
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Hesap izleme ve webhook bildirimleri
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={load}
            disabled={loading}
            className="h-9 gap-1.5 text-xs"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin-slow')} />
            Yenile
          </Button>
          <Button
            size="sm"
            onClick={() => setShowForm(!showForm)}
            className="h-9 gap-1.5 text-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            Yeni Monitor
          </Button>
        </div>
      </div>

      {showForm && (
        <Card className="border-primary/25 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Radio className="h-3.5 w-3.5 text-primary" />
              Yeni Monitor Ekle
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Hedef Kullanıcı Adı <span className="text-destructive">*</span>
                  </label>
                  <Input
                    placeholder="elonmusk"
                    value={form.targetHandle}
                    onChange={(e) => setForm((f) => ({ ...f, targetHandle: e.target.value }))}
                    className="h-9 text-sm font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Webhook URL <span className="text-destructive">*</span>
                  </label>
                  <Input
                    placeholder="https://your-server.com/webhook"
                    value={form.webhookUrl}
                    onChange={(e) => setForm((f) => ({ ...f, webhookUrl: e.target.value }))}
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Hesap ID <span className="text-muted-foreground/60">(opsiyonel)</span>
                  </label>
                  <Input
                    placeholder="Varsayılan hesap kullanılır"
                    value={form.accountId}
                    onChange={(e) => setForm((f) => ({ ...f, accountId: e.target.value }))}
                    className="h-9 text-sm font-mono"
                  />
                </div>
              </div>
              {formError && (
                <p className="text-xs text-destructive">{formError}</p>
              )}
              <div className="flex items-center gap-2">
                <Button type="submit" size="sm" disabled={creating} className="h-8 text-xs">
                  {creating ? 'Oluşturuluyor...' : 'Oluştur'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => { setShowForm(false); setFormError(''); }}
                >
                  İptal
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {error && (
        <div className="flex items-center gap-2.5 rounded-lg border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span>API hatası: {error}</span>
          <button onClick={load} className="ml-auto underline hover:no-underline">Tekrar dene</button>
        </div>
      )}

      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <span className="h-1 w-3 rounded-full bg-primary" />
            Aktif Monitörler
            <span className="ml-1 rounded-full bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
              {monitors.length}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <div key={i} className="skeleton h-10 rounded" />)}
            </div>
          ) : monitors.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-card">
                <Radio className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Henüz monitor yok</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Bir Twitter hesabını izlemeye başlamak için "Yeni Monitor" butonuna tıklayın.
                </p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/40">
                    {['Kullanıcı', 'Webhook URL', 'Durum', 'Son Kontrol', 'İşlemler', ''].map((h) => (
                      <th
                        key={h}
                        className="pb-2 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {monitors.map((m) => (
                    <MonitorRow
                      key={m.id}
                      monitor={m}
                      onDelete={handleDelete}
                      onPause={handlePause}
                      onExpand={(id) => setExpandedId((prev) => (prev === id ? null : id))}
                      expanded={expandedId === m.id}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
