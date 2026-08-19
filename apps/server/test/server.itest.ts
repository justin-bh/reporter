import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildAuthHeaders, buildMultipart } from '@reporter/api-client';
import {
  WEB_HEADERS,
  apiKeyFor,
  buildTestApp,
  loginCookie,
  seedUsers,
  truncateAll,
} from './helpers.js';

// A minimal 1x1 PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
});
afterAll(async () => {
  await app.close();
});
beforeEach(async () => {
  await truncateAll(app);
});

/** Set up an engagement with the three seeded users attached at their roles. */
async function setupEngagement() {
  const users = await seedUsers(app);
  const eng = await app.db.engagement.create({
    data: {
      slug: 'op1',
      name: 'Op One',
      roles: {
        create: [
          { userId: users.admin.id, role: 'admin' },
          { userId: users.writer.id, role: 'write' },
          { userId: users.reader.id, role: 'read' },
        ],
      },
      tags: { create: [{ name: 'sqli', colorName: 'red' }] },
    },
    include: { tags: true },
  });
  return { users, eng, tag: eng.tags[0]! };
}

describe('session auth', () => {
  it('logs in, returns the current user, and logs out', async () => {
    await seedUsers(app);
    const cookie = await loginCookie(app, 'admin@test.local', 'password123');

    const me = await app.inject({ method: 'GET', url: '/web/me', headers: { cookie } });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.email).toBe('admin@test.local');

    const out = await app.inject({
      method: 'POST',
      url: '/web/logout',
      headers: { ...WEB_HEADERS, cookie },
    });
    expect(out.statusCode).toBe(200);
  });

  it('rejects wrong passwords', async () => {
    await seedUsers(app);
    const res = await app.inject({
      method: 'POST',
      url: '/web/login',
      headers: WEB_HEADERS,
      payload: { email: 'admin@test.local', password: 'wrong' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('blocks mutations without the CSRF header', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/web/login',
      payload: { email: 'a@b.com', password: 'x' },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('engagement role enforcement', () => {
  it('lets a writer create evidence but forbids a reader', async () => {
    const { tag } = await setupEngagement();

    const write = await postEvidence('writer@test.local', tag.id);
    expect(write.statusCode).toBe(201);

    const read = await postEvidence('reader@test.local', tag.id);
    expect(read.statusCode).toBe(403);
  });

  async function postEvidence(email: string, tagId: number) {
    const cookie = await loginCookie(app, email, 'password123');
    const { body, contentType } = buildMultipart(
      {
        notes: JSON.stringify({
          contentType: 'image',
          title: 'Screenshot',
          description: 'x',
          tagIds: [tagId],
        }),
      },
      [{ field: 'file', filename: 's.png', contentType: 'image/png', data: PNG }],
    );
    return app.inject({
      method: 'POST',
      url: '/web/engagements/op1/evidence',
      headers: { ...WEB_HEADERS, cookie, 'content-type': contentType },
      payload: body,
    });
  }
});

describe('engagement membership management', () => {
  /** An engagement whose only member is the (system + engagement) admin. */
  async function setupAdminOnly() {
    const users = await seedUsers(app);
    await app.db.engagement.create({
      data: {
        slug: 'op1',
        name: 'Op One',
        roles: { create: [{ userId: users.admin.id, role: 'admin' }] },
      },
    });
    return users;
  }

  it('adds a member by email (case-insensitive) and lists them', async () => {
    await setupAdminOnly();
    const cookie = await loginCookie(app, 'admin@test.local', 'password123');

    const added = await app.inject({
      method: 'POST',
      url: '/web/engagements/op1/users',
      headers: { ...WEB_HEADERS, cookie },
      payload: { email: 'WRITER@Test.Local', role: 'write' },
    });
    expect(added.statusCode).toBe(200);
    expect(added.json().user.email).toBe('writer@test.local');
    expect(added.json().role).toBe('write');

    const list = await app.inject({
      method: 'GET',
      url: '/web/engagements/op1/users',
      headers: { cookie },
    });
    expect(list.statusCode).toBe(200);
    const emails = list
      .json()
      .map((m: { user: { email: string } }) => m.user.email)
      .sort();
    expect(emails).toEqual(['admin@test.local', 'writer@test.local']);
  });

  it('re-roles an existing member instead of duplicating them', async () => {
    await setupAdminOnly();
    const cookie = await loginCookie(app, 'admin@test.local', 'password123');
    const add = (role: string) =>
      app.inject({
        method: 'POST',
        url: '/web/engagements/op1/users',
        headers: { ...WEB_HEADERS, cookie },
        payload: { email: 'reader@test.local', role },
      });

    expect((await add('read')).json().role).toBe('read');
    expect((await add('admin')).json().role).toBe('admin');

    const list = await app.inject({
      method: 'GET',
      url: '/web/engagements/op1/users',
      headers: { cookie },
    });
    expect(list.json()).toHaveLength(2); // admin + reader, no duplicate row
  });

  it('returns 404 when no account matches the email', async () => {
    await setupAdminOnly();
    const cookie = await loginCookie(app, 'admin@test.local', 'password123');
    const res = await app.inject({
      method: 'POST',
      url: '/web/engagements/op1/users',
      headers: { ...WEB_HEADERS, cookie },
      payload: { email: 'nobody@test.local', role: 'read' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('forbids non-admin members from managing membership', async () => {
    const users = await seedUsers(app);
    await app.db.engagement.create({
      data: {
        slug: 'op1',
        name: 'Op One',
        roles: {
          create: [
            { userId: users.admin.id, role: 'admin' },
            { userId: users.reader.id, role: 'read' },
          ],
        },
      },
    });
    const cookie = await loginCookie(app, 'reader@test.local', 'password123');
    const res = await app.inject({
      method: 'POST',
      url: '/web/engagements/op1/users',
      headers: { ...WEB_HEADERS, cookie },
      payload: { email: 'writer@test.local', role: 'read' },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('evidence pipeline', () => {
  it('stores a screenshot, generates a thumbnail, and serves both', async () => {
    const { tag } = await setupEngagement();
    const cookie = await loginCookie(app, 'writer@test.local', 'password123');

    const { body, contentType } = buildMultipart(
      {
        notes: JSON.stringify({
          contentType: 'image',
          title: 'Shot',
          description: 'shot',
          tagIds: [tag.id],
        }),
      },
      [{ field: 'file', filename: 's.png', contentType: 'image/png', data: PNG }],
    );
    const created = await app.inject({
      method: 'POST',
      url: '/web/engagements/op1/evidence',
      headers: { ...WEB_HEADERS, cookie, 'content-type': contentType },
      payload: body,
    });
    expect(created.statusCode).toBe(201);
    const ev = created.json();
    expect(ev.hasThumbnail).toBe(true);
    expect(ev.tags).toHaveLength(1);

    const content = await app.inject({
      method: 'GET',
      url: `/web/engagements/op1/evidence/${ev.uuid}/content`,
      headers: { cookie },
    });
    expect(content.statusCode).toBe(200);
    expect(content.headers['content-type']).toContain('image/png');

    const thumb = await app.inject({
      method: 'GET',
      url: `/web/engagements/op1/evidence/${ev.uuid}/thumbnail`,
      headers: { cookie },
    });
    expect(thumb.statusCode).toBe(200);
    expect(thumb.headers['content-type']).toContain('image/jpeg');
  });

  it('filters the timeline by tag, type, and text', async () => {
    const { tag, users, eng } = await setupEngagement();
    // Two evidence: one tagged image "alpha", one untagged note "beta".
    await app.db.evidence.create({
      data: {
        engagementId: eng.id,
        operatorId: users.writer.id,
        contentType: 'image',
        description: 'alpha finding',
        occurredAt: new Date(),
        tags: { create: [{ tagId: tag.id }] },
      },
    });
    await app.db.evidence.create({
      data: {
        engagementId: eng.id,
        operatorId: users.writer.id,
        contentType: 'none',
        description: 'beta note',
        occurredAt: new Date(),
      },
    });
    const cookie = await loginCookie(app, 'reader@test.local', 'password123');

    const byTag = await timeline(cookie, 'tag:sqli');
    expect(byTag.total).toBe(1);
    expect(byTag.items[0].description).toBe('alpha finding');

    const byType = await timeline(cookie, 'type:none');
    expect(byType.total).toBe(1);
    expect(byType.items[0].description).toBe('beta note');

    const byText = await timeline(cookie, 'alpha');
    expect(byText.total).toBe(1);

    const all = await timeline(cookie, '');
    expect(all.total).toBe(2);
  });

  async function timeline(cookie: string, q: string) {
    const res = await app.inject({
      method: 'GET',
      url: `/web/engagements/op1/evidence?q=${encodeURIComponent(q)}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    return res.json();
  }
});

describe('findings', () => {
  it('links evidence to a finding and shows it in the detail view', async () => {
    const { eng, users, tag } = await setupEngagement();
    const evidence = await app.db.evidence.create({
      data: {
        engagementId: eng.id,
        operatorId: users.writer.id,
        contentType: 'none',
        description: 'linked note',
        occurredAt: new Date(),
        tags: { create: [{ tagId: tag.id }] },
      },
    });
    const cookie = await loginCookie(app, 'writer@test.local', 'password123');

    const finding = (
      await app.inject({
        method: 'POST',
        url: '/web/engagements/op1/findings',
        headers: { ...WEB_HEADERS, cookie },
        payload: { title: 'F1', description: 'd', category: 'Web' },
      })
    ).json();

    const attach = await app.inject({
      method: 'POST',
      url: `/web/engagements/op1/findings/${finding.uuid}/evidence`,
      headers: { ...WEB_HEADERS, cookie },
      payload: { evidenceUuids: [evidence.uuid] },
    });
    expect(attach.statusCode).toBe(200);

    const detail = await app.inject({
      method: 'GET',
      url: `/web/engagements/op1/findings/${finding.uuid}`,
      headers: { cookie },
    });
    expect(detail.json().evidence).toHaveLength(1);
    expect(detail.json().category).toBe('Web');
  });
});

describe('API keys', () => {
  it('generates a key (secret shown once), lists without the secret, and revokes', async () => {
    await seedUsers(app);
    const cookie = await loginCookie(app, 'writer@test.local', 'password123');

    const gen = await app.inject({
      method: 'POST',
      url: '/web/account/api-keys',
      headers: { ...WEB_HEADERS, cookie },
    });
    expect(gen.statusCode).toBe(201);
    const { accessKey, secretKey } = gen.json();
    expect(secretKey).toBeTruthy();

    const list = await app.inject({
      method: 'GET',
      url: '/web/account/api-keys',
      headers: { cookie },
    });
    expect(list.json()[0].accessKey).toBe(accessKey);
    expect(list.json()[0].secretKey).toBeUndefined();

    const del = await app.inject({
      method: 'DELETE',
      url: `/web/account/api-keys/${accessKey}`,
      headers: { ...WEB_HEADERS, cookie },
    });
    expect(del.statusCode).toBe(200);
  });
});

describe('HMAC client API', () => {
  it('accepts a correctly signed request', async () => {
    const { users } = await setupEngagement();
    const key = await apiKeyFor(app, users.writer.id);
    const headers = buildAuthHeaders(
      'GET',
      '/api/checkconnection',
      Buffer.alloc(0),
      key.accessKey,
      key.secretKey,
    );
    const res = await app.inject({ method: 'GET', url: '/api/checkconnection', headers });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.email).toBe('writer@test.local');
  });

  it('creates evidence over a signed multipart request', async () => {
    const { users, tag } = await setupEngagement();
    const key = await apiKeyFor(app, users.writer.id);
    const { body, contentType } = buildMultipart(
      {
        notes: JSON.stringify({
          contentType: 'image',
          title: 'Via API',
          description: 'via api',
          tagIds: [tag.id],
        }),
      },
      [{ field: 'file', filename: 's.png', contentType: 'image/png', data: PNG }],
    );
    const auth = buildAuthHeaders(
      'POST',
      '/api/engagements/op1/evidence',
      body,
      key.accessKey,
      key.secretKey,
    );
    const res = await app.inject({
      method: 'POST',
      url: '/api/engagements/op1/evidence',
      headers: { ...auth, 'content-type': contentType },
      payload: body,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().hasThumbnail).toBe(true);
  });

  it('rejects a tampered body, an expired date, and an unknown key', async () => {
    const { users } = await setupEngagement();
    const key = await apiKeyFor(app, users.writer.id);

    // Tampered signature.
    const good = buildAuthHeaders(
      'GET',
      '/api/engagements',
      Buffer.alloc(0),
      key.accessKey,
      key.secretKey,
    );
    const tampered = { ...good, authorization: `${key.accessKey}:AAAAstalesignatureAAAA==` };
    expect(
      (await app.inject({ method: 'GET', url: '/api/engagements', headers: tampered })).statusCode,
    ).toBe(401);

    // Expired date (outside skew).
    const old = new Date(Date.now() - 60 * 60 * 1000).toUTCString();
    const expired = buildAuthHeaders(
      'GET',
      '/api/engagements',
      Buffer.alloc(0),
      key.accessKey,
      key.secretKey,
      old,
    );
    expect(
      (await app.inject({ method: 'GET', url: '/api/engagements', headers: expired })).statusCode,
    ).toBe(401);

    // Unknown access key.
    const unknown = buildAuthHeaders(
      'GET',
      '/api/engagements',
      Buffer.alloc(0),
      'nope',
      key.secretKey,
    );
    expect(
      (await app.inject({ method: 'GET', url: '/api/engagements', headers: unknown })).statusCode,
    ).toBe(401);
  });
});
