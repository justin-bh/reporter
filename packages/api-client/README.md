# @reporter/api-client

The Node client for the reporter **client API** (`/api/*`), plus the canonical HMAC request-signing implementation. Used by the desktop app and the terminal recorder, and imported by the server to verify incoming signatures. This is the **only** place the signing algorithm is implemented.

## HMAC signing protocol

Every client-API request is signed with the user's API key pair (an **access key** and a base64 **secret key**, generated in the web UI under Account → API keys).

The string to sign is built from four request components, with the SHA-256 of the raw body appended as 32 raw bytes:

```
stringToSign = METHOD + "\n"
             + pathWithQuery + "\n"          e.g. /api/operations/acme/evidence?page=1
             + dateRFC1123GMT + "\n"         e.g. Wed, 13 Aug 2026 20:01:00 GMT
             ⧺ SHA-256(rawBody)              32 raw digest bytes (empty body → hash of 0 bytes)

signature = base64( HMAC-SHA256(base64decode(secretKey), stringToSign) )
```

The request carries two headers:

```
Authorization: <accessKey>:<signature>
Date:          <the same RFC 1123 GMT value used above>
```

The server recomputes the signature, requires the `Date` to be within **±15 minutes** of its clock, and compares in constant time. Any failure returns a uniform `401`.

## Usage

```ts
import { ReporterClient } from '@reporter/api-client';

const client = new ReporterClient({
  baseUrl: 'http://reporter.lan:8080',
  accessKey: process.env.REPORTER_ACCESS_KEY!,
  secretKey: process.env.REPORTER_SECRET_KEY!, // base64, as issued
});

await client.checkConnection();               // { ok: true, user, serverVersion }
const ops = await client.listOperations();

await client.createEvidence(
  'acme-assessment',
  { contentType: 'image', description: 'Login bypass', tagIds: [] },
  { filename: 'shot.png', contentType: 'image/png', data: pngBuffer },
);
```

### Signing a request by hand

```ts
import { buildAuthHeaders } from '@reporter/api-client';

const body = Buffer.from(JSON.stringify(payload));
const headers = buildAuthHeaders('POST', '/api/operations', body, accessKey, secretKeyBase64);
// → { Authorization, Date }
```

## API surface

- `ReporterClient` — `checkConnection`, `listOperations`, `createOperation`, `listTags`, `createTag`, `createEvidence`.
- `computeSignature`, `verifySignature`, `buildAuthHeaders`, `parseAuthorization`, `isDateWithinSkew`, `MAX_CLOCK_SKEW_MS`.
- `buildMultipart` — in-memory `multipart/form-data` builder (so the exact bytes can be signed).
