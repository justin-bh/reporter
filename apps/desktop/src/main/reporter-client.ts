import { ReporterClient } from '@reporter/api-client';
import { getCredentials } from './settings.js';

/** Build a ReporterClient from stored credentials, or null if incomplete. */
export function makeClient(): ReporterClient | null {
  const creds = getCredentials();
  if (!creds) return null;
  return new ReporterClient({
    baseUrl: creds.serverUrl,
    accessKey: creds.accessKey,
    secretKey: creds.secret,
  });
}
