import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import en from '@/messages/en.json';
import { toast, toastStore } from './store';
import { Toaster } from './toaster';

function renderToaster() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <Toaster />
    </NextIntlClientProvider>,
  );
}

describe('Toaster', () => {
  afterEach(() => act(() => toastStore.dismiss()));

  it('announces ordinary toasts politely and errors assertively', () => {
    renderToaster();

    act(() => void toast({ title: 'Added to Listen later' }));
    expect(screen.getByRole('status')).toHaveTextContent('Added to Listen later');
    expect(screen.getByRole('alert')).toBeEmptyDOMElement();

    act(() => void toast({ title: "Couldn't download Dracula", variant: 'error' }));
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't download Dracula");
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('shows only the newest toast', () => {
    renderToaster();
    act(() => void toast({ title: 'First' }));
    act(() => void toast({ title: 'Second' }));

    expect(screen.queryByText('First')).not.toBeInTheDocument();
    expect(screen.getByText('Second')).toBeInTheDocument();
  });

  it('runs the action and closes', async () => {
    const undo = vi.fn();
    renderToaster();
    act(() => void toast({ title: 'Removed download', action: { label: 'Undo', onClick: undo } }));

    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(undo).toHaveBeenCalledOnce();
    expect(screen.queryByText('Removed download')).not.toBeInTheDocument();
  });

  it('closes from the close button', async () => {
    renderToaster();
    act(() => void toast({ title: 'Something', description: 'With details' }));
    expect(screen.getByText('With details')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByText('Something')).not.toBeInTheDocument();
  });
});
