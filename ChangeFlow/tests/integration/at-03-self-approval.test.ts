import { expect, it } from 'vitest';
import { writeTransaction } from '../../src/persistence/database.js';
import { ownerContext } from '../support/owner.js';

const ctx = ownerContext();
it('AT-03: dual-role owner cannot approve their own PendingReview request (AS-09)', async () => {
  const row = ctx.f.requests.PendingReview!;
  writeTransaction(ctx.f.db, () => {
    ctx.f.db.prepare('UPDATE change_requests SET requester_id = ? WHERE id = ?').run(ctx.f.users.dualRole!.id, row.id);
  });
  const before = ctx.f.snapshot();
  expect(before.roles.filter(role => role.user_id === ctx.f.users.dualRole!.id).map(role => role.role).sort())
    .toEqual(['Requester', 'Reviewer']);
  const response = await ctx.http('post', `/${row.id}/approve`, { version: row.version }, 'dualRole');
  expect(ctx.f.snapshot()).toEqual(before);
  expect(response.status).toBe(403);
  expect(response.body).toEqual({ error: { code: 'FORBIDDEN', message: expect.any(String) } });
  expect(response.headers['cache-control']).toBe('no-store');
});
