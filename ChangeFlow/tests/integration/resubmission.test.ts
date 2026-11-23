import { describe, expect, it } from 'vitest';
import { writeTransaction } from '../../src/persistence/database.js';
import { ownerContext, PROPOSAL } from '../support/owner.js';
import { revisionCycle } from '../support/revision-cycle.js';

const ctx = ownerContext();
const cycle = revisionCycle(ctx);
const revised = { title: 'Revised rollout', description: 'Deploy in two verified stages.', reason: 'Address reviewer feedback.' };

describe('T046 return/edit/resubmit journey (AS-14/15; SV-02)', () => {
  it('commits Draft → PendingReview → ChangesRequested → PendingReview → Approved with the original owner', async () => {
    const draft = await cycle.create(PROPOSAL);
    expect([draft.status, draft.version, draft.reviewer_comment]).toEqual(['Draft', 1, null]);
    const pending = await cycle.submit(draft);
    expect([pending.status, pending.version]).toEqual(['PendingReview', 2]);
    const returned = await cycle.requestChanges(pending, 'Explain the staged rollout.');
    expect([returned.status, returned.version]).toEqual(['ChangesRequested', 3]);
    const edited = await cycle.edit(returned, revised);
    expect([edited.status, edited.version]).toEqual(['ChangesRequested', 4]);
    const resubmitted = await cycle.submit(edited);
    expect([resubmitted.status, resubmitted.version]).toEqual(['PendingReview', 5]);
    const approved = await cycle.approve(resubmitted, 'reviewerB');
    expect(approved).toEqual({ ...draft, ...revised, status: 'Approved', version: 6,
      reviewer_comment: 'Explain the staged rollout.' });
    await cycle.read(approved);
  });

  it('works independently from a prepared ChangesRequested row', async () => {
    const original = ctx.f.requests.ChangesRequested!;
    const edited = await cycle.edit(original, revised);
    const resubmitted = await cycle.submit(edited);
    const approved = await cycle.approve(resubmitted);
    expect(approved).toEqual({ ...original, ...revised, status: 'Approved', version: 4 });
    await cycle.read(approved);
  });

  for (const actor of ['requesterB', 'reviewerA', 'dualRole'] as const) {
    for (const operation of ['edit', 'submit'] as const) {
      it(`denies ${actor} ${operation} on a legally returned request; only its original owner can continue`, async () => {
        const pending = await cycle.submit(await cycle.create(PROPOSAL));
        const returned = await cycle.requestChanges(pending, 'Owner must revise this.');
        await cycle.reject(returned, operation === 'edit' ? 'put' : 'post', operation === 'edit' ? '' : '/submit',
          operation === 'edit' ? { ...revised, version: returned.version } : { version: returned.version }, actor, 403, 'FORBIDDEN');
        const edited = await cycle.edit(returned, revised);
        const resubmitted = await cycle.submit(edited);
        expect(resubmitted.requester_id).toBe(ctx.f.users.requesterA!.id);
      });
    }
  }

  for (const change of ['revoke-role', 'disable'] as const) {
    for (const operation of ['edit', 'submit'] as const) {
      it(`checks current owner identity/role after return: ${change} before ${operation}, using the existing JWT`, async () => {
        const returned = await cycle.requestChanges(await cycle.submit(await cycle.create(PROPOSAL)), 'Revise safely.');
        const maintenance = ctx.f.openConnection();
        writeTransaction(maintenance, () => {
          if (change === 'revoke-role') maintenance.prepare('DELETE FROM user_roles WHERE user_id = ? AND role = ?')
            .run(returned.requester_id, 'Requester');
          else maintenance.prepare('UPDATE users SET active = 0 WHERE id = ?').run(returned.requester_id);
        });
        await cycle.reject(returned, operation === 'edit' ? 'put' : 'post', operation === 'edit' ? '' : '/submit',
          operation === 'edit' ? { ...revised, version: returned.version } : { version: returned.version }, 'requesterA',
          change === 'disable' ? 401 : 403, change === 'disable' ? 'UNAUTHENTICATED' : 'FORBIDDEN');
      });
    }
  }

  it('never changes original ownership or feedback through multiple edits before resubmission', async () => {
    const returned = await cycle.requestChanges(await cycle.submit(await cycle.create(PROPOSAL)), 'Preserve this feedback.');
    const first = await cycle.edit(returned, revised);
    const second = await cycle.edit(first, { ...revised, reason: 'Further owner clarification.' });
    const resubmitted = await cycle.submit(second);
    expect(resubmitted).toEqual({ ...returned, ...revised, reason: 'Further owner clarification.', status: 'PendingReview', version: 6 });
  });

  it('rejects current-Version edits and resubmission after final approval, preserving the complete row', async () => {
    const edited = await cycle.edit(ctx.f.requests.ChangesRequested!, revised);
    const approved = await cycle.approve(await cycle.submit(edited));
    await cycle.reject(approved, 'put', '', { ...PROPOSAL, version: approved.version }, 'requesterA', 409, 'INVALID_STATUS');
    await cycle.reject(approved, 'post', '/submit', { version: approved.version }, 'requesterA', 409, 'INVALID_STATUS');
    await cycle.read(approved);
  });
});
