import { describe, expect, it } from 'vitest';
import {
  accountFromUser,
  firstName,
  greetingKey,
  welcomeSeenOnAccount,
  type AuthUser,
} from './account';

const user = (overrides: Partial<AuthUser> = {}): AuthUser => ({
  id: 'u1',
  email: 'sasha@example.com',
  user_metadata: {},
  ...overrides,
});

describe('accountFromUser', () => {
  it('reads name, email and avatar from the Google profile', () => {
    expect(
      accountFromUser(
        user({
          user_metadata: {
            full_name: 'Oleksandr Klymenko',
            avatar_url: 'https://lh3.example/a.png',
          },
        }),
      ),
    ).toEqual({
      id: 'u1',
      email: 'sasha@example.com',
      name: 'Oleksandr Klymenko',
      avatarUrl: 'https://lh3.example/a.png',
      welcomeSeen: false,
    });
  });

  it('falls back to `name`, then to the part of the email before the @', () => {
    expect(accountFromUser(user({ user_metadata: { name: 'Sasha' } })).name).toBe('Sasha');
    expect(accountFromUser(user()).name).toBe('sasha');
  });

  it('ignores an avatar that is not an https URL', () => {
    expect(accountFromUser(user({ user_metadata: { avatar_url: 'javascript:x' } })).avatarUrl).toBe(
      null,
    );
    expect(accountFromUser(user({ user_metadata: { picture: 'http://x/a.png' } })).avatarUrl).toBe(
      null,
    );
    expect(accountFromUser(user({ user_metadata: { picture: 'https://x/a.png' } })).avatarUrl).toBe(
      'https://x/a.png',
    );
  });

  it('copes with no email and odd metadata', () => {
    const account = accountFromUser({ id: 'u2', user_metadata: { full_name: 42 } });
    expect(account.email).toBe('');
    expect(account.name).toBe('');
  });
});

describe('welcomeSeenOnAccount', () => {
  it('is true only for a numeric timestamp', () => {
    expect(welcomeSeenOnAccount({ welcomeSeenAt: 1700000000000 })).toBe(true);
    expect(welcomeSeenOnAccount({ welcomeSeenAt: 'yes' })).toBe(false);
    expect(welcomeSeenOnAccount({})).toBe(false);
    expect(welcomeSeenOnAccount(undefined)).toBe(false);
  });

  it('shows up on the account', () => {
    expect(accountFromUser(user({ user_metadata: { welcomeSeenAt: 5 } })).welcomeSeen).toBe(true);
  });
});

describe('firstName', () => {
  it('takes the first word', () => {
    expect(firstName('Oleksandr Klymenko')).toBe('Oleksandr');
    expect(firstName('  Sasha ')).toBe('Sasha');
    expect(firstName('')).toBe('');
  });
});

describe('greetingKey', () => {
  it('follows the hour of the day', () => {
    expect(greetingKey(5)).toBe('morning');
    expect(greetingKey(11)).toBe('morning');
    expect(greetingKey(12)).toBe('afternoon');
    expect(greetingKey(17)).toBe('afternoon');
    expect(greetingKey(18)).toBe('evening');
    expect(greetingKey(23)).toBe('evening');
    expect(greetingKey(2)).toBe('evening');
  });
});
