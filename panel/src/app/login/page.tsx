'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { KeyRound } from 'lucide-react';

export default function LoginPage() {
  const { login, isAuthenticated } = useAuth();
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (isAuthenticated && typeof window !== 'undefined') {
    window.location.href = '/panel';
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) return;
    setLoading(true);
    setError('');
    const ok = await login(token.trim());
    if (!ok) {
      setError('Token gecersiz veya sunucu ulasilamaz.');
    }
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary">
            <KeyRound className="h-5 w-5 text-primary-foreground" />
          </div>
          <CardTitle className="text-lg">Tweetly Panel</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="token">Admin Token</Label>
              <Input
                id="token"
                type="password"
                placeholder="Admin token girin..."
                value={token}
                onChange={(e) => setToken(e.target.value)}
                disabled={loading}
              />
            </div>
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            <Button type="submit" className="w-full" disabled={loading || !token.trim()}>
              {loading ? 'Dogrulaniyor...' : 'Giris Yap'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
