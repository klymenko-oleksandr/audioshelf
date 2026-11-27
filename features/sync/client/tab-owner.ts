/**
 * The account whose data this tab is showing (`null`: a guest). Set by the sync client, read
 * by the progress store before it writes.
 */
let owner: string | null = null;

export const getTabOwner = () => owner;

export function setTabOwner(next: string | null): void {
  owner = next;
}
