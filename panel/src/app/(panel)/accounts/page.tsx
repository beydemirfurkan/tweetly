'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  apiFetch,
  type AccountsResponse,
  type RedactedAccount,
  type AccountUpdateBody,
} from '@/lib/api';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Pencil, RefreshCw, Users, CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';


const STATUS_STYLES: Record<
  string,
  { variant: 'default' | 'secondary' | 'destructive'; label: string; className: string }
> = {
  active: {
    variant: 'default',
    label: 'Aktif',
    className: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400',
  },
  paused: {
    variant: 'secondary',
    label: 'Duraklatıldı',
    className: 'border-amber-500/25 bg-amber-500/10 text-amber-400',
  },
  banned: {
    variant: 'destructive',
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

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<RedactedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [editAccount, setEditAccount] = useState<RedactedAccount | null>(null);
  const [editForm, setEditForm] = useState<AccountUpdateBody>({});

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<AccountsResponse>('/accounts');
      setAccounts(res.accounts);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  const openEdit = (account: RedactedAccount) => {
    setEditAccount(account);
    setEditForm({});
  };

  const saveEdit = async () => {
    if (!editAccount) return;
    const body: AccountUpdateBody = {};
    if (editForm.displayName !== undefined) body.displayName = editForm.displayName;
    if (editForm.status) body.status = editForm.status;
    if (editForm.authToken) body.authToken = editForm.authToken;
    if (editForm.ct0 !== undefined) body.ct0 = editForm.ct0;
    if (editForm.twid !== undefined) body.twid = editForm.twid;

    await apiFetch(`/accounts/${editAccount.id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    setEditAccount(null);
    loadAccounts();
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-center justify-between">
        <div>
          <h1
            className="text-2xl font-bold tracking-tight text-foreground"
            style={{ fontFamily: 'var(--font-syne)' }}
          >
            Hesaplar
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Kayıtlı Twitter hesaplarını yönetin
          </p>
        </div>
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
      </div>

      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Users className="h-4 w-4 text-primary" />
            Kayıtlı Hesaplar
            {!loading && (
              <span className="ml-1 rounded-full bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
                {accounts.length}
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
          ) : accounts.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Henüz kayıtlı hesap yok.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/40">
                    {['ID', 'Ad', 'Durum', 'Auth', 'CT0', 'Son Kullanım', ''].map(
                      (h) => (
                        <th
                          key={h}
                          className="pb-2 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground first:pl-0 last:text-right"
                        >
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((acc) => {
                    const statusStyle = STATUS_STYLES[acc.status] ?? STATUS_STYLES.paused;
                    return (
                      <tr
                        key={acc.id}
                        className="group border-b border-border/20 last:border-0 hover:bg-accent/30 transition-colors"
                      >
                        <td className="py-3 pr-4 font-mono text-xs font-medium text-foreground">
                          {acc.id}
                        </td>
                        <td className="py-3 pr-4 text-xs">
                          {acc.displayName || (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-3 pr-4">
                          <span
                            className={cn(
                              'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
                              statusStyle.className,
                            )}
                          >
                            {statusStyle.label}
                          </span>
                        </td>
                        <td className="py-3 pr-4">
                          <TokenCell has={acc.hasAuthToken} />
                        </td>
                        <td className="py-3 pr-4">
                          <TokenCell has={acc.hasCt0} />
                        </td>
                        <td className="py-3 pr-4 font-mono text-xs text-muted-foreground">
                          {acc.lastUsedAt
                            ? new Date(acc.lastUsedAt).toLocaleString('tr-TR')
                            : '—'}
                        </td>
                        <td className="py-3 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEdit(acc)}
                            className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
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

      <Dialog
        open={!!editAccount}
        onOpenChange={(open) => !open && setEditAccount(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-mono text-base">
              {editAccount?.id}
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
    </div>
  );
}
