import type { ReactNode } from 'react';
import { AppReady } from '@/components/shell/app-ready';
import { AppShell } from '@/components/shell/app-shell';
import { Splash } from '@/components/shell/splash';

/**
 * Everything a listener sees: splash, navigation, player. The admin panel lives in its own
 * group (`(admin)`) and gets none of this — no player script, no listener navigation.
 */
export default function ListenerLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <>
      <Splash />
      <AppShell>{children}</AppShell>
      <AppReady />
    </>
  );
}
