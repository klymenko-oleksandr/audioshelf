// Applies infra/r2-cors.json to the bucket and prints what the bucket reports back.
// Usage: npm run r2:cors        (reads S3_* from .env)
// Needs an R2 API token with "Admin Read & Write"; an object-only token gets AccessDenied —
// in that case paste the rules into Cloudflare → R2 → bucket → Settings → CORS policy.
import { readFile } from 'node:fs/promises';
import { GetBucketCorsCommand, PutBucketCorsCommand, S3Client } from '@aws-sdk/client-s3';

const required = ['S3_ENDPOINT', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'S3_BUCKET'];
const missing = required.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(`Missing ${missing.join(', ')} — see .env.example.`);
  process.exit(1);
}

const config = JSON.parse(
  await readFile(new URL('../infra/r2-cors.json', import.meta.url), 'utf8'),
);
const client = new S3Client({
  region: process.env.S3_REGION ?? 'auto',
  endpoint: process.env.S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  },
});
const Bucket = process.env.S3_BUCKET;

await client.send(new PutBucketCorsCommand({ Bucket, CORSConfiguration: config }));
const { CORSRules } = await client.send(new GetBucketCorsCommand({ Bucket }));
console.log(`CORS applied to bucket "${Bucket}":`);
console.log(JSON.stringify(CORSRules, null, 2));
