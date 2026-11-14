import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NavLink } from './nav-link';

let pathname = '/';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));

function renderLink(href: string) {
  return render(
    <NavLink
      href={href}
      icon={<i data-testid="icon" />}
      activeIcon={<i data-testid="active-icon" />}
    >
      Library
    </NavLink>,
  );
}

describe('NavLink', () => {
  beforeEach(() => {
    pathname = '/';
  });

  it('marks the current section and swaps to the active icon', () => {
    pathname = '/library/history';
    renderLink('/library');

    expect(screen.getByRole('link', { name: 'Library' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('active-icon')).toBeInTheDocument();
    expect(screen.queryByTestId('icon')).not.toBeInTheDocument();
  });

  it('leaves other sections unmarked with the regular icon', () => {
    pathname = '/explore';
    renderLink('/library');

    expect(screen.getByRole('link', { name: 'Library' })).not.toHaveAttribute('aria-current');
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('falls back to the regular icon when no active icon is given', () => {
    pathname = '/settings';
    render(
      <NavLink href="/settings" icon={<i data-testid="icon" />}>
        Settings
      </NavLink>,
    );

    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });
});
