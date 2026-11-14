import { RiErrorWarningLine, RiRefreshLine } from '@remixicon/react';
import { Button } from '@/components/ui/button';

/** Inline error for a page: the shell and the player around it keep working. */
export function PageError({
  title,
  body,
  retryLabel,
  onRetry,
}: {
  title: string;
  body: string;
  retryLabel: string;
  onRetry: () => void;
}) {
  return (
    <div role="alert" className="grid grow place-items-center p-8">
      <div className="flex max-w-[460px] flex-col items-center gap-3 text-center">
        <RiErrorWarningLine size={32} aria-hidden className="text-destructive" />
        <h1 className="text-h4">{title}</h1>
        <p className="text-muted-foreground">{body}</p>
        <Button variant="outline" size="lg" className="mt-1 px-4" onClick={onRetry}>
          <RiRefreshLine aria-hidden />
          {retryLabel}
        </Button>
      </div>
    </div>
  );
}
