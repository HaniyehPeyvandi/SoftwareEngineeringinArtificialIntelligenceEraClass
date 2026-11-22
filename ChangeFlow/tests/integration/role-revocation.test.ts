import { describe, expect, it } from 'vitest';
import { writeTransaction } from '../../src/persistence/database.js';
import { BASE, ownerContext, PROPOSAL, representation } from '../support/owner.js';
import type { Actor } from '../support/owner.js';
import type { DatabaseSnapshot, RequestRow } from '../support/database.js';
import { expectIndependentWorkers, expectOrder, loadRaceHarness } from '../support/race-contract.js';
import type { HttpCommand, Maintenance } from '../support/race-contract.js';

const ctx = ownerContext();
const operations = ['create', 'list-own', 'read-own', 'edit', 'submit', 'list-review', 'read-review', 'approve', 'request-changes'] as const;
type Operation = typeof operations[number];
function operationDetails(operation: Operation) {
  const review = ['list-review', 'read-review', 'approve', 'request-changes'].includes(operation);
  const row = review ? ctx.f.requests.PendingReview! : ctx.f.requests.Draft!;
  const actor: Actor = review ? 'reviewerA' : 'requesterA';
  const user = review ? ctx.f.users.reviewerA! : ctx.f.users.requesterA!;
  const role = review ? 'Reviewer' as const : 'Requester' as const;
  const method = operation === 'edit' ? 'put' as const : operation.startsWith('list') || operation.startsWith('read') ? 'get' as const : 'post' as const;
  const suffix = operation === 'create' ? '' : operation === 'list-own' ? '/mine' : operation === 'list-review' ? '/pending-review' :
    `/${row.id}${['submit', 'approve', 'request-changes'].includes(operation) ? `/${operation}` : ''}`;
  const body = operation === 'create' ? PROPOSAL : operation === 'edit' ? { ...PROPOSAL, version: row.version } :
    operation === 'request-changes' ? { version: row.version, comment: 'Independent feedback' } :
      operation === 'submit' || operation === 'approve' ? { version: row.version } : undefined;
  return { row, actor, user, role, method, suffix, body };
}
function maintain(before: DatabaseSnapshot, maintenance: Maintenance): DatabaseSnapshot {
  return maintenance.kind === 'disable' ? { ...before, users: before.users.map(user => user.id === maintenance.userId ? { ...user, active: 0 } : user) } :
    { ...before, roles: before.roles.filter(role => role.user_id !== maintenance.userId || role.role !== maintenance.role) };
}

describe('T041 existing-token role revocation and disabled-user ordering (AS-20; SV-03/05)', () => {
  for (const operation of operations) {
    it.each(['revokeRole', 'disable'] as const)(`${operation}: committed %s is enforced with the existing JWT`, async kind => {
      const details = operationDetails(operation);
      const tokenBefore = ctx.token(details.actor as 'requesterA' | 'reviewerA');
      const maintenanceDb = ctx.f.openConnection();
      const before = ctx.f.snapshot();
      writeTransaction(maintenanceDb, () => {
        if (kind === 'disable') maintenanceDb.prepare('UPDATE users SET active = 0 WHERE id = ?').run(details.user.id);
        else maintenanceDb.prepare('DELETE FROM user_roles WHERE user_id = ? AND role = ?').run(details.user.id, details.role);
      });
      const expected = maintain(before, kind === 'disable' ? { kind, userId: details.user.id } : { kind, userId: details.user.id, role: details.role });
      expect(ctx.f.snapshot()).toEqual(expected);
      const response = await ctx.http(details.method, details.suffix, details.body, details.actor);
      expect(ctx.token(details.actor as 'requesterA' | 'reviewerA')).toBe(tokenBefore);
      expect(ctx.f.snapshot()).toEqual(expected);
      expect(response.status).toBe(kind === 'disable' ? 401 : 403);
      expect(response.body).toEqual({ error: { code: kind === 'disable' ? 'UNAUTHENTICATED' : 'FORBIDDEN', message: expect.any(String) } });
      expect(response.headers['cache-control']).toBe('no-store');
      if (kind === 'disable') expect(response.headers['www-authenticate']).toBe('Bearer');
    });
  }
  for (const operation of ['create', 'edit', 'submit', 'approve', 'request-changes'] as const) {
    for (const kind of ['revokeRole', 'disable'] as const) {
      it.each(['maintenance', 'mutation'] as const)(`${operation}: ${kind}, %s acquires IMMEDIATE first in independent workers`, async first => {
        const createHarness = await loadRaceHarness();
        const details = operationDetails(operation);
        const before = ctx.f.snapshot();
        const command: HttpCommand = { credentials: { username: details.user.username, password: details.user.password },
          method: details.method as 'post' | 'put', path: BASE + details.suffix, body: details.body! };
        const maintenance: Maintenance = kind === 'disable' ? { kind, userId: details.user.id } : { kind, userId: details.user.id, role: details.role };
        const harness = await createHarness({ databasePath: ctx.f.databasePath, busyTimeoutMs: 1000, deadlineMs: 20000 });
        try {
          const result = await harness.permissionOrder({ command, maintenance, first });
          expectIndependentWorkers(result.outcome.worker, result.maintenanceWorker);
          expect(result.afterMaintenance.worker).toEqual(result.outcome.worker);
          expect(result.events.filter(event => event.actor === 'mutation' && event.phase === 'authenticated')).toHaveLength(1);
          expectOrder(result.events, [['mutation', 'authenticated'], [first, 'writer-reserved']]);
          const second = first === 'mutation' ? 'maintenance' : 'mutation';
          expectOrder(result.events, [[first, 'writer-reserved'], [second, 'begin-attempt'],
            [first, 'committed'], [second, 'writer-reserved']]);
          expectOrder(result.events, [['maintenance', 'committed'], ['retry', 'http-started'], ['retry', 'response']]);
          const denial = { error: { code: kind === 'disable' ? 'UNAUTHENTICATED' : 'FORBIDDEN', message: expect.any(String) } };
          expect(result.afterMaintenance.status).toBe(kind === 'disable' ? 401 : 403);
          expect(result.afterMaintenance.body).toEqual(denial);
          if (kind === 'disable') expect(result.afterMaintenance.headers['www-authenticate']).toBe('Bearer');
          const saved = ctx.f.snapshot();
          const maintenanceOnly = maintain(before, maintenance);
          if (first === 'maintenance') {
            expectOrder(result.events, [['mutation', 'writer-reserved'], ['mutation', 'rolled-back']]);
            expect(result.outcome.status).toBe(kind === 'disable' ? 401 : 403);
            expect(result.outcome.body).toEqual(denial);
            expect(saved).toEqual(maintenanceOnly);
          } else {
            expect(result.outcome.status).toBe(operation === 'create' ? 201 : 200);
            let changed: RequestRow;
            if (operation === 'create') {
              const body = result.outcome.body as { id: string };
              expect(body.id).toMatch(/^[0-9a-f-]{36}$/i);
              changed = { id: body.id, ...PROPOSAL, requester_id: details.user.id, status: 'Draft', version: 1, reviewer_comment: null };
            } else changed = { ...details.row, ...(operation === 'edit' ? PROPOSAL : {}), version: details.row.version + 1,
              status: operation === 'submit' ? 'PendingReview' : operation === 'approve' ? 'Approved' : operation === 'request-changes' ? 'ChangesRequested' : details.row.status,
              reviewer_comment: operation === 'request-changes' ? 'Independent feedback' : details.row.reviewer_comment };
            expect(result.outcome.body).toEqual(representation(changed));
            const requests = operation === 'create' ? [...before.requests, changed].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0) :
              before.requests.map(row => row.id === changed.id ? changed : row);
            expect(saved).toEqual({ ...maintenanceOnly, requests });
          }
          expect(result.outcome.headers['cache-control']).toBe('no-store');
          expect(result.afterMaintenance.headers['cache-control']).toBe('no-store');
        } finally {
          await harness.close();
        }
      }, 30000);
    }
  }
});
