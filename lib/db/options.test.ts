import { describe, expect, it } from 'vitest';
import { clientOptions } from './options';

describe('clientOptions', () => {
  it('keeps the driver pipeline short (one at a time is `serialise`, 0 would break transactions)', () => {
    expect(clientOptions(true).max_pipeline).toBe(1);
  });

  it('does not use prepared statements (transaction pooler)', () => {
    expect(clientOptions(true).prepare).toBe(false);
  });

  it('uses one connection per serverless instance, five in development', () => {
    expect(clientOptions(true).max).toBe(1);
    expect(clientOptions(false).max).toBe(5);
  });

  it('gives up connecting after 10 s', () => {
    expect(clientOptions(true).connect_timeout).toBe(10);
  });
});
