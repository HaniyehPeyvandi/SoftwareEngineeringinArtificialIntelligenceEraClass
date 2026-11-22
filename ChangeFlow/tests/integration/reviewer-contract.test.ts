import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { writeTransaction } from '../../src/persistence/database.js';
import { ownerContext, representation } from '../support/owner.js';

const ctx = ownerContext();
const contract = JSON.parse(readFileSync('specs/001-change-request-workflow/contracts/openapi.json', 'utf8'));

describe('T028 Reviewer HTTP contract (FR-006/008/015/016)', () => {
  it('keeps strict VersionBody and ReturnBody aligned with the approved contract', () => {
    for (const [schema, fields] of [['VersionBody', ['version']], ['ReturnBody', ['version', 'comment']]] as const) {
      expect(contract.components.schemas[schema].additionalProperties).toBe(false);
      expect(contract.components.schemas[schema].required.sort()).toEqual([...fields].sort());
    }
  });
  it('lists only other owners PendingReview, sorted by ID, without changing SQLite', async () => {
    const source = ctx.f.requests.PendingReview!;
    writeTransaction(ctx.f.db, () => {
      const insert = ctx.f.db.prepare('INSERT INTO change_requests VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
      for (const owner of [ctx.f.users.requesterB!.id, ctx.f.users.reviewerA!.id]) {
        insert.run(randomUUID(), source.title, source.description, source.reason, owner, 'PendingReview', 4, 'Prior feedback');
      }
    });
    const before = ctx.f.snapshot();
    const response = await ctx.http('get', '/pending-review', undefined, 'reviewerA');
    expect(ctx.f.snapshot()).toEqual(before);
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['content-type']).toMatch(/^application\/json/);
    expect(response.body).toEqual({ items: before.requests.filter(row => row.status === 'PendingReview' &&
      row.requester_id !== ctx.f.users.reviewerA!.id).map(representation) });
  });
  it('returns an empty items array when no independent pending requests exist', async () => {
    writeTransaction(ctx.f.db, () => ctx.f.db.prepare('DELETE FROM change_requests WHERE status = ?').run('PendingReview'));
    const before = ctx.f.snapshot();
    const response = await ctx.http('get', '/pending-review', undefined, 'reviewerA');
    expect(ctx.f.snapshot()).toEqual(before);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ items: [] });
  });
  it('allows an independent Reviewer to read a PendingReview representation', async () => {
    const row = ctx.f.requests.PendingReview!;
    const before = ctx.f.snapshot();
    const response = await ctx.http('get', `/${row.id}`, undefined, 'reviewerA');
    expect(ctx.f.snapshot()).toEqual(before);
    expect(response.status).toBe(200);
    expect(response.body).toEqual(representation(row));
    expect(response.headers['cache-control']).toBe('no-store');
  });
  for (const action of ['approve', 'request-changes'] as const) {
    it(`${action} returns exactly the committed row, then forbids independent GET after leaving PendingReview`, async () => {
      const row = ctx.f.requests.PendingReview!;
      const before = ctx.f.snapshot();
      const body = action === 'approve' ? { version: row.version } : { version: row.version, comment: 'Please clarify the impact.' };
      const response = await ctx.http('post', `/${row.id}/${action}`, body, 'reviewerA');
      const saved = ctx.f.snapshot();
      const expected = { ...row, version: row.version + 1,
        status: action === 'approve' ? 'Approved' as const : 'ChangesRequested' as const,
        reviewer_comment: action === 'approve' ? row.reviewer_comment : 'Please clarify the impact.' };
      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers['content-type']).toMatch(/^application\/json/);
      expect(Object.keys(response.body).sort()).toEqual(Object.keys(contract.components.schemas.ChangeRequest.properties).sort());
      expect(response.body).toEqual(representation(expected));
      expect(saved).toEqual({ ...before, requests: before.requests.map(old => old.id === row.id ? expected : old) });
      const later = await ctx.http('get', `/${row.id}`, undefined, 'reviewerA');
      expect(later.status).toBe(403);
      expect(later.body).toEqual({ error: { code: 'FORBIDDEN', message: expect.any(String) } });
      expect(ctx.f.snapshot()).toEqual(saved);
      const list = await ctx.http('get', '/pending-review', undefined, 'reviewerA');
      expect(list.status).toBe(200);
      expect(list.body).toEqual({ items: [] });
      expect(ctx.f.snapshot()).toEqual(saved);
    });
    it.each([undefined, null, 0, -1, 1.5, '1', true, Number.MAX_SAFE_INTEGER + 1])(`${action} rejects invalid Version %j`, async version => {
      const row = ctx.f.requests.PendingReview!;
      const body = action === 'approve' ? { version } : { version, comment: 'Valid feedback' };
      const before = ctx.f.snapshot();
      const response = await ctx.http('post', `/${row.id}/${action}`, body, 'reviewerA');
      expect(ctx.f.snapshot()).toEqual(before);
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: { code: 'INVALID_REQUEST', message: expect.any(String) } });
    });
    it.each(['status', 'requesterId', 'reviewerComment', 'roles', 'extra'])(`${action} rejects protected/unknown key %s`, async key => {
      const row = ctx.f.requests.PendingReview!;
      const before = ctx.f.snapshot();
      const response = await ctx.http('post', `/${row.id}/${action}`,
        { version: row.version, ...(action === 'request-changes' ? { comment: 'Feedback' } : {}), [key]: 'override' }, 'reviewerA');
      expect(ctx.f.snapshot()).toEqual(before);
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_REQUEST');
    });
    it.each(['not-a-uuid', '%E0%A4%A'])(`${action} rejects malformed ID %s`, async id => {
      const before = ctx.f.snapshot();
      const response = await ctx.http('post', `/${id}/${action}`,
        { version: 1, ...(action === 'request-changes' ? { comment: 'Feedback' } : {}) }, 'reviewerA');
      expect(ctx.f.snapshot()).toEqual(before);
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_REQUEST');
    });
    it(`${action} rejects malformed JSON`, async () => {
      const before = ctx.f.snapshot();
      const response = await ctx.http('post', `/${ctx.f.requests.PendingReview!.id}/${action}`, '{', 'reviewerA')
        .set('Content-Type', 'application/json');
      expect(ctx.f.snapshot()).toEqual(before);
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_REQUEST');
    });
    it(`${action} rejects non-JSON bodies`, async () => {
      const before = ctx.f.snapshot();
      const response = await ctx.http('post', `/${ctx.f.requests.PendingReview!.id}/${action}`, 'version=1', 'reviewerA')
        .set('Content-Type', 'text/plain');
      expect(ctx.f.snapshot()).toEqual(before);
      expect(response.status).toBe(415);
      expect(response.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    });
    it(`${action} rejects an envelope over 128 KiB`, async () => {
      const before = ctx.f.snapshot();
      const response = await ctx.http('post', `/${ctx.f.requests.PendingReview!.id}/${action}`,
        { version: 1, comment: 'x'.repeat(129 * 1024) }, 'reviewerA');
      expect(ctx.f.snapshot()).toEqual(before);
      expect(response.status).toBe(413);
      expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    });
  }
});
