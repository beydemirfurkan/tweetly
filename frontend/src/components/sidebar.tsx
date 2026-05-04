'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { useAuth } from '@/lib/auth-context';
import {
  ArrowUpRight,
  Bird,
  BookOpen,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Radio,
  ScrollText,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();

  const NAV_ITEMS: Array<{
    href: '/dashboard' | '/accounts' | '/actions' | '/monitoring' | '/api-keys' | '/guide';
    label: string;
    icon: React.ElementType;
  }> = [
    { href: '/dashboard', label: t('dashboard'), icon: LayoutDashboard },
    { href: '/accounts', label: t('accounts'), icon: Users },
    { href: '/actions', label: t('actions'), icon: Zap },
    { href: '/monitoring', label: t('monitors'), icon: Radio },
    { href: '/api-keys', label: t('apiKeys'), icon: KeyRound },
    { href: '/guide', label: t('guide'), icon: BookOpen },
  ];

  const switchLocale = (locale: string) => {
    router.replace(pathname as '/dashboard', { locale });
  };

  const handleLogout = () => {
    logout();
    router.replace('/login' as const);
  };

  const email = user?.email ?? null;

  return (
    <>
      {/* Mobile backdrop */}
      <div
        aria-hidden
        onClick={onClose}
        className={cn(
          'fixed inset-0 z-40 bg-black/60 transition-opacity duration-200 lg:hidden',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      />

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex h-screen w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-transform duration-200',
          'lg:static lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
      >
        <div className="flex items-center gap-3 border-b border-sidebar-border px-5 py-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
            <Bird className="h-[18px] w-[18px]" strokeWidth={2.5} />
          </div>
          <div className="min-w-0 leading-tight">
            <span className="block truncate text-[15px] font-extrabold tracking-tight text-foreground">
              xtweetly
            </span>
            <span className="block truncate text-[11px] text-muted-foreground">
              {email ?? 'MCP Platform'}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto -mr-1 flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground lg:hidden"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" strokeWidth={2.5} />
          </button>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
          {NAV_ITEMS.map((item, i) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                style={{ animationDelay: `${i * 35}ms` }}
                className={cn(
                  'group animate-fade-up flex items-center gap-3 rounded-full px-3 py-2 text-[14px] font-medium transition-colors',
                  isActive
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                <item.icon
                  className={cn(
                    'h-[18px] w-[18px] shrink-0',
                    isActive ? '' : 'text-muted-foreground group-hover:text-foreground',
                  )}
                  strokeWidth={isActive ? 2.5 : 2}
                />
                <span className="truncate">{item.label}</span>
                {isActive && (
                  <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-background/70" />
                )}
              </Link>
            );
          })}

          <div className="my-3 h-px bg-sidebar-border" />

          <a
            href="/docs"
            target="_blank"
            rel="noreferrer"
            className="group flex items-center gap-3 rounded-full px-3 py-2 text-[14px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ScrollText className="h-[18px] w-[18px] shrink-0" />
            <span className="truncate">API Docs</span>
            <ArrowUpRight
              className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-foreground"
              strokeWidth={2.5}
            />
          </a>
        </nav>

        <div className="border-t border-sidebar-border px-3 py-3 space-y-2">
          <div className="flex items-center gap-1 px-2">
            <button
              onClick={() => switchLocale('tr')}
              className="rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wider text-muted-foreground transition-colors hover:text-foreground"
            >
              TR
            </button>
            <span className="font-mono text-[10px] text-muted-foreground/40">·</span>
            <button
              onClick={() => switchLocale('en')}
              className="rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wider text-muted-foreground transition-colors hover:text-foreground"
            >
              EN
            </button>
          </div>
          <button
            onClick={handleLogout}
            className="group flex w-full items-center gap-3 rounded-full px-3 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut className="h-[16px] w-[16px] shrink-0" strokeWidth={2} />
            <span className="truncate">{t('logout')}</span>
          </button>
        </div>
      </aside>
    </>
  );
}
