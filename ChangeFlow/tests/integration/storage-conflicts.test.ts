import { describe, expect, it } from 'vitest';
import { writeTransaction } from '../../src/persistence/database.js';
import { BASE, ownerContext, PROPOSAL, representation } from '../support/owner.js';
import type { RequestRow } from '../support/database.js';
import { expectIndependentWorkers, expectOrder, loadRaceHarness } from '../support/race-contract.js';
import type { HttpCommand } from '../support/race-contract.js';

const ctx = ownerContext();
const cases = [
  { operation: 'edit', status: 'Draft', actor: 'requesterA' },
  { operation: 'edit', status: 'ChangesRequested', actor: 'requesterA' },
  { operation: 'submit', status: 'Draft', actor: 'requesterA' },
  { operation: 'submit', status: 'ChangesRequested', actor: 'requesterA' },
  { operation: 'approve', status: 'PendingReview', actor: 'reviewerA' },
  { operation: 'request-changes', status: 'PendingReview', actor: 'reviewerA' },
] as const;
type Case = typeof cases[number];
function payload(operation: Case['operation'] | 'create', version: number) {
  return operation === 'create' ? PROPOSAL : operation === 'edit' ? { ...PROPOSAL, version } :
    operation === 'request-changes' ? { version, comment: 'Replacement feedback C2' } : { version };
}
function suffix(operation: Case['operation'] | 'create', id: string) {
  return operation === 'create' ? '' : `/${id}${operation === 'edit' ? '' : `/${operation}`}`;
}
function changed(row: RequestRow, operation: Case['operation']): RequestRow {
  return { ...row, ...(operation === 'edit' ? PROPOSAL : {}), version: row.version + 1,
    status: operation === 'submit' ? 'PendingReview' : operation === 'approve' ? 'Approved' :
      operation === 'request-changes' ? 'ChangesRequested' : row.status,
    reviewer_comment: operation === 'request-changes' ? 'Replacement feedback C2' : row.reviewer_comment };
}

describe('T042 safe Version exhaustion (FR-012/013/016)', () => {
  for (const entry of cases) {
    it.each([
      ['exhausted current Version', Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, 503, 'STORAGE_UNAVAILABLE'],
      ['stale Version takes precedence over exhaustion', Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER - 1, 409, 'VERSION_CONFLICT'],
      ['unsafe client Version', Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1, 400, 'INVALID_REQUEST'],
    ] as const)(`${entry.operation} ${entry.status}: %s leaves complete SQLite state unchanged`, async (_name, persisted, supplied, status, code) => {
      const row = ctx.f.requests[entry.status]!;
      writeTransaction(ctx.f.db, () => ctx.f.db.prepare('UPDATE change_requests SET version = ? WHERE id = ?').run(persisted, row.id));
      const before = ctx.f.snapshot();
      const response = await ctx.http(entry.operation === 'edit' ? 'put' : 'post', suffix(entry.operation, row.id), payload(entry.operation, supplied), entry.actor);
      expect(ctx.f.snapshot()).toEqual(before);
      expect(response.status).toBe(status);
      expect(response.body).toEqual({ error: { code, message: expect.any(String) } });
      expect(response.headers['cache-control']).toBe('no-store');
    });
    it(`${entry.operation} ${entry.status}: final safe increment succeeds exactly to MAX_SAFE_INTEGER`, async () => {
      const row = ctx.f.requests[entry.status]!;
      writeTransaction(ctx.f.db, () => ctx.f.db.prepare('UPDATE change_requests SET version = ? WHERE id = ?').run(Number.MAX_SAFE_INTEGER - 1, row.id));
      const before = ctx.f.snapshot();
      const prior = before.requests.find(saved => saved.id === row.id)!;
      const response = await ctx.http(entry.operation === 'edit' ? 'put' : 'post', suffix(entry.operation, row.id), payload(entry.operation, prior.version), entry.actor);
      const saved = ctx.f.snapshot();
      const expected = changed(prior, entry.operation);
      expect(response.status).toBe(200);
      expect(expected.version).toBe(Number.MAX_SAFE_INTEGER);
      expect(response.body).toEqual(representation(expected));
      expect(saved).toEqual({ ...before, requests: before.requests.map(old => old.id === row.id ? expected : old) });
      expect(response.headers['cache-control']).toBe('no-store');
    });
  }
});

describe('T042 independent-worker SQLite begin/commit contention, separate from healthy races', () => {
  for (const operation of ['create', 'edit', 'submit', 'approve', 'request-changes'] as const) {
    it.each(['begin', 'commit'] as const)(`${operation}: %s lock timeout is 503 STORAGE_BUSY with rollback and fresh-decision recovery`, async stage => {
      const createHarness = await loadRaceHarness();
      const review = operation === 'approve' || operation === 'request-changes';
      const row = review ? ctx.f.requests.PendingReview! : ctx.f.requests.Draft!;
      const user = review ? ctx.f.users.reviewerA! : ctx.f.users.requesterA!;
      const actor = review ? 'reviewerA' : 'requesterA';
      const method = operation === 'edit' ? 'put' : 'post';
      const body = payload(operation, row.version);
      const path = suffix(operation, row.id);
      const command: HttpCommand = { credentials: { username: user.username, password: user.password }, method, path: BASE + path, body };
      const before = ctx.f.snapshot();
      // Test-only shorter timeout on the worker connection. Production remains
      // at the approved 1000 ms. No sleeps or same-event-loop lock release.
      const harness = await createHarness({ databasePath: ctx.f.databasePath, busyTimeoutMs: 100, deadlineMs: 20000 });
      try {
        const result = await harness.lock({ command, stage });
        expectIndependentWorkers(result.outcome.worker, result.lockWorker);
        expect(ctx.f.snapshot()).toEqual(before);
        expect(result.outcome.status).toBe(503);
        expect(result.outcome.body).toEqual({ error: { code: 'STORAGE_BUSY', message: expect.any(String) } });
        expect(result.outcome.headers['cache-control']).toBe('no-store');
        expectOrder(result.events, [['mutation', 'authenticated'], ['lock', 'lock-acquired'], ['mutation', 'begin-attempt']]);
        if (stage === 'begin') {
          expect(result.events.filter(event => event.actor === 'mutation' &&
            ['writer-reserved', 'updated', 'committed'].includes(event.phase))).toEqual([]);
        } else {
          expectOrder(result.events, [['mutation', 'writer-reserved'], ['mutation', 'updated'], ['mutation', 'commit-attempt'],
            ['mutation', 'rolled-back'], ['mutation', 'response'], ['lock', 'lock-released']]);
        }
        expectOrder(result.events, [['mutation', 'response'], ['lock', 'lock-released']]);
        expect(result.events.filter(event => event.actor === 'mutation' && event.phase === 'committed')).toEqual([]);
      } finally {
        await harness.close();
      }
      // A deliberate new request after lock cleanup must succeed at the original
      // Version. This is not automatic replay or evidence of a healthy 200/409 race.
      expect(ctx.f.snapshot()).toEqual(before);
      const recovered = await ctx.http(method, path, body, actor);
      const saved = ctx.f.snapshot();
      expect(recovered.status).toBe(operation === 'create' ? 201 : 200);
      let expected: RequestRow;
      if (operation === 'create') {
        expect(recovered.body.id).toMatch(/^[0-9a-f-]{36}$/i);
        expected = { id: recovered.body.id as string, ...PROPOSAL, requester_id: user.id, status: 'Draft', version: 1, reviewer_comment: null };
      } else expected = changed(row, operation);
      expect(recovered.body).toEqual(representation(expected));
      const requests = operation === 'create' ? [...before.requests, expected].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0) :
        before.requests.map(old => old.id === row.id ? expected : old);
      expect(saved).toEqual({ ...before, requests });
    }, 30000);
  }
});
