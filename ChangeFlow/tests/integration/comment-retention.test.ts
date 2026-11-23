import { describe, expect, it } from 'vitest';
import { ownerContext, PROPOSAL } from '../support/owner.js';
import { revisionCycle } from '../support/revision-cycle.js';

const ctx = ownerContext();
const cycle = revisionCycle(ctx);

describe('T047 latest-comment lifecycle (AS-27; SV-02)', () => {
  it('retains C1 through edit/resubmit, replaces it with C2 on a later return, and retains only C2 through approval', async () => {
    const pending = await cycle.submit(await cycle.create(PROPOSAL));
    const c1 = ' \u00a0First feedback: e\u0301 and \u{1f600}\ufeff ';
    const c2 = '\tSecond feedback: preserve raw text \u{1f642}\n';
    const first = await cycle.requestChanges(pending, c1, 'reviewerA');
    const revised = await cycle.edit(first, { ...PROPOSAL, description: 'First revision.' });
    const resubmitted = await cycle.submit(revised);
    expect([revised.reviewer_comment, resubmitted.reviewer_comment]).toEqual([c1, c1]);
    const second = await cycle.requestChanges(resubmitted, c2, 'reviewerB');
    expect(second).toEqual({ ...resubmitted, status: 'ChangesRequested', version: 6, reviewer_comment: c2 });
    const finalRevision = await cycle.edit(second, { ...PROPOSAL, description: 'Final revision.' });
    const finalSubmission = await cycle.submit(finalRevision);
    const approved = await cycle.approve(finalSubmission, 'reviewerA');
    expect([finalRevision.reviewer_comment, finalSubmission.reviewer_comment, approved.reviewer_comment]).toEqual([c2, c2, c2]);
    expect(approved.version).toBe(9);
    // Strict representations in the helper also forbid an invented comment-history field.
    await cycle.read(approved);
  });

  it.each([
    ['astral', '\u{1f600}'.repeat(2000)],
    ['combining', 'e\u0301'.repeat(1000)],
  ])('preserves a padded 2000-code-point %s comment through the whole returned-request cycle', async (_name, text) => {
    const comment = ` \u00a0${text}\ufeff\t`;
    const returned = await cycle.requestChanges(await cycle.submit(await cycle.create(PROPOSAL)), comment);
    const edited = await cycle.edit(returned, { ...PROPOSAL, title: 'Unicode feedback addressed' });
    const approved = await cycle.approve(await cycle.submit(edited));
    expect(approved.reviewer_comment).toBe(comment);
  });

  for (const sample of [
    { name: 'missing', extra: {}, status: 400, code: 'INVALID_REQUEST' },
    { name: 'null', extra: { comment: null }, status: 400, code: 'INVALID_REQUEST' },
    { name: 'empty', extra: { comment: '' }, status: 422, code: 'VALIDATION_FAILED', reason: 'required' },
    { name: 'Unicode whitespace', extra: { comment: '\u00a0\ufeff\t\n ' }, status: 422, code: 'VALIDATION_FAILED', reason: 'required' },
    { name: '2001 astral code points', extra: { comment: '\u{1f600}'.repeat(2001) }, status: 422, code: 'VALIDATION_FAILED', reason: 'too_long' },
  ]) {
    it(`preserves C1 after a rejected later return with ${sample.name} feedback`, async () => {
      const returned = await cycle.requestChanges(await cycle.submit(await cycle.create(PROPOSAL)), 'Latest valid C1');
      const resubmitted = await cycle.submit(await cycle.edit(returned, { ...PROPOSAL, reason: 'Address C1.' }));
      await cycle.reject(resubmitted, 'post', '/request-changes', { version: resubmitted.version, ...sample.extra },
        'reviewerB', sample.status, sample.code, sample.reason ? [{ field: 'comment', reason: sample.reason }] : undefined);
      const approved = await cycle.approve(resubmitted);
      expect(approved.reviewer_comment).toBe('Latest valid C1');
    });
  }

  for (const operation of ['edit', 'submit', 'approve', 'request-changes'] as const) {
    it(`preserves the new C2 and the complete row after stale ${operation} intent from the previous cycle`, async () => {
      const first = await cycle.requestChanges(await cycle.submit(await cycle.create(PROPOSAL)), 'C1');
      const pending = await cycle.submit(await cycle.edit(first, { ...PROPOSAL, title: 'C1 addressed' }));
      const second = await cycle.requestChanges(pending, 'C2 supersedes C1', 'reviewerB');
      const body = operation === 'edit' ? { ...PROPOSAL, version: pending.version }
        : operation === 'request-changes' ? { version: pending.version, comment: 'Stale attempted C3' } : { version: pending.version };
      await cycle.reject(second, operation === 'edit' ? 'put' : 'post', operation === 'edit' ? '' : `/${operation}`,
        body, operation === 'edit' || operation === 'submit' ? 'requesterA' : 'reviewerA', 409, 'VERSION_CONFLICT');
      await cycle.read(second);
    });
  }

  it.each(['approve', 'request-changes'] as const)('preserves the latest comment on current-Version invalid-status %s', async operation => {
    const returned = await cycle.requestChanges(await cycle.submit(await cycle.create(PROPOSAL)), 'Feedback remains current.');
    await cycle.reject(returned, 'post', `/${operation}`,
      operation === 'approve' ? { version: returned.version } : { version: returned.version, comment: 'Must not replace.' },
      'reviewerB', 409, 'INVALID_STATUS');
  });

  it.each(['reviewerComment', 'comment'] as const)('owner cannot replace latest feedback via %s on Edit', async field => {
    const returned = await cycle.requestChanges(await cycle.submit(await cycle.create(PROPOSAL)), 'Reviewer-owned feedback.');
    await cycle.reject(returned, 'put', '', { ...PROPOSAL, version: returned.version, [field]: 'Owner override.' },
      'requesterA', 400, 'INVALID_REQUEST');
  });
});
