/**
 * HTTP evidence preview — parse the free-form "HTTP data" an operator pastes into
 * the Add-evidence form into a normalized, HTTP-semantic model that the web app
 * can render as a field/value view (method/URL/status, header and query tables,
 * cookies, and request/response bodies with JSON rendered as an expandable tree).
 *
 * Three input shapes are accepted, tried in this order:
 *   1. HAR JSON   — a full HAR document (`{ log: { entries: [...] } }`).
 *   2. Loose JSON — a single HAR entry, a bare array of entries, a bare
 *                   request/response object, or arbitrary JSON (shown as a tree).
 *   3. Raw HTTP   — a pasted raw request and/or response (start-line + headers +
 *                   blank line + body), the shape you copy out of a proxy.
 *
 * Pure and browser-safe (no Node APIs) so it is unit-testable and shared by the
 * web renderer. It never throws: callers get a discriminated result.
 */

/** A single `name: value` pair (a header, query param, or cookie). */
export interface HttpNameValue {
  name: string;
  value: string;
}

/** A request or response body, with the parsed JSON attached when it is JSON. */
export interface HttpBody {
  /** The MIME type from the owning Content-Type header, when known. */
  mimeType?: string;
  /** The raw body text (decoded from base64 when a HAR marked it so). */
  text: string;
  /**
   * The parsed JSON value when `text` is a JSON object or array — drives the
   * expandable field/value tree. Absent for non-JSON (or primitive-JSON) bodies.
   */
  json?: unknown;
}

export interface HttpRequestData {
  method: string;
  url: string;
  httpVersion?: string;
  headers: HttpNameValue[];
  queryString: HttpNameValue[];
  cookies: HttpNameValue[];
  body?: HttpBody;
}

export interface HttpResponseData {
  status?: number;
  statusText?: string;
  httpVersion?: string;
  headers: HttpNameValue[];
  cookies: HttpNameValue[];
  body?: HttpBody;
}

/**
 * One request/response cycle. A raw request-only or response-only paste yields an
 * exchange with just that half; arbitrary non-HTTP JSON yields `data` (shown as a
 * standalone JSON tree) with no request/response.
 */
export interface HttpExchange {
  request?: HttpRequestData;
  response?: HttpResponseData;
  /** Arbitrary JSON that is not clearly a request or response. */
  data?: HttpBody;
}

export type HttpPreviewResult =
  | { ok: true; format: 'har' | 'json' | 'raw'; entries: HttpExchange[] }
  | { ok: false; error: string };

/** Cap parsed exchanges so a huge HAR can't lock up the preview. */
const MAX_ENTRIES = 500;

/**
 * Parse pasted HTTP data into a normalized model. Returns `{ ok: false }` with a
 * human-readable message when the input is empty or unrecognizable.
 */
export function parseHttpExchanges(input: string): HttpPreviewResult {
  const text = (input ?? '').trim();
  if (!text) return { ok: false, error: 'Enter HTTP data to preview.' };

  // 1 + 2: anything starting with { or [ is treated as JSON (HAR or loose).
  const looksJson = text[0] === '{' || text[0] === '[';
  if (looksJson) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      return {
        ok: false,
        error: `Invalid JSON: ${err instanceof Error ? err.message : 'could not parse'}.`,
      };
    }
    return fromJson(parsed);
  }

  // 3: raw HTTP request/response text.
  return fromRawHttp(text);
}

// ---------------------------------------------------------------------------
// JSON (HAR + loose) path
// ---------------------------------------------------------------------------

function fromJson(parsed: unknown): HttpPreviewResult {
  // Full HAR document.
  const harEntries = harLogEntries(parsed);
  if (harEntries) {
    const entries = harEntries.slice(0, MAX_ENTRIES).map(normalizeHarEntry);
    return { ok: true, format: 'har', entries };
  }

  // Bare array — of HAR entries and/or request/response objects.
  if (Array.isArray(parsed)) {
    const entries = parsed.slice(0, MAX_ENTRIES).map(normalizeLooseEntry);
    return { ok: true, format: 'json', entries };
  }

  // Single object — a HAR entry, a request, a response, or arbitrary JSON.
  return { ok: true, format: 'json', entries: [normalizeLooseEntry(parsed)] };
}

/** Return `log.entries` when `v` is a HAR document, else null. */
function harLogEntries(v: unknown): unknown[] | null {
  if (!isRecord(v)) return null;
  const log = v.log;
  if (isRecord(log) && Array.isArray(log.entries)) return log.entries;
  return null;
}

/** Normalize a HAR entry (`{ request, response }`) to an exchange. */
function normalizeHarEntry(entry: unknown): HttpExchange {
  if (!isRecord(entry)) return { data: bodyFromValue(entry) };
  const out: HttpExchange = {};
  if (isRecord(entry.request)) out.request = normalizeRequest(entry.request);
  if (isRecord(entry.response)) out.response = normalizeResponse(entry.response);
  if (!out.request && !out.response) out.data = bodyFromValue(entry);
  return out;
}

/**
 * Normalize one loose JSON value: a HAR entry, a bare request (has method/url), a
 * bare response (has status), or arbitrary JSON (shown as a `data` tree).
 */
function normalizeLooseEntry(value: unknown): HttpExchange {
  if (!isRecord(value)) return { data: bodyFromValue(value) };
  if (isRecord(value.request) || isRecord(value.response)) return normalizeHarEntry(value);
  if ('method' in value || 'url' in value) return { request: normalizeRequest(value) };
  if ('status' in value || 'statusCode' in value) return { response: normalizeResponse(value) };
  return { data: bodyFromValue(value) };
}

function normalizeRequest(r: Record<string, unknown>): HttpRequestData {
  const url = str(r.url);
  const headers = nameValueList(r.headers);
  let queryString = nameValueList(r.queryString);
  if (queryString.length === 0) queryString = queryFromUrl(url);
  const cookies =
    nameValueList(r.cookies).length > 0
      ? nameValueList(r.cookies)
      : cookiesFromHeader(headerValue(headers, 'cookie'), ';');
  return {
    method: str(r.method) || 'GET',
    url,
    httpVersion: optStr(r.httpVersion),
    headers,
    queryString,
    cookies,
    body: bodyFromHar(r.postData, headers),
  };
}

function normalizeResponse(r: Record<string, unknown>): HttpResponseData {
  const headers = nameValueList(r.headers);
  const cookies =
    nameValueList(r.cookies).length > 0 ? nameValueList(r.cookies) : setCookiesFromHeaders(headers);
  const statusRaw = r.status ?? r.statusCode;
  return {
    status: typeof statusRaw === 'number' ? statusRaw : numOrUndef(statusRaw),
    statusText: optStr(r.statusText),
    httpVersion: optStr(r.httpVersion),
    headers,
    cookies,
    body: bodyFromHar(r.content ?? r.body, headers),
  };
}

/** Build a body from a HAR `postData`/`content` object (handles base64 content). */
function bodyFromHar(
  data: unknown,
  headers: HttpNameValue[],
): HttpBody | undefined {
  const ct = headerValue(headers, 'content-type');
  if (typeof data === 'string') return makeBody(data, ct);
  if (!isRecord(data)) return undefined;
  const mime = optStr(data.mimeType) ?? ct;
  let text = str(data.text);
  if (str(data.encoding).toLowerCase() === 'base64' && text) text = decodeBase64(text) ?? text;
  if (!text) return undefined;
  return makeBody(text, mime);
}

/** Wrap arbitrary JSON as a `data` body (pretty-printed text + the value). */
function bodyFromValue(value: unknown): HttpBody {
  const text = safeStringify(value);
  return isObjectOrArray(value) ? { text, json: value } : { text };
}

function makeBody(text: string, mimeType?: string): HttpBody {
  const json = tryParseJsonValue(text);
  const body: HttpBody = { text };
  if (mimeType) body.mimeType = mimeType;
  if (json !== undefined) body.json = json;
  return body;
}

// ---------------------------------------------------------------------------
// Raw HTTP text path
// ---------------------------------------------------------------------------

// A request-line: METHOD SP target SP HTTP/x.y  (e.g. `GET /a?b=1 HTTP/1.1`).
const REQUEST_LINE = /^([A-Za-z]+)\s+(\S+)\s+HTTP\/(\d(?:\.\d)?)\s*$/;
// A status-line: HTTP/x.y SP status [SP reason]  (e.g. `HTTP/1.1 200 OK`).
const STATUS_LINE = /^HTTP\/(\d(?:\.\d)?)\s+(\d{3})(?:\s+(.*))?$/;

interface RawMessage {
  kind: 'request' | 'response';
  startLine: string;
  headers: HttpNameValue[];
  body: string;
}

function fromRawHttp(text: string): HttpPreviewResult {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');

  // Message boundaries: a start-line at the top, or after a blank line (so a body
  // line that happens to look like a start-line is not mistaken for a new message).
  const starts: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!isStartLine(lines[i] ?? '')) continue;
    if (i === 0 || (lines[i - 1] ?? '').trim() === '') starts.push(i);
  }
  if (starts.length === 0) {
    return {
      ok: false,
      error: 'Unrecognized format — expected HAR/JSON, or a raw HTTP request/response.',
    };
  }

  const messages: RawMessage[] = [];
  for (let s = 0; s < starts.length && messages.length < MAX_ENTRIES * 2; s++) {
    const from = starts[s]!;
    const to = s + 1 < starts.length ? starts[s + 1]! : lines.length;
    messages.push(parseRawMessage(lines.slice(from, to)));
  }

  return { ok: true, format: 'raw', entries: pairMessages(messages) };
}

function isStartLine(line: string): boolean {
  return REQUEST_LINE.test(line) || STATUS_LINE.test(line);
}

function parseRawMessage(block: string[]): RawMessage {
  const startLine = (block[0] ?? '').trim();
  const kind: RawMessage['kind'] = STATUS_LINE.test(startLine) ? 'response' : 'request';

  // Headers run until the first blank line; the remainder is the body.
  const headers: HttpNameValue[] = [];
  let i = 1;
  for (; i < block.length; i++) {
    const line = block[i] ?? '';
    if (line.trim() === '') {
      i++;
      break;
    }
    const colon = line.indexOf(':');
    if (colon === -1) continue; // fold/garbage line — skip
    headers.push({ name: line.slice(0, colon).trim(), value: line.slice(colon + 1).trim() });
  }
  // Trailing blank lines shouldn't count as body content.
  const body = block.slice(i).join('\n').replace(/\s+$/, '');
  return { kind, startLine, headers, body };
}

/** Fold a flat list of raw messages into request→response exchanges. */
function pairMessages(messages: RawMessage[]): HttpExchange[] {
  const entries: HttpExchange[] = [];
  let pending: HttpExchange | null = null;
  const flush = () => {
    if (pending) entries.push(pending);
    pending = null;
  };
  for (const m of messages) {
    if (m.kind === 'request') {
      flush();
      pending = { request: rawRequest(m) };
    } else if (pending && pending.request && !pending.response) {
      pending.response = rawResponse(m);
      flush();
    } else {
      flush();
      entries.push({ response: rawResponse(m) });
    }
  }
  flush();
  return entries;
}

function rawRequest(m: RawMessage): HttpRequestData {
  const match = REQUEST_LINE.exec(m.startLine);
  const method = match?.[1] ?? 'GET';
  const url = match?.[2] ?? '';
  const httpVersion = match?.[3] ? `HTTP/${match[3]}` : undefined;
  return {
    method,
    url,
    httpVersion,
    headers: m.headers,
    queryString: queryFromUrl(url),
    cookies: cookiesFromHeader(headerValue(m.headers, 'cookie'), ';'),
    body: m.body ? makeBody(m.body, headerValue(m.headers, 'content-type')) : undefined,
  };
}

function rawResponse(m: RawMessage): HttpResponseData {
  const match = STATUS_LINE.exec(m.startLine);
  return {
    httpVersion: match?.[1] ? `HTTP/${match[1]}` : undefined,
    status: match?.[2] ? Number(match[2]) : undefined,
    statusText: match?.[3]?.trim() || undefined,
    headers: m.headers,
    cookies: setCookiesFromHeaders(m.headers),
    body: m.body ? makeBody(m.body, headerValue(m.headers, 'content-type')) : undefined,
  };
}

// ---------------------------------------------------------------------------
// Small shared helpers
// ---------------------------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isObjectOrArray(v: unknown): boolean {
  return typeof v === 'object' && v !== null;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}

function optStr(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

/** A finite number, or a non-empty numeric string, else undefined. Never coerces
 *  null/''/[]/false to 0 (which JS's `Number()` would), so "no status" stays
 *  undefined rather than becoming a fake `0`. */
function numOrUndef(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

/** Normalize a HAR-style `[{ name, value }]` list (tolerating odd shapes). */
function nameValueList(v: unknown): HttpNameValue[] {
  if (!Array.isArray(v)) return [];
  const out: HttpNameValue[] = [];
  for (const item of v) {
    if (!isRecord(item)) continue;
    if (item.name == null && item.value == null) continue;
    out.push({ name: str(item.name), value: str(item.value) });
  }
  return out;
}

/** First matching header value (case-insensitive), or undefined. */
function headerValue(headers: HttpNameValue[], name: string): string | undefined {
  const lower = name.toLowerCase();
  for (const h of headers) if (h.name.toLowerCase() === lower) return h.value;
  return undefined;
}

/** Parse a URL's query string into name/value pairs (path-only URLs are fine). */
function queryFromUrl(url: string): HttpNameValue[] {
  const q = url.indexOf('?');
  if (q === -1) return [];
  const search = url.slice(q + 1).split('#')[0] ?? '';
  if (!search) return [];
  const out: HttpNameValue[] = [];
  for (const part of search.split('&')) {
    if (!part) continue;
    const eq = part.indexOf('=');
    const name = eq === -1 ? part : part.slice(0, eq);
    const value = eq === -1 ? '' : part.slice(eq + 1);
    out.push({ name: safeDecode(name), value: safeDecode(value) });
  }
  return out;
}

/**
 * Collect response cookies from `Set-Cookie` headers. Unlike a request `Cookie`
 * header (many cookies separated by `;`), each `Set-Cookie` is ONE cookie whose
 * `;`-separated tail is attributes (Path, HttpOnly, …) — so we take only the
 * leading `name=value` and keep every `Set-Cookie` line (responses often send
 * several).
 */
function setCookiesFromHeaders(headers: HttpNameValue[]): HttpNameValue[] {
  const out: HttpNameValue[] = [];
  for (const h of headers) {
    if (h.name.toLowerCase() !== 'set-cookie') continue;
    const first = (h.value.split(';')[0] ?? '').trim();
    if (!first) continue;
    const eq = first.indexOf('=');
    if (eq === -1) out.push({ name: first, value: '' });
    else out.push({ name: first.slice(0, eq).trim(), value: first.slice(eq + 1).trim() });
  }
  return out;
}

/** Split a request `Cookie` header (`a=1; b=2`) into name/value pairs. */
function cookiesFromHeader(header: string | undefined, sep: string): HttpNameValue[] {
  if (!header) return [];
  const out: HttpNameValue[] = [];
  for (const part of header.split(sep)) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) {
      out.push({ name: trimmed, value: '' });
    } else {
      out.push({ name: trimmed.slice(0, eq).trim(), value: trimmed.slice(eq + 1).trim() });
    }
  }
  return out;
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s.replace(/\+/g, ' '));
  } catch {
    return s;
  }
}

/** Parse text as JSON, returning the value only for objects/arrays (tree-worthy). */
function tryParseJsonValue(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed[0] !== '{' && trimmed[0] !== '[') return undefined;
  try {
    const v = JSON.parse(trimmed);
    return isObjectOrArray(v) ? v : undefined;
  } catch {
    return undefined;
  }
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2) ?? String(v);
  } catch {
    return String(v);
  }
}

/** Decode base64 to UTF-8 in browser or Node, tolerating failure. */
function decodeBase64(b64: string): string | undefined {
  try {
    if (typeof atob === 'function') {
      const bin = atob(b64);
      const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    }
    // Node fallback (tests, server).
    const g = globalThis as { Buffer?: { from(s: string, enc: string): { toString(enc: string): string } } };
    if (g.Buffer) return g.Buffer.from(b64, 'base64').toString('utf8');
  } catch {
    /* fall through */
  }
  return undefined;
}
