import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Bird, Zap, Search, Radio, ArrowRight } from 'lucide-react';

export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('landing');

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      {/* Nav */}
      <nav className="border-b border-border/40">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-primary/25 bg-primary/10">
              <Bird className="h-4 w-4 text-primary" />
            </div>
            <span
              className="text-sm font-bold tracking-widest text-foreground uppercase"
              style={{ fontFamily: 'var(--font-syne)' }}
            >
              Tweetly
            </span>
          </div>
          <Link
            href="/login"
            className="rounded-md border border-primary/40 bg-primary/10 px-4 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
          >
            {t('heroCta')}
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative mx-auto max-w-5xl px-6 pb-16 pt-24 text-center">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 70% 50% at 50% 20%, oklch(0.72 0.148 196 / 0.08) 0%, transparent 65%)',
          }}
        />
        <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
          {t('badge')}
        </span>
        <h1
          className="mx-auto max-w-3xl text-4xl font-bold leading-tight tracking-tight text-foreground sm:text-5xl"
          style={{ fontFamily: 'var(--font-syne)' }}
        >
          {t('heroTitle')}
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-base text-muted-foreground">
          {t('heroSubtitle')}
        </p>
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            {t('heroCta')}
            <ArrowRight className="h-4 w-4" />
          </Link>
          <span className="text-xs text-muted-foreground">{t('heroStats')}</span>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-5xl px-6 pb-16">
        <h2
          className="mb-8 text-center text-2xl font-bold text-foreground"
          style={{ fontFamily: 'var(--font-syne)' }}
        >
          {t('featuresTitle')}
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <FeatureCard
            icon={<Zap className="h-5 w-5 text-primary" />}
            title={t('feature1Title')}
            desc={t('feature1Desc')}
          />
          <FeatureCard
            icon={<Search className="h-5 w-5 text-primary" />}
            title={t('feature2Title')}
            desc={t('feature2Desc')}
          />
          <FeatureCard
            icon={<Radio className="h-5 w-5 text-primary" />}
            title={t('feature3Title')}
            desc={t('feature3Desc')}
          />
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-5xl px-6 pb-16">
        <h2
          className="mb-8 text-center text-2xl font-bold text-foreground"
          style={{ fontFamily: 'var(--font-syne)' }}
        >
          {t('howTitle')}
        </h2>
        <div className="grid gap-6 sm:grid-cols-3">
          <HowStep num="01" title={t('how1Title')} desc={t('how1Desc')} />
          <HowStep num="02" title={t('how2Title')} desc={t('how2Desc')} />
          <HowStep num="03" title={t('how3Title')} desc={t('how3Desc')} />
        </div>
      </section>

      {/* Beta CTA */}
      <section className="mx-auto max-w-5xl px-6 pb-24">
        <div className="rounded-xl border border-primary/20 bg-primary/5 px-8 py-10 text-center">
          <p className="text-sm text-muted-foreground">{t('betaText')}</p>
          <Link
            href="/login"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            {t('betaCta')}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 py-6">
        <p className="text-center text-xs text-muted-foreground">
          © 2026 Tweetly. Not affiliated with X Corp.
        </p>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-5">
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg border border-primary/20 bg-primary/10">
        {icon}
      </div>
      <h3 className="mb-1.5 text-sm font-semibold text-foreground">{title}</h3>
      <p className="text-xs leading-relaxed text-muted-foreground">{desc}</p>
    </div>
  );
}

function HowStep({
  num,
  title,
  desc,
}: {
  num: string;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <span
        className="font-mono text-3xl font-bold text-primary/30"
        style={{ fontFamily: 'var(--font-jetbrains)' }}
      >
        {num}
      </span>
      <div>
        <h3 className="mb-1 text-sm font-semibold text-foreground">{title}</h3>
        <p className="text-xs leading-relaxed text-muted-foreground">{desc}</p>
      </div>
    </div>
  );
}
