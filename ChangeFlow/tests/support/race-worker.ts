import { randomUUID } from 'node:crypto';
import { parentPort, threadId, workerData } from 'node:worker_threads';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config.js';
import { openDatabase, writeTransaction } from '../../src/persistence/database.js';
import type { Credentials, HttpCommand, HttpOutcome, Maintenance, Participant, Phase, WorkerIdentity } from './race-contract.js';

export interface WorkerOptions {
  databasePath: string;
  jwtSecretBase64: string;
  busyTimeoutMs: number;
  deadlineMs: number;
}
interface Schedule {
  actor: Participant;
  pauseAfterReservation?: SharedArrayBuffer;
  announceAfterCommit?: SharedArrayBuffer;
}
export type WorkerAction =
  { kind: 'login'; actor: Participant; credentials: Credentials } |
  ({ kind: 'http'; command: HttpCommand } & Schedule) |
  ({ kind: 'maintenance'; maintenance: Maintenance } & Schedule) |
  { kind: 'lock'; stage: 'begin' | 'commit'; release: SharedArrayBuffer } |
  { kind: 'close' };
export type WorkerMessage =
  { kind: 'ready'; identity: WorkerIdentity } |
  { kind: 'event'; actor: Participant; phase: Phase } |
  { kind: 'result'; id: number; value: unknown } |
  { kind: 'error'; id: number; message: string };

if (!parentPort) throw new Error('race-worker must run in an independent Worker.');
const port = parentPort;
const options = workerData as WorkerOptions;
const db = openDatabase(options.databasePath, { fileMustExist: true });
db.pragma(`busy_timeout = ${options.busyTimeoutMs}`);
const config = loadConfig({ DATABASE_PATH: options.databasePath, JWT_SECRET_BASE64: options.jwtSecretBase64 });
const app = createApp(config, db);
const identity: WorkerIdentity = { pid: process.pid, threadId, connectionId: randomUUID() };
let token: string | undefined;
let schedule: Schedule | undefined;
let handling = false;

function emit(actor: Participant, phase: Phase): void {
  port.postMessage({ kind: 'event', actor, phase } satisfies WorkerMessage);
}
function waitForRelease(buffer: SharedArrayBuffer | undefined): void {
  if (!buffer) return;
  const gate = new Int32Array(buffer);
  if (Atomics.wait(gate, 0, 0, options.deadlineMs) === 'timed-out') throw new Error('Worker barrier deadline exceeded.');
  if (Atomics.load(gate, 0) !== 1) throw new Error('Worker barrier was not released.');
}

// Test-only observation around the REAL driver's transaction wrapper. BEGIN,
// COMMIT, rollback and the production callback still execute in better-sqlite3.
// No HTTP/business result or SQL update is simulated here. Login/read transactions
// run untouched; only explicitly scheduled IMMEDIATE operations are observed.
const nativeTransaction = db.transaction.bind(db);
db.transaction = ((work: (...args: unknown[]) => unknown) => {
  let observing = false;
  let entered = false;
  const wrapped = nativeTransaction((...args: unknown[]) => {
    if (observing && schedule) {
      entered = true;
      // The second writer has really acquired SQLite's reservation. Delay its
      // notification until the parent has received the first COMMIT notification,
      // avoiding cross-port message reordering in the evidence trace.
      waitForRelease(schedule.announceAfterCommit);
      emit(schedule.actor, 'writer-reserved');
      waitForRelease(schedule.pauseAfterReservation);
    }
    const value = work(...args);
    if (observing && schedule) {
      emit(schedule.actor, 'updated');
      emit(schedule.actor, 'commit-attempt');
    }
    return value;
  });
  const immediate = (...args: unknown[]) => {
    observing = schedule !== undefined;
    entered = false;
    if (observing) emit(schedule!.actor, 'begin-attempt');
    try {
      const value = wrapped.immediate(...args);
      if (observing) emit(schedule!.actor, 'committed');
      return value;
    } catch (error) {
      if (observing && entered) {
        if (db.inTransaction) throw new Error('Driver left a failed transaction open.');
        emit(schedule!.actor, 'rolled-back');
      }
      throw error;
    }
  };
  // Driver properties are non-writable, so expose a separate callable instead
  // of proxying/reassigning its .immediate property.
  return Object.assign((...args: unknown[]) => wrapped(...args), {
    default: wrapped.default, deferred: wrapped.deferred, exclusive: wrapped.exclusive,
    immediate, database: db,
  });
}) as typeof db.transaction;

async function execute(action: WorkerAction): Promise<unknown> {
  if (action.kind === 'login') {
    const response = await request(app).post('/api/auth/login').send(action.credentials);
    if (response.status !== 200 || typeof response.body.accessToken !== 'string') throw new Error('Worker HTTP login failed.');
    token = response.body.accessToken as string;
    emit(action.actor, 'authenticated');
    return identity; // Token/credentials never leave the worker in results/logs.
  }
  if (action.kind === 'http') {
    if (!token) throw new Error('Worker must authenticate before mutation.');
    schedule = action;
    try {
      emit(action.actor, 'http-started');
      const response = await request(app)[action.command.method](action.command.path)
        .set('Authorization', `Bearer ${token}`).send(action.command.body);
      emit(action.actor, 'response');
      return { worker: identity, status: response.status, body: response.body as unknown,
        headers: { 'cache-control': response.headers['cache-control'] as string | undefined,
          'www-authenticate': response.headers['www-authenticate'] as string | undefined } } satisfies HttpOutcome;
    } finally {
      schedule = undefined;
    }
  }
  if (action.kind === 'maintenance') {
    schedule = action;
    try {
      writeTransaction(db, () => {
        const maintenance = action.maintenance;
        const result = maintenance.kind === 'disable' ? db.prepare('UPDATE users SET active = 0 WHERE id = ?').run(maintenance.userId) :
          db.prepare('DELETE FROM user_roles WHERE user_id = ? AND role = ?').run(maintenance.userId, maintenance.role);
        if (result.changes !== 1) throw new Error('Maintenance fixture expected exactly one affected row.');
      });
      return identity;
    } finally {
      schedule = undefined;
    }
  }
  if (action.kind === 'lock') {
    try {
      db.exec(action.stage === 'begin' ? 'BEGIN IMMEDIATE' : 'BEGIN');
      if (action.stage === 'commit') db.prepare('SELECT id FROM change_requests LIMIT 1').get();
      emit('lock', 'lock-acquired');
      waitForRelease(action.release);
    } finally {
      if (db.inTransaction) db.exec('ROLLBACK');
    }
    emit('lock', 'lock-released');
    return identity;
  }
  if (db.inTransaction) db.exec('ROLLBACK');
  db.close();
  return undefined;
}

port.on('message', async ({ id, action }: { id: number; action: WorkerAction }) => {
  if (handling) {
    port.postMessage({ kind: 'error', id, message: 'Overlapping RPCs on one worker are forbidden.' } satisfies WorkerMessage);
    return;
  }
  handling = true;
  try {
    const value = await execute(action);
    port.postMessage({ kind: 'result', id, value } satisfies WorkerMessage);
    if (action.kind === 'close') port.close();
  } catch (error) {
    port.postMessage({ kind: 'error', id, message: error instanceof Error ? error.message : 'Unknown worker failure.' } satisfies WorkerMessage);
  } finally {
    handling = false;
  }
});
port.postMessage({ kind: 'ready', identity } satisfies WorkerMessage);
