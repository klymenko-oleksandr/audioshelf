/* eslint-disable @next/next/no-html-link-for-pages -- plain anchors: the hook listens for any link click */
import { fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUnsavedChangesGuard } from './use-unsaved-changes';

function Page({ dirty }: { dirty: boolean }) {
  useUnsavedChangesGuard(dirty, 'Leave without saving?');
  return (
    <div>
      <a href="/admin/books">Books</a>
      <a href="/admin/books/new" target="_blank">
        New tab
      </a>
      <a href="#top">Jump</a>
      <a href="https://example.com/">Outside</a>
      <button type="button">Not a link</button>
    </div>
  );
}

const beforeUnload = () => {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event;
};

describe('useUnsavedChangesGuard', () => {
  let confirm: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  });
  afterEach(() => vi.restoreAllMocks());

  it('does nothing while there is nothing unsaved', () => {
    const { getByText } = render(<Page dirty={false} />);
    expect(beforeUnload().defaultPrevented).toBe(false);
    const click = fireEvent.click(getByText('Books'));
    expect(confirm).not.toHaveBeenCalled();
    expect(click).toBe(true);
  });

  it('asks the browser to confirm closing or reloading the tab when something is unsaved', () => {
    render(<Page dirty />);
    expect(beforeUnload().defaultPrevented).toBe(true);
  });

  it('stops following a link when the admin says to stay', () => {
    const { getByText } = render(<Page dirty />);
    const notCancelled = fireEvent.click(getByText('Books'));
    expect(confirm).toHaveBeenCalledWith('Leave without saving?');
    expect(notCancelled).toBe(false);
  });

  it('lets the link through when the admin says to leave', () => {
    confirm.mockReturnValue(true);
    const { getByText } = render(<Page dirty />);
    expect(fireEvent.click(getByText('Books'))).toBe(true);
  });

  it('asks for links to other sites too', () => {
    const { getByText } = render(<Page dirty />);
    expect(fireEvent.click(getByText('Outside'))).toBe(false);
  });

  it('ignores links that do not leave the page: new tab, same-page anchor, modified click, buttons', () => {
    const { getByText } = render(<Page dirty />);
    expect(fireEvent.click(getByText('New tab'))).toBe(true);
    expect(fireEvent.click(getByText('Jump'))).toBe(true);
    expect(fireEvent.click(getByText('Books'), { metaKey: true })).toBe(true);
    expect(fireEvent.click(getByText('Not a link'))).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('stops guarding once the changes are saved', () => {
    const { rerender, getByText } = render(<Page dirty />);
    rerender(<Page dirty={false} />);
    expect(beforeUnload().defaultPrevented).toBe(false);
    expect(fireEvent.click(getByText('Books'))).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });
});
