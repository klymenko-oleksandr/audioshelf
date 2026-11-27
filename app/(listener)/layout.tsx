import { Suspense, type ReactNode } from 'react';
import { AppReady } from '@/components/shell/app-ready';
import { AppShell } from '@/components/shell/app-shell';
import { Splash } from '@/components/shell/splash';
import { GuestNudge } from '@/features/guest/components/guest-nudge';
import { WelcomeGate } from '@/features/guest/components/welcome-gate';
import { SyncRunner } from '@/features/sync/components/sync-runner';

/**
 * Everything a listener sees: splash, navigation, player, and the guest prompts (welcome
 * screen, sign-in nudge). The admin panel lives in its own
 * group (`(admin)`) and gets none of this — no player script, no listener navigation.
 */
export default function ListenerLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <>
      <Splash />
      <AppShell>{children}</AppShell>
      <WelcomeGate />
      {/* useSearchParams (the sign-in link keeps the page) needs a boundary. */}
      <Suspense fallback={null}>
        <GuestNudge />
      </Suspense>
      <SyncRunner />
      <AppReady />
    </>
  );
}
