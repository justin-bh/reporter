import { randomBytes } from 'node:crypto';

export interface MultipartFile {
  field: string;
  filename: string;
  contentType: string;
  data: Buffer;
}

/**
 * Build a `multipart/form-data` body entirely in memory so its exact bytes can
 * be HMAC-signed before sending. Evidence blobs (screenshots, casts) are small,
 * so buffering is fine.
 */
export function buildMultipart(
  fields: Record<string, string>,
  files: MultipartFile[],
): { body: Buffer; contentType: string } {
  const boundary = `----reporter${randomBytes(16).toString('hex')}`;
  const parts: Buffer[] = [];
  const CRLF = '\r\n';

  for (const [name, value] of Object.entries(fields)) {
    parts.push(
      Buffer.from(
        `--${boundary}${CRLF}` +
          `Content-Disposition: form-data; name="${name}"${CRLF}${CRLF}` +
          `${value}${CRLF}`,
        'utf8',
      ),
    );
  }

  for (const file of files) {
    parts.push(
      Buffer.from(
        `--${boundary}${CRLF}` +
          `Content-Disposition: form-data; name="${file.field}"; filename="${file.filename}"${CRLF}` +
          `Content-Type: ${file.contentType}${CRLF}${CRLF}`,
        'utf8',
      ),
    );
    parts.push(file.data);
    parts.push(Buffer.from(CRLF, 'utf8'));
  }

  parts.push(Buffer.from(`--${boundary}--${CRLF}`, 'utf8'));

  return {
    body: Buffer.concat(parts),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}
