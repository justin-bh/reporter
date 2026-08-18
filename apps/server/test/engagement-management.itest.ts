import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { WEB_HEADERS, buildTestApp, loginCookie, seedUsers, truncateAll } from './helpers.js';

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

/**
 * op1 has `reader` as an engagement admin (not a site admin) and `writer` as a
 * write member, so we can exercise both the allow and deny sides of the guard.
 */
async function setup() {
  const users = await seedUsers(app);
  const eng = await app.db.engagement.create({
    data: {
      slug: 'op1',
      name: 'Op One',
      roles: {
        create: [
          { userId: users.reader.id, role: 'admin' },
          { userId: users.writer.id, role: 'write' },
        ],
      },
    },
  });
  return { users, eng };
}

function createFinding(cookie: string, title: string) {
  return app
    .inject({
      method: 'POST',
      url: '/web/engagements/op1/findings',
      headers: { ...WEB_HEADERS, cookie },
      payload: { title, description: '', category: null },
    })
    .then((r) => r.json());
}

describe('engagement findings count', () => {
  it('reports numFindings on the list and detail responses', async () => {
    await setup();
    const admin = await loginCookie(app, 'admin@test.local', 'password123');

    let list = await app
      .inject({
        method: 'GET',
        url: '/web/engagements',
        headers: { ...WEB_HEADERS, cookie: admin },
      })
      .then((r) => r.json());
    expect(list.find((e: { slug: string }) => e.slug === 'op1').numFindings).toBe(0);

    await createFinding(admin, 'F1');
    await createFinding(admin, 'F2');

    list = await app
      .inject({
        method: 'GET',
        url: '/web/engagements',
        headers: { ...WEB_HEADERS, cookie: admin },
      })
      .then((r) => r.json());
    expect(list.find((e: { slug: string }) => e.slug === 'op1').numFindings).toBe(2);

    const detail = await app
      .inject({
        method: 'GET',
        url: '/web/engagements/op1',
        headers: { ...WEB_HEADERS, cookie: admin },
      })
      .then((r) => r.json());
    expect(detail.numFindings).toBe(2);
  });
});

describe('delete engagement', () => {
  it('lets an engagement admin delete it, cascading its children', async () => {
    const { users, eng } = await setup();
    const engAdmin = await loginCookie(app, 'reader@test.local', 'password123');

    // Seed a range of children so we can prove the cascade reaches everything.
    await createFinding(engAdmin, 'F1');
    await app.db.evidence.create({
      data: {
        engagementId: eng.id,
        operatorId: users.reader.id,
        description: 'shot',
        contentType: 'image',
        occurredAt: new Date(),
      },
    });
    await app.db.tag.create({ data: { engagementId: eng.id, name: 'crit', colorName: 'red' } });

    const res = await app.inject({
      method: 'DELETE',
      url: '/web/engagements/op1',
      headers: { ...WEB_HEADERS, cookie: engAdmin },
    });
    expect(res.statusCode).toBe(200);

    expect(await app.db.engagement.findUnique({ where: { id: eng.id } })).toBeNull();
    expect(await app.db.finding.count({ where: { engagementId: eng.id } })).toBe(0);
    expect(await app.db.evidence.count({ where: { engagementId: eng.id } })).toBe(0);
    expect(await app.db.tag.count({ where: { engagementId: eng.id } })).toBe(0);
    expect(await app.db.userEngagementRole.count({ where: { engagementId: eng.id } })).toBe(0);
  });

  it('lets a site admin delete any engagement', async () => {
    const { eng } = await setup();
    const siteAdmin = await loginCookie(app, 'admin@test.local', 'password123');
    const res = await app.inject({
      method: 'DELETE',
      url: '/web/engagements/op1',
      headers: { ...WEB_HEADERS, cookie: siteAdmin },
    });
    expect(res.statusCode).toBe(200);
    expect(await app.db.engagement.findUnique({ where: { id: eng.id } })).toBeNull();
  });

  it('forbids a write member from deleting', async () => {
    const { eng } = await setup();
    const writer = await loginCookie(app, 'writer@test.local', 'password123');
    const res = await app.inject({
      method: 'DELETE',
      url: '/web/engagements/op1',
      headers: { ...WEB_HEADERS, cookie: writer },
    });
    expect(res.statusCode).toBe(403);
    expect(await app.db.engagement.findUnique({ where: { id: eng.id } })).not.toBeNull();
  });

  it('404s when the engagement does not exist', async () => {
    await setup();
    const admin = await loginCookie(app, 'admin@test.local', 'password123');
    const res = await app.inject({
      method: 'DELETE',
      url: '/web/engagements/does-not-exist',
      headers: { ...WEB_HEADERS, cookie: admin },
    });
    expect(res.statusCode).toBe(404);
  });
});
