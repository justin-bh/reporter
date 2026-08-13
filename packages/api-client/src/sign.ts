import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/**
 * The reporter client-API request-signing scheme (HMAC-SHA256), compatible in
 * spirit with ASHIRT. THIS IS THE ONE AND ONLY IMPLEMENTATION — the server
 * imports {@link computeSignature} / {@link verifySignature} to authenticate
 * `/api/*` requests, and the desktop app and terminal recorder use
 * {@link buildAuthHeaders} to sign them. Do not reimplement elsewhere.
 *
 * String-to-sign (bytes):
 *
 *     METHOD "\n" pathWithQuery "\n" dateRFC1123GMT "\n"  ⧺  SHA256(rawBody)
 *
 * where `SHA256(rawBody)` contributes the 32 raw digest bytes (not hex). The
 * signature is base64(HMAC-SHA256(secretKeyBytes, stringToSign)). Requests
 * carry:
 *
 *     Authorization: <accessKey>:<base64 signature>
 *     Date:          <same RFC 1123 GMT value used above>
 */
export interface SignParams {
  method: string;
  /** Path including query string, e.g. `/api/operations/acme/evidence?page=1`. */
  path: string;
  /** RFC 1123 GMT date string, e.g. `Wed, 13 Aug 2026 20:01:00 GMT`. */
  date: string;
  /** The exact raw request body bytes (empty buffer for no body). */
  body: Buffer;
  /** The secret key, base64-encoded (as issued by the server). */
  secretKeyBase64: string;
}

/** Compute the base64 signature for a request. */
export function computeSignature(params: SignParams): string {
  const { method, path, date, body, secretKeyBase64 } = params;
  const bodyHash = createHash('sha256').update(body).digest(); // 32 raw bytes
  const preamble = Buffer.from(`${method.toUpperCase()}\n${path}\n${date}\n`, 'utf8');
  const toSign = Buffer.concat([preamble, bodyHash]);
  const secret = Buffer.from(secretKeyBase64, 'base64');
  return createHmac('sha256', secret).update(toSign).digest('base64');
}

/** Constant-time comparison of a provided signature against the expected one. */
export function verifySignature(params: SignParams, providedSignatureBase64: string): boolean {
  const expected = computeSignature(params);
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(providedSignatureBase64, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export interface AuthHeaders {
  Authorization: string;
  Date: string;
}

/** Build the `Authorization` + `Date` headers for a signed client-API request. */
export function buildAuthHeaders(
  method: string,
  path: string,
  body: Buffer,
  accessKey: string,
  secretKeyBase64: string,
  date: string = new Date().toUTCString(),
): AuthHeaders {
  const signature = computeSignature({ method, path, date, body, secretKeyBase64 });
  return {
    Authorization: `${accessKey}:${signature}`,
    Date: date,
  };
}

/** Parse an `Authorization` header value into its access key and signature. */
export function parseAuthorization(
  header: string | undefined,
): { accessKey: string; signature: string } | null {
  if (!header) return null;
  const idx = header.indexOf(':');
  if (idx <= 0 || idx === header.length - 1) return null;
  return { accessKey: header.slice(0, idx), signature: header.slice(idx + 1) };
}

/** Maximum allowed clock skew between client `Date` and server time. */
export const MAX_CLOCK_SKEW_MS = 15 * 60 * 1000;

/** True when a request `Date` header is within the allowed skew of `now`. */
export function isDateWithinSkew(date: string, now: number = Date.now()): boolean {
  const parsed = Date.parse(date);
  if (Number.isNaN(parsed)) return false;
  return Math.abs(now - parsed) <= MAX_CLOCK_SKEW_MS;
}
