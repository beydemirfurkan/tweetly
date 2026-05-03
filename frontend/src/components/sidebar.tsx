'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { useAuth } from '@/lib/auth-context';
import {
  LayoutDashboard,
  Users,
  Zap,
  KeyRound,
  Radio,
  LogOut,
  Bird,
  BookOpen,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export function Sidebar() {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const router = useRouter();
  const { logout, user } = useAuth();

  const NAV_ITEMS: Array<{
    href: '/';
    label: string;
    icon: React.ElementType;
    exact?: boolean;
  } | {
    href: '/accounts' | '/actions' | '/monitoring' | '/api-keys' | '/guide';
    label: string;
    icon: React.ElementType;
    exact?: never;
  }> = [
    { href: '/', label: t('dashboard'), icon: LayoutDashboard, exact: true },
    { href: '/accounts', label: t('accounts'), icon: Users },
    { href: '/actions', label: t('actions'), icon: Zap },
    { href: '/monitoring', label: t('monitors'), icon: Radio },
    { href: '/api-keys', label: t('apiKeys'), icon: KeyRound },
    { href: '/guide', label: t('guide'), icon: BookOpen },
  ];

  const switchLocale = (locale: string) => {
    router.replace(pathname as '/', { locale });
  };

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

      <div className="border-t border-sidebar-border p-3 space-y-1">
        {/* Language toggle */}
        <div className="flex items-center gap-1 px-2.5 py-1.5">
          <button
            onClick={() => switchLocale('tr')}
            className="text-[10px] font-medium tracking-wider text-muted-foreground hover:text-foreground transition-colors"
          >
            TR
          </button>
          <span className="text-[10px] text-muted-foreground/40">/</span>
          <button
            onClick={() => switchLocale('en')}
            className="text-[10px] font-medium tracking-wider text-muted-foreground hover:text-foreground transition-colors"
          >
            EN
          </button>
        </div>
        {/* Logout */}
        <button
          onClick={logout}
          className="flex w-full items-center gap-2.5 rounded-md border-l-2 border-transparent py-2 pl-2.5 pr-3 text-sm text-muted-foreground transition-all duration-150 hover:border-destructive/50 hover:bg-destructive/10 hover:text-destructive"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          <span>{t('logout')}</span>
        </button>
      </div>
    </aside>
  );
}
