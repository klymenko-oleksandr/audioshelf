import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { THREE } from './track-card';

const MB = 1024 * 1024;

/**
 * Makes a valid MP3 of `megabytes` MiB (a small one repeated) and returns a path for each name.
 * The first file is written once; the others are hard links to it, so five names cost one file.
 * Playwright hands the browser a path, so nothing this size goes through the test's memory.
 */
export function createBigMp3(names: string[], megabytes = 101) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audioshelf-e2e-big-'));
  const seed = fs.readFileSync(THREE);
  const target = megabytes * MB;
  const first = path.join(dir, names[0]!);
  fs.writeFileSync(first, Buffer.concat(Array(Math.ceil(target / seed.length)).fill(seed)));
  fs.truncateSync(first, target);
  const paths = [first];
  for (const name of names.slice(1)) {
    const link = path.join(dir, name);
    fs.linkSync(first, link);
    paths.push(link);
  }
  return { dir, paths, remove: () => fs.rmSync(dir, { recursive: true, force: true }) };
}
