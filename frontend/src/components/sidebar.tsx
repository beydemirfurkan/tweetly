'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import {
  LayoutDashboard,
  Users,
  Zap,
  KeyRound,
  Radio,
  LogOut,
  Bird,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/accounts', label: 'Hesaplar', icon: Users },
  { href: '/actions', label: 'Aksiyonlar', icon: Zap },
  { href: '/monitoring', label: 'Monitörler', icon: Radio },
  { href: '/api-keys', label: 'API Anahtarları', icon: KeyRound },
];

export function Sidebar() {
  const pathname = usePathname();
  const { logout, user } = useAuth();

  return (
    <aside className="flex h-screen w-56 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex items-center gap-3 border-b border-sidebar-border px-4 py-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-primary/10">
          <Bird className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0">
          <span
            className="block truncate text-sm font-bold tracking-widest text-foreground uppercase"
            style={{ fontFamily: 'var(--font-syne)' }}
          >
            Tweetly
          </span>
          <span className="block truncate text-[10px] tracking-wider text-muted-foreground">
            {user?.email ?? 'MCP Platform'}
          </span>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 px-3 py-3">
        {NAV_ITEMS.map((item, i) => {
          const isActive = item.exact
            ? pathname === item.href || pathname === '/'
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{ animationDelay: `${i * 35}ms` }}
              className={cn(
                'group animate-fade-up flex items-center gap-2.5 rounded-md border-l-2 py-2 pl-2.5 pr-3 text-sm transition-all duration-150',
                isActive
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-transparent text-muted-foreground hover:border-border hover:bg-accent hover:text-foreground',
              )}
            >
              <item.icon
                className={cn(
                  'h-4 w-4 shrink-0 transition-colors',
                  isActive
                    ? 'text-primary'
                    : 'text-muted-foreground group-hover:text-foreground',
                )}
              />
              <span className="truncate">{item.label}</span>
              {isActive && (
                <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <button
          onClick={logout}
          className="flex w-full items-center gap-2.5 rounded-md border-l-2 border-transparent py-2 pl-2.5 pr-3 text-sm text-muted-foreground transition-all duration-150 hover:border-destructive/50 hover:bg-destructive/10 hover:text-destructive"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          <span>Çıkış Yap</span>
        </button>
      </div>
    </aside>
  );
}
