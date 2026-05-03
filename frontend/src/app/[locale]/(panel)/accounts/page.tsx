'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  useApiFetch,
  type AccountsResponse,
  type RedactedAccount,
  type AccountUpdateBody,
  type AccountProfile,
} from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Pencil, RefreshCw, Users, CheckCircle2, XCircle, Trash2, ShieldCheck, ShieldAlert, Shield, Plus, KeyRound, ChevronDown, ChevronUp, ExternalLink, UserCheck, UserPlus, FileText, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ConnectAccountDialog } from '@/components/connect-account-dialog';

const STATUS_STYLES: Record<
  string,
  { label: string; className: string }
> = {
  active: {
    label: 'Aktif',
    className: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400',
  },
  paused: {
    label: 'Duraklatıldı',
    className: 'border-amber-500/25 bg-amber-500/10 text-amber-400',
  },
  banned: {
    label: 'Yasaklı',
    className: 'border-destructive/25 bg-destructive/10 text-destructive',
  },
};

function TokenCell({ has }: { has: boolean }) {
  return has ? (
    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
  ) : (
    <XCircle className="h-4 w-4 text-muted-foreground/40" />
  );
}

function SessionHealthBadge({ session }: { session: RedactedAccount['session'] }) {
  if (session.health === 'healthy') {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400"
        title={session.lastCheckAt ? `Son kontrol: ${new Date(session.lastCheckAt).toLocaleString('tr-TR')}` : 'Sağlıklı'}
      >
        <ShieldCheck className="h-3 w-3" />
        Sağlıklı
      </span>
    );
  }
  if (session.health === 'unhealthy') {
    const reason = session.lastFailureReason ?? 'Auth başarısız';
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full border border-destructive/25 bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive"
        title={`${reason}${session.lastFailureAt ? ` (${new Date(session.lastFailureAt).toLocaleString('tr-TR')})` : ''} — token süresi dolmuş olabilir`}
      >
        <ShieldAlert className="h-3 w-3" />
        Token süresi dolmuş?
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
      title="Henüz aksiyon çalıştırılmadı"
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
  const accId = String(account.id ?? '');
  const statusKey = typeof account.status === 'string' ? account.status : '';
  const statusStyle = STATUS_STYLES[statusKey] ?? STATUS_STYLES.paused;
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
                      statusStyle.className,
                    )}
                  >
                    {statusStyle.label}
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
                    title="Yeniden doğrula"
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
                  title="Profili yenile"
                >
                  <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onEdit}
                  className="h-7 w-7 p-0"
                  title="Düzenle"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onDelete}
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                  title="Sil"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-4">
              <StatPill
                icon={<UserCheck className="h-3 w-3" />}
                value={profile?.followersCount ?? '—'}
                label="Takipçi"
              />
              <StatPill
                icon={<UserPlus className="h-3 w-3" />}
                value={profile?.followingCount ?? '—'}
                label="Takip"
              />
              <StatPill
                icon={<FileText className="h-3 w-3" />}
                value={profile?.tweetsCount ?? '—'}
                label="Gönderi"
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
              Son: {account.lastUsedAt != null
                ? new Date(String(account.lastUsedAt)).toLocaleString('tr-TR')
                : '—'}
            </span>
          </div>
          <a
            href={`https://x.com/${encodeURIComponent(accId)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-primary"
          >
            Profili gör
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AccountsPage() {
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
    if (!confirm(`"${id}" hesabını silmek istediğinizden emin misiniz?\nBağlı monitörler ve bekleyen aksiyonlar da iptal edilir.`)) return;
    try {
      await apiFetch(`/api/v1/accounts/${id}`, { method: 'DELETE' });
      loadAccounts();
    } catch (err) {
      alert((err as Error).message);
    }
  };

  if (loadError) {
    return (
      <div className="flex items-center gap-2.5 rounded-lg border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        <span>API hatası: {loadError}</span>
        <button onClick={loadAccounts} className="ml-auto underline hover:no-underline">Tekrar dene</button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <header className="flex items-end justify-between gap-4 border-b border-border pb-6">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            <span className="text-primary">●</span> Identity
          </p>
          <h1 className="mt-2 text-[32px] font-black leading-tight tracking-[-0.025em]">
            Hesaplar
          </h1>
          <p className="mt-1 text-[14px] text-muted-foreground">
            Kayıtlı Twitter hesaplarını yönetin
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
            Yenile
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => setConnectOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            Hesap Ekle
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
            <p className="mt-3 text-sm text-muted-foreground">Henüz kayıtlı hesap yok.</p>
            <Button size="sm" className="mt-4 gap-1.5" onClick={() => setConnectOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              İlk Hesabı Ekle
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
                  onDelete={() => deleteAccount(accId)}
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
            <DialogTitle className="font-mono text-base">
              {editAccount ? String(editAccount.id ?? '') : ''}
            </DialogTitle>
          </DialogHeader>
          {editAccount && (
            <div className="space-y-4 pt-1">
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Görünen Ad
                </Label>
                <Input
                  placeholder={editAccount.displayName ?? 'Ad girin...'}
                  value={editForm.displayName ?? ''}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, displayName: e.target.value }))
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Durum
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
                    <SelectItem value="active">Aktif</SelectItem>
                    <SelectItem value="paused">Duraklatıldı</SelectItem>
                    <SelectItem value="banned">Yasaklı</SelectItem>
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
                  <div className="font-medium">Bu hesabı yeniden doğrula</div>
                  <div className="text-[11px] opacity-80">
                    Şifre + (gerekiyorsa) 2FA secret ile yeni session aç.
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setEditAdvancedOpen((v) => !v)}
                className="flex w-full items-center justify-between rounded-md border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground hover:bg-muted/30"
              >
                <span>Gelişmiş: manuel cookie yapıştır</span>
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
                      Auth Token
                    </Label>
                    <Input
                      type="password"
                      placeholder="Boş bırakırsanız değişmez"
                      value={editForm.authToken ?? ''}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, authToken: e.target.value }))
                      }
                      className="font-mono"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                      CT0 (CSRF)
                    </Label>
                    <Input
                      type="password"
                      placeholder="Boş bırakırsanız değişmez"
                      value={editForm.ct0 ?? ''}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, ct0: e.target.value }))
                      }
                      className="font-mono"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                      TWID
                    </Label>
                    <Input
                      placeholder="Boş bırakırsanız değişmez"
                      value={editForm.twid ?? ''}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, twid: e.target.value }))
                      }
                      className="font-mono"
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setEditAccount(null)}>
                  İptal
                </Button>
                <Button onClick={saveEdit}>Kaydet</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

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
