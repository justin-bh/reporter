import { describe, it, expect } from 'vitest';
import { parseHttpExchanges, type HttpPreviewResult } from './http-preview.js';

/** Assert the result is ok and return it narrowed. */
function ok(result: HttpPreviewResult) {
  if (!result.ok) throw new Error(`expected ok, got error: ${result.error}`);
  return result;
}

describe('parseHttpExchanges — empty & invalid', () => {
  it('rejects empty input', () => {
    expect(parseHttpExchanges('')).toEqual({ ok: false, error: expect.stringContaining('Enter') });
    expect(parseHttpExchanges('   \n  ').ok).toBe(false);
  });

  it('rejects malformed JSON with a message', () => {
    const r = parseHttpExchanges('{ "log": { ');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Invalid JSON/);
  });

  it('rejects text that is neither JSON nor raw HTTP', () => {
    const r = parseHttpExchanges('just some prose without a start line');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Unrecognized/);
  });
});

describe('parseHttpExchanges — HAR JSON', () => {
  const har = JSON.stringify({
    log: {
      entries: [
        {
          request: {
            method: 'POST',
            url: 'https://api.example.com/login?debug=1',
            httpVersion: 'HTTP/1.1',
            headers: [
              { name: 'Content-Type', value: 'application/json' },
              { name: 'Cookie', value: 'sid=abc; theme=dark' },
            ],
            queryString: [{ name: 'debug', value: '1' }],
            postData: { mimeType: 'application/json', text: '{"user":"root","pw":"x"}' },
          },
          response: {
            status: 200,
            statusText: 'OK',
            headers: [{ name: 'Content-Type', value: 'application/json' }],
            content: { mimeType: 'application/json', text: '{"token":"t","ok":true}' },
          },
        },
      ],
    },
  });

  it('parses a HAR document into one exchange', () => {
    const r = ok(parseHttpExchanges(har));
    expect(r.format).toBe('har');
    expect(r.entries).toHaveLength(1);
  });

  it('extracts request method, url, version, headers, query, cookies', () => {
    const { entries } = ok(parseHttpExchanges(har));
    const req = entries[0]!.request!;
    expect(req.method).toBe('POST');
    expect(req.url).toBe('https://api.example.com/login?debug=1');
    expect(req.httpVersion).toBe('HTTP/1.1');
    expect(req.headers).toContainEqual({ name: 'Content-Type', value: 'application/json' });
    expect(req.queryString).toEqual([{ name: 'debug', value: '1' }]);
    expect(req.cookies).toEqual([
      { name: 'sid', value: 'abc' },
      { name: 'theme', value: 'dark' },
    ]);
  });

  it('attaches parsed JSON to request and response bodies', () => {
    const { entries } = ok(parseHttpExchanges(har));
    expect(entries[0]!.request!.body!.json).toEqual({ user: 'root', pw: 'x' });
    const res = entries[0]!.response!;
    expect(res.status).toBe(200);
    expect(res.statusText).toBe('OK');
    expect(res.body!.json).toEqual({ token: 't', ok: true });
  });

  it('derives query params from the URL when queryString is absent', () => {
    const har2 = JSON.stringify({
      log: { entries: [{ request: { method: 'GET', url: '/search?q=hello+world&p=2', headers: [] } }] },
    });
    const { entries } = ok(parseHttpExchanges(har2));
    expect(entries[0]!.request!.queryString).toEqual([
      { name: 'q', value: 'hello world' },
      { name: 'p', value: '2' },
    ]);
  });

  it('decodes base64-encoded HAR response content', () => {
    // btoa('{"a":1}') === 'eyJhIjoxfQ=='
    const har3 = JSON.stringify({
      log: {
        entries: [
          {
            response: {
              status: 200,
              headers: [{ name: 'Content-Type', value: 'application/json' }],
              content: { mimeType: 'application/json', encoding: 'base64', text: 'eyJhIjoxfQ==' },
            },
          },
        ],
      },
    });
    const { entries } = ok(parseHttpExchanges(har3));
    expect(entries[0]!.response!.body!.text).toBe('{"a":1}');
    expect(entries[0]!.response!.body!.json).toEqual({ a: 1 });
  });
});

describe('parseHttpExchanges — loose JSON', () => {
  it('parses a bare request object', () => {
    const { entries } = ok(parseHttpExchanges('{"method":"GET","url":"/x?a=1"}'));
    expect(entries[0]!.request!.method).toBe('GET');
    expect(entries[0]!.request!.queryString).toEqual([{ name: 'a', value: '1' }]);
    expect(entries[0]!.response).toBeUndefined();
  });

  it('parses a bare response object', () => {
    const { entries } = ok(parseHttpExchanges('{"status":404,"statusText":"Not Found","headers":[]}'));
    expect(entries[0]!.response!.status).toBe(404);
    expect(entries[0]!.request).toBeUndefined();
  });

  it('does not coerce a null/empty status into a fake 0', () => {
    const nul = ok(parseHttpExchanges('{"status":null,"statusCode":null,"headers":[]}'));
    expect(nul.entries[0]!.response!.status).toBeUndefined();
    const empty = ok(parseHttpExchanges('{"status":"","headers":[]}'));
    expect(empty.entries[0]!.response!.status).toBeUndefined();
    // A genuine 0 is preserved.
    const zero = ok(parseHttpExchanges('{"status":0,"headers":[]}'));
    expect(zero.entries[0]!.response!.status).toBe(0);
  });

  it('parses an array of HAR entries', () => {
    const arr = JSON.stringify([
      { request: { method: 'GET', url: '/a', headers: [] } },
      { request: { method: 'GET', url: '/b', headers: [] } },
    ]);
    const { entries } = ok(parseHttpExchanges(arr));
    expect(entries).toHaveLength(2);
    expect(entries[1]!.request!.url).toBe('/b');
  });

  it('renders arbitrary JSON as a data tree', () => {
    const { entries } = ok(parseHttpExchanges('{"anything":[1,2,3]}'));
    expect(entries[0]!.request).toBeUndefined();
    expect(entries[0]!.response).toBeUndefined();
    expect(entries[0]!.data!.json).toEqual({ anything: [1, 2, 3] });
  });
});

describe('parseHttpExchanges — raw HTTP text', () => {
  it('parses a raw request with headers and a body', () => {
    const raw = [
      'POST /login?next=/home HTTP/1.1',
      'Host: example.com',
      'Content-Type: application/json',
      'Cookie: sid=abc; theme=dark',
      '',
      '{"user":"root"}',
    ].join('\n');
    const r = ok(parseHttpExchanges(raw));
    expect(r.format).toBe('raw');
    const req = r.entries[0]!.request!;
    expect(req.method).toBe('POST');
    expect(req.url).toBe('/login?next=/home');
    expect(req.httpVersion).toBe('HTTP/1.1');
    expect(req.headers).toContainEqual({ name: 'Host', value: 'example.com' });
    expect(req.queryString).toEqual([{ name: 'next', value: '/home' }]);
    expect(req.cookies).toEqual([
      { name: 'sid', value: 'abc' },
      { name: 'theme', value: 'dark' },
    ]);
    expect(req.body!.json).toEqual({ user: 'root' });
  });

  it('pairs a raw request and response separated by a blank line', () => {
    const raw = [
      'GET /a HTTP/1.1',
      'Host: example.com',
      '',
      'HTTP/1.1 200 OK',
      'Content-Type: text/plain',
      '',
      'hello body',
    ].join('\n');
    const { entries } = ok(parseHttpExchanges(raw));
    expect(entries).toHaveLength(1);
    expect(entries[0]!.request!.method).toBe('GET');
    expect(entries[0]!.response!.status).toBe(200);
    expect(entries[0]!.response!.statusText).toBe('OK');
    expect(entries[0]!.response!.body!.text).toBe('hello body');
  });

  it('parses Set-Cookie into one cookie (attributes ignored) and keeps every line', () => {
    const raw = [
      'HTTP/1.1 200 OK',
      'Set-Cookie: sid=abc123; Path=/; HttpOnly; Secure',
      'Set-Cookie: theme=dark; Max-Age=3600',
      '',
      'ok',
    ].join('\n');
    const { entries } = ok(parseHttpExchanges(raw));
    // Two cookies (one per Set-Cookie), attributes like Path/HttpOnly not listed.
    expect(entries[0]!.response!.cookies).toEqual([
      { name: 'sid', value: 'abc123' },
      { name: 'theme', value: 'dark' },
    ]);
  });

  it('parses a response-only paste', () => {
    const raw = ['HTTP/2 503 Service Unavailable', 'Retry-After: 30', '', 'down'].join('\n');
    const { entries } = ok(parseHttpExchanges(raw));
    expect(entries[0]!.request).toBeUndefined();
    expect(entries[0]!.response!.status).toBe(503);
    expect(entries[0]!.response!.statusText).toBe('Service Unavailable');
  });

  it('handles CRLF line endings', () => {
    const raw = 'GET / HTTP/1.1\r\nHost: x\r\n\r\n';
    const { entries } = ok(parseHttpExchanges(raw));
    expect(entries[0]!.request!.headers).toEqual([{ name: 'Host', value: 'x' }]);
    expect(entries[0]!.request!.body).toBeUndefined();
  });

  it('does not split on a start-line-like line inside a body', () => {
    const raw = [
      'POST /echo HTTP/1.1',
      'Content-Type: text/plain',
      '',
      'payload=1',
      'GET /not-a-real-request HTTP/1.1',
    ].join('\n');
    const { entries } = ok(parseHttpExchanges(raw));
    // The HTTP-looking line is inside the body (preceded by body content, not a
    // blank line), so it stays part of the body — still a single exchange. Only a
    // start-line right after a blank line begins a new message (request→response).
    expect(entries).toHaveLength(1);
    expect(entries[0]!.request!.body!.text).toBe('payload=1\nGET /not-a-real-request HTTP/1.1');
  });

  it('keeps a header value containing a colon intact', () => {
    const raw = 'GET / HTTP/1.1\nDate: Mon, 01 Jan 2026 00:00:00 GMT\n\n';
    const { entries } = ok(parseHttpExchanges(raw));
    expect(entries[0]!.request!.headers).toContainEqual({
      name: 'Date',
      value: 'Mon, 01 Jan 2026 00:00:00 GMT',
    });
  });
});
