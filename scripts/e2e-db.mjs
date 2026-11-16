// A throwaway Postgres for the end-to-end tests: PGlite (Postgres compiled to WebAssembly)
// behind a TCP socket, with every migration applied and e2e/fixtures/catalogue.sql loaded.
// Started by Playwright (see playwright.config.ts); nothing is written to disk.
//
//   node scripts/e2e-db.mjs            # listens on 127.0.0.1:54329
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { unaccent } from '@electric-sql/pglite/contrib/unaccent';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const port = Number(process.env.E2E_DB_PORT ?? 54329);
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const db = await PGlite.create({ extensions: { pg_trgm, unaccent } });
for (const { tag } of JSON.parse(read('db/migrations/meta/_journal.json')).entries) {
  await db.exec(read(`db/migrations/${tag}.sql`).replaceAll('--> statement-breakpoint', ''));
}
await db.exec(read('e2e/fixtures/catalogue.sql'));

// PGlite is single-connection; the server multiplexes a few clients over it.
const server = new PGLiteSocketServer({ db, port, host: '127.0.0.1', maxConnections: 10 });
await server.start();
console.log(`e2e database ready on 127.0.0.1:${port}`);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await server.stop();
    await db.close();
    process.exit(0);
  });
}
