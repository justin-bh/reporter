import type { Readable } from 'node:stream';

/**
 * Storage abstraction for evidence blobs (screenshots, recordings, HAR files).
 * Blobs never live in the database. Implementations: {@link LocalStore},
 * {@link S3Store}, chosen at boot by the `BLOB_STORE` config.
 */
export interface ContentStore {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Readable>;
  getBuffer(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}
