import type { Readable } from 'node:stream';
import type { ContentStore } from './types.js';

export interface S3StoreOptions {
  bucket: string;
  region?: string;
  endpoint?: string;
  prefix?: string;
}

/**
 * S3-compatible blob store. `@aws-sdk/client-s3` is an optional dependency and
 * imported dynamically so a local-only deployment doesn't need it installed.
 */
export class S3Store implements ContentStore {
  private client: any;
  private readonly bucket: string;
  private readonly prefix: string;

  private constructor(client: any, opts: S3StoreOptions) {
    this.client = client;
    this.bucket = opts.bucket;
    this.prefix = opts.prefix ? opts.prefix.replace(/\/+$/, '') + '/' : '';
  }

  static async create(opts: S3StoreOptions): Promise<S3Store> {
    let mod: any;
    try {
      mod = await import('@aws-sdk/client-s3');
    } catch {
      throw new Error(
        'BLOB_STORE=s3 requires the optional dependency @aws-sdk/client-s3. Install it, or use BLOB_STORE=local.',
      );
    }
    const client = new mod.S3Client({
      region: opts.region,
      endpoint: opts.endpoint,
      forcePathStyle: Boolean(opts.endpoint), // needed for MinIO and most S3-compatible servers
    });
    const store = new S3Store(client, opts);
    // Stash the command classes for reuse.
    store.commands = {
      Put: mod.PutObjectCommand,
      Get: mod.GetObjectCommand,
      Delete: mod.DeleteObjectCommand,
      Head: mod.HeadObjectCommand,
    };
    return store;
  }

  private commands!: {
    Put: any;
    Get: any;
    Delete: any;
    Head: any;
  };

  private objectKey(key: string): string {
    return this.prefix + key;
  }

  async put(key: string, data: Buffer): Promise<void> {
    await this.client.send(
      new this.commands.Put({ Bucket: this.bucket, Key: this.objectKey(key), Body: data }),
    );
  }

  async get(key: string): Promise<Readable> {
    const res = await this.client.send(
      new this.commands.Get({ Bucket: this.bucket, Key: this.objectKey(key) }),
    );
    return res.Body as Readable;
  }

  async getBuffer(key: string): Promise<Buffer> {
    const stream = await this.get(key);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks);
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new this.commands.Delete({ Bucket: this.bucket, Key: this.objectKey(key) }),
    );
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new this.commands.Head({ Bucket: this.bucket, Key: this.objectKey(key) }),
      );
      return true;
    } catch {
      return false;
    }
  }
}
