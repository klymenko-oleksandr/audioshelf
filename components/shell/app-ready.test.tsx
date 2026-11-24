import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WELCOME_GATE_MAX_MS, setWelcomeGate } from '@/features/guest/gate';
import { AppReady } from './app-ready';

const root = document.documentElement;
const lifted = () => 'appReady' in root.dataset;

beforeEach(() => {
  vi.useFakeTimers();
  delete root.dataset.appReady;
  delete root.dataset.welcome;
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('AppReady and the splash', () => {
  it('lifts the splash at once when there is nothing to decide', () => {
    render(<AppReady />);
    expect(lifted()).toBe(true);
  });

  it('holds the splash while the welcome decision is pending, then lifts when it is made', () => {
    root.dataset.welcome = 'pending';
    render(<AppReady />);
    expect(lifted()).toBe(false);

    act(() => setWelcomeGate('open'));
    expect(lifted()).toBe(true);
    expect(root.dataset.welcome).toBe('open');
  });

  it('lifts when the decision is "nothing to show"', () => {
    root.dataset.welcome = 'pending';
    render(<AppReady />);
    act(() => setWelcomeGate('done'));
    expect(lifted()).toBe(true);
    expect(root.dataset.welcome).toBeUndefined();
  });

  it('never waits longer than the cap', () => {
    root.dataset.welcome = 'pending';
    render(<AppReady />);
    act(() => void vi.advanceTimersByTime(WELCOME_GATE_MAX_MS - 1));
    expect(lifted()).toBe(false);
    act(() => void vi.advanceTimersByTime(1));
    expect(lifted()).toBe(true);
  });

  it('keeps ?splash=hold working', () => {
    window.history.replaceState(null, '', '/?splash=hold');
    render(<AppReady />);
    expect(lifted()).toBe(false);
  });
});
