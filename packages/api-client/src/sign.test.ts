import { describe, it, expect } from 'vitest';
import { createHash, createHmac } from 'node:crypto';
import {
  computeSignature,
  verifySignature,
  buildAuthHeaders,
  parseAuthorization,
  isDateWithinSkew,
} from './sign.js';

// A fixed key pair + request for deterministic vectors.
const SECRET_B64 = Buffer.from('super-secret-key-material-32byte').toString('base64');
const ACCESS = 'AKIAEXAMPLE1234567';
const DATE = 'Wed, 13 Aug 2026 20:01:00 GMT';

/** Independent reference implementation, to cross-check the shape of the algorithm. */
function reference(method: string, path: string, date: string, body: Buffer): string {
  const bodyHash = createHash('sha256').update(body).digest();
  const toSign = Buffer.concat([Buffer.from(`${method}\n${path}\n${date}\n`, 'utf8'), bodyHash]);
  return createHmac('sha256', Buffer.from(SECRET_B64, 'base64')).update(toSign).digest('base64');
}

describe('computeSignature', () => {
  it('matches an independent reference implementation', () => {
    const body = Buffer.from('{"hello":"world"}');
    const sig = computeSignature({
      method: 'POST',
      path: '/api/engagements/acme/evidence',
      date: DATE,
      body,
      secretKeyBase64: SECRET_B64,
    });
    expect(sig).toBe(reference('POST', '/api/engagements/acme/evidence', DATE, body));
  });

  it('is deterministic for identical inputs', () => {
    const args = {
      method: 'GET',
      path: '/api/engagements',
      date: DATE,
      body: Buffer.alloc(0),
      secretKeyBase64: SECRET_B64,
    };
    expect(computeSignature(args)).toBe(computeSignature(args));
  });

  it('uppercases the method so verbs are canonical', () => {
    const base = {
      path: '/api/engagements',
      date: DATE,
      body: Buffer.alloc(0),
      secretKeyBase64: SECRET_B64,
    };
    expect(computeSignature({ method: 'get', ...base })).toBe(
      computeSignature({ method: 'GET', ...base }),
    );
  });

  it('changes when any signed component changes', () => {
    const base = {
      method: 'POST',
      path: '/api/engagements/acme/evidence',
      date: DATE,
      body: Buffer.from('a'),
      secretKeyBase64: SECRET_B64,
    };
    const sig = computeSignature(base);
    expect(computeSignature({ ...base, method: 'PUT' })).not.toBe(sig);
    expect(computeSignature({ ...base, path: '/api/engagements/other/evidence' })).not.toBe(sig);
    expect(computeSignature({ ...base, date: 'Thu, 14 Aug 2026 20:01:00 GMT' })).not.toBe(sig);
    expect(computeSignature({ ...base, body: Buffer.from('b') })).not.toBe(sig);
  });
});

describe('verifySignature', () => {
  it('accepts a correct signature and rejects a tampered one', () => {
    const params = {
      method: 'POST',
      path: '/api/engagements/acme/evidence',
      date: DATE,
      body: Buffer.from('payload'),
      secretKeyBase64: SECRET_B64,
    };
    const sig = computeSignature(params);
    expect(verifySignature(params, sig)).toBe(true);
    expect(verifySignature({ ...params, body: Buffer.from('tampered') }, sig)).toBe(false);
    expect(verifySignature(params, 'not-a-real-signature')).toBe(false);
  });
});

describe('buildAuthHeaders + parseAuthorization', () => {
  it('produces headers a server can split and verify', () => {
    const body = Buffer.from('{}');
    const headers = buildAuthHeaders('POST', '/api/x', body, ACCESS, SECRET_B64, DATE);
    expect(headers.Date).toBe(DATE);

    const parsed = parseAuthorization(headers.Authorization);
    expect(parsed?.accessKey).toBe(ACCESS);
    expect(
      verifySignature(
        { method: 'POST', path: '/api/x', date: DATE, body, secretKeyBase64: SECRET_B64 },
        parsed!.signature,
      ),
    ).toBe(true);
  });

  it('rejects malformed Authorization headers', () => {
    expect(parseAuthorization(undefined)).toBeNull();
    expect(parseAuthorization('no-colon')).toBeNull();
    expect(parseAuthorization(':leading')).toBeNull();
    expect(parseAuthorization('trailing:')).toBeNull();
  });
});

describe('isDateWithinSkew', () => {
  const now = Date.parse(DATE);
  it('accepts dates within 15 minutes', () => {
    expect(isDateWithinSkew(DATE, now)).toBe(true);
    expect(isDateWithinSkew('Wed, 13 Aug 2026 20:10:00 GMT', now)).toBe(true);
  });
  it('rejects dates outside 15 minutes and unparseable dates', () => {
    expect(isDateWithinSkew('Wed, 13 Aug 2026 20:20:00 GMT', now)).toBe(false);
    expect(isDateWithinSkew('not a date', now)).toBe(false);
  });
});
