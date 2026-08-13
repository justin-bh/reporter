import { ReporterClient } from '@reporter/api-client';
import type { TermConfig } from './config.js';

export function makeClient(config: TermConfig): ReporterClient {
  return new ReporterClient({
    baseUrl: config.serverUrl,
    accessKey: config.accessKey,
    secretKey: config.secretKey,
  });
}
