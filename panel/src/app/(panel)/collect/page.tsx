'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Send, Check, AlertCircle, Download, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

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
      setResult({ ok: true, msg: 'İçerik toplama başlatıldı.' });
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
      setResult({ ok: true, msg: 'Test post kuyruğa eklendi.' });
    } catch (err) {
      setResult({ ok: false, msg: (err as Error).message });
    } finally {
      setTriggering(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <h1
          className="text-2xl font-bold tracking-tight text-foreground"
          style={{ fontFamily: 'var(--font-syne)' }}
        >
          İçerik Topla
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Kaynak taraması ve içerik toplama işlemlerini başlatın
        </p>
      </div>

      {/* Manuel toplama */}
      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Download className="h-4 w-4 text-primary" />
            Manuel Toplama
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Hesap (opsiyonel)
            </Label>
            <Input
              placeholder="Boş bırakırsanız tüm hesaplar için çalışır"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              className="font-mono"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={triggerCollect}
              disabled={triggering}
              className="gap-1.5"
            >
              <Send className="h-3.5 w-3.5" />
              {triggering ? 'Başlatılıyor...' : 'Toplama Başlat'}
            </Button>
            <Button
              variant="outline"
              onClick={triggerTestPost}
              disabled={triggering}
              className="gap-1.5"
            >
              Test Post
            </Button>
          </div>

          {result && (
            <div
              className={cn(
                'flex items-center gap-2 rounded-lg border px-4 py-3 text-sm',
                result.ok
                  ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400'
                  : 'border-destructive/25 bg-destructive/10 text-destructive',
              )}
            >
              {result.ok ? (
                <Check className="h-4 w-4 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0" />
              )}
              {result.msg}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bilgi */}
      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Info className="h-4 w-4 text-muted-foreground" />
            Endpoint Bilgisi
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-xs text-muted-foreground">
            {[
              {
                method: 'POST',
                path: '/admin/collect',
                desc: 'Tüm aktif hesaplarda içerik toplama başlatır.',
              },
              {
                method: 'POST',
                path: '/admin/collect?account=test-account',
                desc: 'Belirli bir hesap için toplama başlatır.',
              },
            ].map(({ method, path, desc }) => (
              <div key={path} className="rounded-md border border-border/50 p-3">
                <div className="flex items-center gap-2 font-mono">
                  <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-primary">
                    {method}
                  </span>
                  <code className="text-foreground">{path}</code>
                </div>
                <p className="mt-1.5 pl-0.5">{desc}</p>
              </div>
            ))}
            <p className="pt-1">
              Toplanan içerikler otomatik olarak puanlanır, tekilleştirilir ve kuyruğa
              eklenir.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
