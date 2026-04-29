'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiFetch, type SecretsStatus } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Check, Eye, EyeOff, Save } from 'lucide-react';

export default function SecretsPage() {
  const [status, setStatus] = useState<SecretsStatus | null>(null);
  const [openrouterKey, setOpenrouterKey] = useState('');
  const [adminToken, setAdminToken] = useState('');
  const [showOpenrouter, setShowOpenrouter] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    const s = await apiFetch<SecretsStatus>('/secrets');
    setStatus(s);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const body: Record<string, string> = {};
      if (openrouterKey) body.openrouterApiKey = openrouterKey;
      if (adminToken) body.adminToken = adminToken;
      if (Object.keys(body).length > 0) {
        await apiFetch('/secrets', {
          method: 'PUT',
          body: JSON.stringify(body),
        });
        setOpenrouterKey('');
        setAdminToken('');
        setSaved(true);
        load();
      }
    } finally {
      setSaving(false);
    }
  };

  if (!status) {
    return <div className="text-sm text-muted-foreground">Yukleniyor...</div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Gizli Anahtarlar</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Mevcut Durum</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant={status.openrouterApiKeyConfigured ? 'default' : 'destructive'}>
                {status.openrouterApiKeyConfigured ? 'Yapilandirildi' : 'Eksik'}
              </Badge>
              <span className="text-sm">OpenRouter API Key</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={status.adminTokenConfigured ? 'default' : 'destructive'}>
                {status.adminTokenConfigured ? 'Yapilandirildi' : 'Eksik'}
              </Badge>
              <span className="text-sm">Admin Token</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Guncelle</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>OpenRouter API Key</Label>
            <div className="flex gap-2">
              <Input
                type={showOpenrouter ? 'text' : 'password'}
                placeholder="Yeni anahtar girin..."
                value={openrouterKey}
                onChange={(e) => setOpenrouterKey(e.target.value)}
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowOpenrouter(!showOpenrouter)}
              >
                {showOpenrouter ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Admin Token</Label>
            <div className="flex gap-2">
              <Input
                type={showAdmin ? 'text' : 'password'}
                placeholder="Yeni token girin..."
                value={adminToken}
                onChange={(e) => setAdminToken(e.target.value)}
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAdmin(!showAdmin)}
              >
                {showAdmin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={save}
              disabled={saving || (!openrouterKey && !adminToken)}
            >
              <Save className="mr-1 h-3 w-3" />
              Kaydet
            </Button>
            {saved && (
              <span className="flex items-center gap-1 text-sm text-green-600">
                <Check className="h-3 w-3" /> Kaydedildi
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
