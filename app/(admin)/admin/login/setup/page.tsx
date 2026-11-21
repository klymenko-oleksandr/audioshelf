import type { Metadata } from 'next';
import Link from 'next/link';
import { PasskeySetupForm } from '@/features/admin/components/passkey-setup-form';
import { isSetupEnabled } from '@/lib/auth/admin/setup-token';

export const metadata: Metadata = { title: 'Add an admin passkey' };

/**
 * Adding a passkey. Exists only while `ADMIN_SETUP_TOKEN` is set in the environment; without
 * it this page is just a note that setup is off.
 */
export default async function PasskeySetupPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  const enabled = isSetupEnabled(process.env.ADMIN_SETUP_TOKEN);

  return (
    <main className="bg-muted text-foreground grid min-h-dvh place-items-center p-6">
      <div className="flex w-full max-w-[420px] flex-col items-center gap-6">
        {enabled ? (
          <PasskeySetupForm
            initialToken={Array.isArray(token) ? (token[0] ?? '') : (token ?? '')}
          />
        ) : (
          <section className="bg-card border-border w-full rounded-xl border p-7 text-[13px] shadow-sm">
            <h1 className="font-heading mb-1 text-[22px] leading-7 font-semibold">Setup is off</h1>
            <p className="text-muted-foreground leading-5">
              To add a passkey, set <code>ADMIN_SETUP_TOKEN</code> (32+ random characters) on the
              server and redeploy.
            </p>
          </section>
        )}
        <Link href="/admin/login" className="text-muted-foreground hover:text-foreground text-xs">
          Back to sign in
        </Link>
      </div>
    </main>
  );
}
