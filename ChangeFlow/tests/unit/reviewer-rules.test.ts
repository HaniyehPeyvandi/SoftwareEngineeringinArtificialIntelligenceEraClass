import { describe, expect, it } from 'vitest';
import * as rules from '../../src/business/rules.js';
import type { ChangeRequestStatus, CurrentIdentity } from '../../src/business/rules.js';

type ReviewOperation = 'ListPendingReview' | 'Read' | 'Approve' | 'RequestChanges';
type Resource = { requesterId: string; status: ChangeRequestStatus; version: number };
type Guard = (actor: CurrentIdentity | undefined, operation: ReviewOperation, resource?: Resource, version?: number) => void;
const reviewer: CurrentIdentity = { id: 'reviewer', active: true, roles: ['Reviewer'] };
const statuses = ['Draft', 'PendingReview', 'ChangesRequested', 'Approved'] as const;

// Test-first interface for T035, analogous to assertOwnerOperation. This is the
// independent Reviewer branch only; general GET must also allow owner+Requester.
// Dynamic lookup keeps discovery/typecheck runnable before implementation exists.
function reviewerGuard(): Guard {
  const candidate: unknown = Reflect.get(rules, 'assertReviewerOperation');
  expect(candidate, 'T035 assertReviewerOperation is not implemented.').toBeTypeOf('function');
  return candidate as Guard;
}
function expectCode(action: () => void, code: string) {
  let error: unknown;
  try { action(); } catch (caught) { error = caught; }
  expect(error).toMatchObject({ code });
}

describe('T032 pure independent Reviewer rules (SV-03/04)', () => {
  it('allows the pending list for a current Reviewer', () => {
    expect(reviewerGuard()(reviewer, 'ListPendingReview')).toBeUndefined();
  });
  for (const operation of ['ListPendingReview', 'Read', 'Approve', 'RequestChanges'] as const) {
    it.each([
      ['absent', undefined, 'UNAUTHENTICATED'],
      ['disabled', { ...reviewer, active: false }, 'UNAUTHENTICATED'],
      ['Requester only', { ...reviewer, roles: ['Requester'] }, 'FORBIDDEN'],
      ['no roles', { ...reviewer, roles: [] }, 'FORBIDDEN'],
    ] as const)(`${operation} denies %s before resource checks`, (_name, actor, code) => {
      const guard = reviewerGuard();
      expectCode(() => guard(actor, operation), code);
    });
  }
  for (const operation of ['Read', 'Approve', 'RequestChanges'] as const) {
    it(`${operation} rejects an absent resource`, () => {
      const guard = reviewerGuard();
      expectCode(() => guard(reviewer, operation, undefined, 3), 'NOT_FOUND');
    });
    it.each(statuses)(`${operation} rejects a dual-role owner in %s before Version/status checks`, status => {
      const guard = reviewerGuard();
      expectCode(() => guard({ ...reviewer, roles: ['Requester', 'Reviewer'] }, operation,
        { requesterId: reviewer.id, status, version: 3 }, 2), 'FORBIDDEN');
    });
  }
  it.each(statuses)('independent Reviewer Read scope in %s', status => {
    const guard = reviewerGuard();
    const action = () => guard(reviewer, 'Read', { requesterId: 'owner', status, version: 3 });
    if (status === 'PendingReview') expect(action()).toBeUndefined();
    else expectCode(action, 'FORBIDDEN');
  });
  for (const operation of ['Approve', 'RequestChanges'] as const) {
    it.each(statuses)(`${operation} checks current Version then starting status %s`, status => {
      const guard = reviewerGuard();
      const resource = { requesterId: 'owner', status, version: 3 };
      if (status === 'PendingReview') expect(guard(reviewer, operation, resource, 3)).toBeUndefined();
      else expectCode(() => guard(reviewer, operation, resource, 3), 'INVALID_STATUS');
    });
    it.each(statuses)(`${operation} rejects stale Version before status %s`, status => {
      const guard = reviewerGuard();
      expectCode(() => guard(reviewer, operation, { requesterId: 'owner', status, version: 3 }, 2), 'VERSION_CONFLICT');
    });
    it(`${operation} permits a dual-role independent Reviewer`, () => {
      expect(reviewerGuard()({ ...reviewer, roles: ['Requester', 'Reviewer'] }, operation,
        { requesterId: 'other', status: 'PendingReview', version: 3 }, 3)).toBeUndefined();
    });
  }
});
