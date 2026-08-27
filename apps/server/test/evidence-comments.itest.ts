import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildAuthHeaders } from '@reporter/api-client';
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

/** An engagement (op1) with the writer attached, plus an unrelated op2. */
async function setup() {
  const users = await seedUsers(app);
  const eng = await app.db.engagement.create({
    data: { slug: 'op1', name: 'Op One', roles: { create: { userId: users.writer.id, role: 'write' } } },
  });
  const other = await app.db.engagement.create({
    data: { slug: 'op2', name: 'Op Two', roles: { create: { userId: users.writer.id, role: 'write' } } },
  });
  const cookie = await loginCookie(app, 'writer@test.local', 'password123');
  return { users, eng, other, cookie };
}

/** Create a piece of (note) evidence over the web plane; returns the parsed body. */
async function createNote(
  cookie: string,
  slug: string,
  fields: { title?: string; description?: string; content?: string; parentEvidenceUuid?: string },
) {
  const res = await app.inject({
    method: 'POST',
    url: `/web/engagements/${slug}/evidence`,
    headers: { ...WEB_HEADERS, cookie, 'content-type': 'application/json' },
    payload: {
      contentType: 'none',
      title: fields.title ?? 'Note',
      description: fields.description ?? '',
      ...fields,
    },
  });
  return res;
}

/** PUT the evidence over the web plane; returns the raw inject response. */
async function updateEvidence(
  cookie: string,
  slug: string,
  uuid: string,
  body: Record<string, unknown>,
) {
  return app.inject({
    method: 'PUT',
    url: `/web/engagements/${slug}/evidence/${uuid}`,
    headers: { ...WEB_HEADERS, cookie, 'content-type': 'application/json' },
    payload: body,
  });
}

/** GET a single piece of evidence's serialized detail. */
async function getEvidence(cookie: string, slug: string, uuid: string) {
  return app.inject({
    method: 'GET',
    url: `/web/engagements/${slug}/evidence/${uuid}`,
    headers: { cookie },
  });
}

/** GET the comments (linked evidence) on a piece of evidence. */
async function getComments(cookie: string, slug: string, uuid: string) {
  return app.inject({
    method: 'GET',
    url: `/web/engagements/${slug}/evidence/${uuid}/comments`,
    headers: { cookie },
  });
}

describe('evidence comments (linked evidence)', () => {
  it('creates a comment linked to a parent and reflects it in count + list', async () => {
    const { cookie } = await setup();
    const parent = (await createNote(cookie, 'op1', { description: 'parent', content: 'p' })).json();

    const commentRes = await createNote(cookie, 'op1', {
      description: 'a comment',
      content: 'c',
      parentEvidenceUuid: parent.uuid,
    });
    expect(commentRes.statusCode).toBe(201);
    const comment = commentRes.json();
    expect(comment.parentEvidenceUuid).toBe(parent.uuid);

    // The parent now reports one comment.
    const detail = await app.inject({
      method: 'GET',
      url: `/web/engagements/op1/evidence/${parent.uuid}`,
      headers: { cookie },
    });
    expect(detail.json().commentCount).toBe(1);
    expect(detail.json().parentEvidenceUuid).toBeNull();

    // The comments endpoint returns the linked evidence.
    const list = await app.inject({
      method: 'GET',
      url: `/web/engagements/op1/evidence/${parent.uuid}/comments`,
      headers: { cookie },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toHaveLength(1);
    expect(list.json()[0].uuid).toBe(comment.uuid);
  });

  it('rejects commenting on a comment (one level deep)', async () => {
    const { cookie } = await setup();
    const parent = (await createNote(cookie, 'op1', { content: 'p' })).json();
    const comment = (
      await createNote(cookie, 'op1', { content: 'c', parentEvidenceUuid: parent.uuid })
    ).json();

    const res = await createNote(cookie, 'op1', {
      content: 'nested',
      parentEvidenceUuid: comment.uuid,
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a parent from another engagement', async () => {
    const { cookie } = await setup();
    const foreign = (await createNote(cookie, 'op2', { content: 'x' })).json();

    const res = await createNote(cookie, 'op1', {
      content: 'c',
      parentEvidenceUuid: foreign.uuid,
    });
    expect(res.statusCode).toBe(404);
  });

  it('orphans comments to top-level evidence when the parent is deleted (default)', async () => {
    const { cookie } = await setup();
    const parent = (await createNote(cookie, 'op1', { content: 'p' })).json();
    const comment = (
      await createNote(cookie, 'op1', { content: 'c', parentEvidenceUuid: parent.uuid })
    ).json();

    const del = await app.inject({
      method: 'DELETE',
      url: `/web/engagements/op1/evidence/${parent.uuid}?comments=orphan`,
      headers: { ...WEB_HEADERS, cookie },
    });
    expect(del.statusCode).toBe(200);

    const survivor = await app.inject({
      method: 'GET',
      url: `/web/engagements/op1/evidence/${comment.uuid}`,
      headers: { cookie },
    });
    expect(survivor.statusCode).toBe(200);
    expect(survivor.json().parentEvidenceUuid).toBeNull();
  });

  it('cascades deletion to comments when asked', async () => {
    const { cookie } = await setup();
    const parent = (await createNote(cookie, 'op1', { content: 'p' })).json();
    const comment = (
      await createNote(cookie, 'op1', { content: 'c', parentEvidenceUuid: parent.uuid })
    ).json();

    const del = await app.inject({
      method: 'DELETE',
      url: `/web/engagements/op1/evidence/${parent.uuid}?comments=cascade`,
      headers: { ...WEB_HEADERS, cookie },
    });
    expect(del.statusCode).toBe(200);

    const gone = await app.inject({
      method: 'GET',
      url: `/web/engagements/op1/evidence/${comment.uuid}`,
      headers: { cookie },
    });
    expect(gone.statusCode).toBe(404);
  });

  it('lists evidence over the signed client API', async () => {
    const { users, cookie } = await setup();
    await createNote(cookie, 'op1', { content: 'p' });
    const key = await apiKeyFor(app, users.writer.id);
    const headers = buildAuthHeaders(
      'GET',
      '/api/engagements/op1/evidence',
      Buffer.alloc(0),
      key.accessKey,
      key.secretKey,
    );
    const res = await app.inject({ method: 'GET', url: '/api/engagements/op1/evidence', headers });
    expect(res.statusCode).toBe(200);
    expect(res.json().items.length).toBeGreaterThanOrEqual(1);
  });
});

describe('re-parenting evidence via PUT', () => {
  it('attaches a top-level item as a comment on another', async () => {
    const { cookie } = await setup();
    const a = (await createNote(cookie, 'op1', { content: 'a' })).json();
    const b = (await createNote(cookie, 'op1', { content: 'b' })).json();

    const res = await updateEvidence(cookie, 'op1', a.uuid, { parentEvidenceUuid: b.uuid });
    expect(res.statusCode).toBe(200);
    expect(res.json().parentEvidenceUuid).toBe(b.uuid);

    const bDetail = await getEvidence(cookie, 'op1', b.uuid);
    expect(bDetail.json().commentCount).toBe(1);

    const comments = await getComments(cookie, 'op1', b.uuid);
    expect(comments.json()).toHaveLength(1);
    expect(comments.json()[0].uuid).toBe(a.uuid);
  });

  it('detaches a comment back to top-level with null', async () => {
    const { cookie } = await setup();
    const b = (await createNote(cookie, 'op1', { content: 'b' })).json();
    const a = (
      await createNote(cookie, 'op1', { content: 'a', parentEvidenceUuid: b.uuid })
    ).json();
    expect(a.parentEvidenceUuid).toBe(b.uuid);

    const res = await updateEvidence(cookie, 'op1', a.uuid, { parentEvidenceUuid: null });
    expect(res.statusCode).toBe(200);
    expect(res.json().parentEvidenceUuid).toBeNull();

    const bDetail = await getEvidence(cookie, 'op1', b.uuid);
    expect(bDetail.json().commentCount).toBe(0);
  });

  it('moves a comment from one parent to another', async () => {
    const { cookie } = await setup();
    const b = (await createNote(cookie, 'op1', { content: 'b' })).json();
    const c = (await createNote(cookie, 'op1', { content: 'c' })).json();
    const a = (
      await createNote(cookie, 'op1', { content: 'a', parentEvidenceUuid: b.uuid })
    ).json();

    const res = await updateEvidence(cookie, 'op1', a.uuid, { parentEvidenceUuid: c.uuid });
    expect(res.statusCode).toBe(200);
    expect(res.json().parentEvidenceUuid).toBe(c.uuid);

    const bDetail = await getEvidence(cookie, 'op1', b.uuid);
    expect(bDetail.json().commentCount).toBe(0);
    const cDetail = await getEvidence(cookie, 'op1', c.uuid);
    expect(cDetail.json().commentCount).toBe(1);

    const cComments = await getComments(cookie, 'op1', c.uuid);
    expect(cComments.json().map((e: { uuid: string }) => e.uuid)).toEqual([a.uuid]);
  });

  it('rejects making evidence a comment on itself', async () => {
    const { cookie } = await setup();
    const a = (await createNote(cookie, 'op1', { content: 'a' })).json();

    const res = await updateEvidence(cookie, 'op1', a.uuid, { parentEvidenceUuid: a.uuid });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a target that is itself a comment (one level deep)', async () => {
    const { cookie } = await setup();
    const b = (await createNote(cookie, 'op1', { content: 'b' })).json();
    const comment = (
      await createNote(cookie, 'op1', { content: 'c', parentEvidenceUuid: b.uuid })
    ).json();
    const x = (await createNote(cookie, 'op1', { content: 'x' })).json();

    const res = await updateEvidence(cookie, 'op1', x.uuid, {
      parentEvidenceUuid: comment.uuid,
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects re-parenting an item that hosts its own comments', async () => {
    const { cookie } = await setup();
    const p = (await createNote(cookie, 'op1', { content: 'p' })).json();
    await createNote(cookie, 'op1', { content: 'child', parentEvidenceUuid: p.uuid });
    const q = (await createNote(cookie, 'op1', { content: 'q' })).json();

    const res = await updateEvidence(cookie, 'op1', p.uuid, { parentEvidenceUuid: q.uuid });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('1 comment(s)');
  });

  it('rejects a target in another engagement', async () => {
    const { cookie } = await setup();
    const a = (await createNote(cookie, 'op1', { content: 'a' })).json();
    const foreign = (await createNote(cookie, 'op2', { content: 'f' })).json();

    const res = await updateEvidence(cookie, 'op1', a.uuid, {
      parentEvidenceUuid: foreign.uuid,
    });
    expect(res.statusCode).toBe(400);
  });

  it('leaves the link unchanged when parentEvidenceUuid is omitted', async () => {
    const { cookie } = await setup();
    const b = (await createNote(cookie, 'op1', { content: 'b' })).json();
    const a = (
      await createNote(cookie, 'op1', { content: 'a', parentEvidenceUuid: b.uuid })
    ).json();

    const res = await updateEvidence(cookie, 'op1', a.uuid, {
      title: 'Renamed',
      description: 'edited',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.title).toBe('Renamed');
    expect(body.description).toBe('edited');
    // Comment link untouched.
    expect(body.parentEvidenceUuid).toBe(b.uuid);
    const bDetail = await getEvidence(cookie, 'op1', b.uuid);
    expect(bDetail.json().commentCount).toBe(1);
  });
});
