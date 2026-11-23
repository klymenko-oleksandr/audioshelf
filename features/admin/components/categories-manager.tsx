'use client';

import { RiAddLine, RiDeleteBinLine, RiErrorWarningLine } from '@remixicon/react';
import { useRef, useState } from 'react';
import {
  createCategoryAction,
  deleteCategoryAction,
  renameCategoryAction,
} from '@/app/(admin)/admin/(panel)/categories/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { AdminCategory } from '../categories/data';
import { categoryDeleteBlock, NAME_MAX, type CategoryErrors } from '../categories/values';
import { Field, describe } from './form-controls';

const CARD = 'bg-card border-border flex flex-col gap-4 rounded-xl border p-5 shadow-sm';
const CARD_TITLE = 'font-heading text-lg font-semibold';

type Editing = { kind: 'none' } | { kind: 'new' } | { kind: 'edit'; id: string };

const day = (date: Date | string) =>
  new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * Categories (canvas: AdminCategories): the list, and one panel for creating, renaming and
 * deleting. Every action answers with the fresh list, so the table never guesses.
 */
export function CategoriesManager({ initial }: { initial: AdminCategory[] }) {
  const [categories, setCategories] = useState(initial);
  const [editing, setEditing] = useState<Editing>({ kind: 'none' });
  const current = editing.kind === 'edit' ? categories.find((c) => c.id === editing.id) : undefined;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_360px] items-start gap-6 px-8 py-6">
      <section aria-labelledby="categories-title" className="flex min-w-0 flex-col gap-3">
        <div className="flex items-center gap-3">
          <h2 id="categories-title" className={CARD_TITLE}>
            Categories · {categories.length}
          </h2>
          <div className="grow" />
          <Button type="button" onClick={() => setEditing({ kind: 'new' })}>
            <RiAddLine aria-hidden />
            New category
          </Button>
        </div>

        {categories.length === 0 ? (
          <p className="text-muted-foreground border-border rounded-xl border border-dashed p-8 text-center text-[13px]">
            No categories yet. Create the first one; books are filed under it.
          </p>
        ) : (
          <table className="border-border bg-card w-full overflow-hidden rounded-xl border text-[13px]">
            <thead className="text-muted-foreground border-border border-b text-left text-xs">
              <tr>
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Books</th>
                <th className="px-4 py-2.5 font-medium">Updated</th>
                <th className="px-4 py-2.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {categories.map((category) => (
                <tr
                  key={category.id}
                  data-testid="category-row"
                  aria-current={current?.id === category.id ? 'true' : undefined}
                  className="border-border aria-[current=true]:bg-muted/50 border-b last:border-b-0"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium">{category.nameUk}</div>
                    <div className="text-muted-foreground text-xs">
                      {category.nameEn ? `${category.nameEn} · ` : ''}/{category.slug}
                    </div>
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {category.liveBooks}
                    {category.deletedBooks > 0 && (
                      <span className="text-muted-foreground text-xs">
                        {' '}
                        (+{category.deletedBooks} deleted)
                      </span>
                    )}
                  </td>
                  <td className="text-muted-foreground px-4 py-3">{day(category.updatedAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`Edit ${category.nameUk}`}
                      onClick={() => setEditing({ kind: 'edit', id: category.id })}
                    >
                      Edit
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <aside>
        {editing.kind === 'none' ? (
          <section className={CARD}>
            <h2 className={CARD_TITLE}>Edit category</h2>
            <p className="text-muted-foreground text-[13px]">
              Choose a category to rename or delete it, or create a new one.
            </p>
          </section>
        ) : (
          <CategoryPanel
            // A fresh panel (and fresh typing) for each category chosen.
            key={editing.kind === 'new' ? 'new' : editing.id}
            category={current}
            onSaved={(next) => {
              setCategories(next);
              setEditing({ kind: 'none' });
            }}
            onCancel={() => setEditing({ kind: 'none' })}
          />
        )}
      </aside>
    </div>
  );
}

function CategoryPanel({
  category,
  onSaved,
  onCancel,
}: {
  /** Absent when creating. */
  category?: AdminCategory;
  onSaved: (categories: AdminCategory[]) => void;
  onCancel: () => void;
}) {
  const [nameUk, setNameUk] = useState(category?.nameUk ?? '');
  const [nameEn, setNameEn] = useState(category?.nameEn ?? '');
  const [errors, setErrors] = useState<CategoryErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const panelRef = useRef<HTMLElement>(null);

  const block = category ? categoryDeleteBlock(category) : null;

  async function run(action: () => ReturnType<typeof createCategoryAction>) {
    if (busy) return;
    setBusy(true);
    setErrors({});
    setMessage(null);
    try {
      const result = await action();
      if (result.ok) {
        onSaved(result.categories);
        return;
      }
      setErrors(result.errors ?? {});
      setMessage(result.message ?? null);
      panelRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    } catch {
      setMessage('Something went wrong. Nothing was changed. Try again in a moment.');
    }
    setBusy(false);
  }

  const save = () =>
    run(() =>
      category
        ? renameCategoryAction(category.id, { nameUk, nameEn })
        : createCategoryAction({ nameUk, nameEn }),
    );

  return (
    <section
      ref={panelRef}
      className={CARD}
      aria-labelledby="category-panel-title"
      onKeyDown={(event) => {
        if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
          event.preventDefault();
          void save();
        }
      }}
    >
      <h2 id="category-panel-title" className={CARD_TITLE}>
        {category ? 'Edit category' : 'New category'}
      </h2>

      <Field id="category-name-uk" label="Name in Ukrainian" error={errors.nameUk}>
        <Input
          id="category-name-uk"
          value={nameUk}
          maxLength={NAME_MAX * 2}
          autoFocus
          autoComplete="off"
          onChange={(e) => {
            setNameUk(e.target.value);
            setErrors((current) => ({ ...current, nameUk: undefined }));
          }}
          {...describe('category-name-uk', errors.nameUk)}
        />
      </Field>

      <Field
        id="category-name-en"
        label="Name in English"
        error={errors.nameEn}
        hint="Optional. English listeners see the Ukrainian name when this is empty."
      >
        <Input
          id="category-name-en"
          value={nameEn}
          maxLength={NAME_MAX * 2}
          autoComplete="off"
          onChange={(e) => {
            setNameEn(e.target.value);
            setErrors((current) => ({ ...current, nameEn: undefined }));
          }}
          {...describe('category-name-en', errors.nameEn, true)}
        />
      </Field>

      <p className="text-muted-foreground text-xs">
        {category
          ? `Web address /category/${category.slug} stays the same when you rename it.`
          : 'The web address is made from the Ukrainian name.'}
      </p>

      {message && (
        <div
          role="alert"
          className="border-destructive/30 bg-destructive/10 text-destructive flex items-start gap-2 rounded-lg border px-3 py-2 text-[13px]"
        >
          <RiErrorWarningLine size={16} aria-hidden className="mt-px shrink-0" />
          {message}
        </div>
      )}

      <div className="flex items-center gap-2">
        {category &&
          (confirmingDelete ? (
            <>
              <Button
                type="button"
                variant="destructive"
                disabled={busy}
                onClick={() => run(() => deleteCategoryAction(category.id))}
              >
                Yes, delete
              </Button>
              <Button type="button" variant="ghost" onClick={() => setConfirmingDelete(false)}>
                Keep
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="destructive"
              disabled={busy || block !== null}
              title={block ?? undefined}
              onClick={() => setConfirmingDelete(true)}
            >
              <RiDeleteBinLine aria-hidden />
              Delete
            </Button>
          ))}
        <div className="grow" />
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" disabled={busy} onClick={save}>
          {busy ? 'Saving…' : category ? 'Save changes' : 'Create category'}
        </Button>
      </div>

      {category && block && (
        <p className="text-muted-foreground text-xs" data-testid="delete-block">
          Can’t delete yet. {block}
        </p>
      )}
    </section>
  );
}
