// Prints ADMIN_PASSWORD_HASH for the shared admin password. Run: npm run admin:hash
// The password is typed hidden (twice) and never stored; only the salted scrypt hash is printed.
import { randomBytes, scryptSync } from 'node:crypto';
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';

const MIN_LENGTH = 8; // keep in sync with lib/auth/admin/password.ts

let muted = false;
const output = new Writable({
  write(chunk, _enc, cb) {
    if (!muted) process.stdout.write(chunk);
    cb();
  },
});
const rl = createInterface({
  input: process.stdin,
  output,
  terminal: Boolean(process.stdin.isTTY),
});
// One iterator for both questions, so lines that arrive together (piped input) are not lost.
const lines = rl[Symbol.asyncIterator]();

async function ask(question) {
  process.stdout.write(question);
  muted = true;
  const { value } = await lines.next();
  muted = false;
  process.stdout.write('\n');
  return value ?? '';
}

const first = await ask('New admin password: ');
const second = await ask('Repeat it: ');
rl.close();

if (first.normalize('NFKC').length < MIN_LENGTH) {
  console.error(`Password must be at least ${MIN_LENGTH} characters.`);
  process.exit(1);
}
if (first !== second) {
  console.error('The two entries differ. Nothing generated.');
  process.exit(1);
}

const salt = randomBytes(16);
const hash = scryptSync(first.normalize('NFKC'), salt, 64);
console.log(
  `ADMIN_PASSWORD_HASH=scrypt.${salt.toString('base64url')}.${hash.toString('base64url')}`,
);
