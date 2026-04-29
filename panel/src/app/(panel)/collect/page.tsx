'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Send, Check, AlertCircle } from 'lucide-react';

export default function CollectPage() {
  const [account, setAccount] = useState('');
  const [triggering, setTriggering] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const triggerCollect = async () => {
    setTriggering(true);
    setResult(null);
    try {
      let path = '/collect';
      if (account) path += `?account=${account}`;
      await apiFetch(path, { method: 'POST' });
      setResult({ ok: true, msg: 'Icerik toplama baslatildi.' });
    } catch (err) {
      setResult({ ok: false, msg: (err as Error).message });
    } finally {
      setTriggering(false);
    }
  };

  const triggerTestPost = async () => {
    setTriggering(true);
    setResult(null);
    try {
      const text = prompt('Test tweet metni:');
      if (!text) return;
      await apiFetch('/test/post', {
        method: 'POST',
        body: JSON.stringify({ text, account: account || undefined }),
      });
      setResult({ ok: true, msg: 'Test post kuyruga eklendi.' });
    } catch (err) {
      setResult({ ok: false, msg: (err as Error).message });
    } finally {
      setTriggering(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Icerik Topla</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Manuel Toplama</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Hesap (opsiyonel)</Label>
            <Input
              placeholder="Bos birakirsaniz tum hesaplar icin calisir"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={triggerCollect} disabled={triggering}>
              <Send className="mr-1 h-3 w-3" />
              Toplama Baslat
            </Button>
            <Button variant="outline" onClick={triggerTestPost} disabled={triggering}>
              Test Post
            </Button>
          </div>

          {result && (
            <div className="flex items-center gap-2 text-sm">
              {result.ok ? (
                <>
                  <Check className="h-4 w-4 text-green-500" />
                  <span className="text-green-600">{result.msg}</span>
                </>
              ) : (
                <>
                  <AlertCircle className="h-4 w-4 text-destructive" />
                  <span className="text-destructive">{result.msg}</span>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Bilgi</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              <Badge variant="outline" className="mr-1 text-xs">POST</Badge>
              <code>/admin/collect</code> - Tum aktif hesaplarda icerik toplama baslatir.
            </p>
            <p>
              <Badge variant="outline" className="mr-1 text-xs">POST</Badge>
              <code>/admin/collect?account=test-account</code> - Belirli bir hesap icin toplama baslatir.
            </p>
            <p>
              Toplanan icerikler otomatik olarak puanlanir, tekillestirilir ve kuyruga eklenir.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
