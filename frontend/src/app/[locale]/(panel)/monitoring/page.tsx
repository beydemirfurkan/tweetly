'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useApiFetch, type Monitor, type MonitorsResponse, type MonitorDetailResponse } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { RefreshCw, Plus, Trash2, Pause, Radio, ChevronDown, ChevronUp, ExternalLink, Copy, Check, KeyRound } from 'lucide-react';
import { cn } from '@/lib/utils';

function StatusBadge({ enabled }: { enabled: boolean }) {
  const t = useTranslations('monitoring');
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
      {enabled ? t('statusActive') : t('statusPaused')}
    </span>
  );
}

function DeliveryBadge({ status }: { status: 'delivered' | 'failed' }) {
  const t = useTranslations('monitoring');
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium',
        status === 'delivered'
          ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400'
          : 'border-rose-500/25 bg-rose-500/10 text-rose-400',
      )}
    >
      {status === 'delivered' ? t('deliveryDelivered') : t('deliveryFailed')}
    </span>
  );
}

function MonitorRow({ monitor, onDelete, onPause, onRotate, onExpand, expanded }: {
  monitor: Monitor;
  onDelete: (id: string) => void;
  onPause: (id: string) => void;
  onRotate: (id: string, handle: string) => void;
  onExpand: (id: string) => void;
  expanded: boolean;
}) {
  const t = useTranslations('monitoring');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const apiFetch = useApiFetch();
  const [detail, setDetail] = useState<MonitorDetailResponse | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const handleExpand = async () => {
    onExpand(monitor.id);
    if (!detail) {
      setLoadingDetail(true);
      try {
        const res = await apiFetch<MonitorDetailResponse>(`/api/v1/monitors/${monitor.id}`);
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
            ? new Date(monitor.lastCheckAt).toLocaleString(locale)
            : '—'}
        </td>
        <td className="py-3 pr-4">
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-primary"
              title={t('rotateSecret')}
              onClick={() => onRotate(monitor.id, monitor.targetHandle)}
            >
              <KeyRound className="h-3.5 w-3.5" />
            </Button>
            {monitor.enabled && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-amber-400"
                title={t('pause')}
                onClick={() => onPause(monitor.id)}
              >
                <Pause className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
              title={tCommon('delete')}
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
                  {t('recentDeliveries')}
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
                          {d.createdAt ? new Date(d.createdAt).toLocaleString(locale) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">{t('noDeliveries')}</p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

export default function MonitoringPage() {
  const t = useTranslations('monitoring');
  const tCommon = useTranslations('common');
  const apiFetch = useApiFetch();
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ targetHandle: '', webhookUrl: '', accountId: '' });
  const [formError, setFormError] = useState('');
  const [createdSecret, setCreatedSecret] = useState<{ targetHandle: string; secret: string } | null>(null);
  const [secretCopied, setSecretCopied] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [rotateTarget, setRotateTarget] = useState<{ id: string; handle: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch<MonitorsResponse>('/api/v1/monitors');
      setMonitors(res.monitors);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.targetHandle.trim()) { setFormError(t('errorHandleRequired')); return; }
    if (!form.webhookUrl.trim()) { setFormError(t('errorWebhookRequired')); return; }
    setCreating(true);
    setFormError('');
    try {
      const handle = form.targetHandle.trim().replace(/^@/, '');
      const result = await apiFetch<{ ok: boolean; webhookSecret: string }>('/api/v1/monitors', {
        method: 'POST',
        body: JSON.stringify({
          targetHandle: handle,
          webhookUrl: form.webhookUrl.trim(),
          accountId: form.accountId.trim() || undefined,
          eventTypes: ['tweet.new'],
        }),
      });
      setForm({ targetHandle: '', webhookUrl: '', accountId: '' });
      setShowForm(false);
      if (result?.webhookSecret) {
        setCreatedSecret({ targetHandle: handle, secret: result.webhookSecret });
      }
      load();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const handleRotate = async (id: string, handle: string) => {
    try {
      const result = await apiFetch<{ webhookSecret: string }>(`/api/v1/monitors/${id}/rotate-secret`, {
        method: 'POST',
      });
      setCreatedSecret({ targetHandle: handle, secret: result.webhookSecret });
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const copySecret = async () => {
    if (!createdSecret) return;
    await navigator.clipboard.writeText(createdSecret.secret);
    setSecretCopied(true);
    setTimeout(() => setSecretCopied(false), 1500);
  };

  const handleDelete = async (id: string) => {
    try {
      await apiFetch(`/api/v1/monitors/${id}`, { method: 'DELETE' });
      setMonitors((prev) => prev.filter((m) => m.id !== id));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handlePause = async (id: string) => {
    try {
      await apiFetch(`/api/v1/monitors/${id}/pause`, { method: 'PATCH' });
      setMonitors((prev) =>
        prev.map((m) => (m.id === id ? { ...m, enabled: false } : m)),
      );
    } catch (err) {
      alert((err as Error).message);
    }
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <header className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            <span className="text-primary">●</span> {t('kicker')}
          </p>
          <h1 className="mt-2 text-[32px] font-black leading-tight tracking-[-0.025em]">
            {t('title')}
          </h1>
          <p className="mt-1 text-[14px] text-muted-foreground">
            {t('subtitle')}
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
            {tCommon('refresh')}
          </Button>
          <Button
            size="sm"
            onClick={() => setShowForm(!showForm)}
            className="h-9 gap-1.5 text-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            {t('newMonitor')}
          </Button>
        </div>
      </header>

      {showForm && (
        <Card className="border-primary/25 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Radio className="h-3.5 w-3.5 text-primary" />
              {t('newMonitorTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    {t('targetHandle')} <span className="text-destructive">*</span>
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
                    {t('webhookUrl')} <span className="text-destructive">*</span>
                  </label>
                  <Input
                    placeholder={t('webhookUrlPlaceholder')}
                    value={form.webhookUrl}
                    onChange={(e) => setForm((f) => ({ ...f, webhookUrl: e.target.value }))}
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    {t('accountIdLabel')} <span className="text-muted-foreground/60">{t('optional')}</span>
                  </label>
                  <Input
                    placeholder={t('accountIdPlaceholder')}
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
                  {creating ? tCommon('creating') : tCommon('create')}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => { setShowForm(false); setFormError(''); }}
                >
                  {tCommon('cancel')}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {error && (
        <div className="flex items-center gap-2.5 rounded-lg border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span>{tCommon('apiError')}: {error}</span>
          <button onClick={load} className="ml-auto underline hover:no-underline">{tCommon('retry')}</button>
        </div>
      )}

      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <span className="h-1 w-3 rounded-full bg-primary" />
            {t('activeMonitors')}
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
                <p className="text-sm font-medium text-foreground">{t('empty')}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t('emptyHint')}
                </p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/40">
                    {[t('colUser'), t('colWebhook'), t('colStatus'), t('colLastCheck'), t('colActions'), ''].map((h, i) => (
                      <th
                        key={i}
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
                      onDelete={(id) => setDeleteId(id)}
                      onPause={handlePause}
                      onRotate={(id, handle) => setRotateTarget({ id, handle })}
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

      {createdSecret && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
              <KeyRound className="h-4 w-4 text-primary" />
              {t('secretTitle')}
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              {t.rich('secretDesc', {
                handleName: createdSecret.targetHandle,
                handle: (chunks) => <span className="font-mono">{chunks}</span>,
                code: (chunks) => <code className="rounded bg-muted px-1">{chunks}</code>,
              })}
            </p>
            <div className="flex items-start gap-2 rounded-md border border-border bg-muted px-3 py-2 font-mono text-xs">
              <span className="flex-1 break-all leading-relaxed">{createdSecret.secret}</span>
              <Button variant="ghost" size="sm" onClick={copySecret} className="h-7 w-7 shrink-0 p-0">
                {secretCopied ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
            <pre className="mt-3 overflow-x-auto rounded border border-border bg-muted/30 p-2 text-[10px] text-muted-foreground">
{`# Verify (Node):
const expected = crypto.createHmac('sha256', SECRET)
  .update(\`\${ts}.\${rawBody}\`).digest('hex');`}
            </pre>
            <div className="mt-4 flex justify-end">
              <Button size="sm" onClick={() => setCreatedSecret(null)}>{t('secretAck')}</Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(o) => !o && setDeleteId(null)}
        kicker={t('kicker')}
        title={t('deleteTitle')}
        description={t('deleteConfirm')}
        confirmLabel={t('deleteAction')}
        cancelLabel={tCommon('cancel')}
        onConfirm={async () => {
          if (deleteId) await handleDelete(deleteId);
        }}
      />

      <ConfirmDialog
        open={!!rotateTarget}
        onOpenChange={(o) => !o && setRotateTarget(null)}
        kicker={t('kicker')}
        tone="default"
        title={t('rotateTitle')}
        description={rotateTarget ? t('rotateConfirm', { handle: rotateTarget.handle }) : ''}
        confirmLabel={t('rotateAction')}
        cancelLabel={tCommon('cancel')}
        onConfirm={async () => {
          if (rotateTarget) await handleRotate(rotateTarget.id, rotateTarget.handle);
        }}
      />
    </div>
  );
}
