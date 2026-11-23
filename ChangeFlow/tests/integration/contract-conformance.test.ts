import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { Response } from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { writeTransaction } from '../../src/persistence/database.js';
import { ownerContext, PROPOSAL, representation } from '../support/owner.js';
import type { RequestRow } from '../support/database.js';

interface Schema {
  $ref?: string; type?: string | string[]; properties?: Record<string, Schema>; required?: string[];
  additionalProperties?: boolean; items?: Schema; minimum?: number; maximum?: number;
  enum?: unknown[]; const?: unknown; format?: string;
  'x-trimmed-min-codepoints'?: number; 'x-trimmed-max-codepoints'?: number;
}
interface Content { 'application/json': { schema: Schema } }
interface ApiResponse { $ref?: string; headers?: Record<string, { schema: Schema }>; content: Content }
interface Operation { operationId: string; requestBody?: { content: Content }; responses: Record<string, ApiResponse>; security?: unknown[] }
const api = JSON.parse(readFileSync(new URL('../../specs/001-change-request-workflow/contracts/openapi.json', import.meta.url), 'utf8')) as {
  paths: Record<string, Record<string, Operation>>;
  components: { schemas: Record<string, Schema>; responses: Record<string, ApiResponse> };
};
const operations = Object.entries(api.paths).flatMap(([path, methods]) => Object.entries(methods)
  .filter(([method]) => ['get', 'post', 'put'].includes(method)).map(([method, operation]) => ({ path, method, ...operation })));
const observed = new Set<string>();
const ctx = ownerContext();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function resolve<T extends { $ref?: string }>(value: T): T {
  if (!value.$ref) return value;
  const [, , section, name] = value.$ref.split('/');
  expect(value.$ref).toMatch(/^#\/components\/(schemas|responses)\/[^/]+$/);
  const resolved = api.components[section as keyof typeof api.components][name!];
  expect(resolved, `Unresolved contract reference ${value.$ref}`).toBeDefined();
  return resolved as T;
}

// Deliberately limited to the checked-in contract's vocabulary, not a general
// JSON Schema engine. Fail closed on a new keyword instead of silently ignoring
// a constraint. This checker does not import production validators or constants.
function conform(value: unknown, input: Schema): void {
  const schema = resolve(input);
  const supported = new Set(['type', 'properties', 'required', 'additionalProperties', 'items', 'minimum', 'maximum',
    'enum', 'const', 'format', 'description', 'writeOnly', 'x-trimmed-min-codepoints', 'x-trimmed-max-codepoints', 'x-counting-unit']);
  for (const key of Object.keys(schema)) expect(supported.has(key), `Unsupported schema keyword ${key}`).toBe(true);
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  const actual = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  expect(types.some(type => type === actual || type === 'integer' && typeof value === 'number' && Number.isSafeInteger(value))).toBe(true);
  if ('const' in schema) expect(value).toEqual(schema.const);
  if (schema.enum) expect(schema.enum).toContainEqual(value);
  if (typeof value === 'number') {
    if (schema.minimum !== undefined) expect(value).toBeGreaterThanOrEqual(schema.minimum);
    if (schema.maximum !== undefined) expect(value).toBeLessThanOrEqual(schema.maximum);
  }
  if (typeof value === 'string') {
    if (schema.format === 'uuid') expect(value).toMatch(uuid);
    if (schema.format) expect(['uuid', 'password']).toContain(schema.format);
    // for...of yields surrogate pairs together and isolated surrogates separately.
    expect([...value].some(point => /^[\uD800-\uDFFF]$/u.test(point))).toBe(false);
    const length = [...value.trim()].length;
    if (schema['x-trimmed-min-codepoints'] !== undefined) expect(length).toBeGreaterThanOrEqual(schema['x-trimmed-min-codepoints']!);
    if (schema['x-trimmed-max-codepoints'] !== undefined) expect(length).toBeLessThanOrEqual(schema['x-trimmed-max-codepoints']!);
  }
  if (Array.isArray(value)) for (const item of value) { expect(schema.items).toBeDefined(); conform(item, schema.items!); }
  else if (value !== null && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    for (const name of schema.required ?? []) expect(Object.hasOwn(object, name)).toBe(true);
    for (const [name, child] of Object.entries(object)) {
      if (schema.additionalProperties === false) expect(Object.hasOwn(schema.properties ?? {}, name)).toBe(true);
      if (schema.properties?.[name]) conform(child, schema.properties[name]);
    }
  }
}

function responseConforms(op: typeof operations[number], response: Response) {
  const declared = op.responses[String(response.status)];
  expect(declared, `${op.operationId}: undeclared HTTP ${response.status}`).toBeDefined();
  const contract = resolve(declared!);
  expect(response.headers['content-type']).toMatch(/^application\/json\b/);
  expect(response.headers['cache-control']).toBe('no-store');
  conform(response.body, contract.content['application/json'].schema);
  for (const [name, header] of Object.entries(contract.headers ?? {})) conform(response.headers[name.toLowerCase()], header.schema);
  if (response.status === 201) expect(response.headers.location).toBe(`/api/change-requests/${response.body.id}`);
}

function preparation(op: typeof operations[number]) {
  const row = ctx.f.requests[op.operationId === 'approveChangeRequest' || op.operationId === 'requestChanges' ? 'PendingReview' : 'Draft']!;
  const body = op.operationId === 'login' ? { username: ctx.f.users.requesterA!.username, password: ctx.f.users.requesterA!.password }
    : op.operationId === 'createChangeRequest' ? { ...PROPOSAL }
      : op.operationId === 'editChangeRequest' ? { ...PROPOSAL, version: row.version }
        : op.operationId === 'requestChanges' ? { version: row.version, comment: 'Contract feedback.' }
          : op.requestBody ? { version: row.version } : undefined;
  const actor = ['approveChangeRequest', 'requestChanges', 'listPendingReview'].includes(op.operationId) ? 'reviewerA' as const : 'requesterA' as const;
  return { row, body: body as Record<string, unknown> | undefined, actor, path: `/api${op.path.replace('{id}', row.id)}` };
}

function send(op: typeof operations[number], prepared: ReturnType<typeof preparation>, body: object | string | undefined = prepared.body, token = true) {
  const pending = request(ctx.app)[op.method as 'get' | 'post' | 'put'](prepared.path);
  if (token && op.operationId !== 'login') pending.set('Authorization', `Bearer ${ctx.token(prepared.actor)}`);
  if (body !== undefined) pending.send(body);
  return pending;
}

function committed(op: typeof operations[number], row: RequestRow, body: Record<string, unknown> | undefined, response: Response,
  before: ReturnType<typeof ctx.f.snapshot>) {
  let expected: RequestRow | undefined;
  if (op.operationId === 'createChangeRequest') expected = { ...body as unknown as typeof PROPOSAL, id: response.body.id as string,
    requester_id: ctx.f.users.requesterA!.id, status: 'Draft', version: 1, reviewer_comment: null };
  else if (op.operationId === 'editChangeRequest') expected = { ...row, title: body!.title as string, description: body!.description as string,
    reason: body!.reason as string, version: row.version + 1 };
  else if (op.operationId === 'submitChangeRequest') expected = { ...row, status: 'PendingReview', version: row.version + 1 };
  else if (op.operationId === 'approveChangeRequest') expected = { ...row, status: 'Approved', version: row.version + 1 };
  else if (op.operationId === 'requestChanges') expected = { ...row, status: 'ChangesRequested', version: row.version + 1, reviewer_comment: body!.comment as string };
  if (expected) {
    expect(response.body).toEqual(representation(expected));
    const requests = op.operationId === 'createChangeRequest' ? [...before.requests, expected].sort((a, b) => a.id < b.id ? -1 : 1)
      : before.requests.map(saved => saved.id === row.id ? expected! : saved);
    expect(ctx.f.snapshot()).toEqual({ ...before, requests });
  } else {
    expect(ctx.f.snapshot()).toEqual(before);
    if (op.operationId === 'getChangeRequest') expect(response.body).toEqual(representation(row));
    if (op.operationId === 'listOwnChangeRequests') expect(response.body).toEqual({ items: before.requests.map(representation) });
    if (op.operationId === 'listPendingReview') expect(response.body).toEqual({ items: before.requests.filter(saved => saved.status === 'PendingReview').map(representation) });
  }
}

afterAll(() => expect([...observed].sort()).toEqual(operations.map(op => op.operationId).sort()));

describe('T052 nine OpenAPI operations: real HTTP request/response contracts', () => {
  it('pins exactly the nine approved operations and all 15 constrained text/Version schema-property occurrences', () => {
    expect(operations.map(op => op.operationId).sort()).toEqual(['login', 'createChangeRequest', 'listOwnChangeRequests', 'listPendingReview',
      'getChangeRequest', 'editChangeRequest', 'submitChangeRequest', 'approveChangeRequest', 'requestChanges'].sort());
    let count = 0;
    for (const schema of Object.values(api.components.schemas)) for (const [field, child] of Object.entries(schema.properties ?? {})) {
      if (child['x-trimmed-max-codepoints']) {
        expect(child).not.toHaveProperty('maxLength');
        expect(child['x-trimmed-min-codepoints']).toBe(1);
        expect(child['x-trimmed-max-codepoints']).toBe(field === 'title' ? 200 : field === 'description' ? 5000 : 2000);
        count++;
      }
      if (field === 'version') { expect(child.minimum).toBe(1); expect(child.maximum).toBe(Number.MAX_SAFE_INTEGER); count++; }
    }
    // CreateBody 3 + EditBody 4 + VersionBody 1 + ReturnBody 2 + ChangeRequest 5.
    // Count the checked-in schemas directly; earlier document-only reports said 14.
    expect(count).toBe(15);
  });

  for (const op of operations) {
    it(`${op.operationId}: successful request, declared response, headers, and independent saved state`, async () => {
      const prepared = preparation(op);
      if (op.requestBody) conform(prepared.body, op.requestBody.content['application/json'].schema);
      const before = ctx.f.snapshot();
      const response = await send(op, prepared);
      expect(response.status).toBe(op.operationId === 'createChangeRequest' ? 201 : 200);
      responseConforms(op, response);
      committed(op, prepared.row, prepared.body, response, before);
      observed.add(op.operationId);
    });

    if (op.operationId !== 'login') {
      it(`${op.operationId}: unauthenticated error schema/challenge`, async () => {
        const before = ctx.f.snapshot();
        const response = await send(op, preparation(op), undefined, false);
        expect(response.status).toBe(401);
        expect(response.body.error.code).toBe('UNAUTHENTICATED');
        responseConforms(op, response);
        expect(ctx.f.snapshot()).toEqual(before);
      });
      it(`${op.operationId}: wrong-role 403 schema without resource data`, async () => {
        const before = ctx.f.snapshot();
        const response = await send(op, preparation(op)).set('Authorization', `Bearer ${ctx.token('noRole')}`);
        expect(response.status).toBe(403);
        expect(response.body.error.code).toBe('FORBIDDEN');
        responseConforms(op, response);
        expect(ctx.f.snapshot()).toEqual(before);
      });
    }

    if (!op.requestBody) continue;
    const schema = resolve(op.requestBody.content['application/json'].schema);
    for (const field of schema.required!) for (const variant of ['missing', 'null', 'wrong type'] as const) {
      it(`${op.operationId}: ${variant} ${field} rejects the strict request schema`, async () => {
        const prepared = preparation(op);
        const body = { ...prepared.body };
        if (variant === 'missing') delete body[field]; else body[field] = variant === 'null' ? null : true;
        expect(() => conform(body, schema)).toThrow();
        const before = ctx.f.snapshot();
        const response = await send(op, prepared, body);
        expect(response.status).toBe(400);
        expect(response.body.error.code).toBe('INVALID_REQUEST');
        responseConforms(op, response);
        expect(ctx.f.snapshot()).toEqual(before);
      });
    }
    it(`${op.operationId}: additional/protected property rejected`, async () => {
      const prepared = preparation(op);
      const body = { ...prepared.body, status: 'Approved' };
      expect(() => conform(body, schema)).toThrow();
      const before = ctx.f.snapshot();
      const response = await send(op, prepared, body);
      expect(response.status).toBe(400);
      responseConforms(op, response);
      expect(ctx.f.snapshot()).toEqual(before);
    });

    if (schema.properties?.version) {
      for (const version of [0, -1, 1.5, '1', Number.MAX_SAFE_INTEGER + 1]) {
        it(`${op.operationId}: rejects unsafe/non-positive/non-integer Version ${version}`, async () => {
          const prepared = preparation(op);
          const body = { ...prepared.body, version };
          expect(() => conform(body, schema)).toThrow();
          const before = ctx.f.snapshot();
          const response = await send(op, prepared, body);
          expect(response.status).toBe(400);
          responseConforms(op, response);
          expect(ctx.f.snapshot()).toEqual(before);
        });
      }
      it(`${op.operationId}: safe maximum Version is valid transport but conflicts with current V1`, async () => {
        const prepared = preparation(op);
        const body = { ...prepared.body, version: Number.MAX_SAFE_INTEGER };
        conform(body, schema);
        const before = ctx.f.snapshot();
        const response = await send(op, prepared, body);
        expect(response.status).toBe(409);
        expect(response.body.error.code).toBe('VERSION_CONFLICT');
        responseConforms(op, response);
        expect(ctx.f.snapshot()).toEqual(before);
      });
      it(`${op.operationId}: declared 503 when the stored safe maximum cannot advance`, async () => {
        const prepared = preparation(op);
        writeTransaction(ctx.f.db, () => ctx.f.db.prepare('UPDATE change_requests SET version = ? WHERE id = ?').run(Number.MAX_SAFE_INTEGER, prepared.row.id));
        const before = ctx.f.snapshot();
        const response = await send(op, prepared, { ...prepared.body, version: Number.MAX_SAFE_INTEGER });
        expect(response.status).toBe(503);
        expect(response.body.error.code).toBe('STORAGE_UNAVAILABLE');
        responseConforms(op, response);
        expect(ctx.f.snapshot()).toEqual(before);
      });
    }

    for (const [field, property] of Object.entries(schema.properties ?? {})) {
      const maximum = property['x-trimmed-max-codepoints'];
      if (!maximum) continue;
      for (const encoding of ['astral', 'combining'] as const) for (const overflow of [false, true]) {
        it(`${op.operationId}: ${field} padded ${encoding} ${overflow ? 'max+1' : 'max'} follows trimmed code points`, async () => {
          const prepared = preparation(op);
          const text = encoding === 'astral' ? '\u{1f600}'.repeat(maximum + Number(overflow))
            : 'e\u0301'.repeat(maximum / 2) + (overflow ? 'x' : '');
          const body = { ...prepared.body, [field]: `\t\u00a0${text}\ufeff ` };
          if (overflow) expect(() => conform(body, schema)).toThrow(); else conform(body, schema);
          const before = ctx.f.snapshot();
          const response = await send(op, prepared, body);
          expect(response.status).toBe(overflow ? 422 : op.operationId === 'createChangeRequest' ? 201 : 200);
          responseConforms(op, response);
          if (overflow) { expect(response.body.error.fields).toEqual([{ field, reason: 'too_long' }]); expect(ctx.f.snapshot()).toEqual(before); }
          else committed(op, prepared.row, body, response, before);
        });
      }
      it(`${op.operationId}: blank ${field} is shape-valid but violates the text annotation (422)`, async () => {
        const prepared = preparation(op);
        const body = { ...prepared.body, [field]: '\u00a0\ufeff\t ' };
        expect(() => conform(body, schema)).toThrow();
        const before = ctx.f.snapshot();
        const response = await send(op, prepared, body);
        expect(response.status).toBe(422);
        expect(response.body.error.fields).toEqual([{ field, reason: 'required' }]);
        responseConforms(op, response);
        expect(ctx.f.snapshot()).toEqual(before);
      });
    }

    for (const envelope of ['malformed JSON', 'oversized', 'wrong media'] as const) {
      it(`${op.operationId}: declared ${envelope} transport error`, async () => {
        const before = ctx.f.snapshot();
        const pending = send(op, preparation(op), envelope === 'malformed JSON' ? '{' : envelope === 'oversized' ? { padding: 'x'.repeat(128 * 1024) } : 'plain text');
        pending.set('Content-Type', envelope === 'wrong media' ? 'text/plain' : 'application/json');
        const response = await pending;
        expect(response.status).toBe(envelope === 'malformed JSON' ? 400 : envelope === 'oversized' ? 413 : 415);
        responseConforms(op, response);
        expect(ctx.f.snapshot()).toEqual(before);
      });
    }
  }

  it('GET missing and malformed IDs follow the declared 404/400 contracts', async () => {
    const op = operations.find(value => value.operationId === 'getChangeRequest')!;
    const before = ctx.f.snapshot();
    for (const [id, status] of [[randomUUID(), 404], ['invalid-uuid', 400]] as const) {
      const response = await send(op, { ...preparation(op), path: `/api/change-requests/${id}` });
      expect(response.status).toBe(status);
      responseConforms(op, response);
      expect(ctx.f.snapshot()).toEqual(before);
    }
  });
  it('login failure follows the separate INVALID_CREDENTIALS response contract', async () => {
    const op = operations.find(value => value.operationId === 'login')!;
    const before = ctx.f.snapshot();
    const response = await send(op, preparation(op), { username: 'absent-local-account', password: 'test-only wrong input' });
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
    responseConforms(op, response);
    expect(ctx.f.snapshot()).toEqual(before);
  });
});
