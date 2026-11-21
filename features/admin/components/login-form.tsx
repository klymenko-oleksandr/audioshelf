'use client';

import { RiArrowRightLine, RiErrorWarningLine, RiEyeLine, RiEyeOffLine } from '@remixicon/react';
import { useActionState, useState } from 'react';
import { signIn, type LoginFormState } from '@/app/(admin)/admin/login/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MIN_PASSWORD_LENGTH } from '@/lib/auth/admin/min-length';

function minutes(seconds: number) {
  const m = Math.max(1, Math.ceil(seconds / 60));
  return m === 1 ? '1 minute' : `${m} minutes`;
}

/** The text under the field for each way a sign-in can fail (canvas: AdminLogin, wrong password). */
export function loginErrorText(state: LoginFormState): string | null {
  switch (state.error) {
    case null:
      return null;
    case 'wrong':
      return state.attemptsLeft === 1
        ? 'Wrong password. 1 attempt left before a 15-minute lock.'
        : `Wrong password. ${state.attemptsLeft} attempts left before a 15-minute lock.`;
    case 'too_short':
      return `The password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
    case 'locked':
      return `Too many wrong passwords. Try again in ${minutes(state.retryAfterSeconds)}.`;
    case 'unavailable':
      return 'Sign-in is not available right now. Try again in a moment.';
    case 'misconfigured':
      return 'Admin sign-in is not set up on this server.';
  }
}

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginFormState, FormData>(signIn, {
    error: null,
  });
  const [visible, setVisible] = useState(false);
  const message = loginErrorText(state);
  const invalid = state.error === 'wrong' || state.error === 'too_short';

  return (
    <form
      action={action}
      aria-labelledby="login-title"
      className="bg-card border-border flex w-full flex-col gap-4 rounded-xl border p-7 shadow-sm"
    >
      <input type="hidden" name="next" value={next} />
      <div className="flex flex-col gap-1">
        <h1
          id="login-title"
          className="font-heading text-[22px] leading-7 font-semibold tracking-[-0.02em]"
        >
          Sign in to admin
        </h1>
        <p className="text-muted-foreground text-[13px] leading-5">
          Enter the admin password to manage books and categories.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="admin-password" className="text-[13px] leading-none font-medium">
          Password
        </label>
        <div className="relative flex">
          <Input
            id="admin-password"
            name="password"
            type={visible ? 'text' : 'password'}
            autoComplete="current-password"
            autoFocus
            required
            aria-invalid={invalid || undefined}
            aria-describedby={message ? 'admin-password-error' : undefined}
            className="pr-10"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={visible ? 'Hide password' : 'Show password'}
            aria-pressed={visible}
            onClick={() => setVisible((v) => !v)}
            className="absolute top-0 right-0.5 h-9"
          >
            {visible ? <RiEyeOffLine aria-hidden /> : <RiEyeLine aria-hidden />}
          </Button>
        </div>
        {message && (
          <span
            id="admin-password-error"
            role="alert"
            className="text-destructive flex items-start gap-1.5 text-xs"
          >
            <RiErrorWarningLine size={14} aria-hidden className="mt-px shrink-0" />
            {message}
          </span>
        )}
      </div>

      <Button type="submit" size="lg" disabled={pending} className="justify-center gap-1.5">
        {pending ? 'Signing in…' : 'Sign in'}
        {!pending && <RiArrowRightLine aria-hidden />}
      </Button>
    </form>
  );
}
