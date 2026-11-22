import { expect, it } from 'vitest';
import { BASE, ownerContext, PROPOSAL, representation } from '../support/owner.js';

const ctx = ownerContext();
it('AT-01: creates a Draft and verifies its HTTP representation and independently persisted row (AS-01)', async () => {
  const before = ctx.f.snapshot();
  const response = await ctx.http('post', '', PROPOSAL);
  const saved = ctx.f.snapshot(); // Independent connection, after HTTP completion.
  expect(response.status).toBe(201);
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.headers['content-type']).toMatch(/^application\/json/);
  expect(response.body.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  expect(response.headers.location).toBe(`${BASE}/${response.body.id}`);
  expect(saved.requests).toHaveLength(before.requests.length + 1);
  const inserted = saved.requests.filter(row => !before.requests.some(old => old.id === row.id));
  expect(inserted).toHaveLength(1);
  expect(inserted[0]).toEqual({ id: response.body.id, ...PROPOSAL, requester_id: ctx.f.users.requesterA!.id,
    status: 'Draft', version: 1, reviewer_comment: null });
  expect(response.body).toEqual(representation(inserted[0]!));
  expect(saved.requests.filter(row => row.id !== response.body.id)).toEqual(before.requests);
  expect(saved.users).toEqual(before.users);
  expect(saved.roles).toEqual(before.roles);
});
