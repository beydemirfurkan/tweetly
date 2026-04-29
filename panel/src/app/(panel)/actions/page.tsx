'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiFetch, type ActionRow } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { RefreshCw, RotateCcw, X } from 'lucide-react';

const ACTION_TYPES = ['post', 'reply', 'retweet', 'like', 'follow', 'quote', 'bookmark'];

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'outline',
  claimed: 'secondary',
  running: 'default',
  succeeded: 'default',
  failed: 'destructive',
  dead: 'destructive',
  cancelled: 'secondary',
};

export default function ActionsPage() {
  const [type, setType] = useState('post');
  const [status, setStatus] = useState<string>('');
  const [rows, setRows] = useState<ActionRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let path = `/actions?type=${type}&limit=100`;
      if (status) path += `&status=${status}`;
      const res = await apiFetch<{ rows: ActionRow[] }>(path);
      setRows(res.rows);
    } finally {
      setLoading(false);
    }
  }, [type, status]);

  useEffect(() => {
    load();
  }, [load]);

  const replay = async (id: string) => {
    await apiFetch(`/actions/${type}/${id}/replay`, { method: 'POST' });
    load();
  };

  const cancel = async (id: string) => {
    await apiFetch(`/actions/${type}/${id}/cancel`, { method: 'POST' });
    load();
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Aksiyonlar</h1>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={type} onValueChange={(v) => v && setType(v)}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ACTION_TYPES.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={status} onValueChange={(v) => setStatus(v ?? '')}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Tum durumlar" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Tum durumlar</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="claimed">Claimed</SelectItem>
            <SelectItem value="running">Running</SelectItem>
            <SelectItem value="succeeded">Succeeded</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="dead">Dead</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>

        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className="mr-1 h-3 w-3" />
          Yenile
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            {type} - {rows.length} kayit
          </CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <div className="text-sm text-muted-foreground">Kayit bulunamadi.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead>Hesap</TableHead>
                  <TableHead>Deneme</TableHead>
                  <TableHead>Zamanlama</TableHead>
                  <TableHead>Hata</TableHead>
                  <TableHead className="text-right">Islem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">
                      {r.id.slice(0, 8)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[r.status] ?? 'outline'}>
                        {r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{r.account_id}</TableCell>
                    <TableCell>
                      {r.attempts}/{r.max_attempts}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(r.scheduled_at).toLocaleString('tr-TR')}
                    </TableCell>
                    <TableCell className="max-w-48 truncate text-xs text-destructive">
                      {r.last_error || '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {(r.status === 'failed' || r.status === 'dead') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => replay(r.id)}
                            title="Tekrar oynat"
                          >
                            <RotateCcw className="h-3 w-3" />
                          </Button>
                        )}
                        {(r.status === 'pending' || r.status === 'claimed') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => cancel(r.id)}
                            title="Iptal et"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
