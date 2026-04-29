'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiFetch, type SettingDef } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { RefreshCw, Save } from 'lucide-react';

type SettingsMap = Record<string, unknown>;

export default function SettingsPage() {
  const [defs, setDefs] = useState<SettingDef[]>([]);
  const [values, setValues] = useState<SettingsMap>({});
  const [dirty, setDirty] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, v] = await Promise.all([
        apiFetch<SettingDef[]>('/settings/defs'),
        apiFetch<SettingsMap>('/settings'),
      ]);
      setDefs(d);
      setValues(v);
      setDirty({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      await apiFetch('/settings', {
        method: 'PUT',
        body: JSON.stringify(dirty),
      });
      setDirty({});
      await load();
    } finally {
      setSaving(false);
    }
  };

  const grouped = defs.reduce<Record<string, SettingDef[]>>((acc, def) => {
    const category = def.key.split('.')[0];
    if (!acc[category]) acc[category] = [];
    acc[category].push(def);
    return acc;
  }, {});

  if (loading) {
    return <div className="text-sm text-muted-foreground">Yukleniyor...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Ayarlar</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="mr-1 h-3 w-3" />
            Yenile
          </Button>
          {Object.keys(dirty).length > 0 && (
            <Button size="sm" onClick={save} disabled={saving}>
              <Save className="mr-1 h-3 w-3" />
              Kaydet ({Object.keys(dirty).length})
            </Button>
          )}
        </div>
      </div>

      {Object.entries(grouped).map(([category, catDefs]) => (
        <Card key={category}>
          <CardHeader>
            <CardTitle className="text-sm capitalize">{category}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Key</TableHead>
                  <TableHead>Deger</TableHead>
                  <TableHead>Tip</TableHead>
                  <TableHead>Varsayilan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {catDefs.map((def) => {
                  const currentVal =
                    dirty[def.key] !== undefined
                      ? dirty[def.key]
                      : String(values[def.key] ?? def.defaultValue);

                  return (
                    <TableRow key={def.key}>
                      <TableCell className="font-mono text-xs">
                        {def.key}
                      </TableCell>
                      <TableCell>
                        {def.type === 'boolean' ? (
                          <select
                            value={currentVal}
                            onChange={(e) =>
                              setDirty((d) => ({ ...d, [def.key]: e.target.value }))
                            }
                            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                          >
                            <option value="true">true</option>
                            <option value="false">false</option>
                          </select>
                        ) : (
                          <Input
                            className="h-8 text-xs"
                            value={currentVal}
                            onChange={(e) =>
                              setDirty((d) => ({ ...d, [def.key]: e.target.value }))
                            }
                          />
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {def.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-32 truncate font-mono text-xs text-muted-foreground">
                        {def.defaultValue}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
