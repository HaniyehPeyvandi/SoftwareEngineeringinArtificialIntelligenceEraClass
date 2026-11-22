import { expect, it } from 'vitest';
import { writeTransaction } from '../../src/persistence/database.js';
import { ownerContext, representation } from '../support/owner.js';

const ctx = ownerContext();
it('AT-04: independent current Reviewer approves PendingReview and preserves proposal, owner and latest feedback (AS-07)', async () => {
  const row = ctx.f.requests.PendingReview!;
  // A previously returned/resubmitted proposal may retain its latest feedback.
  writeTransaction(ctx.f.db, () => {
    ctx.f.db.prepare('UPDATE change_requests SET reviewer_comment = ? WHERE id = ?').run('Retained feedback C1', row.id);
  });
  const before = ctx.f.snapshot();
  const prior = before.requests.find(saved => saved.id === row.id)!;
  expect(prior.requester_id).not.toBe(ctx.f.users.reviewerA!.id);
  const response = await ctx.http('post', `/${row.id}/approve`, { version: prior.version }, 'reviewerA');
  const saved = ctx.f.snapshot();
  const expected = { ...prior, status: 'Approved' as const, version: prior.version + 1 };
  expect(response.status).toBe(200);
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.body).toEqual(representation(expected));
  expect(saved).toEqual({ ...before, requests: before.requests.map(old => old.id === prior.id ? expected : old) });
});
