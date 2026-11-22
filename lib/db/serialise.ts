import type postgres from 'postgres';

type Client = ReturnType<typeof postgres>;

/**
 * Makes the client run one top-level query (or one whole transaction) at a time.
 *
 * The driver cannot do this itself: with `max_pipeline: 1` it still puts two queries on the wire
 * together, and `max_pipeline: 0` breaks transactions (postgres.js 3.4.9). The Supabase pooler
 * loses the second of two overlapping queries, and the page then waits until the function is
 * killed (production, 21-22 Nov). Drizzle reaches the driver only through `unsafe()` (awaited or
 * `.values()`) and `begin()`, so queueing those two is enough. Queries inside a transaction use
 * the transaction's own handle and are not queued again.
 *
 * Never call the outer client from inside a transaction callback: it would wait for itself.
 */
export function serialise(client: Client): Client {
  let tail: Promise<unknown> = Promise.resolve();
  const turn = <T>(run: () => Promise<T>): Promise<T> => {
    const result = tail.then(run, run);
    tail = result.catch(() => undefined);
    return result;
  };

  return new Proxy(client, {
    get(target, property) {
      if (property === 'unsafe') {
        return (...args: Parameters<Client['unsafe']>) => {
          const start = () => target.unsafe(...args);
          return {
            then: (resolve?: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
              turn(() => start()).then(resolve, reject),
            values: () => turn(() => start().values()),
          };
        };
      }
      if (property === 'begin') {
        return (...args: unknown[]) =>
          turn(() => (target.begin as (...a: unknown[]) => Promise<unknown>)(...args));
      }
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
