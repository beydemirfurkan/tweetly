'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import {
  LayoutDashboard,
  Users,
  Zap,
  Settings,
  Heart,
  KeyRound,
  Send,
  LogOut,
  Bird,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '/panel', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/panel/accounts', label: 'Hesaplar', icon: Users },
  { href: '/panel/actions', label: 'Aksiyonlar', icon: Zap },
  { href: '/panel/settings', label: 'Ayarlar', icon: Settings },
  { href: '/panel/engagement', label: 'Etkileşim', icon: Heart },
  { href: '/panel/secrets', label: 'Gizli Anahtarlar', icon: KeyRound },
  { href: '/panel/collect', label: 'İçerik Topla', icon: Send },
];

export function Sidebar() {
  const pathname = usePathname();
  const { logout } = useAuth();

  return (
    <aside className="flex h-screen w-56 flex-col border-r border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-4">
        <Bird className="h-5 w-5 text-primary" />
        <span className="text-sm font-semibold">Tweetly</span>
      </div>

      <nav className="flex-1 space-y-1 px-2 py-3">
        {NAV_ITEMS.map((item) => {
          const isActive = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-accent text-accent-foreground font-medium'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border p-2">
        <button
          onClick={logout}
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
        >
          <LogOut className="h-4 w-4" />
          Çıkış
        </button>
      </div>
    </aside>
  );
}
