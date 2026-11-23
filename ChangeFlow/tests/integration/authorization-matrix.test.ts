import { randomUUID } from 'node:crypto';
import type { Response } from 'supertest';
import { describe, expect, it } from 'vitest';
import { writeTransaction } from '../../src/persistence/database.js';
import { ownerContext, PROPOSAL, representation } from '../support/owner.js';
import type { Actor } from '../support/owner.js';
import type { DatabaseSnapshot, RequestRow } from '../support/database.js';

const ctx = ownerContext();
const states = ['Draft', 'PendingReview', 'ChangesRequested', 'Approved'] as const;
const globals = ['create', 'mine', 'pending-review'] as const;
const resources = ['read', 'edit', 'submit', 'approve', 'request-changes'] as const;
type Operation = typeof globals[number] | typeof resources[number];
const profiles = [
  { name: 'owner', actor: 'requesterA', global: [201, 200, 403], read: [200, 200, 200, 200], owner: true, review: false },
  { name: 'unrelated Requester', actor: 'requesterB', global: [201, 200, 403], read: [403, 403, 403, 403], owner: false, review: false },
  { name: 'independent Reviewer', actor: 'reviewerA', global: [403, 403, 200], read: [403, 200, 403, 403], owner: false, review: true },
  { name: 'independent dual-role', actor: 'dualRole', global: [201, 200, 200], read: [403, 200, 403, 403], owner: false, review: true },
  { name: 'dual-role owner', actor: 'dualRole', global: [201, 200, 200], read: [200, 200, 200, 200], owner: true, review: false },
  { name: 'no-role', actor: 'noRole', denied: 403 },
  { name: 'anonymous', actor: 'anonymous', denied: 401 },
  { name: 'disabled', actor: 'disabled', denied: 401 },
  { name: 'revoked owner', actor: 'requesterA', denied: 403 },
  { name: 'revoked Reviewer', actor: 'reviewerA', denied: 403 },
  { name: 'disabled owner', actor: 'requesterA', denied: 401 },
  { name: 'deleted subject', actor: 'noRole', denied: 401 },
] as const;

function command(operation: Operation, id: string, version = 1, invalidText = false) {
  return {
    method: operation === 'edit' ? 'put' as const : ['mine', 'pending-review', 'read'].includes(operation) ? 'get' as const : 'post' as const,
    suffix: operation === 'create' ? '' : operation === 'mine' || operation === 'pending-review' ? `/${operation}`
      : `/${id}${operation === 'read' || operation === 'edit' ? '' : `/${operation}`}`,
    body: operation === 'create' ? PROPOSAL : operation === 'edit' ? { ...PROPOSAL, title: invalidText ? '  ' : PROPOSAL.title, version }
      : operation === 'request-changes' ? { version, comment: invalidText ? '  ' : 'Matrix review feedback.' }
        : operation === 'submit' || operation === 'approve' ? { version } : undefined,
  };
}

function error(response: { status: number; body: unknown; headers: Record<string, string> }, status: number,
  code: string, before: DatabaseSnapshot, fields?: { field: string; reason: string }[]) {
  expect(response.status).toBe(status);
  expect(response.body).toEqual({ error: { code, message: expect.any(String), ...(fields ? { fields } : {}) } });
  expect(response.headers['cache-control']).toBe('no-store');
  if (status === 401) expect(response.headers['www-authenticate']).toBe('Bearer');
  const serialized = JSON.stringify(response.body);
  for (const row of before.requests) for (const value of [row.id, row.requester_id, row.title, row.description, row.reason, row.reviewer_comment]) {
    if (value) expect(serialized).not.toContain(value);
  }
  for (const user of before.users) expect(serialized).not.toContain(user.password_hash);
  expect(ctx.f.snapshot()).toEqual(before);
}

function prepare(name: string, row: RequestRow): RequestRow {
  const maintenance = ctx.f.openConnection();
  writeTransaction(maintenance, () => {
    if (name === 'dual-role owner') maintenance.prepare('UPDATE change_requests SET requester_id = ? WHERE id = ?').run(ctx.f.users.dualRole!.id, row.id);
    if (name === 'revoked owner' || name === 'revoked Reviewer') maintenance.prepare('DELETE FROM user_roles WHERE user_id = ? AND role = ?')
      .run(ctx.f.users[name === 'revoked owner' ? 'requesterA' : 'reviewerA']!.id, name === 'revoked owner' ? 'Requester' : 'Reviewer');
    if (name === 'disabled owner') maintenance.prepare('UPDATE users SET active = 0 WHERE id = ?').run(row.requester_id);
    if (name === 'deleted subject') maintenance.prepare('DELETE FROM users WHERE id = ?').run(ctx.f.users.noRole!.id);
  });
  return ctx.f.snapshot().requests.find(saved => saved.id === row.id)!;
}

function success(operation: Operation, row: RequestRow, actor: Actor, status: number, response: Response, before: DatabaseSnapshot) {
  expect(response.status).toBe(status);
  if (operation === 'create') {
    const expected = { ...PROPOSAL, id: response.body.id as string, requester_id: ctx.f.users[actor as Exclude<Actor, 'anonymous'>]!.id,
      status: 'Draft' as const, version: 1, reviewer_comment: null };
    expect(before.requests.some(saved => saved.id === expected.id)).toBe(false);
    expect(response.body).toEqual(representation(expected));
    expect(ctx.f.snapshot()).toEqual({ ...before, requests: [...before.requests, expected].sort((a, b) => a.id < b.id ? -1 : 1) });
  } else if (operation === 'mine' || operation === 'pending-review') {
    const id = ctx.f.users[actor as Exclude<Actor, 'anonymous'>]!.id;
    const expected = before.requests.filter(saved => operation === 'mine' ? saved.requester_id === id : saved.requester_id !== id && saved.status === 'PendingReview');
    expect(response.body).toEqual({ items: expected.map(representation) });
    expect(ctx.f.snapshot()).toEqual(before);
  } else {
    const expected: RequestRow = operation === 'read' ? row : { ...row, ...(operation === 'edit' ? PROPOSAL : {}), version: row.version + 1,
      status: operation === 'submit' ? 'PendingReview' : operation === 'approve' ? 'Approved' : operation === 'request-changes' ? 'ChangesRequested' : row.status,
      reviewer_comment: operation === 'request-changes' ? 'Matrix review feedback.' : row.reviewer_comment };
    expect(response.body).toEqual(representation(expected));
    expect(ctx.f.snapshot()).toEqual({ ...before, requests: before.requests.map(saved => saved.id === row.id ? expected : saved) });
  }
}

describe('T051 complete protected-operation / actor / state matrix (SV-03/04)', () => {
  for (const profile of profiles) {
    for (const [index, operation] of globals.entries()) {
      it(`${operation}: ${profile.name}; current roles are loaded with the existing JWT`, async () => {
        const row = prepare(profile.name, ctx.f.requests.Draft!);
        const before = ctx.f.snapshot();
        const cmd = command(operation, row.id);
        const response = await ctx.http(cmd.method, cmd.suffix, cmd.body, profile.actor);
        const status = 'denied' in profile ? profile.denied : profile.global[index]!;
        if (status >= 400) error(response, status, status === 401 ? 'UNAUTHENTICATED' : 'FORBIDDEN', before);
        else success(operation, row, profile.actor, status, response, before);
        expect(response.headers['cache-control']).toBe('no-store');
      });
    }
    for (const [index, state] of states.entries()) for (const operation of resources) {
      it(`${operation} / ${state} / ${profile.name}`, async () => {
        const row = prepare(profile.name, ctx.f.requests[state]!);
        const before = ctx.f.snapshot();
        const cmd = command(operation, row.id);
        const response = await ctx.http(cmd.method, cmd.suffix, cmd.body, profile.actor);
        const status = 'denied' in profile ? profile.denied : operation === 'read' ? profile.read[index]!
          : operation === 'edit' || operation === 'submit' ? !profile.owner ? 403 : state === 'Draft' || state === 'ChangesRequested' ? 200 : 409
            : !profile.review ? 403 : state === 'PendingReview' ? 200 : 409;
        if (status >= 400) error(response, status, status === 401 ? 'UNAUTHENTICATED' : status === 403 ? 'FORBIDDEN' : 'INVALID_STATUS', before);
        else success(operation, row, profile.actor, status, response, before);
        expect(response.headers['cache-control']).toBe('no-store');
      });
    }
  }
});

describe('T051 precondition precedence, missing IDs and safe errors (FR-011/012/016)', () => {
  for (const state of states) for (const operation of ['edit', 'submit', 'approve', 'request-changes'] as const) {
    for (const version of [2, 3, 4]) {
      it(`${operation} ${state}: supplied V${version}, saved V3; Version precedes status and invalid text`, async () => {
        const source = ctx.f.requests[state]!;
        writeTransaction(ctx.f.db, () => ctx.f.db.prepare('UPDATE change_requests SET version = 3 WHERE id = ?').run(source.id));
        const before = ctx.f.snapshot();
        const cmd = command(operation, source.id, version, true);
        const response = await ctx.http(cmd.method, cmd.suffix, cmd.body, operation === 'edit' || operation === 'submit' ? 'requesterA' : 'reviewerA');
        const validState = operation === 'edit' || operation === 'submit' ? state === 'Draft' || state === 'ChangesRequested' : state === 'PendingReview';
        if (version !== 3) error(response, 409, 'VERSION_CONFLICT', before);
        else if (!validState) error(response, 409, 'INVALID_STATUS', before);
        else if (operation === 'edit' || operation === 'request-changes') error(response, 422, 'VALIDATION_FAILED', before,
          [{ field: operation === 'edit' ? 'title' : 'comment', reason: 'required' }]);
        else success(operation, before.requests.find(row => row.id === source.id)!, 'requesterA', 200, response, before);
      });
    }
    it(`${operation} ${state}: ownership/self-review denial precedes stale Version and invalid text`, async () => {
      const row = ctx.f.requests[state]!;
      const actor = operation === 'edit' || operation === 'submit' ? 'requesterB' : 'dualRole';
      if (actor === 'dualRole') prepare('dual-role owner', row);
      const before = ctx.f.snapshot();
      const cmd = command(operation, row.id, 2, true);
      const response = await ctx.http(cmd.method, cmd.suffix, cmd.body, actor);
      error(response, 403, 'FORBIDDEN', before);
    });
  }

  for (const operation of resources) for (const actor of ['requesterA', 'reviewerA', 'noRole', 'anonymous'] as const) {
    it(`${operation}: missing UUID / ${actor}; role check precedes existence`, async () => {
      const before = ctx.f.snapshot();
      const cmd = command(operation, randomUUID());
      const response = await ctx.http(cmd.method, cmd.suffix, cmd.body, actor);
      const allowed = actor === 'requesterA' && ['read', 'edit', 'submit'].includes(operation)
        || actor === 'reviewerA' && ['read', 'approve', 'request-changes'].includes(operation);
      error(response, actor === 'anonymous' ? 401 : allowed ? 404 : 403,
        actor === 'anonymous' ? 'UNAUTHENTICATED' : allowed ? 'NOT_FOUND' : 'FORBIDDEN', before);
    });
  }

  for (const operation of [...globals, ...resources]) {
    it(`${operation}: JWT rejection precedes malformed body/path`, async () => {
      const before = ctx.f.snapshot();
      const cmd = command(operation, 'not-a-uuid');
      const response = await ctx.http(cmd.method, cmd.suffix, cmd.method === 'get' ? undefined : '{', 'anonymous')
        .set('Authorization', 'Bearer invalid-token').set('Content-Type', 'application/json');
      error(response, 401, 'UNAUTHENTICATED', before);
    });
    if (!['mine', 'pending-review', 'read'].includes(operation)) {
      it(`${operation}: shape errors precede current-role denial`, async () => {
        const before = ctx.f.snapshot();
        const cmd = command(operation, ctx.f.requests.Draft!.id);
        const response = await ctx.http(cmd.method, cmd.suffix, { ...cmd.body, protectedOverride: 'not allowed' }, 'noRole');
        error(response, 400, 'INVALID_REQUEST', before);
      });
    }
  }

  for (const operation of ['edit', 'submit', 'approve', 'request-changes'] as const) {
    it(`${operation}: exhausted safe Version returns sanitized 503 without wrapping`, async () => {
      const row = ctx.f.requests[operation === 'edit' || operation === 'submit' ? 'ChangesRequested' : 'PendingReview']!;
      writeTransaction(ctx.f.db, () => ctx.f.db.prepare('UPDATE change_requests SET version = ? WHERE id = ?').run(Number.MAX_SAFE_INTEGER, row.id));
      const before = ctx.f.snapshot();
      const cmd = command(operation, row.id, Number.MAX_SAFE_INTEGER);
      const response = await ctx.http(cmd.method, cmd.suffix, cmd.body, operation === 'edit' || operation === 'submit' ? 'requesterA' : 'reviewerA');
      error(response, 503, 'STORAGE_UNAVAILABLE', before);
    });
  }
});
