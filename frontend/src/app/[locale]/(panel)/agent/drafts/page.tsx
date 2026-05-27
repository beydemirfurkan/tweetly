'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useApiFetch, type RedactedAccount } from '@/lib/api';
import {
  Check,
  X,
  Edit3,
  RefreshCw,
  Clock,
  Send,
  FileText,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface AgentDraft {
  id: string;
  agentConfigId: string;
  accountId: string;
  text: string;
  format: string;
  status: 'pending' | 'approved' | 'rejected' | 'published';
  estimatedScore: number | null;
  reasoning: string | null;
  sourceTopic: string | null;
  actionId: string | null;
  publishedAt: string | null;
  createdAt: string;
}

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected' | 'published';

export default function AgentDraftsPage() {
  const t = useTranslations('agent');
  const tc = useTranslations('common');
  const apiFetch = useApiFetch();

  const [accounts, setAccounts] = useState<RedactedAccount[]>([]);
  const [drafts, setDrafts] = useState<AgentDraft[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const accs = await apiFetch<RedactedAccount[]>('/api/v1/accounts');
      const draftData = await apiFetch<{ items: AgentDraft[]; total: number }>(
        `/api/v1/agent/drafts?status=${statusFilter === 'all' ? '' : statusFilter}&limit=50`,
      );

      setAccounts(accs);
      setDrafts(draftData.items);
      setTotal(draftData.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, statusFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const getAccountName = (accountId: string) => {
    const acc = accounts.find((a) => a.id === accountId);
    return acc?.displayName || `@${accountId}`;
  };

  const handleApprove = async (id: string) => {
    try {
      setActionLoading(id);
      await apiFetch(`/api/v1/agent/drafts/${id}/approve`, { method: 'POST' });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (id: string) => {
    try {
      setActionLoading(id);
      await apiFetch(`/api/v1/agent/drafts/${id}/reject`, { method: 'POST' });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject');
    } finally {
      setActionLoading(null);
    }
  };

  const handleEdit = (draft: AgentDraft) => {
    setEditingId(draft.id);
    setEditText(draft.text);
  };

  const handleSaveEdit = async (id: string) => {
    try {
      setActionLoading(id);
      await apiFetch(`/api/v1/agent/drafts/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ text: editText }),
      });
      setEditingId(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to edit');
    } finally {
      setActionLoading(null);
    }
  };

  const handleEditAndApprove = async (id: string) => {
    try {
      setActionLoading(id);
      await apiFetch(`/api/v1/agent/drafts/${id}/edit-and-approve`, {
        method: 'POST',
        body: JSON.stringify({ text: editText }),
      });
      setEditingId(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to edit and approve');
    } finally {
      setActionLoading(null);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('tr-TR', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const statusFilters: { key: StatusFilter; label: string }[] = [
    { key: 'pending', label: t('pending') },
    { key: 'approved', label: t('approved') },
    { key: 'rejected', label: t('rejected') },
    { key: 'published', label: t('published') },
    { key: 'all', label: 'All' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('draft.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {total} {t('drafts').toLowerCase()}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {statusFilters.map((filter) => (
          <button
            key={filter.key}
            onClick={() => setStatusFilter(filter.key)}
            className={cn(
              'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
              statusFilter === filter.key
                ? 'bg-foreground text-background'
                : 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {drafts.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-card py-12 text-center">
          <FileText className="mb-3 h-10 w-10 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">{t('draft.empty')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {drafts.map((draft) => (
            <div
              key={draft.id}
              className="rounded-lg border border-border bg-card p-4"
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                    {getAccountName(draft.accountId)}
                  </span>
                  <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-400">
                    {draft.format}
                  </span>
                  {draft.estimatedScore && (
                    <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-600 dark:text-green-400">
                      {draft.estimatedScore.toFixed(1)} {t('draft.score')}
                    </span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  {formatDate(draft.createdAt)}
                </span>
              </div>

              {editingId === draft.id ? (
                <div className="space-y-3">
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background p-3 text-sm focus:border-foreground focus:outline-none"
                    rows={4}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleSaveEdit(draft.id)}
                      disabled={actionLoading === draft.id}
                      className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50"
                    >
                      {actionLoading === draft.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Check className="h-3 w-3" />
                      )}
                      {tc('save')}
                    </button>
                    <button
                      onClick={() => handleEditAndApprove(draft.id)}
                      disabled={actionLoading === draft.id}
                      className="flex items-center gap-1.5 rounded-full bg-green-500/10 px-3 py-1.5 text-xs font-medium text-green-600 transition-colors hover:bg-green-500/20 disabled:opacity-50 dark:text-green-400"
                    >
                      {actionLoading === draft.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Send className="h-3 w-3" />
                      )}
                      {t('draft.editAndApprove')}
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {tc('cancel')}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{draft.text}</p>

                  {draft.reasoning && (
                    <p className="mt-2 text-xs italic text-muted-foreground">
                      {draft.reasoning}
                    </p>
                  )}

                  {draft.sourceTopic && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {t('draft.topic')}: {draft.sourceTopic}
                    </p>
                  )}

                  {draft.status === 'pending' && (
                    <div className="mt-4 flex gap-2">
                      <button
                        onClick={() => handleApprove(draft.id)}
                        disabled={actionLoading === draft.id}
                        className="flex items-center gap-1.5 rounded-full bg-green-500/10 px-3 py-1.5 text-xs font-medium text-green-600 transition-colors hover:bg-green-500/20 disabled:opacity-50 dark:text-green-400"
                      >
                        {actionLoading === draft.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Check className="h-3 w-3" />
                        )}
                        {t('draft.approve')}
                      </button>
                      <button
                        onClick={() => handleReject(draft.id)}
                        disabled={actionLoading === draft.id}
                        className="flex items-center gap-1.5 rounded-full bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-500/20 disabled:opacity-50 dark:text-red-400"
                      >
                        {actionLoading === draft.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <X className="h-3 w-3" />
                        )}
                        {t('draft.reject')}
                      </button>
                      <button
                        onClick={() => handleEdit(draft)}
                        className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
                      >
                        <Edit3 className="h-3 w-3" />
                        {t('draft.edit')}
                      </button>
                    </div>
                  )}

                  {draft.status !== 'pending' && (
                    <div className="mt-3 flex items-center gap-2">
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-xs font-medium',
                          draft.status === 'approved' && 'bg-green-500/10 text-green-600 dark:text-green-400',
                          draft.status === 'rejected' && 'bg-red-500/10 text-red-600 dark:text-red-400',
                          draft.status === 'published' && 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
                        )}
                      >
                        {draft.status === 'approved' && t('approved')}
                        {draft.status === 'rejected' && t('rejected')}
                        {draft.status === 'published' && t('published')}
                      </span>
                      {draft.publishedAt && (
                        <span className="text-xs text-muted-foreground">
                          <Clock className="mr-1 inline h-3 w-3" />
                          {formatDate(draft.publishedAt)}
                        </span>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
