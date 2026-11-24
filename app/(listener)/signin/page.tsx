import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { safeNextPath } from '@/features/account/next';
import { SigninView } from '@/features/account/components/signin-view';
import { parseSigninError } from '@/features/account/signin-error';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('pages.signin');
  return { title: t('title'), robots: { index: false, follow: false } };
}

/** Sign in (boards SignIn, MSignIn). `?next=` is where to return to; `?error=` after a failed try. */
export default async function SigninPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[]; error?: string | string[] }>;
}) {
  const params = await searchParams;
  return <SigninView next={safeNextPath(params.next)} error={parseSigninError(params.error)} />;
}
