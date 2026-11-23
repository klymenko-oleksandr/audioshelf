// A tiny stand-in for Cloudflare R2 for the end-to-end tests: it takes the browser's uploads and
// answers the server's checks, so the real presigning and checking code runs without the network.
//
// Single request: PUT, HEAD, GET, OPTIONS.
// Multipart: create (POST ?uploads), upload part (PUT ?partNumber&uploadId), complete
// (POST ?uploadId, with the parts as XML) and abort (DELETE ?uploadId). Like R2, a part other
// than the last must be at least 5 MiB, and completing checks every part number and ETag.
//
// File names steer failures (the name ends up in the key):
//   - "reject": the PUT, or every part PUT, answers 500 (the upload fails)
//   - "vanish": the PUT / the completing step answers 200 but keeps nothing (storage says "not found")
//   - "slow":   every part PUT waits 1.5 s before answering, so a test can cancel mid-upload
//
// Tests ask what happened with GET /__state?contains=<text in the key>:
//   { open, completed, aborted, partPuts, objects }   (uploads and objects whose key has the text)
//
// Path-style addresses only: http://localhost:<port>/<bucket>/<key>. Run: node scripts/e2e-r2.mjs
import { createServer } from 'node:http';

const port = Number(process.env.E2E_R2_PORT ?? 54330);
const MIN_PART = 5 * 1024 * 1024;
const SLOW_MS = 1500;

/** key path -> { size, contentType } */
const objects = new Map();
/** upload id -> { path, contentType, parts: Map(number -> size), state: 'open' | 'completed' | 'aborted', partPuts } */
const uploads = new Map();
let nextUpload = 1;

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'PUT, HEAD, GET, POST, DELETE, OPTIONS',
  'access-control-allow-headers': '*',
  'access-control-expose-headers': 'ETag',
};

const xml = (res, status, body) =>
  res
    .writeHead(status, { ...cors, 'content-type': 'application/xml' })
    .end(`<?xml version="1.0" encoding="UTF-8"?>${body}`);
const error = (res, status, code, message) =>
  xml(res, status, `<Error><Code>${code}</Code><Message>${message}</Message></Error>`);
const unescape = (text) =>
  text
    .replaceAll('&quot;', '"')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>');

/** Reads and discards the body (keeping only its size); never throws if the client hangs up. */
function drain(req) {
  return new Promise((resolve) => {
    let size = 0;
    req.on('data', (chunk) => (size += chunk.length));
    req.on('end', () => resolve({ size, complete: true }));
    req.on('error', () => resolve({ size, complete: false }));
    req.on('close', () => resolve({ size, complete: req.complete }));
  });
}

function readText(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', () => resolve(''));
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function state(contains) {
  const mine = [...uploads.values()].filter((u) => u.path.includes(contains));
  return {
    open: mine.filter((u) => u.state === 'open').length,
    completed: mine.filter((u) => u.state === 'completed').length,
    aborted: mine.filter((u) => u.state === 'aborted').length,
    partPuts: mine.reduce((sum, u) => sum + u.partPuts, 0),
    objects: [...objects.keys()].filter((p) => p.includes(contains)),
  };
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const path = decodeURIComponent(url.pathname);
  const query = url.searchParams;
  res.on('error', () => {});

  if (req.method === 'OPTIONS') {
    res.writeHead(204, { ...cors, 'access-control-max-age': '600' }).end();
    return;
  }

  if (path === '/__state' && req.method === 'GET') {
    res
      .writeHead(200, { 'content-type': 'application/json' })
      .end(JSON.stringify(state(query.get('contains') ?? '')));
    return;
  }

  // --- multipart -----------------------------------------------------------------------------

  if (req.method === 'POST' && query.has('uploads')) {
    await drain(req);
    const uploadId = `e2e-upload-${nextUpload++}`;
    uploads.set(uploadId, {
      path,
      contentType: req.headers['content-type'] ?? 'application/octet-stream',
      parts: new Map(),
      state: 'open',
      partPuts: 0,
    });
    xml(
      res,
      200,
      `<InitiateMultipartUploadResult><Bucket>e2e-bucket</Bucket><Key>${path}</Key><UploadId>${uploadId}</UploadId></InitiateMultipartUploadResult>`,
    );
    return;
  }

  if (req.method === 'PUT' && query.has('uploadId') && query.has('partNumber')) {
    const upload = uploads.get(query.get('uploadId'));
    const { size, complete } = await drain(req);
    if (!complete) return; // the browser hung up (cancelled): nothing to answer
    if (!upload || upload.state !== 'open' || upload.path !== path) {
      error(res, 404, 'NoSuchUpload', 'The upload does not exist or was aborted.');
      return;
    }
    upload.partPuts++;
    if (path.includes('reject')) {
      res.writeHead(500, cors).end('rejected on purpose');
      return;
    }
    if (path.includes('slow')) await sleep(SLOW_MS);
    if (upload.state !== 'open') {
      error(res, 404, 'NoSuchUpload', 'The upload was aborted.');
      return;
    }
    const number = Number(query.get('partNumber'));
    upload.parts.set(number, size);
    res.writeHead(200, { ...cors, etag: `"part-${number}-${size}"` }).end();
    return;
  }

  if (req.method === 'POST' && query.has('uploadId')) {
    const upload = uploads.get(query.get('uploadId'));
    const body = await readText(req);
    if (!upload || upload.state !== 'open' || upload.path !== path) {
      error(res, 404, 'NoSuchUpload', 'The upload does not exist or was aborted.');
      return;
    }
    const listed = [...body.matchAll(/<Part>([\s\S]*?)<\/Part>/g)].map((m) => ({
      number: Number(/<PartNumber>(\d+)<\/PartNumber>/.exec(m[1])?.[1]),
      etag: unescape(/<ETag>([\s\S]*?)<\/ETag>/.exec(m[1])?.[1] ?? ''),
    }));
    if (listed.length === 0) {
      error(res, 400, 'MalformedXML', 'No parts were listed.');
      return;
    }
    let total = 0;
    for (const [index, part] of listed.entries()) {
      const size = upload.parts.get(part.number);
      if (index > 0 && part.number <= listed[index - 1].number) {
        error(res, 400, 'InvalidPartOrder', 'Parts must be listed in ascending order.');
        return;
      }
      if (size === undefined || part.etag !== `"part-${part.number}-${size}"`) {
        error(
          res,
          400,
          'InvalidPart',
          `Part ${part.number} was not uploaded or its ETag does not match.`,
        );
        return;
      }
      if (index < listed.length - 1 && size < MIN_PART) {
        error(res, 400, 'EntityTooSmall', `Part ${part.number} is smaller than the 5 MiB minimum.`);
        return;
      }
      total += size;
    }
    upload.state = 'completed';
    if (!path.includes('vanish'))
      objects.set(path, { size: total, contentType: upload.contentType });
    xml(
      res,
      200,
      `<CompleteMultipartUploadResult><Location>http://localhost${path}</Location><Bucket>e2e-bucket</Bucket><Key>${path}</Key><ETag>"e2e-multipart"</ETag></CompleteMultipartUploadResult>`,
    );
    return;
  }

  if (req.method === 'DELETE' && query.has('uploadId')) {
    await drain(req);
    const upload = uploads.get(query.get('uploadId'));
    if (!upload || upload.state !== 'open') {
      error(res, 404, 'NoSuchUpload', 'The upload does not exist or is already finished.');
      return;
    }
    upload.state = 'aborted';
    upload.parts.clear();
    res.writeHead(204, cors).end();
    return;
  }

  // --- single request ------------------------------------------------------------------------

  if (req.method === 'PUT') {
    const { size, complete } = await drain(req);
    if (!complete) return;
    if (path.includes('reject')) {
      res.writeHead(500, cors).end('rejected on purpose');
      return;
    }
    if (!path.includes('vanish')) {
      objects.set(path, {
        size,
        contentType: req.headers['content-type'] ?? 'application/octet-stream',
      });
    }
    res.writeHead(200, { ...cors, etag: '"e2e"' }).end();
    return;
  }

  if (req.method === 'HEAD' || req.method === 'GET') {
    const object = objects.get(path);
    if (!object) {
      res.writeHead(404, cors).end();
      return;
    }
    res
      .writeHead(200, {
        ...cors,
        'content-length': String(req.method === 'HEAD' ? object.size : 0),
        'content-type': object.contentType,
        etag: '"e2e"',
      })
      .end();
    return;
  }

  res.writeHead(405, cors).end();
});

server.listen(port, '127.0.0.1', () => console.log(`e2e R2 stand-in on http://127.0.0.1:${port}`));
