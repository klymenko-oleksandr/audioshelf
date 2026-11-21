/** Options for the `postgres` client (kept apart from `index.ts` so they can be tested). */
export function clientOptions(production: boolean) {
  return {
    // Supabase's transaction pooler (port 6543) does not support prepared statements.
    prepare: false,
    max: production ? 1 : 5,
    // One query at a time per connection. By default the driver sends the next query before the
    // previous one has finished; through the pooler the later query is then lost and the page waits
    // until the function times out (production, 21-22 Nov). It must be 0, not 1: the driver
    // checks `sent.length < max_pipeline` and does not count the query that is running, so 1 still
    // let two queries travel together (postgres.js 3.4.9, src/connection.js).
    max_pipeline: 0,
    connect_timeout: 10,
  };
}
