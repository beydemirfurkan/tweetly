'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import {
  useApiFetch,
  type AccountsResponse,
  type RedactedAccount,
  type AccountUpdateBody,
} from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Pencil, RefreshCw, Users, CheckCircle2, XCircle, Trash2, ShieldCheck, ShieldAlert, Shield, Plus, KeyRound, ChevronDown, ChevronUp, ExternalLink, UserCheck, UserPlus, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ConnectAccountDialog } from '@/components/connect-account-dialog';

const STATUS_CLASS: Record<string, string> = {
  active: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400',
  paused: 'border-amber-500/25 bg-amber-500/10 text-amber-400',
  banned: 'border-destructive/25 bg-destructive/10 text-destructive',
};

function statusLabelKey(status: string): 'statusActive' | 'statusPaused' | 'statusBanned' {
  if (status === 'active') return 'statusActive';
  if (status === 'banned') return 'statusBanned';
  return 'statusPaused';
}

function TokenCell({ has }: { has: boolean }) {
  return has ? (
    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
  ) : (
    <XCircle className="h-4 w-4 text-muted-foreground/40" />
  );
}

function SessionHealthBadge({ session }: { session: RedactedAccount['session'] }) {
  const t = useTranslations('accounts');
  const locale = useLocale();

  if (session.health === 'healthy') {
    const title = session.lastCheckAt
      ? t('sessionLastCheck', { at: new Date(session.lastCheckAt).toLocaleString(locale) })
      : t('sessionHealthyTitle');
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400"
        title={title}
      >
        <ShieldCheck className="h-3 w-3" />
        {t('sessionHealthy')}
      </span>
    );
  }
  if (session.health === 'unhealthy') {
    const reason = session.lastFailureReason ?? t('sessionAuthFailed');
    const at = session.lastFailureAt
      ? ` (${new Date(session.lastFailureAt).toLocaleString(locale)})`
      : '';
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full border border-destructive/25 bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive"
        title={t('sessionTokenExpiredHint', { reason, at })}
      >
        <ShieldAlert className="h-3 w-3" />
        {t('sessionTokenExpired')}
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
      title={t('sessionNotChecked')}
    >
      <Shield className="h-3 w-3" />
      —
    </span>
  );
}

function StatPill({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-xs font-semibold text-foreground">{value}</span>
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </div>
  );
}

function ProfileCard({
  account,
  onEdit,
  onDelete,
  onReauth,
  onRefreshProfile,
  refreshing,
}: {
  account: RedactedAccount;
  onEdit: () => void;
  onDelete: () => void;
  onReauth: () => void;
  onRefreshProfile: () => void;
  refreshing: boolean;
}) {
  const t = useTranslations('accounts');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const accId = String(account.id ?? '');
  const statusKey = typeof account.status === 'string' ? account.status : '';
  const statusClass = STATUS_CLASS[statusKey] ?? STATUS_CLASS.paused;
  const profile = account.profile;

  return (
    <Card className="border-border/60 overflow-hidden">
      <CardContent className="p-0">
        <div className="flex gap-4 p-4">
          <div className="shrink-0">
            {profile?.profileImageUrl ? (
              <img
                src={profile.profileImageUrl}
                alt={profile.displayName}
                className="h-16 w-16 rounded-full object-cover ring-2 ring-border"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-xl font-bold text-muted-foreground">
                {(profile?.displayName ?? accId)[0]?.toUpperCase() ?? '?'}
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold text-foreground">
                    {profile?.displayName ?? accId}
                  </span>
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium',
                      statusClass,
                    )}
                  >
                    {t(statusLabelKey(statusKey))}
                  </span>
                  <SessionHealthBadge session={account.session} />
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-mono">@{accId}</span>
                  {profile?.verified && (
                    <svg className="h-3.5 w-3.5 text-blue-400" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M22.5 12.5c0-1.58-.875-2.95-2.148-3.6.154-.435.238-.905.238-1.4 0-2.21-1.71-3.998-3.818-3.998-.47 0-.92.084-1.336.25C14.818 2.415 13.51 1.5 12 1.5s-2.816.917-3.437 2.25c-.415-.165-.866-.25-1.336-.25-2.11 0-3.818 1.79-3.818 4 0 .494.083.964.237 1.4-1.272.65-2.147 2.018-2.147 3.6 0 1.495.782 2.798 1.942 3.486-.02.17-.032.34-.032.514 0 2.21 1.708 4 3.818 4 .47 0 .92-.086 1.335-.25.62 1.334 1.926 2.25 3.437 2.25 1.512 0 2.818-.916 3.437-2.25.415.163.865.248 1.336.248 2.11 0 3.818-1.79 3.818-4 0-.174-.012-.344-.033-.513 1.158-.687 1.943-1.99 1.943-3.484zm-6.616-3.334l-4.334 6.5c-.145.217-.382.334-.625.334-.143 0-.288-.04-.416-.126l-.115-.094-2.415-2.415c-.293-.293-.293-.768 0-1.06s.768-.294 1.06 0l1.77 1.767 3.825-5.74c.23-.345.696-.436 1.04-.207.346.23.44.696.21 1.04z" />
                    </svg>
                  )}
                </div>
                {profile?.bio && (
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground/80">
                    {profile.bio}
                  </p>
                )}
              </div>

              <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                {account.session.health === 'unhealthy' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onReauth}
                    className="h-7 w-7 p-0 text-amber-400 opacity-100"
                    title={t('reauth')}
                  >
                    <KeyRound className="h-3.5 w-3.5" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onRefreshProfile}
                  disabled={refreshing}
                  className="h-7 w-7 p-0"
                  title={t('refreshProfile')}
                >
                  <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onEdit}
                  className="h-7 w-7 p-0"
                  title={tCommon('edit')}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onDelete}
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                  title={tCommon('delete')}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-4">
              <StatPill
                icon={<UserCheck className="h-3 w-3" />}
                value={profile?.followersCount ?? '—'}
                label={t('statFollowers')}
              />
              <StatPill
                icon={<UserPlus className="h-3 w-3" />}
                value={profile?.followingCount ?? '—'}
                label={t('statFollowing')}
              />
              <StatPill
                icon={<FileText className="h-3 w-3" />}
                value={profile?.tweetsCount ?? '—'}
                label={t('statTweets')}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-border/40 px-4 py-2">
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              Auth <TokenCell has={Boolean(account.hasAuthToken)} />
            </span>
            <span className="flex items-center gap-1">
              CT0 <TokenCell has={Boolean(account.hasCt0)} />
            </span>
            <span>
              {t('lastUsed', {
                at:
                  account.lastUsedAt != null
                    ? new Date(String(account.lastUsedAt)).toLocaleString(locale)
                    : '—',
              })}
            </span>
          </div>
          <a
            href={`https://x.com/${encodeURIComponent(accId)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-primary"
          >
            {t('viewProfile')}
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AccountsPage() {
  const t = useTranslations('accounts');
  const tCommon = useTranslations('common');
  const apiFetch = useApiFetch();
  const [accounts, setAccounts] = useState<RedactedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [editAccount, setEditAccount] = useState<RedactedAccount | null>(null);
  const [editForm, setEditForm] = useState<AccountUpdateBody>({});
  const [editAdvancedOpen, setEditAdvancedOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [reauthAccount, setReauthAccount] = useState<RedactedAccount | null>(null);
  const [refreshingProfile, setRefreshingProfile] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await apiFetch<AccountsResponse>('/api/v1/accounts');
      const list = Array.isArray(res?.accounts)
        ? res.accounts
        : Array.isArray(res)
          ? (res as unknown as RedactedAccount[])
          : [];
      setAccounts(list);
    } catch (err) {
      setLoadError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  const refreshProfile = async (id: string) => {
    setRefreshingProfile(id);
    try {
      await apiFetch(`/api/v1/accounts/${encodeURIComponent(id)}/refresh-profile`, {
        method: 'POST',
      });
      await loadAccounts();
    } catch {
    } finally {
      setRefreshingProfile(null);
    }
  };

  const openEdit = (account: RedactedAccount) => {
    setEditAccount(account);
    setEditForm({});
    setEditAdvancedOpen(false);
  };

  const saveEdit = async () => {
    if (!editAccount) return;
    const body: AccountUpdateBody = {};
    if (editForm.displayName !== undefined) body.displayName = editForm.displayName;
    if (editForm.status) body.status = editForm.status;
    if (editForm.authToken) body.authToken = editForm.authToken;
    if (editForm.ct0 !== undefined) body.ct0 = editForm.ct0;
    if (editForm.twid !== undefined) body.twid = editForm.twid;

    await apiFetch(`/api/v1/accounts/${String(editAccount.id)}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    setEditAccount(null);
    loadAccounts();
  };

  const deleteAccount = async (id: string) => {
    try {
      await apiFetch(`/api/v1/accounts/${id}`, { method: 'DELETE' });
      loadAccounts();
    } catch (err) {
      setLoadError((err as Error).message);
    }
  };

  if (loadError) {
    return (
      <div className="flex items-center gap-2.5 rounded-lg border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        <span>{tCommon('apiError')}: {loadError}</span>
        <button onClick={loadAccounts} className="ml-auto underline hover:no-underline">{tCommon('retry')}</button>
      </div>
    );
  }

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
            onClick={loadAccounts}
            disabled={loading}
            className="gap-1.5"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin-slow')} />
            {tCommon('refresh')}
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => setConnectOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            {t('addAccount')}
          </Button>
        </div>
      </header>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="skeleton h-32 rounded-xl" />
          ))}
        </div>
      ) : accounts.length === 0 ? (
        <Card className="border-border/60">
          <CardContent className="py-12 text-center">
            <Users className="mx-auto h-8 w-8 text-muted-foreground/40" />
            <p className="mt-3 text-sm text-muted-foreground">{t('empty')}</p>
            <Button size="sm" className="mt-4 gap-1.5" onClick={() => setConnectOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              {t('addFirst')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {accounts.map((acc) => {
            const accId = String(acc.id ?? '');
            return (
              <div key={accId} className="group">
                <ProfileCard
                  account={acc}
                  onEdit={() => openEdit(acc)}
                  onDelete={() => setDeleteId(accId)}
                  onReauth={() => setReauthAccount(acc)}
                  onRefreshProfile={() => refreshProfile(accId)}
                  refreshing={refreshingProfile === accId}
                />
              </div>
            );
          })}
        </div>
      )}

      <Dialog
        open={!!editAccount}
        onOpenChange={(open) => !open && setEditAccount(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogKicker>{t('kicker')}</DialogKicker>
            <DialogTitle className="font-mono text-base">
              {editAccount ? String(editAccount.id ?? '') : ''}
            </DialogTitle>
          </DialogHeader>
          {editAccount && (
            <div className="space-y-4 pt-1">
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  {t('displayName')}
                </Label>
                <Input
                  placeholder={editAccount.displayName ?? t('displayNamePlaceholder')}
                  value={editForm.displayName ?? ''}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, displayName: e.target.value }))
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  {t('status')}
                </Label>
                <Select
                  value={editForm.status ?? editAccount.status}
                  onValueChange={(v) =>
                    setEditForm((f) => ({
                      ...f,
                      status: v as AccountUpdateBody['status'],
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">{t('statusActive')}</SelectItem>
                    <SelectItem value="paused">{t('statusPaused')}</SelectItem>
                    <SelectItem value="banned">{t('statusBanned')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (editAccount) setReauthAccount(editAccount);
                  setEditAccount(null);
                }}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-xs transition-colors',
                  editAccount.session.health === 'unhealthy'
                    ? 'border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20'
                    : 'border-border/60 bg-muted/30 text-foreground hover:bg-muted/50',
                )}
              >
                <KeyRound className="h-4 w-4 flex-shrink-0" />
                <div>
                  <div className="font-medium">{t('reauthTitle')}</div>
                  <div className="text-[11px] opacity-80">
                    {t('reauthDesc')}
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setEditAdvancedOpen((v) => !v)}
                className="flex w-full items-center justify-between rounded-md border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground hover:bg-muted/30"
              >
                <span>{t('advancedToggle')}</span>
                {editAdvancedOpen ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </button>

              {editAdvancedOpen && (
                <div className="space-y-4 rounded-md border border-border/40 bg-muted/20 p-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                      {t('authToken')}
                    </Label>
                    <Input
                      type="password"
                      placeholder={t('advancedPlaceholder')}
                      value={editForm.authToken ?? ''}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, authToken: e.target.value }))
                      }
                      className="font-mono"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                      {t('ct0')}
                    </Label>
                    <Input
                      type="password"
                      placeholder={t('advancedPlaceholder')}
                      value={editForm.ct0 ?? ''}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, ct0: e.target.value }))
                      }
                      className="font-mono"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                      {t('twid')}
                    </Label>
                    <Input
                      placeholder={t('advancedPlaceholder')}
                      value={editForm.twid ?? ''}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, twid: e.target.value }))
                      }
                      className="font-mono"
                    />
                  </div>
                </div>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={() => setEditAccount(null)}>
                  {tCommon('cancel')}
                </Button>
                <Button onClick={saveEdit}>{tCommon('save')}</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(o) => !o && setDeleteId(null)}
        kicker={t('kicker')}
        title={t('deleteTitle')}
        description={deleteId ? t('deleteConfirm', { id: deleteId }) : ''}
        confirmLabel={t('deleteAction')}
        cancelLabel={tCommon('cancel')}
        onConfirm={async () => {
          if (deleteId) await deleteAccount(deleteId);
        }}
      />

      <ConnectAccountDialog
        open={connectOpen}
        onOpenChange={setConnectOpen}
        mode="connect"
        onSuccess={loadAccounts}
      />

      <ConnectAccountDialog
        open={!!reauthAccount}
        onOpenChange={(o) => !o && setReauthAccount(null)}
        mode="reauth"
        targetAccountId={reauthAccount?.id}
        onSuccess={loadAccounts}
      />
    </div>
  );
}
