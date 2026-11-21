/** Options for the `postgres` client (kept apart from `index.ts` so they can be tested). */
export function clientOptions(production: boolean) {
  return {
    // Supabase's transaction pooler (port 6543) does not support prepared statements.
    prepare: false,
    max: production ? 1 : 5,
    // One query at a time per connection. By default the driver sends the next query before
    // the previous one has finished; through the pooler that left the first one hanging until
    // the function timed out (production, 21 Nov: every page that ran queries with Promise.all).
    max_pipeline: 1,
    connect_timeout: 10,
    // Do not keep an idle connection around for a later request to trip over.
    idle_timeout: 20,
  };
}
