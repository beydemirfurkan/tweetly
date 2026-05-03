'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { ArrowRight, Zap, Search, Radio } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function GuidePage() {
  const t = useTranslations('guide');

  return (
    <div className="space-y-8 animate-fade-up max-w-3xl">
      <div>
        <h1
          className="text-2xl font-bold tracking-tight text-foreground"
          style={{ fontFamily: 'var(--font-syne)' }}
        >
          {t('title')}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      {/* Steps */}
      <div className="space-y-6">
        {/* Step 1 */}
        <StepCard num="01" title={t('step1Title')}>
          <p className="text-sm text-muted-foreground">{t('step1Desc')}</p>
          <Link
            href="/accounts"
            className="mt-3 inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
          >
            {t('step1Link')}
            <ArrowRight className="h-3 w-3" />
          </Link>
        </StepCard>

        {/* Step 2 */}
        <StepCard num="02" title={t('step2Title')}>
          <p className="text-sm text-muted-foreground">{t('step2Desc')}</p>
          <Link
            href="/api-keys"
            className="mt-3 inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
          >
            {t('step2Link')}
            <ArrowRight className="h-3 w-3" />
          </Link>
        </StepCard>

        {/* Step 3 */}
        <StepCard num="03" title={t('step3Title')}>
          <p className="text-sm text-muted-foreground">{t('step3Desc')}</p>
          <pre className="mt-3 overflow-x-auto rounded-md border border-border bg-muted/40 px-4 py-3 font-mono text-xs text-muted-foreground">
{`claude mcp add tweetly \\
  --url <backend>/mcp/sse \\
  --header "Authorization: Bearer tk_..."`}
          </pre>
        </StepCard>

        {/* Step 4 */}
        <StepCard num="04" title={t('step4Title')}>
          <p className="text-sm text-muted-foreground">{t('step4Desc')}</p>
          <pre className="mt-3 overflow-x-auto rounded-md border border-border bg-muted/40 px-4 py-3 font-mono text-xs text-muted-foreground">
{`# In Claude Code conversation:
Use the post_tweet tool to tweet "Hello from Tweetly MCP!"

# Or via tool call:
{
  "tool": "post_tweet",
  "arguments": {
    "text": "Hello from Tweetly MCP!"
  }
}`}
          </pre>
        </StepCard>
      </div>

      {/* Tools list */}
      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <span className="h-1 w-3 rounded-full bg-primary" />
            {t('toolsTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <ToolGroup
              icon={<Zap className="h-4 w-4 text-primary" />}
              label={t('writeTools')}
              tools={['post_tweet', 'reply_to_tweet', 'quote_tweet', 'retweet_tweet', 'like_tweet', 'unlike_tweet', 'follow_account', 'unfollow_account', 'send_dm', 'delete_tweet', 'bookmark_tweet', 'post_thread', 'update_profile', 'update_avatar', 'update_banner']}
            />
            <ToolGroup
              icon={<Search className="h-4 w-4 text-primary" />}
              label={t('readTools')}
              tools={['search_tweets', 'get_user', 'get_tweet', 'get_user_tweets', 'search_users', 'get_user_followers', 'get_user_following', 'get_user_mentions', 'get_x_trending', 'get_tweet_replies', 'get_tweet_quotes', 'get_tweet_retweeters']}
            />
            <ToolGroup
              icon={<Radio className="h-4 w-4 text-primary" />}
              label={t('monitorTools')}
              tools={['create_monitor', 'list_monitors', 'get_monitor', 'delete_monitor', 'pause_monitor']}
            />
          </div>
        </CardContent>
      </Card>

      {/* Troubleshooting */}
      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <span className="h-1 w-3 rounded-full bg-destructive/60" />
            {t('troubleTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-xs text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-destructive/60">•</span>
              {t('trouble1')}
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-destructive/60">•</span>
              {t('trouble2')}
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-destructive/60">•</span>
              {t('trouble3')}
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function StepCard({
  num,
  title,
  children,
}: {
  num: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-4">
      <span
        className="shrink-0 font-mono text-xl font-bold text-primary/30"
        style={{ fontFamily: 'var(--font-jetbrains)' }}
      >
        {num}
      </span>
      <div className="flex-1 rounded-xl border border-border/60 bg-card p-5">
        <h3 className="mb-3 text-sm font-semibold text-foreground">{title}</h3>
        {children}
      </div>
    </div>
  );
}

function ToolGroup({
  icon,
  label,
  tools,
}: {
  icon: React.ReactNode;
  label: string;
  tools: string[];
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5">
        {icon}
        <span className="text-xs font-semibold text-foreground">{label}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {tools.map((tool) => (
          <span
            key={tool}
            className="rounded border border-border/60 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
          >
            {tool}
          </span>
        ))}
      </div>
    </div>
  );
}
