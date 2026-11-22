// Independent product examples shared by unit and HTTP tests, not a validator.
export const PROPOSAL_LIMITS = { title: 200, description: 5000, reason: 2000 } as const;
export type ProposalField = keyof typeof PROPOSAL_LIMITS;
export interface TextCase { name: string; value: unknown; code?: 'INVALID_REQUEST' | 'VALIDATION_FAILED' }

export function proposalCases(limit: number): TextCase[] {
  return [
    { name: 'exact maximum', value: 'x'.repeat(limit) },
    { name: 'maximum plus one', value: 'x'.repeat(limit + 1), code: 'VALIDATION_FAILED' },
    { name: 'padded exact maximum including NBSP/BOM', value: ` \t\u00a0\ufeff${'x'.repeat(limit)}\r\n` },
    { name: 'padded maximum plus one', value: ` \u00a0${'x'.repeat(limit + 1)}\ufeff `, code: 'VALIDATION_FAILED' },
    { name: 'empty', value: '', code: 'VALIDATION_FAILED' },
    { name: 'ASCII whitespace only', value: ' \t\r\n', code: 'VALIDATION_FAILED' },
    { name: 'Unicode whitespace only', value: '\u00a0\ufeff', code: 'VALIDATION_FAILED' },
    { name: 'one astral code point with surrounding whitespace', value: ' \u00a0😀\ufeff ' },
    { name: 'astral exact maximum', value: '😀'.repeat(limit) },
    { name: 'astral maximum plus one', value: '😀'.repeat(limit + 1), code: 'VALIDATION_FAILED' },
    { name: 'combining sequence exact maximum', value: 'e\u0301'.repeat(limit / 2) },
    { name: 'combining sequence maximum plus one', value: 'e\u0301'.repeat(limit / 2) + 'x', code: 'VALIDATION_FAILED' },
    { name: 'interior whitespace exact maximum', value: 'a' + ' '.repeat(limit - 2) + 'b' },
    { name: 'interior whitespace maximum plus one', value: 'a' + ' '.repeat(limit - 1) + 'b', code: 'VALIDATION_FAILED' },
    { name: 'decomposed text remains decomposed', value: 'e\u0301' },
    { name: 'missing', value: undefined, code: 'INVALID_REQUEST' },
    { name: 'null', value: null, code: 'INVALID_REQUEST' },
    { name: 'number', value: 12, code: 'INVALID_REQUEST' },
    { name: 'boolean', value: true, code: 'INVALID_REQUEST' },
    { name: 'array', value: [], code: 'INVALID_REQUEST' },
    { name: 'object', value: {}, code: 'INVALID_REQUEST' },
    { name: 'unpaired high surrogate', value: '\ud800', code: 'INVALID_REQUEST' },
    { name: 'unpaired low surrogate', value: '\udc00', code: 'INVALID_REQUEST' },
  ];
}
