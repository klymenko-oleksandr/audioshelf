import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import en from '@/messages/en.json';
import { chapterStates } from '../progress';
import { ChapterList } from './chapter-list';

const chapters = [
  { id: 'a', title: 'A Scandal in Bohemia', start: 0, end: 600 },
  { id: 'b', title: 'The Red-Headed League', start: 600, end: 1800 },
  { id: 'c', title: 'A Case of Identity', start: 1800, end: 2400 },
];

function renderList(current: number, position: number, finished = false) {
  const onSelect = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ChapterList
        chapters={chapters}
        states={chapterStates(chapters.length, current, finished)}
        position={position}
        onSelect={onSelect}
      />
    </NextIntlClientProvider>,
  );
  return onSelect;
}
const row = (title: string) => screen.getByRole('button', { name: new RegExp(title) });

describe('ChapterList', () => {
  it('numbers every chapter and marks none for a book never started', () => {
    renderList(-1, 0);
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(row('A Scandal in Bohemia')).toHaveTextContent(/^1A Scandal in Bohemia10:00$/);
    expect(screen.queryByText('Finished')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { current: true })).not.toBeInTheDocument();
  });

  it('shows earlier chapters as finished and the current one with its position', () => {
    renderList(1, 900);
    expect(within(row('A Scandal in Bohemia')).getAllByText('Finished').length).toBeGreaterThan(0);
    const current = row('The Red-Headed League');
    expect(current).toHaveAttribute('aria-current', 'true');
    expect(current).toHaveTextContent('5:00'); // 900 s into the book = 5 min into chapter 2
    expect(current).toHaveTextContent('20:00');
    expect(row('A Case of Identity')).not.toHaveAttribute('aria-current');
    expect(within(row('A Case of Identity')).queryByText('Finished')).not.toBeInTheDocument();
  });

  it('marks everything finished for a finished book', () => {
    renderList(2, 2400, true);
    for (const chapter of chapters) {
      expect(within(row(chapter.title)).getAllByText('Finished').length).toBeGreaterThan(0);
    }
    expect(screen.queryByRole('button', { current: true })).not.toBeInTheDocument();
  });

  it('plays from a chapter when it is pressed', async () => {
    const onSelect = renderList(-1, 0);
    await userEvent.click(row('A Case of Identity'));
    expect(onSelect).toHaveBeenCalledWith(chapters[2]);
  });
});
