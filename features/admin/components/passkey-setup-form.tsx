'use client';

import { RiErrorWarningLine, RiFileCopyLine } from '@remixicon/react';
import { browserSupportsWebAuthn, startRegistration } from '@simplewebauthn/browser';
import { useState } from 'react';
import { beginPasskeySetup, finishPasskeySetup } from '@/app/(admin)/admin/login/setup/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const ERRORS = {
  bad_token: 'That setup token is not right.',
  rejected: 'The passkey was not accepted. Try again.',
  expired: 'This took too long. Try again.',
  misconfigured: 'Admin sign-in is not set up on this server (ADMIN_SESSION_SECRET).',
  cancelled: 'The passkey prompt was closed.',
  unsupported: 'This browser does not support passkeys.',
  unavailable: 'Something went wrong. Try again.',
} as const;

export function PasskeySetupForm({ initialToken }: { initialToken: string }) {
  const [token, setToken] = useState(initialToken);
  const [label, setLabel] = useState('');
  const [error, setError] = useState<keyof typeof ERRORS | null>(null);
  const [pending, setPending] = useState(false);
  const [entry, setEntry] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function create() {
    setError(null);
    if (!browserSupportsWebAuthn()) return setError('unsupported');
    setPending(true);
    try {
      const begun = await beginPasskeySetup(token);
      if (!begun.ok) return setError(begun.error);
      const response = await startRegistration({ optionsJSON: begun.options });
      const finished = await finishPasskeySetup(token, response, label);
      if (!finished.ok) return setError(finished.error);
      setEntry(finished.entry);
    } catch (caught) {
      const cancelled = caught instanceof Error && caught.name === 'NotAllowedError';
      setError(cancelled ? 'cancelled' : 'unavailable');
    } finally {
      setPending(false);
    }
  }

  if (entry) {
    return (
      <section className="bg-card border-border flex w-full flex-col gap-4 rounded-xl border p-7 shadow-sm">
        <h1 className="font-heading text-[22px] leading-7 font-semibold">Passkey created</h1>
        <ol className="text-muted-foreground list-decimal space-y-1 pl-4 text-[13px] leading-5">
          <li>
            In Vercel, open the project&apos;s environment variables and edit{' '}
            <code>ADMIN_PASSKEYS</code>.
          </li>
          <li>
            It holds a JSON list. Create it as <code>[ENTRY]</code> or add this entry after a comma
            to an existing list.
          </li>
          <li>
            Redeploy. Then remove <code>ADMIN_SETUP_TOKEN</code> so this page switches off.
          </li>
        </ol>
        <textarea
          readOnly
          aria-label="Passkey entry"
          value={entry}
          rows={5}
          onFocus={(event) => event.currentTarget.select()}
          className="border-input bg-background w-full rounded-md border p-2 font-mono text-xs"
        />
        <Button
          type="button"
          variant="outline"
          onClick={async () => {
            await navigator.clipboard.writeText(entry);
            setCopied(true);
          }}
          className="justify-center gap-1.5"
        >
          <RiFileCopyLine aria-hidden />
          {copied ? 'Copied' : 'Copy entry'}
        </Button>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="setup-title"
      className="bg-card border-border flex w-full flex-col gap-4 rounded-xl border p-7 shadow-sm"
    >
      <div className="flex flex-col gap-1">
        <h1 id="setup-title" className="font-heading text-[22px] leading-7 font-semibold">
          Add a passkey
        </h1>
        <p className="text-muted-foreground text-[13px] leading-5">
          Create a passkey on this device. Repeat on each device you want to sign in from.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="setup-token" className="text-[13px] leading-none font-medium">
          Setup token
        </label>
        <Input
          id="setup-token"
          type="password"
          autoComplete="off"
          value={token}
          onChange={(event) => setToken(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="setup-label" className="text-[13px] leading-none font-medium">
          Name (optional)
        </label>
        <Input
          id="setup-label"
          autoComplete="off"
          placeholder="MacBook"
          maxLength={60}
          value={label}
          onChange={(event) => setLabel(event.target.value)}
        />
      </div>
      <Button
        type="button"
        size="lg"
        disabled={pending || !token}
        onClick={create}
        className="justify-center"
      >
        {pending ? 'Waiting for your device…' : 'Create passkey'}
      </Button>
      {error && (
        <span role="alert" className="text-destructive flex items-start gap-1.5 text-xs">
          <RiErrorWarningLine size={14} aria-hidden className="mt-px shrink-0" />
          {ERRORS[error]}
        </span>
      )}
    </section>
  );
}
