import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import en from '@/messages/en.json';
import { BookCard, type BookCardProps } from './book-card';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const book = {
  slug: 'holmes',
  title: 'The Adventures of Sherlock Holmes',
  author: 'Arthur Conan Doyle',
  authorSlug: 'arthur-conan-doyle',
  durationLabel: '10 h 24 m',
  language: 'EN',
};

function renderCard(props: Partial<BookCardProps> = {}) {
  const handlers = {
    onPlay: vi.fn(),
    onToggleLike: vi.fn(),
    onToggleListenLater: vi.fn(),
    onToggleDownload: vi.fn(),
    onShare: vi.fn(),
  };
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <BookCard book={book} {...handlers} {...props} />
    </NextIntlClientProvider>,
  );
  return handlers;
}

describe('BookCard', () => {
  it('links the cover and the title to the book page', () => {
    renderCard();
    const cover = screen.getByRole('link', {
      name: 'The Adventures of Sherlock Holmes, Arthur Conan Doyle',
    });
    expect(cover).toHaveAttribute('href', '/book/holmes');
    expect(screen.getByRole('link', { name: book.title })).toHaveAttribute('href', '/book/holmes');
  });

  it('shows duration and language for a book that has not been started', () => {
    renderCard();
    expect(screen.getByText('10 h 24 m · EN')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Play ${book.title}` })).toBeInTheDocument();
  });

  it('shows progress and offers to resume once started', () => {
    renderCard({ progressPct: 46.4 });
    expect(screen.getByText('46% listened · 10 h 24 m')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Resume ${book.title}` })).toBeInTheDocument();
  });

  it('keeps liked and downloaded badges in the accessible tree', () => {
    renderCard({ liked: true, download: { status: 'done' } });
    expect(screen.getByText('Liked')).toBeInTheDocument();
    expect(screen.getByText('Downloaded to this device')).toBeInTheDocument();
  });

  it('labels an ongoing book', () => {
    renderCard({ book: { ...book, ongoing: true } });
    expect(screen.getByText('Ongoing')).toBeInTheDocument();
  });

  it('has no ongoing label for a complete book', () => {
    renderCard();
    expect(screen.queryByText('Ongoing')).not.toBeInTheDocument();
  });

  it('shows download progress while downloading', () => {
    renderCard({ download: { status: 'downloading', pct: 63.6 } });
    expect(screen.getByText('64%')).toBeInTheDocument();
    expect(screen.getByText('Downloading')).toBeInTheDocument();
  });

  it('toggles like from the heart and reflects the state', async () => {
    const handlers = renderCard({ liked: true });
    const heart = screen.getByRole('button', { name: 'Unlike' });
    expect(heart).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(heart);
    expect(handlers.onToggleLike).toHaveBeenCalledOnce();
  });

  it('plays from the play button', async () => {
    const handlers = renderCard();
    await userEvent.click(screen.getByRole('button', { name: `Play ${book.title}` }));
    expect(handlers.onPlay).toHaveBeenCalledOnce();
  });
});
