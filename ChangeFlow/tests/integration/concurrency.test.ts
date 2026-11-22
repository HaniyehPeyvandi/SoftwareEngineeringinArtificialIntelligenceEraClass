import { describe, expect, it } from 'vitest';
import { writeTransaction } from '../../src/persistence/database.js';
import { BASE, ownerContext, representation } from '../support/owner.js';
import type { RequestRow } from '../support/database.js';
import { expectIndependentWorkers, expectOrder, loadRaceHarness } from '../support/race-contract.js';
import type { HttpCommand } from '../support/race-contract.js';

const ctx = ownerContext();
type Action = 'edit' | 'submit' | 'approve' | 'request-changes';
const pairs: { name: string; status: 'Draft' | 'ChangesRequested' | 'PendingReview'; actions: readonly [Action, Action] }[] = [
  { name: 'Draft edit/edit', status: 'Draft', actions: ['edit', 'edit'] },
  { name: 'ChangesRequested edit/edit', status: 'ChangesRequested', actions: ['edit', 'edit'] },
  { name: 'Draft edit/Submit', status: 'Draft', actions: ['edit', 'submit'] },
  { name: 'ChangesRequested edit/Submit', status: 'ChangesRequested', actions: ['edit', 'submit'] },
  { name: 'Approve/RequestChanges', status: 'PendingReview', actions: ['approve', 'request-changes'] },
  { name: 'Approve/Approve', status: 'PendingReview', actions: ['approve', 'approve'] },
  { name: 'RequestChanges/RequestChanges', status: 'PendingReview', actions: ['request-changes', 'request-changes'] },
];
function changed(row: RequestRow, action: Action, body: Record<string, unknown>): RequestRow {
  if (action === 'edit') return { ...row, title: body.title as string, description: body.description as string,
    reason: body.reason as string, version: row.version + 1 };
  return { ...row, version: row.version + 1,
    status: action === 'submit' ? 'PendingReview' : action === 'approve' ? 'Approved' : 'ChangesRequested',
    reviewer_comment: action === 'request-changes' ? body.comment as string : row.reviewer_comment };
}

describe('T040 independent-worker races and explicit recovery (SV-05; AS-17–21; SC-004)', () => {
  for (const pair of pairs) {
    // Twenty separately named rounds per pair. Alternating the reserved writer
    // exercises ten wins in each direction; scheduler luck is not the oracle.
    for (let repetition = 1; repetition <= 20; repetition++) {
      const first: 0 | 1 = repetition % 2 === 1 ? 0 : 1;
      it(`${pair.name}: round ${repetition}/20, command ${first + 1} reserves first`, async () => {
        const createHarness = await loadRaceHarness();
        const source = ctx.f.requests[pair.status]!;
        if (pair.status === 'PendingReview') writeTransaction(ctx.f.db, () =>
          ctx.f.db.prepare('UPDATE change_requests SET reviewer_comment = ? WHERE id = ?').run('Prior feedback C0', source.id));
        const before = ctx.f.snapshot();
        const initial = before.requests.find(row => row.id === source.id)!;
        const commands = pair.actions.map((action, index): HttpCommand => {
          const user = action === 'edit' || action === 'submit' ? ctx.f.users.requesterA! :
            index === 0 ? ctx.f.users.reviewerA! : ctx.f.users.reviewerB!;
          const body = action === 'edit' ? { title: `Title ${index}`, description: `Description ${index}`, reason: `Reason ${index}`, version: initial.version } :
            action === 'request-changes' ? { version: initial.version, comment: `Distinct feedback C${index + 1}` } : { version: initial.version };
          return { credentials: { username: user.username, password: user.password },
            method: action === 'edit' ? 'put' : 'post', path: `${BASE}/${initial.id}${action === 'edit' ? '' : `/${action}`}`, body };
        }) as [HttpCommand, HttpCommand];
        const harness = await createHarness({ databasePath: ctx.f.databasePath, busyTimeoutMs: 1000, deadlineMs: 20000 });
        try {
          const result = await harness.race({ commands, first });
          const loser = first === 0 ? 1 : 0;
          const winner = result.outcomes[first];
          const rejected = result.outcomes[loser];
          expectIndependentWorkers(winner.worker, rejected.worker);
          expect(result.outcomes.map(outcome => outcome.status).sort()).toEqual([200, 409]);
          expect(winner.status).toBe(200);
          expect(rejected.status).toBe(409); // 503/SQLITE_BUSY never satisfies a healthy race.
          expect(rejected.body).toEqual({ error: { code: 'VERSION_CONFLICT', message: expect.any(String) } });
          for (const outcome of result.outcomes) expect(outcome.headers['cache-control']).toBe('no-store');
          const winnerName = first === 0 ? 'first' : 'second';
          const loserName = first === 0 ? 'second' : 'first';
          expectOrder(result.events, [[winnerName, 'authenticated'], [winnerName, 'writer-reserved'],
            [loserName, 'begin-attempt'], [winnerName, 'committed'], [loserName, 'writer-reserved'], [loserName, 'rolled-back']]);
          expectOrder(result.events, [[loserName, 'authenticated'], [loserName, 'begin-attempt']]);
          const expected = changed(initial, pair.actions[first], commands[first].body);
          expect(winner.body).toEqual(representation(expected));
          const committed = ctx.f.snapshot();
          expect(committed).toEqual({ ...before, requests: before.requests.map(row => row.id === initial.id ? expected : row) });

          // No automatic replay: inspect fresh state before a distinct new action.
          // An independent Reviewer loses read access after either decision.
          const actor = pair.status === 'PendingReview' ? loser === 0 ? 'reviewerA' : 'reviewerB' : 'requesterA';
          const fresh = await ctx.http('get', `/${initial.id}`, undefined, actor);
          expect(ctx.f.snapshot()).toEqual(committed);
          if (pair.status === 'PendingReview') {
            expect(fresh.status).toBe(403);
            expect(fresh.body).toEqual({ error: { code: 'FORBIDDEN', message: expect.any(String) } });
            const ownerRead = await ctx.http('get', `/${initial.id}`);
            expect(ownerRead.status).toBe(200);
            expect(ownerRead.body).toEqual(representation(expected));
          } else {
            expect(fresh.status).toBe(200);
            expect(fresh.body).toEqual(representation(expected));
          }
          expect(ctx.f.snapshot()).toEqual(committed);
          const retryBody = { ...commands[loser].body, version: expected.version };
          const retryPath = commands[loser].path.slice(BASE.length);
          const deliberate = await ctx.http(commands[loser].method, retryPath, retryBody, actor);
          if (expected.status === 'Draft' || expected.status === 'ChangesRequested' && pair.status !== 'PendingReview') {
            const recovered = changed(expected, pair.actions[loser], retryBody);
            expect(deliberate.status).toBe(200);
            expect(deliberate.body).toEqual(representation(recovered));
            expect(ctx.f.snapshot()).toEqual({ ...committed,
              requests: committed.requests.map(row => row.id === initial.id ? recovered : row) });
          } else {
            expect(ctx.f.snapshot()).toEqual(committed);
            expect(deliberate.status).toBe(409);
            expect(deliberate.body).toEqual({ error: { code: 'INVALID_STATUS', message: expect.any(String) } });
          }
        } finally {
          await harness.close();
        }
      }, 30000);
    }
  }
});
