import { describe, expect, it } from 'vitest';
import { initials } from './avatar';

describe('initials', () => {
  it('uses the first letters of the first two words of the name', () => {
    expect(initials({ name: 'Oleksandr Klymenko', email: 'x@y.z' })).toBe('OK');
    expect(initials({ name: 'олександр клименко', email: '' })).toBe('ОК');
    expect(initials({ name: 'Sasha', email: '' })).toBe('S');
  });

  it('falls back to the email and then to a question mark', () => {
    expect(initials({ name: '', email: 'sasha.k@example.com' })).toBe('SK');
    expect(initials({ name: '', email: '' })).toBe('?');
  });
});
