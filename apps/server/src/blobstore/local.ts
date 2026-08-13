import { createReadStream } from 'node:fs';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { Readable } from 'node:stream';
import type { ContentStore } from './types.js';

/**
 * Stores blobs on the local filesystem under a base directory, fanned out by
 * the first two characters of the key to avoid enormous flat directories.
 */
export class LocalStore implements ContentStore {
  private readonly base: string;

  constructor(baseDir: string) {
    this.base = resolve(baseDir);
  }

  private pathFor(key: string): string {
    const safe = key.replace(/[^a-zA-Z0-9._-]/g, '_');
    const shard = safe.slice(0, 2).padEnd(2, '_');
    return join(this.base, shard, safe);
  }

  async put(key: string, data: Buffer): Promise<void> {
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
  }

  async get(key: string): Promise<Readable> {
    return createReadStream(this.pathFor(key));
  }

  async getBuffer(key: string): Promise<Buffer> {
    return readFile(this.pathFor(key));
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }

  async exists(key: string): Promise<boolean> {
    try {
      await stat(this.pathFor(key));
      return true;
    } catch {
      return false;
    }
  }
}
