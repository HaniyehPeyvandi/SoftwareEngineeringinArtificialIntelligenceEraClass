import { describe, expect, it } from 'vitest';
import { writeTransaction } from '../../src/persistence/database.js';
import { ownerContext, PROPOSAL, representation } from '../support/owner.js';
import { proposalCases } from '../support/proposal-cases.js';

const ctx = ownerContext();

describe('T033 RequestChanges feedback validation and persistence (SV-02; AS-08/26/28/29)', () => {
  // Explicit preparation represents either a first review or an already resubmitted
  // request. SQL only prepares fixtures; the tested decision always uses real HTTP.
  for (const previousComment of [null, 'Retained feedback C1'] as const) {
    for (const sample of proposalCases(2000)) {
      it(`RequestChanges ${sample.name}; previous comment ${previousComment === null ? 'absent' : 'C1'}`, async () => {
        const row = ctx.f.requests.PendingReview!;
        writeTransaction(ctx.f.db, () => ctx.f.db.prepare('UPDATE change_requests SET reviewer_comment = ? WHERE id = ?')
          .run(previousComment, row.id));
        const before = ctx.f.snapshot();
        const prior = before.requests.find(saved => saved.id === row.id)!;
        const response = await ctx.http('post', `/${row.id}/request-changes`,
          { version: prior.version, comment: sample.value }, 'reviewerA');
        const saved = ctx.f.snapshot();
        if (sample.code) {
          expect(saved).toEqual(before);
          expect(response.status).toBe(sample.code === 'INVALID_REQUEST' ? 400 : 422);
          expect(Object.keys(response.body)).toEqual(['error']);
          expect(response.body.error.code).toBe(sample.code);
          expect(response.body.error.message).toEqual(expect.any(String));
          if (sample.code === 'VALIDATION_FAILED') {
            expect(response.body.error.fields).toEqual([{ field: 'comment',
              reason: typeof sample.value === 'string' && sample.value.trim().length === 0 ? 'required' : 'too_long' }]);
            expect(Object.keys(response.body.error).sort()).toEqual(['code', 'fields', 'message']);
          } else expect(Object.keys(response.body.error).sort()).toEqual(['code', 'message']);
        } else {
          const expected = { ...prior, status: 'ChangesRequested' as const, version: prior.version + 1,
            reviewer_comment: sample.value as string };
          expect(response.status).toBe(200);
          expect(response.body).toEqual(representation(expected));
          expect(saved).toEqual({ ...before, requests: before.requests.map(old => old.id === row.id ? expected : old) });
          const ownerRead = await ctx.http('get', `/${row.id}`);
          expect(ownerRead.status).toBe(200);
          expect(ownerRead.body).toEqual(representation(expected));
          expect(ctx.f.snapshot()).toEqual(saved);
        }
        expect(response.headers['cache-control']).toBe('no-store');
      });
    }
  }
  it('replaces retained C1 with C2 atomically, then owner Edit/Submit and independent approval all retain C2 (AS-14/15/27)', async () => {
    const row = ctx.f.requests.PendingReview!;
    writeTransaction(ctx.f.db, () => ctx.f.db.prepare('UPDATE change_requests SET reviewer_comment = ? WHERE id = ?')
      .run('Previous feedback C1', row.id));
    const before = ctx.f.snapshot();
    const c2 = ' \u00a0Clarify the updated proposal \u{1F600}\ufeff ';
    const returned = await ctx.http('post', `/${row.id}/request-changes`, { version: row.version, comment: c2 }, 'reviewerA');
    let expected = { ...row, status: 'ChangesRequested' as 'ChangesRequested' | 'PendingReview' | 'Approved',
      version: row.version + 1, reviewer_comment: c2 };
    expect(returned.status).toBe(200);
    expect(returned.body).toEqual(representation(expected));
    const assertSaved = () => expect(ctx.f.snapshot()).toEqual({ ...before,
      requests: before.requests.map(old => old.id === row.id ? expected : old) });
    assertSaved();
    const edit = await ctx.http('put', `/${row.id}`, { ...PROPOSAL, version: expected.version });
    expected = { ...expected, ...PROPOSAL, version: expected.version + 1 };
    expect(edit.status).toBe(200);
    expect(edit.body).toEqual(representation(expected));
    assertSaved();
    const submit = await ctx.http('post', `/${row.id}/submit`, { version: expected.version });
    expected = { ...expected, status: 'PendingReview', version: expected.version + 1 };
    expect(submit.status).toBe(200);
    expect(submit.body).toEqual(representation(expected));
    assertSaved();
    const approve = await ctx.http('post', `/${row.id}/approve`, { version: expected.version }, 'reviewerB');
    expected = { ...expected, status: 'Approved', version: expected.version + 1 };
    expect(approve.status).toBe(200);
    expect(approve.body).toEqual(representation(expected));
    assertSaved();
    const ownerRead = await ctx.http('get', `/${row.id}`);
    expect(ownerRead.status).toBe(200);
    expect(ownerRead.body).toEqual(representation(expected));
    assertSaved();
  });
  it('preserves an existing latest comment through owner revision/resubmission independently of unimplemented Reviewer decisions', async () => {
    const row = ctx.f.requests.ChangesRequested!;
    const before = ctx.f.snapshot();
    const edit = await ctx.http('put', `/${row.id}`, { ...PROPOSAL, version: row.version });
    const edited = { ...row, ...PROPOSAL, version: row.version + 1 };
    expect(edit.status).toBe(200);
    expect(edit.body).toEqual(representation(edited));
    expect(ctx.f.snapshot()).toEqual({ ...before, requests: before.requests.map(old => old.id === row.id ? edited : old) });
    const submit = await ctx.http('post', `/${row.id}/submit`, { version: edited.version });
    const submitted = { ...edited, status: 'PendingReview' as const, version: edited.version + 1 };
    expect(submit.status).toBe(200);
    expect(submit.body).toEqual(representation(submitted));
    expect(ctx.f.snapshot()).toEqual({ ...before, requests: before.requests.map(old => old.id === row.id ? submitted : old) });
  });
  it.each(['Draft', 'PendingReview', 'ChangesRequested', 'Approved'] as const)('owner reads the latest permitted comment in %s', async status => {
    const row = ctx.f.requests[status]!;
    if (status !== 'Draft') writeTransaction(ctx.f.db, () => ctx.f.db.prepare('UPDATE change_requests SET reviewer_comment = ? WHERE id = ?')
      .run('Retained owner-visible feedback', row.id));
    const before = ctx.f.snapshot();
    const response = await ctx.http('get', `/${row.id}`);
    expect(ctx.f.snapshot()).toEqual(before);
    expect(response.status).toBe(200);
    expect(response.body).toEqual(representation(before.requests.find(saved => saved.id === row.id)!));
  });
  for (const status of ['Draft', 'PendingReview', 'ChangesRequested', 'Approved'] as const) {
    it.each(['comment', 'reviewerComment'])(`owner cannot override %s on ${status} Edit`, async field => {
      const row = ctx.f.requests[status]!;
      const before = ctx.f.snapshot();
      const response = await ctx.http('put', `/${row.id}`, { ...PROPOSAL, version: row.version, [field]: 'Owner override' });
      expect(ctx.f.snapshot()).toEqual(before);
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: { code: 'INVALID_REQUEST', message: expect.any(String) } });
    });
  }
  it.each(['stale', 'wrong status', 'self-return', 'wrong role'] as const)('rejected %s retains C1 and every other SQLite field', async rejection => {
    const row = ctx.f.requests.PendingReview!;
    writeTransaction(ctx.f.db, () => ctx.f.db.prepare(`UPDATE change_requests SET reviewer_comment = ?, version = 3,
      status = ?, requester_id = ? WHERE id = ?`).run('Retained C1', rejection === 'wrong status' ? 'Approved' : 'PendingReview',
        rejection === 'self-return' ? ctx.f.users.dualRole!.id : row.requester_id, row.id));
    const before = ctx.f.snapshot();
    const actor = rejection === 'self-return' ? 'dualRole' : rejection === 'wrong role' ? 'requesterB' : 'reviewerA';
    const response = await ctx.http('post', `/${row.id}/request-changes`,
      { version: rejection === 'stale' ? 2 : 3, comment: 'Replacement C2' }, actor);
    expect(ctx.f.snapshot()).toEqual(before);
    expect(response.status).toBe(rejection === 'stale' || rejection === 'wrong status' ? 409 : 403);
    const code = rejection === 'stale' ? 'VERSION_CONFLICT' : rejection === 'wrong status' ? 'INVALID_STATUS' : 'FORBIDDEN';
    expect(response.body).toEqual({ error: { code, message: expect.any(String) } });
  });
});
