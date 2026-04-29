'use client';

import { useEffect, useState } from 'react';
import { apiFetch, type StatusResponse } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Activity, AlertTriangle, CheckCircle, Clock, Inbox } from 'lucide-react';

export default function DashboardPage() {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<StatusResponse>('/status')
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  if (error) {
    return (
      <div className="text-destructive text-sm">Sunucuya baglanilamadi: {error}</div>
    );
  }

  if (!data) {
    return <div className="text-sm text-muted-foreground">Yukleniyor...</div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Dashboard</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Sistem Durumu"
          value={data.ok ? 'Saglikli' : 'Sorunlu'}
          icon={data.ok ? <CheckCircle className="h-4 w-4 text-green-500" /> : <AlertTriangle className="h-4 w-4 text-destructive" />}
        />
        <StatCard
          title="Bekleyen Aksiyon"
          value={data.queue.totalPending}
          icon={<Clock className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          title="Basarisiz (Dead)"
          value={data.queue.totalDead}
          icon={<AlertTriangle className="h-4 w-4 text-destructive" />}
        />
        <StatCard
          title="Son 7 Gun Post"
          value={data.analytics.last7dPosts}
          icon={<Activity className="h-4 w-4 text-muted-foreground" />}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Kuyruk Derinligi</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tip</TableHead>
                  <TableHead className="text-right">Bekleyen</TableHead>
                  <TableHead className="text-right">Calisiyor</TableHead>
                  <TableHead className="text-right">Basarisiz</TableHead>
                  <TableHead className="text-right">Dead</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.queue.byType.map((q) => (
                  <TableRow key={q.type}>
                    <TableCell className="font-medium">{q.type}</TableCell>
                    <TableCell className="text-right">{q.pending}</TableCell>
                    <TableCell className="text-right">{q.claimed + q.running}</TableCell>
                    <TableCell className="text-right">{q.failed}</TableCell>
                    <TableCell className="text-right">{q.dead}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Format Performansi (7 Gun)</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Format</TableHead>
                  <TableHead className="text-right">Toplam</TableHead>
                  <TableHead className="text-right">Basari</TableHead>
                  <TableHead className="text-right">Oran</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.analytics.formatPerformance.map((f) => (
                  <TableRow key={f.format}>
                    <TableCell className="font-medium">{f.format}</TableCell>
                    <TableCell className="text-right">{f.total}</TableCell>
                    <TableCell className="text-right">{f.success}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={f.successRate >= 0.8 ? 'default' : f.successRate >= 0.5 ? 'secondary' : 'destructive'}>
                        {(f.successRate * 100).toFixed(0)}%
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon,
}: {
  title: string;
  value: React.ReactNode;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">
          {title}
        </CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}
