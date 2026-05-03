import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import {
  ArrowUpRight,
  Bird,
  BookOpen,
  CheckCircle2,
  Code2,
  Globe2,
  Repeat2,
  Search,
  Sparkles,
  Zap,
} from 'lucide-react';

export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('landing');

  return (
    <div className="min-h-screen bg-background text-foreground antialiased">
      {/* TOP NAV — X-style sticky bar with hairline */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-[1100px] items-center justify-between px-5">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-background">
              <Bird className="h-[18px] w-[18px]" strokeWidth={2.5} />
            </div>
            <span className="text-[17px] font-extrabold tracking-tight">xtweetly</span>
          </Link>
          <nav className="hidden items-center gap-7 text-sm font-medium text-muted-foreground sm:flex">
            <a href="#features" className="hover:text-foreground transition-colors">{t('navFeatures')}</a>
            <a href="#how" className="hover:text-foreground transition-colors">{t('navWorkflow')}</a>
            <a href="#dx" className="hover:text-foreground transition-colors">{t('navDevelopers')}</a>
            <a
              href="/docs"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
            >
              {t('navDocs')}
              <ArrowUpRight className="h-3 w-3" strokeWidth={2.5} />
            </a>
          </nav>
          <Link
            href="/login"
            className="pill inline-flex items-center gap-1.5 bg-foreground px-4 py-1.5 text-[13px] font-bold text-background transition-opacity hover:opacity-90"
          >
            {t('heroCta')}
          </Link>
        </div>
      </header>

      {/* HERO — feed-column composition with a real "post card" preview */}
      <section className="relative overflow-hidden border-b border-border">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              'radial-gradient(900px 420px at 80% -10%, color-mix(in oklab, var(--primary) 22%, transparent) 0%, transparent 60%), radial-gradient(700px 360px at 5% 110%, color-mix(in oklab, var(--primary) 14%, transparent) 0%, transparent 55%)',
          }}
        />
        <div className="mx-auto grid max-w-[1100px] grid-cols-1 gap-12 px-5 pb-24 pt-20 lg:grid-cols-[1.15fr_1fr] lg:gap-10 lg:pb-28 lg:pt-28">
          <div className="animate-fade-up">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-primary">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-pulse-dot rounded-full bg-primary" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
              </span>
              {t('badge')}
            </span>
            <h1 className="mt-5 text-[44px] font-black leading-[1.04] tracking-[-0.035em] sm:text-[58px]">
              {t('heroTitle')}
            </h1>
            <p className="mt-5 max-w-[34ch] text-[17px] leading-[1.55] text-muted-foreground">
              {t('heroSubtitle')}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/login"
                className="pill group inline-flex items-center gap-2 bg-foreground px-6 py-3 text-[15px] font-bold text-background transition-transform hover:scale-[1.02]"
              >
                {t('heroCta')}
                <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" strokeWidth={2.75} />
              </Link>
              <a
                href="/docs"
                target="_blank"
                rel="noreferrer"
                className="pill inline-flex items-center gap-2 border border-border bg-transparent px-5 py-3 text-[14px] font-semibold text-foreground transition-colors hover:bg-accent"
              >
                <Code2 className="h-4 w-4" />
                {t('heroDocsCta')}
              </a>
              <span className="ml-1 text-[12px] font-medium text-muted-foreground">{t('heroStats')}</span>
            </div>

            <div className="mt-10 flex items-center gap-6 border-t border-border pt-6 text-[12px] text-muted-foreground">
              <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-success" /> {t('trustMagicLink')}</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-success" /> {t('trustWebhooks')}</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-success" /> {t('trustTools')}</span>
            </div>
          </div>

          {/* Post-card preview — visually quotes the X UI */}
          <div className="animate-fade-up [animation-delay:120ms]">
            <PostCard
              name={t('postCardName')}
              handle={t('postCardHandle')}
              body={t.rich('postCardBody', {
                accent: (chunks) => <span className="text-primary">{chunks}</span>,
              })}
              via={t('postCardVia')}
            />
          </div>
        </div>

        {/* TICKER STRIP */}
        <TickerStrip />
      </section>

      {/* FEATURES — three full-bleed columns with hairline rules between, no card chrome */}
      <section id="features" className="border-b border-border">
        <div className="mx-auto max-w-[1100px] px-5 py-20">
          <SectionEyebrow num="01" label={t('eyebrowCapabilities')} />
          <h2 className="mt-3 max-w-3xl text-[36px] font-black leading-[1.1] tracking-[-0.03em]">
            {t('featuresTitle')}
          </h2>
          <div className="mt-12 grid grid-cols-1 divide-y divide-border md:grid-cols-3 md:divide-x md:divide-y-0">
            <FeatureColumn
              icon={<Zap className="h-5 w-5" />}
              title={t('feature1Title')}
              desc={t('feature1Desc')}
              kbd={t('feature1Kbd')}
            />
            <FeatureColumn
              icon={<Search className="h-5 w-5" />}
              title={t('feature2Title')}
              desc={t('feature2Desc')}
              kbd={t('feature2Kbd')}
            />
            <FeatureColumn
              icon={<Globe2 className="h-5 w-5" />}
              title={t('feature3Title')}
              desc={t('feature3Desc')}
              kbd={t('feature3Kbd')}
            />
          </div>
        </div>
      </section>

      {/* WORKFLOW — numbered, generous spacing, no boxes */}
      <section id="how" className="border-b border-border">
        <div className="mx-auto grid max-w-[1100px] grid-cols-1 gap-10 px-5 py-20 lg:grid-cols-[280px_1fr] lg:gap-20">
          <div>
            <SectionEyebrow num="02" label={t('eyebrowWorkflow')} />
            <h2 className="mt-3 text-[36px] font-black leading-[1.05] tracking-[-0.03em]">
              {t('howTitle')}
            </h2>
            <p className="mt-4 text-[14px] leading-[1.6] text-muted-foreground">
              {t('howSubtitle')}
            </p>
          </div>
          <ol className="space-y-0">
            <Step n="01" title={t('how1Title')} desc={t('how1Desc')} />
            <Step n="02" title={t('how2Title')} desc={t('how2Desc')} />
            <Step n="03" title={t('how3Title')} desc={t('how3Desc')} last />
          </ol>
        </div>
      </section>

      {/* DEV-EX BLOCK — terminal-styled command card */}
      <section id="dx" className="border-b border-border">
        <div className="mx-auto max-w-[1100px] px-5 py-20">
          <SectionEyebrow num="03" label={t('eyebrowConnect')} />
          <h2 className="mt-3 max-w-2xl text-[36px] font-black leading-[1.05] tracking-[-0.03em]">
            {t('connectTitle')}
          </h2>
          <p className="mt-5 max-w-[58ch] text-[15px] leading-[1.6] text-muted-foreground">
            {t.rich('connectBody', {
              code: (chunks) => <code className="font-mono text-foreground">{chunks}</code>,
            })}
          </p>
          <div className="mt-8 overflow-hidden rounded-2xl border border-border bg-popover">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-destructive/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-[oklch(0.78_0.155_80)]/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-success/80" />
              </div>
              <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{t('connectMcpLabel')}</span>
              <span className="font-mono text-[11px] text-success">{t('connectLive')}</span>
            </div>
            <pre className="overflow-x-auto px-5 py-5 font-mono text-[15px] leading-[1.6] text-foreground">
              https://api.your-domain.com/mcp
            </pre>
            <div className="border-t border-border px-5 py-4 font-mono text-[12px] leading-[1.65] text-muted-foreground whitespace-pre-line">
              {t('connectInstructions')}
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={'/connect' as '/connect'}
              className="pill group inline-flex items-center gap-2 bg-foreground px-6 py-3 text-[14px] font-bold text-background transition-transform hover:scale-[1.02]"
            >
              <Sparkles className="h-4 w-4" strokeWidth={2.75} />
              {t('connectPerClient')}
              <ArrowUpRight
                className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                strokeWidth={2.75}
              />
            </Link>
          </div>
        </div>
      </section>

      {/* API REFERENCE — surfaces the Scalar API reference behind the panel */}
      <section id="docs" className="border-b border-border">
        <div className="mx-auto grid max-w-[1100px] grid-cols-1 gap-10 px-5 py-20 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
          <div>
            <SectionEyebrow num="04" label={t('eyebrowDocs')} />
            <h2 className="mt-3 max-w-[18ch] text-[36px] font-black leading-[1.05] tracking-[-0.03em]">
              {t('docsTitle')}
            </h2>
            <p className="mt-5 max-w-[44ch] text-[14px] leading-[1.65] text-muted-foreground">
              {t.rich('docsBody', {
                code: (chunks) => <span className="font-mono text-foreground">{chunks}</span>,
              })}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a
                href="/docs"
                target="_blank"
                rel="noreferrer"
                className="pill group inline-flex items-center gap-2 bg-foreground px-6 py-3 text-[14px] font-bold text-background transition-transform hover:scale-[1.02]"
              >
                <BookOpen className="h-4 w-4" strokeWidth={2.75} />
                {t('docsOpenReference')}
                <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" strokeWidth={2.75} />
              </a>
              <a
                href="/api/openapi.json"
                target="_blank"
                rel="noreferrer"
                className="pill inline-flex items-center gap-2 border border-border px-5 py-3 font-mono text-[12px] uppercase tracking-wider text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                openapi.json
              </a>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-border bg-popover">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-destructive/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-[oklch(0.78_0.155_80)]/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-success/80" />
              </div>
              <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                {t('docsPanelTitle')}
              </span>
              <span className="font-mono text-[11px] text-success">{t('docsPanelLive')}</span>
            </div>
            <ul className="divide-y divide-border font-mono text-[12px]">
              <Endpoint method="POST" path="/api/v1/actions/post" desc={t('endpointDesc.post')} />
              <Endpoint method="POST" path="/api/v1/actions/reply" desc={t('endpointDesc.reply')} />
              <Endpoint method="POST" path="/api/v1/actions/quote" desc={t('endpointDesc.quote')} />
              <Endpoint method="POST" path="/api/v1/actions/retweet" desc={t('endpointDesc.retweet')} />
              <Endpoint method="POST" path="/api/v1/actions/like" desc={t('endpointDesc.like')} />
              <Endpoint method="POST" path="/api/v1/actions/follow" desc={t('endpointDesc.follow')} />
              <Endpoint method="POST" path="/api/v1/actions/dm" desc={t('endpointDesc.dm')} />
              <Endpoint method="GET" path="/api/v1/search/tweets" desc={t('endpointDesc.searchTweets')} />
              <Endpoint method="GET" path="/api/v1/users/:handle" desc={t('endpointDesc.userProfile')} />
              <Endpoint method="GET" path="/api/v1/me/summary" desc={t('endpointDesc.summary')} />
              <Endpoint method="POST" path="/api/v1/monitors" desc={t('endpointDesc.createMonitor')} />
            </ul>
            <div className="border-t border-border px-4 py-2.5 text-right font-mono text-[11px] text-muted-foreground">
              {t('docsMore')}
            </div>
          </div>
        </div>
      </section>

      {/* CTA — pill button on a quiet row */}
      <section className="border-b border-border">
        <div className="mx-auto flex max-w-[1100px] flex-col items-center gap-5 px-5 py-20 text-center">
          <Sparkles className="h-6 w-6 text-primary" />
          <p className="max-w-xl text-[20px] font-semibold leading-[1.4] tracking-tight">
            {t('betaText')}
          </p>
          <Link
            href="/login"
            className="pill inline-flex items-center gap-2 bg-foreground px-7 py-3 text-[15px] font-bold text-background transition-transform hover:scale-[1.02]"
          >
            {t('betaCta')}
            <ArrowUpRight className="h-4 w-4" strokeWidth={2.75} />
          </Link>
        </div>
      </section>

      <footer>
        <div className="mx-auto flex max-w-[1100px] items-center justify-between px-5 py-7 text-[12px] text-muted-foreground">
          <span>{t('footer')}</span>
          <span>{t('footerDisclaimer')}</span>
        </div>
      </footer>
    </div>
  );
}

/* ---------- bits ---------- */

function SectionEyebrow({ num, label }: { num: string; label: string }) {
  return (
    <div className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
      <span className="font-mono text-primary">{num}</span>
      <span className="h-px w-10 bg-border" />
      <span>{label}</span>
    </div>
  );
}

function FeatureColumn({
  icon,
  title,
  desc,
  kbd,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  kbd: string;
}) {
  return (
    <div className="group relative px-0 py-8 first:pt-0 md:px-7 md:py-2 md:first:pl-0 md:last:pr-0">
      <div className="mb-5 inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-accent text-foreground transition-colors group-hover:border-primary group-hover:text-primary">
        {icon}
      </div>
      <h3 className="text-[20px] font-bold tracking-tight">{title}</h3>
      <p className="mt-2 text-[14px] leading-[1.6] text-muted-foreground">{desc}</p>
      <div className="mt-5 font-mono text-[11px] tracking-wider text-muted-foreground/80">
        {kbd}
      </div>
    </div>
  );
}

function Step({
  n,
  title,
  desc,
  last,
}: {
  n: string;
  title: string;
  desc: string;
  last?: boolean;
}) {
  return (
    <li className={`flex gap-6 py-7 ${last ? '' : 'border-b border-border'}`}>
      <span className="font-mono text-[13px] font-semibold text-primary">{n}</span>
      <div>
        <h3 className="text-[20px] font-bold tracking-tight">{title}</h3>
        <p className="mt-2 max-w-[52ch] text-[14px] leading-[1.65] text-muted-foreground">{desc}</p>
      </div>
    </li>
  );
}

function PostCard({
  name,
  handle,
  body,
  via,
}: {
  name: string;
  handle: string;
  body: React.ReactNode;
  via: string;
}) {
  return (
    <article className="relative rounded-2xl border border-border bg-popover/60 p-5 backdrop-blur-sm">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 rounded-2xl"
        style={{
          background:
            'linear-gradient(135deg, color-mix(in oklab, var(--primary) 10%, transparent), transparent 55%)',
        }}
      />
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
          <Bird className="h-5 w-5" strokeWidth={2.5} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 text-[15px] font-bold">
            {name}
            <svg viewBox="0 0 22 22" className="h-[18px] w-[18px] text-primary"><path fill="currentColor" d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z"/></svg>
            <span className="text-[14px] font-normal text-muted-foreground">{handle}</span>
          </div>
          <p className="mt-1 text-[15px] leading-[1.45]">{body}</p>
          <div className="mt-3 overflow-hidden rounded-xl border border-border">
            <div className="flex items-center gap-3 border-b border-border bg-accent/40 px-4 py-2.5">
              <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-success" />
              <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">tool · post_tweet</span>
              <span className="ml-auto font-mono text-[11px] text-muted-foreground">200 OK · 312ms</span>
            </div>
            <pre className="px-4 py-3 font-mono text-[12px] leading-[1.6] text-muted-foreground">
{`{
  "id": "1834729310987234567",
  "text": "New release of @anthropic-ai…",
  "created_at": "2026-05-03T14:22:08Z"
}`}
            </pre>
          </div>
          <div className="mt-3 flex items-center gap-7 text-[13px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><Repeat2 className="h-4 w-4" /> 1.2K</span>
            <span className="inline-flex items-center gap-1.5"><Sparkles className="h-4 w-4" /> 8.4K</span>
            <span className="ml-auto font-mono text-[11px]">{via}</span>
          </div>
        </div>
      </div>
    </article>
  );
}

function Endpoint({
  method,
  path,
  desc,
}: {
  method: 'GET' | 'POST' | 'DELETE' | 'PATCH';
  path: string;
  desc: string;
}) {
  const methodColor = {
    GET: 'text-success border-success/40',
    POST: 'text-primary border-primary/40',
    DELETE: 'text-destructive border-destructive/40',
    PATCH: 'text-[oklch(0.78_0.155_80)] border-[oklch(0.78_0.155_80)]/40',
  }[method];
  return (
    <li className="row-hover flex items-center gap-3 px-4 py-2.5">
      <span
        className={`pill min-w-[44px] border px-2 text-center text-[10px] font-bold tracking-wider ${methodColor}`}
      >
        {method}
      </span>
      <span className="text-foreground">{path}</span>
      <span className="ml-auto text-muted-foreground">{desc}</span>
    </li>
  );
}

function TickerStrip() {
  const items = [
    'POST_TWEET',
    'REPLY',
    'QUOTE',
    'RETWEET',
    'LIKE',
    'FOLLOW',
    'UNFOLLOW',
    'SEND_DM',
    'DELETE_TWEET',
    'SEARCH_TWEETS',
    'GET_USER',
    'GET_TIMELINE',
    'GET_TRENDS',
    'WATCH_USER',
    'WATCH_QUERY',
  ];
  const doubled = [...items, ...items];
  return (
    <div className="overflow-hidden border-t border-border bg-background/40">
      <div className="flex gap-10 whitespace-nowrap py-3 font-mono text-[11px] uppercase tracking-widest text-muted-foreground animate-ticker">
        {doubled.map((it, i) => (
          <span key={i} className="flex items-center gap-3">
            <span className="h-1 w-1 rounded-full bg-primary" />
            {it}
          </span>
        ))}
      </div>
    </div>
  );
}
