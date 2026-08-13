import type { ServerConfig } from '../config.js';
import { LocalStore } from './local.js';
import { S3Store } from './s3.js';
import type { ContentStore } from './types.js';

export type { ContentStore } from './types.js';
export { LocalStore } from './local.js';
export { S3Store } from './s3.js';

/** Construct the configured blob store. */
export async function createBlobStore(config: ServerConfig): Promise<ContentStore> {
  if (config.BLOB_STORE === 's3') {
    if (!config.S3_BUCKET) throw new Error('BLOB_STORE=s3 requires S3_BUCKET');
    return S3Store.create({
      bucket: config.S3_BUCKET,
      region: config.S3_REGION,
      endpoint: config.S3_ENDPOINT,
      prefix: config.S3_PREFIX,
    });
  }
  return new LocalStore(config.BLOB_DIR);
}
