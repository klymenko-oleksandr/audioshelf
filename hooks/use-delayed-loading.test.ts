import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDelayedLoading } from './use-delayed-loading';

function setup(initial = true) {
  return renderHook(({ loading }) => useDelayedLoading(loading), {
    initialProps: { loading: initial },
  });
}
const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));

describe('useDelayedLoading', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('shows nothing when the data arrives within 300 ms', () => {
    const { result, rerender } = setup();
    advance(299);
    expect(result.current).toBe(false);

    rerender({ loading: false });
    advance(2000);
    expect(result.current).toBe(false);
  });

  it('appears after 300 ms of loading', () => {
    const { result } = setup();
    advance(300);
    expect(result.current).toBe(true);
  });

  it('PRD example: data at 400 ms keeps the loader from 300 to 900 ms', () => {
    const { result, rerender } = setup();
    advance(400);
    expect(result.current).toBe(true);

    rerender({ loading: false });
    advance(499); // t = 899
    expect(result.current).toBe(true);
    advance(1); // t = 900
    expect(result.current).toBe(false);
  });

  it('hides immediately when it has already been visible for the minimum', () => {
    const { result, rerender } = setup();
    advance(300 + 600 + 50);
    rerender({ loading: false });
    advance(0);
    expect(result.current).toBe(false);
  });

  it('stays visible without restarting when loading resumes during the minimum', () => {
    const { result, rerender } = setup();
    advance(350);
    rerender({ loading: false });
    advance(100);
    rerender({ loading: true });
    advance(5000);
    expect(result.current).toBe(true);

    rerender({ loading: false });
    advance(0);
    expect(result.current).toBe(false);
  });

  it('starts hidden and stays hidden while idle', () => {
    const { result } = setup(false);
    advance(5000);
    expect(result.current).toBe(false);
  });

  it('honours custom timings', () => {
    const { result, rerender } = renderHook(
      ({ loading }) => useDelayedLoading(loading, { delay: 100, minimum: 200 }),
      { initialProps: { loading: true } },
    );
    advance(100);
    expect(result.current).toBe(true);
    rerender({ loading: false });
    advance(199);
    expect(result.current).toBe(true);
    advance(1);
    expect(result.current).toBe(false);
  });
});
