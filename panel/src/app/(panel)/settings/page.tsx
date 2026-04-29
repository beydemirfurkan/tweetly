'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiFetch, type SettingDef } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RefreshCw, Save, Settings as SettingsIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

type SettingsMap = Record<string, unknown>;

const TYPE_COLORS: Record<string, string> = {
  string: 'border-primary/20 bg-primary/10 text-primary',
  number: 'border-amber-500/20 bg-amber-500/10 text-amber-400',
  boolean: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400',
  json: 'border-violet-500/20 bg-violet-500/10 text-violet-400',
};

export default function SettingsPage() {
  const [defs, setDefs] = useState<SettingDef[]>([]);
  const [values, setValues] = useState<SettingsMap>({});
  const [dirty, setDirty] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [d, v] = await Promise.all([
        apiFetch<SettingDef[]>('/settings/defs'),
        apiFetch<SettingsMap>('/settings'),
      ]);
      setDefs(d);
      setValues(v);
      setDirty({});
    } catch (err) {
      setLoadError((err as Error).message);
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

  const dirtyCount = Object.keys(dirty).length;

  if (loadError) {
    return (
      <div className="flex items-center gap-2.5 rounded-lg border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        <span>API hatası: {loadError}</span>
        <button onClick={load} className="ml-auto underline hover:no-underline">Tekrar dene</button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-start justify-between">
        <div>
          <h1
            className="text-2xl font-bold tracking-tight text-foreground"
            style={{ fontFamily: 'var(--font-syne)' }}
          >
            Ayarlar
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sistem davranışını konfigüre edin
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={load}
            disabled={loading}
            className="h-9 gap-1.5 text-xs"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin-slow')} />
            Yenile
          </Button>
          {dirtyCount > 0 && (
            <Button
              size="sm"
              onClick={save}
              disabled={saving}
              className="h-9 gap-1.5 text-xs"
            >
              <Save className="h-3.5 w-3.5" />
              Kaydet ({dirtyCount})
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton h-48 rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([category, catDefs]) => (
            <Card key={category} className="border-border/60">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                  <SettingsIcon className="h-3.5 w-3.5 text-primary" />
                  <span className="capitalize">{category}</span>
                  <span className="ml-1 rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                    {catDefs.length}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border/40">
                        {['Key', 'Değer', 'Tip', 'Varsayılan'].map((h) => (
                          <th
                            key={h}
                            className="pb-2 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {catDefs.map((def) => {
                        const currentVal =
                          dirty[def.key] !== undefined
                            ? dirty[def.key]
                            : String(values[def.key] ?? def.defaultValue);
                        const isDirty = dirty[def.key] !== undefined;

                        return (
                          <tr
                            key={def.key}
                            className={cn(
                              'border-b border-border/20 last:border-0 transition-colors',
                              isDirty ? 'bg-primary/5' : 'hover:bg-accent/30',
                            )}
                          >
                            <td className="py-2.5 pr-4">
                              <div className="flex items-center gap-2">
                                {isDirty && (
                                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                                )}
                                <code className="font-mono text-foreground">
                                  {def.key}
                                </code>
                              </div>
                            </td>
                            <td className="py-2 pr-4">
                              {def.type === 'boolean' ? (
                                <select
                                  value={currentVal}
                                  onChange={(e) =>
                                    setDirty((d) => ({
                                      ...d,
                                      [def.key]: e.target.value,
                                    }))
                                  }
                                  className="h-8 rounded-md border border-input bg-input px-2 font-mono text-xs focus:border-primary focus:outline-none"
                                >
                                  <option value="true">true</option>
                                  <option value="false">false</option>
                                </select>
                              ) : (
                                <Input
                                  className="h-8 font-mono text-xs"
                                  value={currentVal}
                                  onChange={(e) =>
                                    setDirty((d) => ({
                                      ...d,
                                      [def.key]: e.target.value,
                                    }))
                                  }
                                />
                              )}
                            </td>
                            <td className="py-2.5 pr-4">
                              <span
                                className={cn(
                                  'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium',
                                  TYPE_COLORS[def.type] ?? TYPE_COLORS.string,
                                )}
                              >
                                {def.type}
                              </span>
                            </td>
                            <td className="max-w-32 truncate py-2.5 font-mono text-muted-foreground">
                              {def.defaultValue}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
