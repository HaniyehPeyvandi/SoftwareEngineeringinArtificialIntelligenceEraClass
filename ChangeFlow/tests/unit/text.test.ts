import { existsSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { proposalCases, PROPOSAL_LIMITS } from '../support/proposal-cases.js';
import type { ProposalField } from '../support/proposal-cases.js';

// Test-authoring interface for T022: validateText(field, value) returns original
// valid text or throws a BusinessError. No stub or validator is implemented here.
type TextValidator = (field: ProposalField, value: unknown) => string;
let candidate: unknown;
beforeAll(async () => {
  const source = new URL('../../src/business/text.ts', import.meta.url);
  if (existsSync(source)) candidate = (await import(/* @vite-ignore */ source.href)).validateText;
});

describe('T020 pure proposal text rules (AS-04/28/29, FR-003/018)', () => {
  for (const [field, limit] of Object.entries(PROPOSAL_LIMITS) as [ProposalField, number][]) {
    for (const sample of proposalCases(limit)) {
      it(`${field}: ${sample.name}`, () => {
        expect(candidate, 'T022 validateText is not implemented; this is an expected missing-implementation failure.').toBeTypeOf('function');
        const validate = candidate as TextValidator;
        if (sample.code) {
          let failure: unknown;
          try { validate(field, sample.value); } catch (error) { failure = error; }
          expect(failure).toMatchObject({ code: sample.code });
        } else expect(validate(field, sample.value)).toBe(sample.value);
      });
    }
  }
});
