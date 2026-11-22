// A tiny stand-in for Cloudflare R2 for the end-to-end tests: it takes the browser's PUT and
// answers the server's HEAD, so the real presigning and checking code runs without the network.
//   - a key containing "reject" answers the PUT with 500 (the upload fails)
//   - a key containing "vanish" answers the PUT with 200 but keeps nothing (storage says "not found")
// Path-style addresses only: http://localhost:<port>/<bucket>/<key>. Run: node scripts/e2e-r2.mjs
import { createServer } from 'node:http';

const port = Number(process.env.E2E_R2_PORT ?? 54330);
const objects = new Map();

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'PUT, HEAD, GET, OPTIONS',
  'access-control-allow-headers': '*',
  'access-control-expose-headers': 'ETag',
};

const server = createServer((req, res) => {
  const path = decodeURIComponent((req.url ?? '/').split('?')[0]);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors).end();
    return;
  }

  if (req.method === 'PUT') {
    let size = 0;
    req.on('data', (chunk) => (size += chunk.length));
    req.on('end', () => {
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
    });
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
