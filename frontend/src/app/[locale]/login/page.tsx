import { SignIn } from '@clerk/nextjs';
import { Bird } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

export default async function LoginPage() {
  const t = await getTranslations('login');

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-5 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(700px 360px at 80% 0%, color-mix(in oklab, var(--primary) 18%, transparent) 0%, transparent 60%), radial-gradient(600px 320px at 10% 100%, color-mix(in oklab, var(--primary) 12%, transparent) 0%, transparent 55%)',
        }}
      />

      <div className="relative flex w-full max-w-[420px] flex-col items-center gap-8 animate-fade-up">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-foreground text-background">
            <Bird className="h-5 w-5" strokeWidth={2.5} />
          </div>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            <span className="text-primary">●</span> {t('subtitle')}
          </p>
          <h1 className="text-[32px] font-black leading-[1] tracking-[-0.03em]">
            Sign in to <span className="text-primary">xtweetly</span>
          </h1>
        </div>

        <SignIn
          routing="hash"
          signUpUrl="/sign-up"
          forceRedirectUrl="/dashboard"
        />
      </div>
    </div>
  );
}
