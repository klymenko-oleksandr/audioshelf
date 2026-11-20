import { RiHeadphoneLine } from '@remixicon/react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { LoginForm } from '@/features/admin/components/login-form';
import { safeNextPath } from '@/lib/auth/admin/redirect';

export const metadata: Metadata = { title: 'Admin sign in' };

/** Canvas: AdminLogin. A signed-in owner never sees this; `proxy.ts` sends them to the list. */
export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next } = await searchParams;
  const target = safeNextPath(Array.isArray(next) ? next[0] : next);

  return (
    <main className="bg-muted text-foreground grid min-h-dvh place-items-center p-6">
      <div className="flex w-full max-w-[380px] flex-col items-center gap-6">
        <div className="flex items-center gap-2.5">
          <span className="bg-foreground text-background grid size-9 place-items-center rounded-md">
            <RiHeadphoneLine size={20} aria-hidden />
          </span>
          <span className="flex flex-col">
            <span className="font-heading text-lg leading-5 font-semibold">Audioshelf</span>
            <span className="text-muted-foreground text-[11px]">Admin panel</span>
          </span>
        </div>
        <LoginForm next={target} />
        <Link
          href="/"
          className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-xs"
        >
          <RiHeadphoneLine size={14} aria-hidden />
          Back to the listening app
        </Link>
      </div>
    </main>
  );
}
