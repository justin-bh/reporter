import Busboy from 'busboy';

export interface ParsedFile {
  field: string;
  filename: string;
  mimeType: string;
  data: Buffer;
}

export interface ParsedMultipart {
  fields: Record<string, string>;
  files: ParsedFile[];
}

/**
 * Parse a buffered `multipart/form-data` body. We buffer the whole request in a
 * content-type parser (so it can be HMAC-verified), then parse fields/files
 * here with busboy.
 */
export function parseMultipart(buffer: Buffer, contentType: string): Promise<ParsedMultipart> {
  return new Promise((resolve, reject) => {
    const bb = Busboy({ headers: { 'content-type': contentType } });
    const fields: Record<string, string> = {};
    const files: ParsedFile[] = [];

    bb.on('field', (name, value) => {
      fields[name] = value;
    });
    bb.on('file', (name, stream, info) => {
      const chunks: Buffer[] = [];
      stream.on('data', (c: Buffer) => chunks.push(c));
      stream.on('end', () => {
        files.push({
          field: name,
          filename: info.filename ?? 'file',
          mimeType: info.mimeType ?? 'application/octet-stream',
          data: Buffer.concat(chunks),
        });
      });
    });
    bb.on('close', () => resolve({ fields, files }));
    bb.on('error', (err) => reject(err));

    bb.end(buffer);
  });
}
