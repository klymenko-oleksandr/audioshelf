/** Options for the `postgres` client (kept apart from `index.ts` so they can be tested). */
export function clientOptions(production: boolean) {
  return {
    // Supabase's transaction pooler (port 6543) does not support prepared statements.
    prepare: false,
    max: production ? 1 : 5,
    // Only a cap on queries sent together. It does not make queries run one at a time (`1` still
    // allows two, `0` breaks transactions): that is `serialise.ts`'s job.
    max_pipeline: 1,
    connect_timeout: 10,
  };
}
