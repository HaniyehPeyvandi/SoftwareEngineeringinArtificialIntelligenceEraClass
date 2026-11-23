import { describe, expect, it } from 'vitest';
import { writeTransaction } from '../../src/persistence/database.js';
import { ownerContext, PROPOSAL } from '../support/owner.js';
import { revisionCycle } from '../support/revision-cycle.js';
import type { RequestRow } from '../support/database.js';

const ctx = ownerContext();
const cycle = revisionCycle(ctx);

describe('T048 revision feedback visibility (AS-06/16; FR-014/015)', () => {
  it('owner reads and lists saved content in every status; unrelated Requesters never see it', async () => {
    async function inspect(row: RequestRow) {
      await cycle.read(row);
      await cycle.list('mine', 'requesterA');
      await cycle.reject(row, 'get', '', undefined, 'requesterB', 403, 'FORBIDDEN');
      await cycle.list('mine', 'requesterB');
      await cycle.list('pending-review', 'reviewerA');
      if (row.status === 'PendingReview') await cycle.read(row, 'reviewerA');
      else await cycle.reject(row, 'get', '', undefined, 'reviewerA', 403, 'FORBIDDEN');
    }
    const draft = await cycle.create(PROPOSAL);
    await inspect(draft);
    const pending = await cycle.submit(draft);
    await inspect(pending);
    const returned = await cycle.requestChanges(pending, 'Owner-visible private feedback.');
    await inspect(returned);
    const edited = await cycle.edit(returned, { ...PROPOSAL, description: 'Feedback addressed.' });
    await inspect(edited);
    const resubmitted = await cycle.submit(edited);
    await inspect(resubmitted);
    await inspect(await cycle.approve(resubmitted));
  });

  for (const reviewer of ['reviewerA', 'reviewerB'] as const) {
    it(`${reviewer} receives the committed return response, loses GET/list visibility, and regains it only after resubmission`, async () => {
      const pending = await cycle.submit(await cycle.create(PROPOSAL));
      await cycle.read(pending, reviewer);
      const returned = await cycle.requestChanges(pending, 'Action response is not a lasting read permission.', reviewer);
      await cycle.reject(returned, 'get', '', undefined, reviewer, 403, 'FORBIDDEN');
      await cycle.list('pending-review', reviewer);
      await cycle.read(returned);
      const edited = await cycle.edit(returned, { ...PROPOSAL, reason: 'Returned feedback addressed.' });
      await cycle.reject(edited, 'get', '', undefined, reviewer, 403, 'FORBIDDEN');
      const resubmitted = await cycle.submit(edited);
      await cycle.read(resubmitted, reviewer);
      await cycle.list('pending-review', reviewer);
    });

    it(`${reviewer} receives the committed approval response but cannot GET the result or list it afterward`, async () => {
      const pending = await cycle.submit(await cycle.edit(ctx.f.requests.ChangesRequested!, PROPOSAL));
      const approved = await cycle.approve(pending, reviewer);
      await cycle.reject(approved, 'get', '', undefined, reviewer, 403, 'FORBIDDEN');
      await cycle.list('pending-review', reviewer);
      await cycle.read(approved);
      await cycle.list('mine', 'requesterA');
    });
  }

  it('dual-role owner retains owner reads in all states without gaining self-review or self-return permission', async () => {
    const draft = await cycle.create(PROPOSAL, 'dualRole');
    await cycle.read(draft, 'dualRole');
    const pending = await cycle.submit(draft, 'dualRole');
    await cycle.read(pending, 'dualRole');
    await cycle.list('pending-review', 'dualRole');
    await cycle.reject(pending, 'post', '/approve', { version: pending.version }, 'dualRole', 403, 'FORBIDDEN');
    await cycle.reject(pending, 'post', '/request-changes', { version: pending.version, comment: 'Self-return forbidden.' }, 'dualRole', 403, 'FORBIDDEN');
    const returned = await cycle.requestChanges(pending, 'Independent feedback.');
    await cycle.read(returned, 'dualRole');
    const resubmitted = await cycle.submit(await cycle.edit(returned, PROPOSAL, 'dualRole'), 'dualRole');
    const approved = await cycle.approve(resubmitted);
    await cycle.read(approved, 'dualRole');
    await cycle.list('mine', 'dualRole');
  });

  it('a dual-role owner cannot use the remaining Reviewer role to read returned feedback after Requester revocation', async () => {
    const pending = await cycle.submit(await cycle.create(PROPOSAL, 'dualRole'), 'dualRole');
    const returned = await cycle.requestChanges(pending, 'Requires current owner permission.');
    const maintenance = ctx.f.openConnection();
    writeTransaction(maintenance, () => maintenance.prepare('DELETE FROM user_roles WHERE user_id = ? AND role = ?')
      .run(returned.requester_id, 'Requester'));
    await cycle.reject(returned, 'get', '', undefined, 'dualRole', 403, 'FORBIDDEN');
    expect(ctx.f.snapshot().roles.filter(role => role.user_id === returned.requester_id).map(role => role.role)).toEqual(['Reviewer']);
  });
});
