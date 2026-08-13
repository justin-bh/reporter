import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import type { TermConfig } from './config.js';
import { makeClient } from './client.js';

export interface RecordingMeta {
  operationSlug: string;
  description: string;
  tagIds: number[];
}

/** Upload an asciicast file as terminal-recording evidence. Returns its uuid. */
export async function uploadCast(
  config: TermConfig,
  castPath: string,
  meta: RecordingMeta,
): Promise<string> {
  const data = await readFile(castPath);
  const client = makeClient(config);
  const evidence = await client.createEvidence(
    meta.operationSlug,
    {
      contentType: 'terminal-recording',
      description: meta.description,
      tagIds: meta.tagIds,
      occurredAt: new Date().toISOString(),
    },
    { filename: basename(castPath), contentType: 'application/x-asciicast', data },
  );
  return evidence.uuid;
}
