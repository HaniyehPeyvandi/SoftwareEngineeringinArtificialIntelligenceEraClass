import { describe, expect, it } from 'vitest';
import { ownerContext, PROPOSAL, representation } from '../support/owner.js';
import { proposalCases, PROPOSAL_LIMITS } from '../support/proposal-cases.js';
import type { ProposalField } from '../support/proposal-cases.js';
import { writeTransaction } from '../../src/persistence/database.js';

const ctx = ownerContext();
const profiles = ['create', 'edit Draft', 'edit ChangesRequested', 'submit Draft', 'submit ChangesRequested'] as const;

describe('T020 HTTP and independent SQLite text validation (SV-01, AS-04/28/29)', () => {
  for (const [field, limit] of Object.entries(PROPOSAL_LIMITS) as [ProposalField, number][]) {
    for (const profile of profiles) {
      for (const sample of proposalCases(limit)) {
        const submit = profile.startsWith('submit');
        // SQL structural constraints already ensure saved values are strings.
        // Never insert malformed surrogates: SQLite would replace them on encode.
        if (submit && (typeof sample.value !== 'string' || sample.code === 'INVALID_REQUEST')) continue;
        it(`${profile}: ${field} ${sample.name}`, async () => {
          const status = profile.endsWith('ChangesRequested') ? 'ChangesRequested' : 'Draft';
          const initial = ctx.f.requests[status]!;
          if (submit) {
            // Trusted, deliberate invalid saved-content fixture for Submit's
            // defense-in-depth revalidation, never a supported creation path.
            writeTransaction(ctx.f.db, () => ctx.f.db.prepare(`UPDATE change_requests SET ${field} = ? WHERE id = ?`)
              .run(sample.value, initial.id));
          }
          const before = ctx.f.snapshot();
          const old = before.requests.find(row => row.id === initial.id)!;
          const proposal = { ...PROPOSAL, [field]: sample.value };
          const suffix = profile === 'create' ? '' : `/${old.id}${submit ? '/submit' : ''}`;
          const body = submit ? { version: old.version } : { ...proposal, ...(profile === 'create' ? {} : { version: old.version }) };
          const response = await ctx.http(profile.startsWith('edit') ? 'put' : 'post', suffix, body);
          const saved = ctx.f.snapshot();
          if (sample.code) {
            expect(saved).toEqual(before);
            expect(response.status).toBe(sample.code === 'INVALID_REQUEST' ? 400 : 422);
            expect(response.body.error.code).toBe(sample.code);
            expect(response.body).not.toHaveProperty('title');
          } else {
            expect(response.status).toBe(profile === 'create' ? 201 : 200);
            if (profile === 'create') {
              const row = saved.requests.find(item => item.id === response.body.id)!;
              expect(saved.requests).toHaveLength(before.requests.length + 1);
              expect(row).toEqual({ id: response.body.id, ...proposal, requester_id: ctx.f.users.requesterA!.id,
                status: 'Draft', version: 1, reviewer_comment: null });
              expect(response.body).toEqual(representation(row));
              expect(saved.requests.filter(item => item.id !== response.body.id)).toEqual(before.requests);
              expect(saved.users).toEqual(before.users);
              expect(saved.roles).toEqual(before.roles);
            } else {
              const expected = { ...old, ...(!submit ? proposal : {}),
                status: submit ? 'PendingReview' as const : old.status, version: old.version + 1 };
              expect(saved).toEqual({ ...before, requests: before.requests.map(row => row.id === old.id ? expected : row) });
              expect(response.body).toEqual(representation(expected as typeof old));
            }
          }
          expect(response.headers['cache-control']).toBe('no-store');
        });
      }
    }
  }
});
