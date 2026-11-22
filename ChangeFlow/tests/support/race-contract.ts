import { existsSync } from 'node:fs';
import { expect } from 'vitest';

// Test-first interface only for T040–T042. T043 owns both executable harness
// modules. This file neither starts workers nor simulates their results/locks.
export interface WorkerIdentity { pid: number; threadId: number; connectionId: string }
export interface Credentials { username: string; password: string }
export interface HttpCommand {
  credentials: Credentials;
  method: 'post' | 'put';
  path: string;
  body: Record<string, unknown>;
}
export interface HttpOutcome {
  worker: WorkerIdentity;
  status: number;
  body: unknown;
  headers: Record<string, string | undefined>;
}
export type Participant = 'first' | 'second' | 'mutation' | 'maintenance' | 'retry' | 'lock';
export type Phase = 'authenticated' | 'http-started' | 'begin-attempt' | 'writer-reserved' |
  'updated' | 'commit-attempt' | 'committed' | 'rolled-back' | 'response' | 'lock-acquired' | 'lock-released';
export interface TraceEvent { actor: Participant; phase: Phase; order: number }
export type Maintenance = { kind: 'revokeRole'; userId: string; role: 'Requester' | 'Reviewer' } |
  { kind: 'disable'; userId: string };

export interface RaceHarness {
  // Login both actors via HTTP before the barrier. Both HTTP commands use the
  // same caller-supplied Version on different workers/connections. Hold the first
  // writer until the other reports begin-attempt, NOT writer-reserved; release
  // promptly before busy_timeout. Parent-sequenced trace must show overlap/order.
  race(input: { commands: readonly [HttpCommand, HttpCommand]; first: 0 | 1 }): Promise<{
    outcomes: readonly [HttpOutcome, HttpOutcome]; events: readonly TraceEvent[];
  }>;
  // Login/retain JWT before any maintenance. Execute the mutation and committed
  // maintenance on different workers, controlling which acquires IMMEDIATE first.
  // After maintenance commits, reuse the SAME JWT/worker for afterMaintenance;
  // never re-login or silently obtain a new token after revocation/disablement.
  permissionOrder(input: { command: HttpCommand; maintenance: Maintenance; first: 'mutation' | 'maintenance' }): Promise<{
    outcome: HttpOutcome; afterMaintenance: HttpOutcome; maintenanceWorker: WorkerIdentity; events: readonly TraceEvent[];
  }>;
  // Hold BEGIN IMMEDIATE (begin conflict) or BEGIN+SELECT SHARED (commit conflict)
  // in one worker until the other returns 503. Release via IPC in finally before
  // returning, never a sleep-only schedule. Login precedes lock acquisition.
  lock(input: { command: HttpCommand; stage: 'begin' | 'commit' }): Promise<{
    outcome: HttpOutcome; lockWorker: WorkerIdentity; events: readonly TraceEvent[];
  }>;
  // Await all terminations/connection closures, including on assertion/IPC/startup
  // failures. The caller closes the harness before fixture cleanup on Windows.
  close(): Promise<void>;
}
type Factory = (options: { databasePath: string; busyTimeoutMs: number; deadlineMs: number }) => Promise<RaceHarness>;

export async function loadRaceHarness(): Promise<Factory> {
  const entry = new URL('./race-harness.ts', import.meta.url);
  const worker = new URL('./race-worker.ts', import.meta.url);
  if (!existsSync(entry) || !existsSync(worker)) {
    const error = new Error('T043_DEPENDENCY_UNAVAILABLE: independent race-harness.ts/race-worker.ts are not implemented; no concurrency behavior executed.');
    error.name = 'T043DependencyUnavailable';
    throw error;
  }
  const module: Record<string, unknown> = await import(/* @vite-ignore */ entry.href);
  expect(module.createRaceHarness, 'T043 must export createRaceHarness; no stub/fallback is permitted.').toBeTypeOf('function');
  return module.createRaceHarness as Factory;
}

export function expectIndependentWorkers(a: WorkerIdentity, b: WorkerIdentity) {
  expect(Number.isInteger(a.pid) && a.pid > 0 && Number.isInteger(a.threadId) && a.threadId >= 0).toBe(true);
  expect(Number.isInteger(b.pid) && b.pid > 0 && Number.isInteger(b.threadId) && b.threadId >= 0).toBe(true);
  expect(`${a.pid}:${a.threadId}`).not.toBe(`${b.pid}:${b.threadId}`);
  expect(a.connectionId).toEqual(expect.any(String));
  expect(a.connectionId.length).toBeGreaterThan(0);
  expect(b.connectionId).toEqual(expect.any(String));
  expect(b.connectionId.length).toBeGreaterThan(0);
  expect(a.connectionId).not.toBe(b.connectionId);
}

export function expectOrder(events: readonly TraceEvent[], steps: readonly (readonly [Participant, Phase])[]) {
  expect(new Set(events.map(event => event.order)).size).toBe(events.length);
  let previous = -1;
  for (const [actor, phase] of steps) {
    const found = events.find(event => event.actor === actor && event.phase === phase);
    expect(found, `Missing actual IPC event: ${actor}/${phase}`).toBeDefined();
    expect(found!.order).toBeGreaterThan(previous);
    previous = found!.order;
  }
}
