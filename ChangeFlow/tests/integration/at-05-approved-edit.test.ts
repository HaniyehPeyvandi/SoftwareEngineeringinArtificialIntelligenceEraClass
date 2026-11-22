import { expect, it } from 'vitest';
import { ownerContext, PROPOSAL } from '../support/owner.js';

const ctx = ownerContext();
it('AT-05: owner edit of Approved with valid replacement content and current Version is rejected without SQLite changes (AS-25)', async () => {
  const row = ctx.f.requests.Approved!;
  const before = ctx.f.snapshot();
  const response = await ctx.http('put', `/${row.id}`, { ...PROPOSAL, version: row.version });
  expect(ctx.f.snapshot()).toEqual(before);
  expect(response.status).toBe(409);
  expect(response.body).toEqual({ error: { code: 'INVALID_STATUS', message: expect.any(String) } });
  expect(response.headers['cache-control']).toBe('no-store');
});
