import { describe, expect, it } from 'vitest';
import { ownerContext, representation } from '../support/owner.js';

const ctx = ownerContext();
describe('T039 mandatory AT-06 outdated-Version rejection (AS-24; FR-011/012/013/016/017)', () => {
  it.each(['Draft', 'ChangesRequested'] as const)('AT-06: %s retains the complete newer committed edit after a stale write', async status => {
    const initial = ctx.f.requests[status]!;
    const before = ctx.f.snapshot();
    const original = await ctx.http('get', `/${initial.id}`);
    expect(original.status).toBe(200);
    expect(original.body).toEqual(representation(initial));
    expect(ctx.f.snapshot()).toEqual(before);
    const winner = { title: 'Winning title', description: 'Winning description', reason: 'Winning reason' };
    const newer = await ctx.http('put', `/${initial.id}`, { ...winner, version: initial.version });
    const expected = { ...initial, ...winner, version: initial.version + 1 };
    expect(newer.status).toBe(200);
    expect(newer.body).toEqual(representation(expected));
    expect(newer.headers['cache-control']).toBe('no-store');
    const committed = ctx.f.snapshot();
    expect(committed).toEqual({ ...before, requests: before.requests.map(row => row.id === initial.id ? expected : row) });
    const stale = await ctx.http('put', `/${initial.id}`, {
      title: 'Losing title', description: 'Losing description', reason: 'Losing reason', version: initial.version,
    });
    expect(ctx.f.snapshot()).toEqual(committed);
    expect(stale.status).toBe(409);
    expect(stale.body).toEqual({ error: { code: 'VERSION_CONFLICT', message: expect.any(String) } });
    expect(stale.headers['cache-control']).toBe('no-store');
  });
});
