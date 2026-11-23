import { expect } from 'vitest';
import type { Proposal } from '../../src/business/rules.js';
import { BASE, representation } from './owner.js';
import type { Actor, ownerContext } from './owner.js';
import type { RequestRow } from './database.js';

type Context = ReturnType<typeof ownerContext>;
type Owner = 'requesterA' | 'requesterB' | 'dualRole';
type Reviewer = 'reviewerA' | 'reviewerB';

// Test fixture only: compose real, legal HTTP steps. Never prepare a revision
// cycle with SQL or infer committed state from a response/another HTTP GET.
// Explicit expected rows include every column; snapshots also protect unrelated
// requests, users, role memberships, and row counts from accidental changes.
export function revisionCycle(ctx: Context) {
  async function mutation(row: RequestRow, method: 'put' | 'post', suffix: string,
    body: object, actor: Actor, expected: RequestRow): Promise<RequestRow> {
    const before = ctx.f.snapshot();
    expect(before.requests.find(saved => saved.id === row.id)).toEqual(row);
    const response = await ctx.http(method, `/${row.id}${suffix}`, body, actor);
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual(representation(expected));
    expect(ctx.f.snapshot()).toEqual({ ...before,
      requests: before.requests.map(saved => saved.id === row.id ? expected : saved) });
    return expected;
  }

  return {
    async create(proposal: Proposal, owner: Owner = 'requesterA'): Promise<RequestRow> {
      const before = ctx.f.snapshot();
      const response = await ctx.http('post', '', proposal, owner);
      expect(response.status).toBe(201);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.body.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      const expected: RequestRow = { ...proposal, id: response.body.id as string,
        requester_id: ctx.f.users[owner]!.id, status: 'Draft', version: 1, reviewer_comment: null };
      expect(before.requests.some(row => row.id === expected.id)).toBe(false);
      expect(response.headers.location).toBe(`${BASE}/${expected.id}`);
      expect(response.body).toEqual(representation(expected));
      expect(ctx.f.snapshot()).toEqual({ ...before, requests: [...before.requests, expected]
        .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0) });
      return expected;
    },
    edit(row: RequestRow, proposal: Proposal, owner: Owner = 'requesterA') {
      return mutation(row, 'put', '', { ...proposal, version: row.version }, owner,
        { ...row, ...proposal, version: row.version + 1 });
    },
    submit(row: RequestRow, owner: Owner = 'requesterA') {
      return mutation(row, 'post', '/submit', { version: row.version }, owner,
        { ...row, status: 'PendingReview', version: row.version + 1 });
    },
    requestChanges(row: RequestRow, comment: string, reviewer: Reviewer = 'reviewerA') {
      return mutation(row, 'post', '/request-changes', { version: row.version, comment }, reviewer,
        { ...row, status: 'ChangesRequested', reviewer_comment: comment, version: row.version + 1 });
    },
    approve(row: RequestRow, reviewer: Reviewer = 'reviewerA') {
      return mutation(row, 'post', '/approve', { version: row.version }, reviewer,
        { ...row, status: 'Approved', version: row.version + 1 });
    },
    async read(row: RequestRow, actor: Actor = 'requesterA') {
      const before = ctx.f.snapshot();
      expect(before.requests.find(saved => saved.id === row.id)).toEqual(row);
      const response = await ctx.http('get', `/${row.id}`, undefined, actor);
      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.body).toEqual(representation(row));
      expect(ctx.f.snapshot()).toEqual(before);
    },
    async list(kind: 'mine' | 'pending-review', actor: Owner | Reviewer) {
      const before = ctx.f.snapshot();
      const actorId = ctx.f.users[actor]!.id;
      const expected = before.requests.filter(row => kind === 'mine' ? row.requester_id === actorId
        : row.requester_id !== actorId && row.status === 'PendingReview');
      const response = await ctx.http('get', `/${kind}`, undefined, actor);
      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.body).toEqual({ items: expected.map(representation) });
      expect(ctx.f.snapshot()).toEqual(before);
    },
    async reject(row: RequestRow, method: 'get' | 'put' | 'post', suffix: string, body: object | undefined,
      actor: Actor, status: number, code: string, fields?: { field: string; reason: string }[]) {
      const before = ctx.f.snapshot();
      expect(before.requests.find(saved => saved.id === row.id)).toEqual(row);
      const response = await ctx.http(method, `/${row.id}${suffix}`, body, actor);
      expect(response.status).toBe(status);
      expect(response.headers['cache-control']).toBe('no-store');
      if (status === 401) expect(response.headers['www-authenticate']).toBe('Bearer');
      expect(response.body).toEqual({ error: { code, message: expect.any(String), ...(fields ? { fields } : {}) } });
      // Reject any resource data hidden in the otherwise-free-form message, too.
      for (const protectedValue of [row.id, row.requester_id, row.title, row.description, row.reason, row.reviewer_comment]) {
        if (protectedValue) expect(response.body.error.message).not.toContain(protectedValue);
      }
      expect(ctx.f.snapshot()).toEqual(before);
    },
  };
}
