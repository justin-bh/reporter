import 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { ContentStore } from './blobstore/index.js';
import type { ServerConfig } from './config.js';

/** The authenticated principal attached to a request by an auth preHandler. */
export interface AuthedUser {
  id: number;
  slug: string;
  email: string;
  firstName: string;
  lastName: string;
  admin: boolean;
  /** How this request authenticated: web session or client API key. */
  via: 'session' | 'apikey';
}

declare module 'fastify' {
  interface FastifyInstance {
    db: PrismaClient;
    blobs: ContentStore;
    config: ServerConfig;
  }
  interface FastifyRequest {
    /** Raw request body bytes, captured for HMAC verification on `/api/*`. */
    rawBody?: Buffer;
    /** Set by `requireAuth` / `requireApiAuth`; null until authenticated. */
    authedUser: AuthedUser | null;
  }
}
