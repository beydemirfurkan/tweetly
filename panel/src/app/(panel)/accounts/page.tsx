'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  apiFetch,
  type AccountsResponse,
  type RedactedAccount,
  type AccountUpdateBody,
} from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Pencil, RefreshCw } from 'lucide-react';

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive'> = {
  active: 'default',
  paused: 'secondary',
  banned: 'destructive',
};

const STATUS_LABEL: Record<string, string> = {
  active: 'Aktif',
  paused: 'Duraklatildi',
  banned: 'Yasakli',
};

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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Hesaplar</h1>
        <Button variant="outline" size="sm" onClick={loadAccounts} disabled={loading}>
          <RefreshCw className="mr-1 h-3 w-3" />
          Yenile
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            Kayitli Hesaplar ({accounts.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-muted-foreground">Yukleniyor...</div>
          ) : accounts.length === 0 ? (
            <div className="text-sm text-muted-foreground">Henuz hesap yok.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Ad</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead>Auth Token</TableHead>
                  <TableHead>CT0</TableHead>
                  <TableHead>Son Kullanim</TableHead>
                  <TableHead className="text-right">Islem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((acc) => (
                  <TableRow key={acc.id}>
                    <TableCell className="font-medium">{acc.id}</TableCell>
                    <TableCell>{acc.displayName || '-'}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[acc.status] ?? 'secondary'}>
                        {STATUS_LABEL[acc.status] ?? acc.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{acc.hasAuthToken ? '✓' : '✗'}</TableCell>
                    <TableCell>{acc.hasCt0 ? '✓' : '✗'}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {acc.lastUsedAt
                        ? new Date(acc.lastUsedAt).toLocaleString('tr-TR')
                        : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(acc)}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={!!editAccount}
        onOpenChange={(open) => !open && setEditAccount(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Hesap Duzenle: {editAccount?.id}
            </DialogTitle>
          </DialogHeader>
          {editAccount && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Gorunen Ad</Label>
                <Input
                  placeholder={editAccount.displayName ?? ''}
                  value={editForm.displayName ?? ''}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, displayName: e.target.value }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>Durum</Label>
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
                    <SelectItem value="paused">Duraklatildi</SelectItem>
                    <SelectItem value="banned">Yasakli</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Auth Token</Label>
                <Input
                  type="password"
                  placeholder="Bos birakirsaniz degismez"
                  value={editForm.authToken ?? ''}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, authToken: e.target.value }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>CT0 (CSRF)</Label>
                <Input
                  type="password"
                  placeholder="Bos birakirsaniz degismez"
                  value={editForm.ct0 ?? ''}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, ct0: e.target.value }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>TWID</Label>
                <Input
                  placeholder="Bos birakirsaniz degismez"
                  value={editForm.twid ?? ''}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, twid: e.target.value }))
                  }
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setEditAccount(null)}>
                  Iptal
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
