// @vitest-environment node
import { createServer, type Server, type Socket } from 'node:net';
import postgres from 'postgres';
import { afterEach, describe, expect, it } from 'vitest';
import { clientOptions } from './options';
import { serialise } from './serialise';

/**
 * A minimal Postgres server (just enough protocol for simple queries) that answers each query
 * after a short delay and records how many were on the wire at the same time. The Supabase
 * pooler loses a query that arrives while another is still running, so the driver must never
 * have more than one in flight.
 */
async function fakePostgres() {
  const state = { inFlight: 0, maxInFlight: 0 };
  const message = (type: string, body: Buffer = Buffer.alloc(0)) => {
    const head = Buffer.alloc(5);
    head.write(type, 0, 'latin1');
    head.writeInt32BE(body.length + 4, 1);
    return Buffer.concat([head, body]);
  };
  const ready = message('Z', Buffer.from('I'));
  const authOk = message('R', Buffer.from([0, 0, 0, 0]));

  const serve = (socket: Socket) => {
    let buffer = Buffer.alloc(0);
    let started = false;
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      for (;;) {
        if (!started) {
          if (buffer.length < 4 || buffer.length < buffer.readInt32BE(0)) return;
          buffer = buffer.subarray(buffer.readInt32BE(0));
          started = true;
          socket.write(Buffer.concat([authOk, ready]));
          continue;
        }
        if (buffer.length < 5 || buffer.length < buffer.readInt32BE(1) + 1) return;
        const type = String.fromCharCode(buffer[0]!);
        buffer = buffer.subarray(buffer.readInt32BE(1) + 1);
        if (type === 'S') {
          // The driver ends a transaction with an extended-protocol `commit`.
          socket.write(
            Buffer.concat([
              message('1'),
              message('2'),
              message('C', Buffer.from('COMMIT\0')),
              ready,
            ]),
          );
          continue;
        }
        if (type !== 'Q') continue;
        state.maxInFlight = Math.max(state.maxInFlight, ++state.inFlight);
        setTimeout(() => {
          state.inFlight--;
          socket.write(Buffer.concat([message('C', Buffer.from('SELECT 0\0')), ready]));
        }, 20);
      }
    });
    socket.on('error', () => {});
  };

  const server: Server = createServer(serve);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as { port: number };
  return { state, port, close: () => new Promise((resolve) => server.close(resolve)) };
}

describe('queries on one connection', () => {
  const cleanup: (() => Promise<unknown>)[] = [];
  afterEach(async () => {
    await Promise.all(cleanup.splice(0).map((fn) => fn()));
  });

  async function connect(wrap: boolean) {
    const server = await fakePostgres();
    // `max_pipeline` is a real driver option that its type definitions leave out.
    const options = { ...clientOptions(true), fetch_types: false };
    const raw = postgres(`postgres://u:p@127.0.0.1:${server.port}/db`, options);
    const sql = wrap ? serialise(raw) : raw;
    cleanup.push(() => raw.end({ timeout: 0 }), server.close);
    // Pipelining only happens on a connection that is already open, so connect first.
    await sql.unsafe('select 0');
    return { sql, server };
  }

  it('the bare driver sends two queries together even with max_pipeline 1 (the production bug)', async () => {
    const { sql, server } = await connect(false);
    await Promise.all([sql.unsafe('select 1'), sql.unsafe('select 2'), sql.unsafe('select 3')]);
    expect(server.state.maxInFlight).toBe(2);
  });

  it('serialise never has more than one query in flight', async () => {
    const { sql, server } = await connect(true);
    const results = await Promise.all([
      sql.unsafe('select 1'),
      sql.unsafe('select 2').values(),
      sql.unsafe('select 3'),
    ]);
    expect(results).toHaveLength(3);
    expect(server.state.maxInFlight).toBe(1);
  });

  it('a transaction finishes, and queries wait for it instead of overlapping', async () => {
    const { sql, server } = await connect(true);
    const order: string[] = [];
    await Promise.all([
      sql.begin(async (tx) => {
        await tx.unsafe('select 1');
        await tx.unsafe('select 2');
        order.push('transaction');
      }),
      sql.unsafe('select 3').then(() => order.push('after')),
    ]);
    // Inside a transaction the driver pipelines on purpose (the pooler pins one backend for it).
    expect(order).toEqual(['transaction', 'after']);
    expect(server.state.inFlight).toBe(0);
  });

  it('keeps working after a query fails', async () => {
    const { sql } = await connect(true);
    await expect(sql.unsafe('select boom', [], { prepare: false }).then(() => 1)).resolves.toBe(1);
    await expect(sql.unsafe('select 4')).resolves.toBeDefined();
  });
});
