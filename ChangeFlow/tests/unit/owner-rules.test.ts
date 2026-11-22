import { describe, expect, it } from 'vitest';
import * as rules from '../../src/business/rules.js';
import type { ChangeRequestStatus, CurrentIdentity } from '../../src/business/rules.js';

type OwnerOperation = 'Create' | 'ListOwn' | 'Read' | 'Edit' | 'Submit';
type OwnerResource = { requesterId: string; status: ChangeRequestStatus; version: number };
type OwnerGuard = (actor: CurrentIdentity | undefined, operation: OwnerOperation, resource?: OwnerResource, expectedVersion?: number) => void;
const owner: CurrentIdentity = { id: 'owner', active: true, roles: ['Requester'] };

function ownerGuard(): OwnerGuard {
  const candidate: unknown = Reflect.get(rules, 'assertOwnerOperation');
  expect(candidate, 'T024 assertOwnerOperation is not implemented; expected missing-implementation failure.').toBeTypeOf('function');
  return candidate as OwnerGuard;
}
function expectCode(action: () => void, code: string) {
  let error: unknown;
  try { action(); } catch (caught) { error = caught; }
  expect(error).toMatchObject({ code });
}

// Proposed pure owner-branch interface for T024. Independent Reviewer reads are
// a separate permission branch (T035); this does not redefine general GET access.
describe('T021 pure current Requester/owner/state rules', () => {
  it.each(['Create', 'ListOwn'] as const)('permits %s for a current Requester', operation => {
    expect(ownerGuard()(owner, operation)).toBeUndefined();
  });
  it.each(['Draft', 'PendingReview', 'ChangesRequested', 'Approved'] as const)('permits owner Read in %s', status => {
    expect(ownerGuard()(owner, 'Read', { requesterId: owner.id, status, version: 3 })).toBeUndefined();
  });
  for (const operation of ['Edit', 'Submit'] as const) {
    it.each(['Draft', 'ChangesRequested'] as const)(`permits ${operation} in %s with current Version`, status => {
      expect(ownerGuard()(owner, operation, { requesterId: owner.id, status, version: 3 }, 3)).toBeUndefined();
    });
    it.each(['PendingReview', 'Approved'] as const)(`rejects ${operation} in %s with current Version`, status => {
      const guard = ownerGuard();
      expectCode(() => guard(owner, operation, { requesterId: owner.id, status, version: 3 }, 3), 'INVALID_STATUS');
    });
    it.each(['Draft', 'PendingReview', 'ChangesRequested', 'Approved'] as const)(`rejects stale ${operation} before status in %s`, status => {
      const guard = ownerGuard();
      expectCode(() => guard(owner, operation, { requesterId: owner.id, status, version: 3 }, 2), 'VERSION_CONFLICT');
    });
  }
  for (const operation of ['Create', 'ListOwn', 'Read', 'Edit', 'Submit'] as const) {
    it.each([
      ['missing', undefined, 'UNAUTHENTICATED'],
      ['disabled', { ...owner, active: false }, 'UNAUTHENTICATED'],
      ['no role', { ...owner, roles: [] }, 'FORBIDDEN'],
      ['Reviewer only', { ...owner, roles: ['Reviewer'] }, 'FORBIDDEN'],
    ] as const)(`${operation} denies %s identity before resource checks`, (_name, actor, code) => {
      const guard = ownerGuard();
      expectCode(() => guard(actor, operation, { requesterId: owner.id, status: 'Approved', version: 3 }, 2), code);
    });
  }
  for (const operation of ['Read', 'Edit', 'Submit'] as const) {
    it.each(['Draft', 'ChangesRequested'] as const)(`${operation} rejects a dual-role non-owner in owner branch (%s)`, status => {
      const guard = ownerGuard();
      expectCode(() => guard({ id: 'other', active: true, roles: ['Requester', 'Reviewer'] }, operation,
        { requesterId: owner.id, status, version: 3 }, 2), 'FORBIDDEN');
    });
  }
});
