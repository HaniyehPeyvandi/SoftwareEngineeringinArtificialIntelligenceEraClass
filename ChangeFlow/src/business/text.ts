import { BusinessError } from './rules.js';
import type { Proposal } from './rules.js';

const LIMITS = { title: 200, description: 5000, reason: 2000, comment: 2000 } as const;
export type TextField = keyof typeof LIMITS;

// Shared transport check, including JSON keys. Do not allow UTF-8 conversion to
// replace an unpaired surrogate before the business validator or SQLite sees it.
export function isValidUnicode(value: unknown): boolean {
  if (typeof value === 'string') {
    for (let i = 0; i < value.length; i++) {
      const unit = value.charCodeAt(i);
      if (unit >= 0xd800 && unit <= 0xdbff) {
        const next = value.charCodeAt(++i);
        if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      } else if (unit >= 0xdc00 && unit <= 0xdfff) return false;
    }
  } else if (Array.isArray(value)) return value.every(isValidUnicode);
  else if (value !== null && typeof value === 'object') {
    return Object.entries(value).every(([key, entry]) => isValidUnicode(key) && isValidUnicode(entry));
  }
  return true;
}

export function validateText(field: TextField, value: unknown): string {
  if (typeof value !== 'string' || !isValidUnicode(value)) throw new BusinessError('INVALID_REQUEST');
  const length = [...value.trim()].length;
  if (length === 0) throw new BusinessError('VALIDATION_FAILED', [{ field, reason: 'required' }]);
  if (length > LIMITS[field]) throw new BusinessError('VALIDATION_FAILED', [{ field, reason: 'too_long' }]);
  return value; // Preserve whitespace, combining sequences, and all original text.
}

export function validateProposal(value: unknown): Proposal {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 3 ||
      !Object.hasOwn(value, 'title') || !Object.hasOwn(value, 'description') || !Object.hasOwn(value, 'reason')) {
    throw new BusinessError('INVALID_REQUEST');
  }
  const fields = value as Record<string, unknown>;
  return { title: validateText('title', fields.title), description: validateText('description', fields.description),
    reason: validateText('reason', fields.reason) };
}
