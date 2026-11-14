'use client';

import {
  RiDeleteBinLine,
  RiDownload2Fill,
  RiErrorWarningLine,
  RiPlayListAddLine,
} from '@remixicon/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { useDelayedLoading } from '@/hooks/use-delayed-loading';

function Section({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <section className="border-border flex flex-col gap-3 border-t pt-5">
      <h2 className="text-h4">{title}</h2>
      <p className="text-muted-foreground max-w-prose">{note}</p>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </section>
  );
}

function LoaderDemo() {
  const [loading, setLoading] = useState(false);
  const visible = useDelayedLoading(loading);
  const startedAt = useRef(0);
  const log = useRef<HTMLParagraphElement>(null);

  // Written straight to the DOM: this is a stopwatch readout, not app state.
  useEffect(() => {
    if (!log.current || startedAt.current === 0) return;
    const at = Math.round(performance.now() - startedAt.current);
    log.current.textContent += ` · skeleton ${visible ? 'shown' : 'hidden'} at ${at} ms`;
  }, [visible]);

  function load(ms: number) {
    startedAt.current = performance.now();
    if (log.current) log.current.textContent = `Loading for ${ms} ms`;
    setLoading(true);
    setTimeout(() => setLoading(false), ms);
  }

  return (
    <>
      <Button variant="outline" disabled={loading} onClick={() => load(200)}>
        Load 200 ms
      </Button>
      <Button variant="outline" disabled={loading} onClick={() => load(400)}>
        Load 400 ms
      </Button>
      <Button variant="outline" disabled={loading} onClick={() => load(2000)}>
        Load 2 s
      </Button>
      <div className="flex basis-full flex-col gap-2 pt-2">
        <div className="h-12 w-72">
          {visible ? (
            <Skeleton className="size-full" />
          ) : (
            <div className="border-border bg-card grid size-full place-items-center rounded-md border">
              Content
            </div>
          )}
        </div>
        <p ref={log} className="text-muted-foreground text-caption" data-testid="loader-log">
          Idle
        </p>
      </div>
    </>
  );
}

function Bomb(): ReactNode {
  throw new Error('Showcase: thrown on purpose to demonstrate the error boundary');
}

export function Showcase() {
  const [explode, setExplode] = useState(false);
  if (explode) return <Bomb />;

  return (
    <div className="flex flex-col gap-6 px-4 pt-2 pb-6 md:px-6 md:pt-5 lg:px-8 lg:pt-7">
      <div className="flex flex-col gap-2">
        <h1 className="text-h2">UI showcase</h1>
        <p className="text-muted-foreground max-w-prose">
          Shared behaviours from the PRD, for review. Not linked from the app and hidden in
          production.
        </p>
      </div>

      <Section
        title="Toasts"
        note="One at a time; a new one replaces the current. 5 s, or 8 s with an action; hover or focus pauses the timer. Errors stay until dismissed."
      >
        <Button
          variant="outline"
          onClick={() =>
            toast({
              icon: <RiPlayListAddLine size={18} />,
              title: 'Added to Listen later',
              action: {
                label: 'Undo',
                onClick: () => toast({ title: 'Removed from Listen later' }),
              },
            })
          }
        >
          With Undo
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            toast({
              icon: <RiDeleteBinLine size={18} />,
              title: 'Removed download',
              description: 'Frees 412 MB on this device',
              action: { label: 'Undo', onClick: () => {} },
              onDismiss: (reason) => {
                if (reason !== 'action') console.info(`Delayed delete runs now (${reason})`);
              },
            })
          }
        >
          With description
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            toast({ icon: <RiDownload2Fill size={18} />, title: 'Dracula is ready offline' })
          }
        >
          Plain
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            toast({
              variant: 'error',
              icon: <RiErrorWarningLine size={18} />,
              title: "Couldn't download Dracula",
              description: 'Not enough space on this device',
              action: { label: 'Retry', onClick: () => {} },
            })
          }
        >
          Error
        </Button>
      </Section>

      <Section
        title="Loader timing"
        note="Nothing for the first 300 ms, then at least 600 ms on screen. 200 ms shows no skeleton; 400 ms shows it from 300 to 900 ms."
      >
        <LoaderDemo />
      </Section>

      <Section
        title="Error boundary"
        note="A page that fails shows an inline error with Try again. The shell and the player stay."
      >
        <Button variant="outline" onClick={() => setExplode(true)}>
          Break this page
        </Button>
      </Section>

      <Section
        title="Splash"
        note="Shown on cold start until the app is ready, then fades out over 150 ms. Hold it to see the 3 s and 15 s messages."
      >
        {/* A full page load on purpose: the splash only exists on cold start. */}
        <a href="/dev/ui?splash=hold" className="text-brand underline underline-offset-4">
          Open with the splash held
        </a>
      </Section>
    </div>
  );
}
