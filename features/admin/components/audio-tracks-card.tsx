'use client';

import { RiDeleteBinLine, RiRestartLine, RiUpload2Line } from '@remixicon/react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  completeTrackUploadAction,
  failTrackUploadAction,
  removeTrackAction,
  renameChapterAction,
  renameTrackAction,
  restartTrackUploadAction,
  startTrackUploadAction,
} from '@/app/(admin)/admin/(panel)/books/[id]/track-actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import type { TrackActionResult, TracksSnapshot } from '../tracks/action-types';
import { uploadFile, type Phase, type UploadApi } from '../tracks/client/upload-file';
import type { TrackItem } from '../tracks/data';
import { formatClock, formatFileSize } from '../tracks/format';

const CARD = 'bg-card border-border flex flex-col gap-4 rounded-xl border p-5 shadow-sm';
const CARD_TITLE = 'font-heading text-lg font-semibold';

const PHASE_LABEL: Record<Phase, string> = {
  reading: 'Reading the length…',
  fingerprint: 'Preparing the file…',
  sending: 'Uploading…',
  checking: 'Checking the file…',
};

interface Live {
  phase: Phase;
  fraction: number;
}

interface Job {
  file: File;
  retryTrackId?: string;
}

/** Enter and Escape in a name field commit or undo the edit; they must never submit the book form. */
function nameKeys(event: KeyboardEvent<HTMLInputElement>, original: string) {
  if (event.key === 'Enter') {
    event.preventDefault();
    event.currentTarget.blur();
  } else if (event.key === 'Escape') {
    event.currentTarget.value = original;
    event.currentTarget.blur();
  }
}

function Progress({ live }: { live: Live }) {
  const percent = Math.round(live.fraction * 100);
  const showPercent = live.phase === 'fingerprint' || live.phase === 'sending';
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground text-xs">
        {PHASE_LABEL[live.phase]}
        {showPercent && ` ${percent}%`}
      </span>
      <div
        role="progressbar"
        aria-label={PHASE_LABEL[live.phase]}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="bg-muted h-1.5 w-full overflow-hidden rounded-full"
      >
        <div className="bg-brand h-full transition-[width]" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

/**
 * The "Audio tracks" card on the edit page (canvas: AdminEdit, desktop first): add MP3/M4A files,
 * watch them upload straight to storage, rename parts and chapters, retry or remove a part.
 * Nothing in here is named or submitted with the book form; every button is `type="button"`.
 */
export function AudioTracksCard({
  bookId,
  bookStatus,
  initial,
}: {
  bookId: string;
  bookStatus: 'draft' | 'scheduled' | 'published';
  initial: TracksSnapshot;
}) {
  const [snapshot, setSnapshot] = useState(initial);
  const [live, setLive] = useState<Record<string, Live>>({});
  const [preparing, setPreparing] = useState<{ name: string; live: Live } | null>(null);
  const [rejected, setRejected] = useState<{ name: string; reason: string }[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const queue = useRef<Job[]>([]);
  const running = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const retryFor = useRef<string | undefined>(undefined);

  const api: UploadApi = useMemo(
    () => ({
      start: (input) => startTrackUploadAction(bookId, input),
      restart: (trackId, input) => restartTrackUploadAction(bookId, trackId, input),
      fail: (trackId, reason) => failTrackUploadAction(bookId, trackId, reason),
      complete: (trackId) => completeTrackUploadAction(bookId, trackId),
    }),
    [bookId],
  );

  // Leaving the page would cancel the upload that is running.
  useEffect(() => {
    if (!working) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [working]);

  async function runQueue() {
    if (running.current) return;
    running.current = true;
    setWorking(true);
    try {
      for (let job = queue.current.shift(); job; job = queue.current.shift()) {
        let activeTrack: string | null = job.retryTrackId ?? null;
        try {
          const outcome = await uploadFile({
            file: job.file,
            api,
            retryTrackId: job.retryTrackId,
            onSnapshot: setSnapshot,
            onPhase: (phase, fraction, trackId) => {
              if (trackId) {
                activeTrack = trackId;
                setPreparing(null);
                setLive((current) => ({ ...current, [trackId]: { phase, fraction } }));
              } else {
                setPreparing({ name: job.file.name, live: { phase, fraction } });
              }
            },
          });
          if (outcome.kind === 'rejected') {
            setRejected((current) => [...current, { name: job.file.name, reason: outcome.reason }]);
          } else if (outcome.kind === 'refused') {
            setNotice(outcome.message);
          }
        } catch (error) {
          console.error('Upload failed', error);
          setNotice(`${job.file.name}: something went wrong. Try again.`);
        } finally {
          setPreparing(null);
          const done = activeTrack;
          if (done) {
            setLive((current) => {
              const rest = { ...current };
              delete rest[done];
              return rest;
            });
          }
        }
      }
    } finally {
      running.current = false;
      setWorking(false);
    }
  }

  function enqueue(files: FileList | File[], retryTrackId?: string) {
    setNotice(null);
    setRejected([]);
    for (const file of Array.from(files)) queue.current.push({ file, retryTrackId });
    void runQueue();
  }

  function applyResult(result: TrackActionResult) {
    if (result.ok) {
      setSnapshot(result.snapshot);
      setNotice(null);
    } else {
      if (result.snapshot) setSnapshot(result.snapshot);
      setNotice(result.message);
    }
  }

  async function renameTrack(track: TrackItem, title: string) {
    if (title.trim() === track.title) return;
    applyResult(await renameTrackAction(bookId, track.id, title));
  }

  async function renameChapter(chapterId: string, current: string, title: string) {
    if (title.trim() === current) return;
    applyResult(await renameChapterAction(bookId, chapterId, title));
  }

  async function remove(trackId: string) {
    setConfirming(null);
    applyResult(await removeTrackAction(bookId, trackId));
  }

  function openPicker(retryTrackId?: string) {
    retryFor.current = retryTrackId;
    fileInput.current?.click();
  }

  const { tracks, chapters } = snapshot;

  return (
    <section className={CARD} aria-labelledby="tracks-title">
      <div className="flex items-start gap-3">
        <div className="flex grow flex-col gap-0.5">
          <h2 id="tracks-title" className={CARD_TITLE}>
            Audio tracks
          </h2>
          <p className="text-muted-foreground text-xs">
            MP3 or M4A, up to 100 MB each. Parts play in the order listed.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => openPicker()}>
          <RiUpload2Line aria-hidden />
          Add audio files
        </Button>
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          aria-label="Audio files"
          accept=".mp3,.m4a,audio/mpeg,audio/mp4"
          onChange={(event) => {
            const files = event.currentTarget.files;
            const retry = retryFor.current;
            if (files && files.length > 0) enqueue(retry ? [files[0]!] : files, retry);
            retryFor.current = undefined;
            event.currentTarget.value = '';
          }}
        />
      </div>

      {notice && (
        <p role="alert" className="text-destructive text-[13px]">
          {notice}
        </p>
      )}

      {rejected.length > 0 && (
        <ul
          aria-label="Files that were not added"
          className="border-destructive/30 bg-destructive/10 text-destructive flex flex-col gap-1 rounded-lg border px-3 py-2 text-[13px]"
        >
          {rejected.map((item, index) => (
            <li key={`${item.name}-${index}`}>
              <strong className="font-medium">{item.name}</strong>: {item.reason}
            </li>
          ))}
        </ul>
      )}

      {tracks.length === 0 && !preparing ? (
        <p className="text-muted-foreground text-[13px]">
          No audio yet. Add the files in the order they should play.
        </p>
      ) : (
        <ul aria-label="Parts" className="flex flex-col gap-2">
          {tracks.map((track, index) => {
            // Positions can have gaps after a removal; the admin sees the order in the list.
            const number = index + 1;
            const progress = live[track.id];
            const interrupted = track.status === 'uploading' && !progress;
            const canRemove =
              !progress &&
              track.status !== 'processing' &&
              (track.status !== 'ready' || bookStatus === 'draft');
            const canRetry = !progress && (track.status === 'failed' || interrupted);
            return (
              <li
                key={track.id}
                data-status={track.status}
                className="border-border flex flex-col gap-2 rounded-lg border p-3"
              >
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground w-6 text-right text-xs tabular-nums">
                    {number}
                  </span>
                  <Input
                    key={`${track.id}:${track.title}`}
                    aria-label={`Title of part ${number}`}
                    defaultValue={track.title}
                    maxLength={200}
                    onKeyDown={(event) => nameKeys(event, track.title)}
                    onBlur={(event) => void renameTrack(track, event.currentTarget.value)}
                  />
                  {track.status === 'ready' && <Badge variant="secondary">Ready</Badge>}
                  {track.status === 'failed' && <Badge variant="destructive">Failed</Badge>}
                  {track.status === 'processing' && (
                    <Badge variant="outline">
                      <Spinner className="size-3" />
                      Processing
                    </Badge>
                  )}
                  {track.status === 'uploading' && (
                    <Badge variant="outline">{interrupted ? 'Interrupted' : 'Uploading'}</Badge>
                  )}
                  {canRetry && (
                    <Button type="button" variant="outline" onClick={() => openPicker(track.id)}>
                      <RiRestartLine aria-hidden />
                      Retry
                    </Button>
                  )}
                  {canRemove && confirming !== track.id && (
                    <Button
                      type="button"
                      variant="ghost"
                      aria-label={`Remove part ${number}`}
                      onClick={() =>
                        track.status === 'ready' ? setConfirming(track.id) : void remove(track.id)
                      }
                    >
                      <RiDeleteBinLine aria-hidden />
                      Remove
                    </Button>
                  )}
                </div>

                <p className="text-muted-foreground pl-8 text-xs">
                  {[
                    track.originalFilename,
                    track.sizeBytes ? formatFileSize(track.sizeBytes) : null,
                    track.durationSeconds > 0 ? formatClock(track.durationSeconds) : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>

                {progress && (
                  <div className="pl-8">
                    <Progress live={progress} />
                  </div>
                )}
                {track.status === 'failed' && track.failureReason && (
                  <p className="text-destructive pl-8 text-xs">{track.failureReason}</p>
                )}
                {interrupted && (
                  <p className="text-muted-foreground pl-8 text-xs">
                    This upload did not finish. Retry it with the file, or remove the part.
                  </p>
                )}
                {confirming === track.id && (
                  <div
                    role="group"
                    aria-label="Confirm removing this part"
                    className="flex items-center gap-2 pl-8 text-[13px]"
                  >
                    <span>Remove this part? Its chapters are removed with it.</span>
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => void remove(track.id)}
                    >
                      Yes, remove
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => setConfirming(null)}>
                      Keep it
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
          {preparing && (
            <li className="border-border flex flex-col gap-2 rounded-lg border p-3">
              <span className="text-[13px] font-medium">{preparing.name}</span>
              <Progress live={preparing.live} />
            </li>
          )}
        </ul>
      )}

      {chapters.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-[13px] font-medium">Chapters</h3>
          <ul aria-label="Chapters" className="flex flex-col gap-1.5">
            {chapters.map((chapter) => (
              <li key={chapter.id} className="flex items-center gap-2">
                <span className="text-muted-foreground w-24 shrink-0 text-xs tabular-nums">
                  {formatClock(chapter.startSeconds)}–{formatClock(chapter.endSeconds)}
                </span>
                <Input
                  key={`${chapter.id}:${chapter.title}`}
                  aria-label={`Title of chapter ${chapter.position}`}
                  defaultValue={chapter.title}
                  maxLength={200}
                  onKeyDown={(event) => nameKeys(event, chapter.title)}
                  onBlur={(event) =>
                    void renameChapter(chapter.id, chapter.title, event.currentTarget.value)
                  }
                />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
