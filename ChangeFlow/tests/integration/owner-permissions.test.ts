import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ownerContext, PROPOSAL, representation } from '../support/owner.js';
import { writeTransaction } from '../../src/persistence/database.js';

const ctx = ownerContext();
const operations = ['create', 'list', 'read', 'edit', 'submit'] as const;
type OwnerOperation = (typeof operations)[number];
function command(operation: OwnerOperation, id: string, version = 1) {
  return {
    method: operation === 'edit' ? 'put' as const : ['list', 'read'].includes(operation) ? 'get' as const : 'post' as const,
    suffix: operation === 'create' ? '' : operation === 'list' ? '/mine' : `/${id}${operation === 'submit' ? '/submit' : ''}`,
    body: operation === 'create' ? PROPOSAL : operation === 'edit' ? { ...PROPOSAL, version } : operation === 'submit' ? { version } : undefined,
  };
}
function noDisclosure(response: { body: { error?: unknown } }, protectedTitle: string) {
  expect(Object.keys(response.body)).toEqual(['error']);
  expect(JSON.stringify(response.body)).not.toContain(protectedTitle);
  expect(response.body).not.toHaveProperty('version');
  expect(response.body).not.toHaveProperty('reviewerComment');
}

describe('T021 owner authorization/status/immutability (SV-03/04)', () => {
  for (const operation of operations) {
    it.each([['anonymous', 401, 'UNAUTHENTICATED'], ['disabled', 401, 'UNAUTHENTICATED'],
      ['noRole', 403, 'FORBIDDEN'], ['reviewerA', 403, 'FORBIDDEN']] as const)
    (`${operation} denies %s actor (AS-10/11)`, async (actor, status, code) => {
      const row = ctx.f.requests.Draft!;
      const cmd = command(operation, row.id);
      const before = ctx.f.snapshot();
      const response = await ctx.http(cmd.method, cmd.suffix, cmd.body, actor);
      expect(ctx.f.snapshot()).toEqual(before);
      expect(response.status).toBe(status);
      expect(response.body.error.code).toBe(code);
      noDisclosure(response, row.title);
      if (status === 401) expect(response.headers['www-authenticate']).toBe('Bearer');
    });
    it(`${operation} rechecks a committed Requester-role revocation with an existing token (AS-22)`, async () => {
      const row = ctx.f.requests.Draft!;
      writeTransaction(ctx.f.db, () => ctx.f.db.prepare('DELETE FROM user_roles WHERE user_id = ? AND role = ?')
        .run(ctx.f.users.requesterA!.id, 'Requester'));
      const before = ctx.f.snapshot();
      const cmd = command(operation, row.id);
      const response = await ctx.http(cmd.method, cmd.suffix, cmd.body);
      expect(ctx.f.snapshot()).toEqual(before);
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
      noDisclosure(response, row.title);
    });
  }

  for (const status of ['Draft', 'ChangesRequested'] as const) {
    for (const operation of ['edit', 'submit'] as const) {
      it.each(['requesterB', 'dualRole'] as const)(`${operation} ${status} rejects non-owner %s despite cumulative roles (AS-12)`, async actor => {
        const row = ctx.f.requests[status]!;
        const cmd = command(operation, row.id);
        const before = ctx.f.snapshot();
        const response = await ctx.http(cmd.method, cmd.suffix, cmd.body, actor);
        expect(ctx.f.snapshot()).toEqual(before);
        expect(response.status).toBe(403);
        expect(response.body.error.code).toBe('FORBIDDEN');
        noDisclosure(response, row.title);
      });
    }
  }

  it.each(['Draft', 'PendingReview', 'ChangesRequested', 'Approved'] as const)('unrelated Requester cannot read %s (AS-16)', async status => {
    const row = ctx.f.requests[status]!;
    const before = ctx.f.snapshot();
    const response = await ctx.http('get', `/${row.id}`, undefined, 'requesterB');
    expect(ctx.f.snapshot()).toEqual(before);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
    noDisclosure(response, row.title);
  });

  it.each(['Draft', 'ChangesRequested', 'Approved'] as const)('dual-role non-owner cannot use Reviewer to read %s (AS-06)', async status => {
    const row = ctx.f.requests[status]!;
    const before = ctx.f.snapshot();
    const response = await ctx.http('get', `/${row.id}`, undefined, 'dualRole');
    expect(ctx.f.snapshot()).toEqual(before);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
    noDisclosure(response, row.title);
  });

  it.each(['Draft', 'PendingReview', 'ChangesRequested', 'Approved'] as const)('dual-role owner keeps owner reads in %s', async status => {
    const row = ctx.f.requests[status]!;
    writeTransaction(ctx.f.db, () => ctx.f.db.prepare('UPDATE change_requests SET requester_id = ? WHERE id = ?')
      .run(ctx.f.users.dualRole!.id, row.id));
    const before = ctx.f.snapshot();
    const expected = before.requests.find(item => item.id === row.id)!;
    const response = await ctx.http('get', `/${row.id}`, undefined, 'dualRole');
    expect(ctx.f.snapshot()).toEqual(before);
    expect(response.status).toBe(200);
    expect(response.body).toEqual(representation(expected));
  });

  it('Reviewer role alone does not grant owner access after the dual-role owner loses Requester', async () => {
    const row = ctx.f.requests.PendingReview!;
    const user = ctx.f.users.dualRole!;
    writeTransaction(ctx.f.db, () => {
      ctx.f.db.prepare('UPDATE change_requests SET requester_id = ? WHERE id = ?').run(user.id, row.id);
      ctx.f.db.prepare('DELETE FROM user_roles WHERE user_id = ? AND role = ?').run(user.id, 'Requester');
    });
    const before = ctx.f.snapshot();
    const response = await ctx.http('get', `/${row.id}`, undefined, 'dualRole');
    expect(ctx.f.snapshot()).toEqual(before);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  for (const operation of ['edit', 'submit'] as const) {
    it.each(['PendingReview', 'Approved'] as const)(`${operation} in %s with current Version is INVALID_STATUS (AS-13)`, async status => {
      const row = ctx.f.requests[status]!;
      const cmd = command(operation, row.id, row.version);
      const before = ctx.f.snapshot();
      const response = await ctx.http(cmd.method, cmd.suffix, cmd.body);
      expect(ctx.f.snapshot()).toEqual(before);
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('INVALID_STATUS');
      noDisclosure(response, row.title);
    });
    it.each(['Draft', 'ChangesRequested', 'PendingReview', 'Approved'] as const)(`${operation} stale Version precedes status in %s`, async status => {
      const row = ctx.f.requests[status]!;
      writeTransaction(ctx.f.db, () => ctx.f.db.prepare('UPDATE change_requests SET version = 2 WHERE id = ?').run(row.id));
      const before = ctx.f.snapshot();
      const cmd = command(operation, row.id, 1);
      const response = await ctx.http(cmd.method, cmd.suffix, cmd.body);
      expect(ctx.f.snapshot()).toEqual(before);
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('VERSION_CONFLICT');
      noDisclosure(response, row.title);
    });
  }

  for (const status of ['Draft', 'ChangesRequested'] as const) {
    it.each(['requesterId', 'status', 'id', 'reviewerComment', 'roles', 'comment'] as const)(`PUT ${status} rejects protected/unknown %s (AS-05)`, async key => {
      const row = ctx.f.requests[status]!;
      const value = key === 'requesterId' ? ctx.f.users.requesterB!.id : key === 'status' ? 'Approved' :
        key === 'id' ? randomUUID() : key === 'roles' ? ['Requester', 'Reviewer'] : 'forged review feedback';
      const before = ctx.f.snapshot();
      const response = await ctx.http('put', `/${row.id}`, { ...PROPOSAL, version: row.version, [key]: value });
      expect(ctx.f.snapshot()).toEqual(before);
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_REQUEST');
    });
  }
  it.each(['requesterId', 'status', 'id', 'reviewerComment', 'roles', 'version'] as const)('Create rejects server-controlled %s', async key => {
    const before = ctx.f.snapshot();
    const value = key === 'requesterId' ? ctx.f.users.requesterB!.id : key === 'status' ? 'Approved' :
      key === 'id' ? randomUUID() : key === 'roles' ? ['Requester', 'Reviewer'] : key === 'version' ? 1 : 'forged review feedback';
    const response = await ctx.http('post', '', { ...PROPOSAL, [key]: value });
    expect(ctx.f.snapshot()).toEqual(before);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_REQUEST');
  });

  it.each(['read', 'edit', 'submit'] as const)('%s distinguishes a missing UUID without creating or disclosing a resource', async operation => {
    const before = ctx.f.snapshot();
    // Positive control prevents the current catch-all 404 from masquerading as a
    // passing missing-resource test when no owner routes exist at all.
    const known = await ctx.http('get', `/${ctx.f.requests.Draft!.id}`);
    expect(known.status).toBe(200);
    const cmd = command(operation, randomUUID());
    const response = await ctx.http(cmd.method, cmd.suffix, cmd.body);
    expect(ctx.f.snapshot()).toEqual(before);
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
    noDisclosure(response, ctx.f.requests.Draft!.title);
  });
});
