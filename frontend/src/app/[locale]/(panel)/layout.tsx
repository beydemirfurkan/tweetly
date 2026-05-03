import { auth } from '@clerk/nextjs/server';
import { redirect } from '@/i18n/navigation';
import { Sidebar } from '@/components/sidebar';

export default async function PanelLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const { userId } = await auth();
  if (!userId) {
    redirect({ href: '/login', locale });
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
