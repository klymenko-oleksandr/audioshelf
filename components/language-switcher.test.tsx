import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import en from '@/messages/en.json';
import { LanguageSwitcher } from './language-switcher';

const refresh = vi.fn();
const setLocale = vi.fn<(locale: string) => Promise<void>>(async () => {});

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));
vi.mock('@/i18n/actions', () => ({
  setLocale: (locale: string) => setLocale(locale),
}));

function renderSwitcher() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <LanguageSwitcher />
    </NextIntlClientProvider>,
  );
}

describe('LanguageSwitcher', () => {
  beforeEach(() => {
    refresh.mockClear();
    setLocale.mockClear();
  });

  it('marks the current language as pressed', () => {
    renderSwitcher();
    expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Українська' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('stores the chosen language and refreshes the page', async () => {
    renderSwitcher();
    await userEvent.click(screen.getByRole('button', { name: 'Українська' }));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(setLocale).toHaveBeenCalledWith('uk');
  });

  it('does nothing when the current language is chosen again', async () => {
    renderSwitcher();
    await userEvent.click(screen.getByRole('button', { name: 'English' }));

    expect(setLocale).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });
});
