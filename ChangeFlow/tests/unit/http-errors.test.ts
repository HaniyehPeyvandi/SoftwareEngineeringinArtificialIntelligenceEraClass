import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { errorHandler } from '../../src/http/errors.js';
import { BusinessError } from '../../src/business/rules.js';

describe('T014 sanitized HTTP failure adapter (test-only handlers)', () => {
  it.each([
    [new Database.SqliteError('private SQL, path, hash or secret', 'SQLITE_BUSY_TIMEOUT'), 503, 'STORAGE_BUSY'],
    [new Database.SqliteError('private SQL, path, hash or secret', 'SQLITE_IOERR_WRITE'), 503, 'STORAGE_UNAVAILABLE'],
    [new Error('private SQL, path, hash or secret'), 500, 'INTERNAL_ERROR'],
  ] as const)('sanitizes operational and unexpected errors: %#', async (failure, status, code) => {
    const harness = express();
    harness.get('/test-only', () => { throw failure; });
    harness.use(errorHandler);
    const response = await request(harness).get('/test-only');
    expect(response.status).toBe(status);
    expect(response.body.error.code).toBe(code);
    expect(Object.keys(response.body.error).sort()).toEqual(['code', 'message']);
    expect(response.text).not.toMatch(/private|SQLITE|stack|node_modules/);
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('uses safe field reasons without including supplied values', async () => {
    const harness = express();
    harness.get('/test-only', () => {
      throw new BusinessError('VALIDATION_FAILED', [{ field: 'title', reason: 'required' }]);
    });
    harness.use(errorHandler);
    const response = await request(harness).get('/test-only');
    expect(response.status).toBe(422);
    expect(response.body.error.fields).toEqual([{ field: 'title', reason: 'required' }]);
  });
});
