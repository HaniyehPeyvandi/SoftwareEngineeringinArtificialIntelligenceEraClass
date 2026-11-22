import { expect, it } from 'vitest';
import { ownerContext, representation } from '../support/owner.js';

const ctx = ownerContext();
it('AT-02: valid owner Submit changes Draft V1 to PendingReview V2 in HTTP and actual SQLite (AS-03)', async () => {
  const draft = ctx.f.requests.Draft!;
  const before = ctx.f.snapshot();
  const response = await ctx.http('post', `/${draft.id}/submit`, { version: 1 });
  const saved = ctx.f.snapshot();
  expect(response.status).toBe(200);
  expect(response.headers['cache-control']).toBe('no-store');
  const expected = { ...draft, status: 'PendingReview', version: 2 };
  expect(saved.requests).toHaveLength(before.requests.length);
  expect(saved.requests.find(row => row.id === draft.id)).toEqual(expected);
  expect(response.body).toEqual({ ...representation(draft), status: 'PendingReview', version: 2 });
  expect(saved.requests.filter(row => row.id !== draft.id)).toEqual(before.requests.filter(row => row.id !== draft.id));
  expect(saved.users).toEqual(before.users);
  expect(saved.roles).toEqual(before.roles);
});
