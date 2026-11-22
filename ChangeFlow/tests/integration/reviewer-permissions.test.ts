import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { writeTransaction } from '../../src/persistence/database.js';
import { ownerContext, representation } from '../support/owner.js';
import type { Actor } from '../support/owner.js';

const ctx = ownerContext();
const statuses = ['Draft', 'PendingReview', 'ChangesRequested', 'Approved'] as const;
const operations = ['list', 'read', 'approve', 'request-changes'] as const;
type ReviewOperation = typeof operations[number];
function perform(operation: ReviewOperation, actor: Actor, id = ctx.f.requests.PendingReview!.id, version = 1) {
  if (operation === 'list') return ctx.http('get', '/pending-review', undefined, actor);
  if (operation === 'read') return ctx.http('get', `/${id}`, undefined, actor);
  return ctx.http('post', `/${id}/${operation}`,
    { version, ...(operation === 'request-changes' ? { comment: 'Please revise.' } : {}) }, actor);
}
function denied(response: { status: number; body: unknown; headers: Record<string, unknown> }, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(response.body).toEqual({ error: { code, message: expect.any(String) } });
  expect(response.headers['cache-control']).toBe('no-store');
  if (status === 401) expect(response.headers['www-authenticate']).toBe('Bearer');
}

describe('T032 current Reviewer permission, visibility and state rules (SV-03/04)', () => {
  for (const operation of operations) {
    it.each([
      ['anonymous', 401, 'UNAUTHENTICATED'], ['disabled', 401, 'UNAUTHENTICATED'],
      ['noRole', 403, 'FORBIDDEN'], ['requesterB', 403, 'FORBIDDEN'],
    ] as const)(`${operation} denies %s without protected disclosure or writes`, async (actor, status, code) => {
      const before = ctx.f.snapshot();
      const response = await perform(operation, actor);
      expect(ctx.f.snapshot()).toEqual(before);
      denied(response, status, code);
    });
    it.each(['revoke role', 'disable', 'delete identity'] as const)(`${operation} checks SQLite after %s with an existing token`, async change => {
      const user = ctx.f.users.reviewerA!;
      // Token was issued before this committed local maintenance change.
      writeTransaction(ctx.f.db, () => {
        if (change === 'revoke role') ctx.f.db.prepare('DELETE FROM user_roles WHERE user_id = ? AND role = ?').run(user.id, 'Reviewer');
        else if (change === 'disable') ctx.f.db.prepare('UPDATE users SET active = 0 WHERE id = ?').run(user.id);
        else ctx.f.db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
      });
      const before = ctx.f.snapshot();
      const response = await perform(operation, 'reviewerA');
      expect(ctx.f.snapshot()).toEqual(before);
      denied(response, change === 'revoke role' ? 403 : 401, change === 'revoke role' ? 'FORBIDDEN' : 'UNAUTHENTICATED');
    });
    it(`${operation} observes a committed Reviewer grant with the same no-role token`, async () => {
      writeTransaction(ctx.f.db, () => {
        ctx.f.db.prepare('INSERT INTO user_roles VALUES (?, ?)').run(ctx.f.users.noRole!.id, 'Reviewer');
      });
      const before = ctx.f.snapshot();
      const row = ctx.f.requests.PendingReview!;
      const response = await perform(operation, 'noRole');
      const after = ctx.f.snapshot();
      expect(response.status).toBe(200);
      if (operation === 'list') {
        expect(response.body).toEqual({ items: [representation(row)] });
        expect(after).toEqual(before);
      } else if (operation === 'read') {
        expect(response.body).toEqual(representation(row));
        expect(after).toEqual(before);
      } else {
        const expected = { ...row, status: operation === 'approve' ? 'Approved' as const : 'ChangesRequested' as const,
          version: row.version + 1, reviewer_comment: operation === 'approve' ? row.reviewer_comment : 'Please revise.' };
        expect(response.body).toEqual(representation(expected));
        expect(after).toEqual({ ...before, requests: before.requests.map(old => old.id === row.id ? expected : old) });
      }
    });
    it(`${operation} rejects an invalid-signature token`, async () => {
      const token = ctx.token('reviewerA');
      const parts = token.split('.');
      parts[2] = (parts[2]!.startsWith('A') ? 'B' : 'A') + parts[2]!.slice(1);
      const before = ctx.f.snapshot();
      const response = await perform(operation, 'reviewerA').set('Authorization', `Bearer ${parts.join('.')}`);
      expect(ctx.f.snapshot()).toEqual(before);
      denied(response, 401, 'UNAUTHENTICATED');
    });
  }
  it.each(statuses)('independent Reviewer read visibility in %s', async status => {
    const row = ctx.f.requests[status]!;
    const before = ctx.f.snapshot();
    const response = await perform('read', 'reviewerA', row.id);
    expect(ctx.f.snapshot()).toEqual(before);
    if (status === 'PendingReview') {
      expect(response.status).toBe(200);
      expect(response.body).toEqual(representation(row));
    } else denied(response, 403, 'FORBIDDEN');
  });
  it.each(statuses)('dual-role owner retains owner GET access in %s', async status => {
    const row = ctx.f.requests[status]!;
    writeTransaction(ctx.f.db, () => {
      ctx.f.db.prepare('UPDATE change_requests SET requester_id = ? WHERE id = ?').run(ctx.f.users.dualRole!.id, row.id);
    });
    const before = ctx.f.snapshot();
    const response = await perform('read', 'dualRole', row.id);
    expect(ctx.f.snapshot()).toEqual(before);
    expect(response.status).toBe(200);
    expect(response.body).toEqual(representation(before.requests.find(saved => saved.id === row.id)!));
  });
  it('Reviewer-only owner cannot use the independent-review branch to read their own pending request', async () => {
    const row = ctx.f.requests.PendingReview!;
    writeTransaction(ctx.f.db, () => {
      ctx.f.db.prepare('UPDATE change_requests SET requester_id = ? WHERE id = ?').run(ctx.f.users.reviewerA!.id, row.id);
    });
    const before = ctx.f.snapshot();
    const response = await perform('read', 'reviewerA');
    expect(ctx.f.snapshot()).toEqual(before);
    denied(response, 403, 'FORBIDDEN');
  });
  it('dual-role pending list excludes own submissions without hiding other owners', async () => {
    const row = ctx.f.requests.Draft!;
    writeTransaction(ctx.f.db, () => {
      ctx.f.db.prepare('UPDATE change_requests SET requester_id = ?, status = ? WHERE id = ?')
        .run(ctx.f.users.dualRole!.id, 'PendingReview', row.id);
    });
    const before = ctx.f.snapshot();
    const response = await perform('list', 'dualRole');
    expect(ctx.f.snapshot()).toEqual(before);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ items: before.requests.filter(saved => saved.status === 'PendingReview' &&
      saved.requester_id !== ctx.f.users.dualRole!.id).map(representation) });
  });
  for (const action of ['approve', 'request-changes'] as const) {
    it.each(statuses)(`${action} unconditionally denies dual-role self-review in %s`, async status => {
      const row = ctx.f.requests[status]!;
      writeTransaction(ctx.f.db, () => {
        ctx.f.db.prepare('UPDATE change_requests SET requester_id = ? WHERE id = ?').run(ctx.f.users.dualRole!.id, row.id);
      });
      const before = ctx.f.snapshot();
      const response = await perform(action, 'dualRole', row.id, row.version);
      expect(ctx.f.snapshot()).toEqual(before);
      denied(response, 403, 'FORBIDDEN');
    });
    it.each(statuses)(`${action} independently checks current-Version state %s`, async status => {
      const row = ctx.f.requests[status]!;
      const before = ctx.f.snapshot();
      const response = await perform(action, 'reviewerA', row.id, row.version);
      const saved = ctx.f.snapshot();
      if (status === 'PendingReview') {
        const expected = { ...row, status: action === 'approve' ? 'Approved' as const : 'ChangesRequested' as const,
          version: row.version + 1, reviewer_comment: action === 'approve' ? row.reviewer_comment : 'Please revise.' };
        expect(response.status).toBe(200);
        expect(response.body).toEqual(representation(expected));
        expect(saved).toEqual({ ...before, requests: before.requests.map(old => old.id === row.id ? expected : old) });
      } else {
        expect(saved).toEqual(before);
        denied(response, 409, 'INVALID_STATUS');
      }
    });
    it.each(statuses)(`${action} stale Version precedes status %s for an authorized independent Reviewer`, async status => {
      const row = ctx.f.requests[status]!;
      writeTransaction(ctx.f.db, () => ctx.f.db.prepare('UPDATE change_requests SET version = 3 WHERE id = ?').run(row.id));
      const before = ctx.f.snapshot();
      const response = await perform(action, 'reviewerA', row.id, 2);
      expect(ctx.f.snapshot()).toEqual(before);
      denied(response, 409, 'VERSION_CONFLICT');
    });
    it(`${action} permits a dual-role independent Reviewer`, async () => {
      const row = ctx.f.requests.PendingReview!;
      const before = ctx.f.snapshot();
      const response = await perform(action, 'dualRole');
      const saved = ctx.f.snapshot();
      const expected = { ...row, status: action === 'approve' ? 'Approved' as const : 'ChangesRequested' as const,
        version: row.version + 1, reviewer_comment: action === 'approve' ? row.reviewer_comment : 'Please revise.' };
      expect(response.status).toBe(200);
      expect(response.body).toEqual(representation(expected));
      expect(saved).toEqual({ ...before, requests: before.requests.map(old => old.id === row.id ? expected : old) });
    });
    it(`${action} returns safe NOT_FOUND for an absent valid UUID`, async () => {
      const before = ctx.f.snapshot();
      const response = await perform(action, 'reviewerA', randomUUID());
      expect(ctx.f.snapshot()).toEqual(before);
      denied(response, 404, 'NOT_FOUND');
    });
    it(`${action} self-denial precedes stale Version and does not leak current data`, async () => {
      const row = ctx.f.requests.PendingReview!;
      writeTransaction(ctx.f.db, () => ctx.f.db.prepare('UPDATE change_requests SET requester_id = ?, version = 3 WHERE id = ?')
        .run(ctx.f.users.dualRole!.id, row.id));
      const before = ctx.f.snapshot();
      const response = await perform(action, 'dualRole', row.id, 1);
      expect(ctx.f.snapshot()).toEqual(before);
      denied(response, 403, 'FORBIDDEN');
    });
  }
});
