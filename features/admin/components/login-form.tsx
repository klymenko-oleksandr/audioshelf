'use client';

import { RiErrorWarningLine, RiFingerprintLine } from '@remixicon/react';
import { browserSupportsWebAuthn, startAuthentication } from '@simplewebauthn/browser';
import { useState } from 'react';
import { beginPasskeyLogin, finishPasskeyLogin } from '@/app/(admin)/admin/login/actions';
import { Button } from '@/components/ui/button';

export type LoginError =
  'cancelled' | 'rejected' | 'expired' | 'unsupported' | 'unavailable' | 'misconfigured';

/** The text under the button for each way a sign-in can fail. */
export function loginErrorText(error: LoginError | null): string | null {
  switch (error) {
    case null:
      return null;
    case 'cancelled':
      return 'The passkey prompt was closed. Try again when you are ready.';
    case 'rejected':
      return 'That passkey was not accepted.';
    case 'expired':
      return 'The sign-in took too long. Try again.';
    case 'unsupported':
      return 'This browser does not support passkeys.';
    case 'unavailable':
      return 'Sign-in is not available right now. Try again in a moment.';
    case 'misconfigured':
      return 'No passkey is set up on this server yet.';
  }
}

/** A closed or timed-out system prompt is not an error worth alarming anyone about. */
const isCancel = (error: unknown) =>
  error instanceof Error && (error.name === 'NotAllowedError' || error.name === 'AbortError');

export function LoginForm({ next }: { next: string }) {
  const [error, setError] = useState<LoginError | null>(null);
  const [pending, setPending] = useState(false);
  const message = loginErrorText(error);

  async function signIn() {
    setError(null);
    if (!browserSupportsWebAuthn()) return setError('unsupported');
    setPending(true);
    try {
      const begun = await beginPasskeyLogin();
      if (!begun.ok) return setError(begun.error);
      const response = await startAuthentication({ optionsJSON: begun.options });
      const finished = await finishPasskeyLogin(response, next);
      if (!finished.ok) return setError(finished.error);
      // A full navigation: the new cookie must be sent with the very next request.
      window.location.assign(finished.next);
    } catch (caught) {
      setError(isCancel(caught) ? 'cancelled' : 'unavailable');
    } finally {
      setPending(false);
    }
  }

  return (
    <section
      aria-labelledby="login-title"
      className="bg-card border-border flex w-full flex-col gap-4 rounded-xl border p-7 shadow-sm"
    >
      <div className="flex flex-col gap-1">
        <h1
          id="login-title"
          className="font-heading text-[22px] leading-7 font-semibold tracking-[-0.02em]"
        >
          Sign in to admin
        </h1>
        <p className="text-muted-foreground text-[13px] leading-5">
          Use your passkey (Touch ID, phone or security key) to manage books and categories.
        </p>
      </div>

      <Button
        type="button"
        size="lg"
        autoFocus
        disabled={pending}
        onClick={signIn}
        className="justify-center gap-1.5"
      >
        <RiFingerprintLine aria-hidden />
        {pending ? 'Waiting for your passkey…' : 'Sign in with passkey'}
      </Button>

      {message && (
        <span role="alert" className="text-destructive flex items-start gap-1.5 text-xs">
          <RiErrorWarningLine size={14} aria-hidden className="mt-px shrink-0" />
          {message}
        </span>
      )}
    </section>
  );
}
