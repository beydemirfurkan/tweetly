import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { ClerkProvider } from '@clerk/nextjs';
import { enUS, trTR } from '@clerk/localizations';
import { routing } from '@/i18n/routing';
import { clerkAppearance } from '@/lib/clerk-appearance';
import '../globals.css';

const geist = Geist({
  variable: '--font-geist',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
});

export const metadata: Metadata = {
  title: 'xtweetly',
  description: 'Programmatic X automation via MCP',
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!(routing.locales as readonly string[]).includes(locale)) {
    notFound();
  }

  setRequestLocale(locale);
  const messages = await getMessages();
  const clerkLocalization = locale === 'tr' ? trTR : enUS;

  return (
    <html
      lang={locale}
      className={`${geist.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ClerkProvider localization={clerkLocalization} appearance={clerkAppearance}>{children}</ClerkProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
