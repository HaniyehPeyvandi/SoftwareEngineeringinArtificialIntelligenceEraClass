import { randomUUID } from 'node:crypto';
import { readTransaction, writeTransaction } from '../persistence/database.js';
import type { SqliteDatabase } from '../persistence/database.js';
import { createStore, withStorageErrors } from '../persistence/store.js';
import { requireCurrentIdentity } from './auth.js';
import { assertOwnerOperation, assertReviewerOperation, BusinessError } from './rules.js';
import type { ChangeRequest, CurrentIdentity, OwnerOperation, Proposal, ReviewerOperation } from './rules.js';
import { validateProposal, validateText } from './text.js';

export function createChangeRequestService(db: SqliteDatabase, store = createStore(db)) {
  const read = <T>(work: () => T) => withStorageErrors(() => readTransaction(db, work));
  const write = <T>(work: () => T) => withStorageErrors(() => writeTransaction(db, work));

  function owned(actor: CurrentIdentity, operation: OwnerOperation, id: string, version?: number): ChangeRequest {
    const saved = store.findRequestById(id);
    if (!saved) throw new BusinessError('NOT_FOUND');
    assertOwnerOperation(actor, operation, saved, version);
    return saved;
  }
  function savedResult(id: string): ChangeRequest {
    const saved = store.findRequestById(id);
    if (!saved) throw new BusinessError('INTERNAL_ERROR');
    return saved;
  }
  function reviewable(actor: CurrentIdentity, operation: ReviewerOperation, id: string, version: number): ChangeRequest {
    const saved = store.findRequestById(id);
    assertReviewerOperation(actor, operation, saved, version);
    return saved!;
  }
  function canAdvance(saved: ChangeRequest): void {
    if (saved.version >= Number.MAX_SAFE_INTEGER) throw new BusinessError('STORAGE_UNAVAILABLE');
  }

  return {
    create(subject: string, input: unknown): ChangeRequest {
      return write(() => {
        const actor = requireCurrentIdentity(store, subject, 'Requester');
        assertOwnerOperation(actor, 'Create');
        const proposal = validateProposal(input);
        const id = randomUUID();
        if (store.insertDraft(id, actor.id, proposal) !== 1) throw new BusinessError('INTERNAL_ERROR');
        return savedResult(id);
      });
    },
    listOwn(subject: string): { items: ChangeRequest[] } {
      return read(() => {
        const actor = requireCurrentIdentity(store, subject, 'Requester');
        assertOwnerOperation(actor, 'ListOwn');
        return { items: store.listOwnedRequests(actor.id) };
      });
    },
    readOwn(subject: string, id: string): ChangeRequest {
      return read(() => owned(requireCurrentIdentity(store, subject, 'Requester'), 'Read', id));
    },
    listPendingReview(subject: string): { items: ChangeRequest[] } {
      return read(() => {
        const actor = requireCurrentIdentity(store, subject, 'Reviewer');
        assertReviewerOperation(actor, 'ListPendingReview');
        return { items: store.listPendingReviewRequests(actor.id) };
      });
    },
    readRequest(subject: string, id: string): ChangeRequest {
      return read(() => {
        const actor = requireCurrentIdentity(store, subject);
        if (!actor.roles.includes('Requester') && !actor.roles.includes('Reviewer')) throw new BusinessError('FORBIDDEN');
        const saved = store.findRequestById(id);
        if (!saved) throw new BusinessError('NOT_FOUND');
        if (saved.requesterId === actor.id && actor.roles.includes('Requester')) assertOwnerOperation(actor, 'Read', saved);
        else assertReviewerOperation(actor, 'Read', saved);
        return saved;
      });
    },
    edit(subject: string, id: string, version: number, input: Proposal): ChangeRequest {
      return write(() => {
        const actor = requireCurrentIdentity(store, subject, 'Requester');
        const saved = owned(actor, 'Edit', id, version);
        const proposal = validateProposal(input);
        canAdvance(saved);
        if (store.editOwnedRequest(id, actor.id, version, proposal) !== 1) throw new BusinessError('VERSION_CONFLICT');
        return savedResult(id);
      });
    },
    submit(subject: string, id: string, version: number): ChangeRequest {
      return write(() => {
        const actor = requireCurrentIdentity(store, subject, 'Requester');
        const saved = owned(actor, 'Submit', id, version);
        validateProposal({ title: saved.title, description: saved.description, reason: saved.reason });
        canAdvance(saved);
        if (store.submitOwnedRequest(id, actor.id, version) !== 1) throw new BusinessError('VERSION_CONFLICT');
        return savedResult(id);
      });
    },
    approve(subject: string, id: string, version: number): ChangeRequest {
      return write(() => {
        const actor = requireCurrentIdentity(store, subject, 'Reviewer');
        const saved = reviewable(actor, 'Approve', id, version);
        canAdvance(saved);
        if (store.approveIndependentRequest(id, actor.id, version) !== 1) throw new BusinessError('VERSION_CONFLICT');
        // Mutation authorization permits this result; later GET has its own scope.
        return savedResult(id);
      });
    },
    requestChanges(subject: string, id: string, version: number, input: unknown): ChangeRequest {
      return write(() => {
        const actor = requireCurrentIdentity(store, subject, 'Reviewer');
        const saved = reviewable(actor, 'RequestChanges', id, version);
        const comment = validateText('comment', input);
        canAdvance(saved);
        if (store.returnIndependentRequest(id, actor.id, version, comment) !== 1) throw new BusinessError('VERSION_CONFLICT');
        return savedResult(id);
      });
    },
  };
}
