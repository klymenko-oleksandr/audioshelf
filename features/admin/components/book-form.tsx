'use client';

import { RiCheckLine, RiErrorWarningLine, RiEyeLine } from '@remixicon/react';
import Link from 'next/link';
import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { saveBookAction } from '@/app/(admin)/admin/(panel)/books/actions';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BookCover } from '@/features/catalogue/components/book-cover';
import { IDLE, type SaveBookState } from '../book-form/action-state';
import {
  chooseAuthor,
  emptyValues,
  sameRaw,
  toRaw,
  valuesFromBook,
  type FormValues,
} from '../book-form/form-state';
import { slugBase } from '../book-form/unique-slug';
import { useUnsavedChangesGuard } from '../book-form/use-unsaved-changes';
import {
  DESCRIPTION_MAX,
  LANGUAGES,
  LANGUAGE_LABELS,
  NEW_CHOICE,
  type BookLanguage,
  type FieldName,
} from '../book-form/values';
import type { BookEditData, BookFormOptions } from '../data/book-form';
import { CheckboxRow, Field, Select, Textarea, describe } from './form-controls';

const CARD = 'bg-card border-border flex flex-col gap-4 rounded-xl border p-5 shadow-sm';
const CARD_TITLE = 'font-heading text-lg font-semibold';
const LEAVE_MESSAGE = 'You have unsaved changes. Leave this page without saving?';
const NO_FIELDS: ReadonlySet<FieldName> = new Set();

function StatusBadge({ status }: { status: BookEditData['status'] | 'draft' }) {
  if (status === 'published') return <Badge variant="secondary">Published</Badge>;
  if (status === 'scheduled') return <Badge>Scheduled</Badge>;
  return <Badge variant="outline">Draft</Badge>;
}

function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Add / edit a book (canvas: Admin, AdminEdit). Covers only the book's own fields; audio tracks
 * come in 4c, publishing in 4d, cover images later. Saving a draft needs only a title.
 *
 * The form is submitted by hand (not through `<form action>`), so React never resets the fields
 * after a save and a refused save keeps everything the admin typed.
 */
export function BookForm({
  book,
  options,
  created = false,
}: {
  /** Absent when adding a book. */
  book?: BookEditData;
  options: BookFormOptions;
  /** The page was opened right after the draft was created. */
  created?: boolean;
}) {
  const [values, setValues] = useState<FormValues>(() =>
    book ? valuesFromBook(book, options) : emptyValues(),
  );
  const [initialRaw] = useState(() => toRaw(values));
  const [state, formAction, pending] = useActionState<SaveBookState, FormData>(
    (previous, formData) => saveBookAction(book?.id ?? null, previous, formData),
    IDLE,
  );
  const formRef = useRef<HTMLFormElement>(null);

  // Errors stay until the admin touches the field they belong to (or saves again).
  const [cleared, setCleared] = useState<{ state: SaveBookState; fields: ReadonlySet<FieldName> }>({
    state: IDLE,
    fields: NO_FIELDS,
  });
  const hidden = cleared.state === state ? cleared.fields : NO_FIELDS;
  const errors = state.status === 'error' ? state.errors : {};
  const errorOf = (field: FieldName) => (hidden.has(field) ? undefined : errors[field]);

  function set<K extends keyof FormValues>(key: K, value: FormValues[K], ...fields: FieldName[]) {
    setValues((current) => ({ ...current, [key]: value }));
    if (fields.length > 0) {
      setCleared({ state, fields: new Set([...hidden, ...fields]) });
    }
  }

  const baseline = state.status === 'saved' ? state.submitted : initialRaw;
  const dirty = !sameRaw(toRaw(values), baseline);
  useUnsavedChangesGuard(dirty, LEAVE_MESSAGE);

  // After a refused save, move to the first field that needs attention.
  useEffect(() => {
    if (state.status !== 'error') return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const formData = new FormData();
    for (const [key, value] of Object.entries(toRaw(values))) formData.set(key, value);
    startTransition(() => formAction(formData));
  }

  const status = book?.status ?? 'draft';
  const isDraft = status === 'draft';
  const authorName =
    values.author === NEW_CHOICE
      ? values.newAuthorName.trim()
      : options.authors.find((a) => a.id === values.author)?.name;
  const coverSeed = book?.slug ?? slugBase(values.title, 'book');
  const hasFieldErrors = Object.keys(errors).length > 0 && state.status === 'error';
  const banner =
    state.status === 'error'
      ? (state.message ??
        (hasFieldErrors && hidden.size < Object.keys(errors).length
          ? 'Some fields need attention. Fix them and save again.'
          : null))
      : null;

  let note: string | null = null;
  if (dirty) note = 'Unsaved changes';
  else if (state.status === 'saved') note = `Saved at ${clockTime(state.savedAt)}`;
  else if (created) note = 'Draft created';
  else if (!book) note = 'Not saved yet';

  const descriptionLength = values.description.length;

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate aria-label={book ? 'Edit book' : 'New book'}>
      <header className="border-border flex h-16 shrink-0 items-center gap-3 border-b px-8">
        <Link prefetch={false} href="/admin/books" className="text-muted-foreground text-[13px]">
          Books
        </Link>
        <span aria-hidden className="text-muted-foreground">
          /
        </span>
        <h1 className="max-w-[40ch] truncate text-[13px] font-medium">
          {book ? book.title : 'New book'}
        </h1>
        <StatusBadge status={status} />
        {note && (
          <span role="status" className="text-muted-foreground text-xs">
            {note}
          </span>
        )}
        <div className="grow" />
        {book && status === 'published' && (
          <Link
            prefetch={false}
            href={`/book/${book.slug}`}
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({ variant: 'ghost' })}
          >
            <RiEyeLine aria-hidden />
            View in app
          </Link>
        )}
        <Button type="submit" disabled={pending}>
          {!pending && <RiCheckLine aria-hidden />}
          {pending ? 'Saving…' : isDraft ? 'Save draft' : 'Save changes'}
        </Button>
      </header>

      <div className="grid grid-cols-[minmax(0,1fr)_360px] items-start gap-6 px-8 py-6">
        <section className={CARD} aria-labelledby="details-title">
          <div className="flex flex-col gap-0.5">
            <h2 id="details-title" className={CARD_TITLE}>
              Details
            </h2>
            <p className="text-muted-foreground text-xs">
              What listeners see on the book page and in search.
            </p>
          </div>

          <Field
            id="title"
            label="Title"
            error={errorOf('title')}
            hint={
              book
                ? `Web address /book/${book.slug} stays the same when you rename the book.`
                : values.title.trim()
                  ? `Web address /book/${coverSeed} (a number is added if it is taken).`
                  : 'Required. The only thing a draft needs.'
            }
          >
            <Input
              id="title"
              value={values.title}
              onChange={(e) => set('title', e.target.value, 'title')}
              autoFocus={!book}
              autoComplete="off"
              {...describe('title', errorOf('title'), true)}
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-4">
              <Field id="author" label="Author" error={errorOf('author')}>
                <Select
                  id="author"
                  value={values.author}
                  onChange={(e) => {
                    setValues((current) => chooseAuthor(current, e.target.value, options));
                    setCleared({
                      state,
                      fields: new Set([...hidden, 'author', 'newAuthorName', 'authorBio']),
                    });
                  }}
                  {...describe('author', errorOf('author'))}
                >
                  <option value="">No author yet</option>
                  {options.authors.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                  <option value={NEW_CHOICE}>+ New author…</option>
                </Select>
              </Field>
              {values.author === NEW_CHOICE && (
                <Field
                  id="newAuthorName"
                  label="New author’s name"
                  error={errorOf('newAuthorName')}
                >
                  <Input
                    id="newAuthorName"
                    value={values.newAuthorName}
                    onChange={(e) => set('newAuthorName', e.target.value, 'newAuthorName')}
                    autoComplete="off"
                    {...describe('newAuthorName', errorOf('newAuthorName'))}
                  />
                </Field>
              )}
            </div>

            <div className="flex flex-col gap-4">
              <Field id="narrator" label="Narrator (read by)" error={errorOf('narrator')}>
                <Select
                  id="narrator"
                  value={values.narrator}
                  onChange={(e) => {
                    setValues((current) => ({
                      ...current,
                      narrator: e.target.value,
                      newNarratorName: '',
                    }));
                    setCleared({
                      state,
                      fields: new Set([...hidden, 'narrator', 'newNarratorName']),
                    });
                  }}
                  {...describe('narrator', errorOf('narrator'))}
                >
                  <option value="">No narrator yet</option>
                  {options.narrators.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.name}
                    </option>
                  ))}
                  <option value={NEW_CHOICE}>+ New narrator…</option>
                </Select>
              </Field>
              {values.narrator === NEW_CHOICE && (
                <Field
                  id="newNarratorName"
                  label="New narrator’s name"
                  error={errorOf('newNarratorName')}
                >
                  <Input
                    id="newNarratorName"
                    value={values.newNarratorName}
                    onChange={(e) => set('newNarratorName', e.target.value, 'newNarratorName')}
                    autoComplete="off"
                    {...describe('newNarratorName', errorOf('newNarratorName'))}
                  />
                </Field>
              )}
            </div>
          </div>

          {values.author !== '' && (
            <Field
              id="authorBio"
              label="Author bio"
              error={errorOf('authorBio')}
              hint="Shown on the author’s page. Changing it changes it for all of this author’s books."
            >
              <Textarea
                id="authorBio"
                rows={3}
                value={values.authorBio}
                onChange={(e) => set('authorBio', e.target.value, 'authorBio')}
                {...describe('authorBio', errorOf('authorBio'), true)}
              />
            </Field>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Field id="category" label="Category" error={errorOf('category')}>
              <Select
                id="category"
                value={values.category}
                onChange={(e) => set('category', e.target.value, 'category')}
                {...describe('category', errorOf('category'))}
              >
                <option value="">No category yet</option>
                {options.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="language" label="Language" error={errorOf('language')}>
              <Select
                id="language"
                value={values.language}
                onChange={(e) => set('language', e.target.value as BookLanguage, 'language')}
                {...describe('language', errorOf('language'))}
              >
                {LANGUAGES.map((code) => (
                  <option key={code} value={code}>
                    {LANGUAGE_LABELS[code]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field id="description" label="Description" error={errorOf('description')}>
            <Textarea
              id="description"
              rows={5}
              value={values.description}
              onChange={(e) => set('description', e.target.value, 'description')}
              {...describe('description', errorOf('description'))}
            />
            <span
              className={`text-right text-xs tabular-nums ${descriptionLength > DESCRIPTION_MAX ? 'text-destructive' : 'text-muted-foreground'}`}
            >
              {descriptionLength.toLocaleString('en-US')} /{' '}
              {DESCRIPTION_MAX.toLocaleString('en-US')}
            </span>
          </Field>

          <CheckboxRow
            id="ongoing"
            label="Ongoing"
            hint="More parts are coming. Listeners see “Ongoing · more parts coming”."
            checked={values.ongoing}
            onChange={(e) => set('ongoing', e.target.checked)}
          />
        </section>

        <aside className="flex flex-col gap-6">
          {banner && (
            <div
              role="alert"
              className="border-destructive/30 bg-destructive/10 text-destructive flex items-start gap-2 rounded-xl border px-4 py-3 text-[13px]"
            >
              <RiErrorWarningLine size={16} aria-hidden className="mt-px shrink-0" />
              {banner}
            </div>
          )}
          <section className={CARD} aria-labelledby="cover-title">
            <h2 id="cover-title" className={CARD_TITLE}>
              Cover
            </h2>
            <div
              className="aspect-square w-full overflow-hidden rounded-lg"
              data-testid="cover-preview"
            >
              <BookCover
                title={values.title.trim() || 'Untitled'}
                author={authorName}
                seed={coverSeed}
              />
            </div>
            <p className="text-muted-foreground text-xs">
              The app shows this designed cover for every book. Uploading a cover image comes later.
            </p>
          </section>
        </aside>
      </div>
    </form>
  );
}
