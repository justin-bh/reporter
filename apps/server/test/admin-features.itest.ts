import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { WEB_HEADERS, apiKeyFor, buildTestApp, loginCookie, seedUsers, truncateAll } from './helpers.js';

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
 * Two engagements: the site admin is a member of `adm-mine` only, so the
 * admin console (all engagements) and the membership-scoped list diverge.
 */
async function setup() {
  const users = await seedUsers(app);
  const mine = await app.db.engagement.create({
    data: {
      slug: 'adm-mine',
      name: 'Mine',
      roles: { create: [{ userId: users.admin.id, role: 'admin' }] },
    },
  });
  const other = await app.db.engagement.create({
    data: {
      slug: 'adm-other',
      name: 'Other',
      status: 'archived',
      roles: {
        create: [
          { userId: users.reader.id, role: 'read' },
          { userId: users.writer.id, role: 'write' },
        ],
      },
    },
  });
  return { users, mine, other };
}

describe('GET /web/admin/engagements', () => {
  it('returns every engagement with counts and the amMember flag', async () => {
    const { users, other } = await setup();
    await app.db.evidence.create({
      data: {
        engagementId: other.id,
        operatorId: users.writer.id,
        description: 'shot',
        contentType: 'image',
        occurredAt: new Date(),
      },
    });

    const admin = await loginCookie(app, 'admin@test.local', 'password123');
    const res = await app.inject({
      method: 'GET',
      url: '/web/admin/engagements',
      headers: { ...WEB_HEADERS, cookie: admin },
    });
    expect(res.statusCode).toBe(200);
    const list = res.json();
    expect(list).toHaveLength(2);

    const mine = list.find((e: { slug: string }) => e.slug === 'adm-mine');
    const otherRow = list.find((e: { slug: string }) => e.slug === 'adm-other');
    expect(mine.amMember).toBe(true);
    expect(mine.numUsers).toBe(1);
    expect(otherRow.amMember).toBe(false);
    expect(otherRow.status).toBe('archived');
    expect(otherRow.numUsers).toBe(2);
    expect(otherRow.numEvidence).toBe(1);
    expect(otherRow.numFindings).toBe(0);
    expect(typeof otherRow.createdAt).toBe('string');
  });

  it('is admin-only', async () => {
    await setup();
    const writer = await loginCookie(app, 'writer@test.local', 'password123');
    const res = await app.inject({
      method: 'GET',
      url: '/web/admin/engagements',
      headers: { ...WEB_HEADERS, cookie: writer },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('GET /web/engagements membership scoping', () => {
  it('no longer shows site admins engagements they are not a member of', async () => {
    await setup();
    const admin = await loginCookie(app, 'admin@test.local', 'password123');
    const list = await app
      .inject({ method: 'GET', url: '/web/engagements', headers: { ...WEB_HEADERS, cookie: admin } })
      .then((r) => r.json());
    expect(list.map((e: { slug: string }) => e.slug)).toEqual(['adm-mine']);
  });
});

describe('admin users list', () => {
  it('reports hasTotp per user', async () => {
    const { users } = await setup();
    await app.db.authIdentity.updateMany({
      where: { userId: users.writer.id },
      data: { totpSecret: 'JBSWY3DPEHPK3PXP' },
    });

    const admin = await loginCookie(app, 'admin@test.local', 'password123');
    const list = await app
      .inject({ method: 'GET', url: '/web/admin/users', headers: { ...WEB_HEADERS, cookie: admin } })
      .then((r) => r.json());
    const bySlug = new Map(list.map((u: { slug: string; hasTotp: boolean }) => [u.slug, u]));
    expect((bySlug.get(users.writer.slug) as { hasTotp: boolean }).hasTotp).toBe(true);
    expect((bySlug.get(users.reader.slug) as { hasTotp: boolean }).hasTotp).toBe(false);
  });
});

describe('POST /web/admin/users/:slug/totp-reset', () => {
  it('clears an enrolled TOTP secret', async () => {
    const { users } = await setup();
    await app.db.authIdentity.updateMany({
      where: { userId: users.writer.id },
      data: { totpSecret: 'JBSWY3DPEHPK3PXP' },
    });

    const admin = await loginCookie(app, 'admin@test.local', 'password123');
    const res = await app.inject({
      method: 'POST',
      url: `/web/admin/users/${users.writer.slug}/totp-reset`,
      headers: { ...WEB_HEADERS, cookie: admin },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, hadTotp: true });

    const identities = await app.db.authIdentity.findMany({ where: { userId: users.writer.id } });
    expect(identities.every((i) => i.totpSecret === null)).toBe(true);
  });

  it('is a 200 no-op with hadTotp=false when nothing is enrolled', async () => {
    const { users } = await setup();
    const admin = await loginCookie(app, 'admin@test.local', 'password123');
    const res = await app.inject({
      method: 'POST',
      url: `/web/admin/users/${users.reader.slug}/totp-reset`,
      headers: { ...WEB_HEADERS, cookie: admin },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, hadTotp: false });
  });

  it('404s for an unknown user', async () => {
    await setup();
    const admin = await loginCookie(app, 'admin@test.local', 'password123');
    const res = await app.inject({
      method: 'POST',
      url: '/web/admin/users/no-such-user/totp-reset',
      headers: { ...WEB_HEADERS, cookie: admin },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('admin per-user API keys', () => {
  it('lists a user’s keys without secrets and revokes one', async () => {
    const { users } = await setup();
    const key = await apiKeyFor(app, users.writer.id);
    const admin = await loginCookie(app, 'admin@test.local', 'password123');

    const list = await app
      .inject({
        method: 'GET',
        url: `/web/admin/users/${users.writer.slug}/api-keys`,
        headers: { ...WEB_HEADERS, cookie: admin },
      })
      .then((r) => r.json());
    expect(list).toHaveLength(1);
    expect(list[0].accessKey).toBe(key.accessKey);
    expect(list[0]).not.toHaveProperty('secretKey');

    const del = await app.inject({
      method: 'DELETE',
      url: `/web/admin/users/${users.writer.slug}/api-keys/${encodeURIComponent(key.accessKey)}`,
      headers: { ...WEB_HEADERS, cookie: admin },
    });
    expect(del.statusCode).toBe(200);
    expect(await app.db.apiKey.count({ where: { userId: users.writer.id } })).toBe(0);
  });

  it('404s when the key belongs to a different user', async () => {
    const { users } = await setup();
    const key = await apiKeyFor(app, users.writer.id);
    const admin = await loginCookie(app, 'admin@test.local', 'password123');
    const res = await app.inject({
      method: 'DELETE',
      url: `/web/admin/users/${users.reader.slug}/api-keys/${encodeURIComponent(key.accessKey)}`,
      headers: { ...WEB_HEADERS, cookie: admin },
    });
    expect(res.statusCode).toBe(404);
    expect(await app.db.apiKey.count({ where: { userId: users.writer.id } })).toBe(1);
  });

  it('is admin-only', async () => {
    const { users } = await setup();
    const writer = await loginCookie(app, 'writer@test.local', 'password123');
    const res = await app.inject({
      method: 'GET',
      url: `/web/admin/users/${users.writer.slug}/api-keys`,
      headers: { ...WEB_HEADERS, cookie: writer },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('recovery link round trip', () => {
  it('issues a link an unauthenticated user can redeem exactly once', async () => {
    const { users } = await setup();
    const admin = await loginCookie(app, 'admin@test.local', 'password123');
    const { recoveryUrl } = await app
      .inject({
        method: 'POST',
        url: `/web/admin/users/${users.writer.slug}/recovery`,
        headers: { ...WEB_HEADERS, cookie: admin },
      })
      .then((r) => r.json());
    const code = String(recoveryUrl).split('/login/recovery/')[1]!;
    expect(code.length).toBeGreaterThan(20);

    const redeem = await app.inject({
      method: 'POST',
      url: '/web/login/recovery',
      headers: WEB_HEADERS,
      payload: { code },
    });
    expect(redeem.statusCode).toBe(200);
    expect(redeem.json().user.slug).toBe(users.writer.slug);
    expect(redeem.headers['set-cookie']).toBeDefined();

    // Single use: a second redemption fails.
    const again = await app.inject({
      method: 'POST',
      url: '/web/login/recovery',
      headers: WEB_HEADERS,
      payload: { code },
    });
    expect(again.statusCode).toBe(401);
  });

  it('rejects an unknown code', async () => {
    await setup();
    const res = await app.inject({
      method: 'POST',
      url: '/web/login/recovery',
      headers: WEB_HEADERS,
      payload: { code: 'not-a-real-code' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('lets the redeemed user set a new password without the current one, exactly once', async () => {
    const { users } = await setup();
    const admin = await loginCookie(app, 'admin@test.local', 'password123');
    const { recoveryUrl } = await app
      .inject({
        method: 'POST',
        url: `/web/admin/users/${users.writer.slug}/recovery`,
        headers: { ...WEB_HEADERS, cookie: admin },
      })
      .then((r) => r.json());
    const code = String(recoveryUrl).split('/login/recovery/')[1]!;

    const redeem = await app.inject({
      method: 'POST',
      url: '/web/login/recovery',
      headers: WEB_HEADERS,
      payload: { code },
    });
    expect(redeem.statusCode).toBe(200);
    const setCookie = redeem.headers['set-cookie'];
    const session = (Array.isArray(setCookie) ? setCookie[0]! : String(setCookie)).split(';')[0]!;

    // /web/me reports the pending reset.
    const me = await app
      .inject({ method: 'GET', url: '/web/me', headers: { ...WEB_HEADERS, cookie: session } })
      .then((r) => r.json());
    expect(me.user.mustResetPassword).toBe(true);

    // Set a new password with no currentPassword — allowed once.
    const set = await app.inject({
      method: 'POST',
      url: '/web/account/password',
      headers: { ...WEB_HEADERS, cookie: session },
      payload: { newPassword: 'brand-new-pass-1' },
    });
    expect(set.statusCode).toBe(200);

    // Old password no longer works; the new one does.
    const oldLogin = await app.inject({
      method: 'POST',
      url: '/web/login',
      headers: WEB_HEADERS,
      payload: { email: 'writer@test.local', password: 'password123' },
    });
    expect(oldLogin.statusCode).toBe(401);
    await loginCookie(app, 'writer@test.local', 'brand-new-pass-1');

    // The waiver is spent: another set without the current password fails…
    const again = await app.inject({
      method: 'POST',
      url: '/web/account/password',
      headers: { ...WEB_HEADERS, cookie: session },
      payload: { newPassword: 'brand-new-pass-2' },
    });
    expect(again.statusCode).toBe(400);

    // …but works with it.
    const withCurrent = await app.inject({
      method: 'POST',
      url: '/web/account/password',
      headers: { ...WEB_HEADERS, cookie: session },
      payload: { currentPassword: 'brand-new-pass-1', newPassword: 'brand-new-pass-2' },
    });
    expect(withCurrent.statusCode).toBe(200);
  });
});
