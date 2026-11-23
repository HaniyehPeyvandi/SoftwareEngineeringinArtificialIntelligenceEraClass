import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';
import type { HttpOutcome, Participant, Phase, RaceHarness, TraceEvent, WorkerIdentity } from './race-contract.js';
import type { WorkerAction, WorkerMessage, WorkerOptions } from './race-worker.js';

function deadline<T>(work: Promise<T>, milliseconds: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([work, new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`Race harness deadline: ${label}`)), milliseconds);
  })]).finally(() => clearTimeout(timer));
}

class Client {
  readonly worker: Worker;
  readonly ready: Promise<WorkerIdentity>;
  private sequence = 0;
  private exited = false;
  private closing = false;
  private failure: Error | undefined;
  private readonly pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();

  constructor(options: WorkerOptions, onEvent: (actor: Participant, phase: Phase) => void, onFailure: (error: Error) => void) {
    // Register the existing tsx ESM loader inside a clean independent worker.
    // Do not inherit Vitest's execArgv/loader or import Vitest into the worker.
    const api = pathToFileURL(createRequire(import.meta.url).resolve('tsx/esm/api')).href;
    const entry = new URL('./race-worker.ts', import.meta.url).href;
    this.worker = new Worker(`(async () => { const { register } = await import(${JSON.stringify(api)}); register(); await import(${JSON.stringify(entry)}); })().catch(error => { throw error; });`,
      { eval: true, execArgv: [], workerData: options });
    let resolveReady: (identity: WorkerIdentity) => void;
    let rejectReady: (error: Error) => void;
    this.ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
    void this.ready.catch(() => {});
    const fail = (error: Error) => {
      this.failure = error;
      rejectReady(error);
      for (const rpc of this.pending.values()) rpc.reject(error);
      this.pending.clear();
      onFailure(error);
    };
    this.worker.on('message', (message: WorkerMessage) => {
      if (message.kind === 'ready') resolveReady(message.identity);
      else if (message.kind === 'event') onEvent(message.actor, message.phase);
      else {
        const rpc = this.pending.get(message.id);
        if (!rpc) return fail(new Error('Unexpected worker RPC response.'));
        this.pending.delete(message.id);
        if (message.kind === 'error') rpc.reject(new Error(`Race worker: ${message.message}`));
        else rpc.resolve(message.value);
      }
    });
    this.worker.on('error', error => fail(new Error(`Race worker startup/runtime error: ${error.message}`)));
    this.worker.on('exit', code => {
      this.exited = true;
      if (!this.closing) fail(new Error(`Race worker exited unexpectedly (${code}).`));
    });
  }

  call<T>(action: WorkerAction): Promise<T> {
    if (this.failure || this.exited) return Promise.reject(this.failure ?? new Error('Worker already exited.'));
    const id = ++this.sequence;
    const promise = new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, action });
    }) as Promise<T>;
    // Calls can be running while their IPC barrier is awaited. Attach a handler
    // immediately; the original rejection is still propagated when awaited.
    void promise.catch(() => {});
    return promise;
  }

  async close(): Promise<void> {
    this.closing = true;
    if (this.exited) return;
    try {
      if (!this.failure) await deadline(this.call({ kind: 'close' }), 2500, 'graceful worker close');
    } finally {
      await this.worker.terminate();
    }
  }
}

export async function createRaceHarness(options: { databasePath: string; busyTimeoutMs: number; deadlineMs: number }): Promise<RaceHarness> {
  if (!Number.isInteger(options.busyTimeoutMs) || options.busyTimeoutMs < 1 || options.busyTimeoutMs > 1000 ||
      !Number.isInteger(options.deadlineMs) || options.deadlineMs < 1000) throw new Error('Invalid race timing configuration.');
  const events: TraceEvent[] = [];
  const waiters = new Set<{ actor: Participant; phase: Phase; resolve: () => void; reject: (error: Error) => void }>();
  const gates: SharedArrayBuffer[] = [];
  const clients: Client[] = [];
  const commitAcks = new Map<Participant, SharedArrayBuffer>();
  let closed = false;
  let used = false;
  let failure: Error | undefined;
  const release = (buffer: SharedArrayBuffer) => {
    const view = new Int32Array(buffer);
    Atomics.store(view, 0, 1);
    Atomics.notify(view, 0);
  };
  const gate = () => { const buffer = new SharedArrayBuffer(4); gates.push(buffer); return buffer; };
  const fail = (error: Error) => {
    failure = error;
    for (const waiter of waiters) waiter.reject(error);
    waiters.clear();
    // Unblock synchronous native/barrier work so finally can close connections.
    for (const buffer of gates) release(buffer);
  };
  const onEvent = (actor: Participant, phase: Phase) => {
    events.push({ actor, phase, order: events.length });
    if (phase === 'committed' && commitAcks.has(actor)) release(commitAcks.get(actor)!);
    for (const waiter of waiters) {
      if (waiter.actor === actor && waiter.phase === phase) { waiters.delete(waiter); waiter.resolve(); }
    }
  };
  async function wait(actor: Participant, phase: Phase) {
    if (failure) throw failure;
    if (events.some(event => event.actor === actor && event.phase === phase)) return;
    const waiter = { actor, phase, resolve: () => {}, reject: (_error: Error) => {} };
    try {
      await deadline(new Promise<void>((resolve, reject) => {
        waiter.resolve = resolve; waiter.reject = reject; waiters.add(waiter);
      }), options.deadlineMs, `${actor}/${phase}`);
    } finally {
      waiters.delete(waiter);
    }
  }
  async function start(): Promise<[Client, Client]> {
    if (used || closed) throw new Error('Each race harness runs exactly one scenario.');
    used = true;
    const workerOptions: WorkerOptions = { ...options, jwtSecretBase64: randomBytes(32).toString('base64') };
    clients.push(new Client(workerOptions, onEvent, fail), new Client(workerOptions, onEvent, fail));
    await deadline(Promise.all(clients.map(client => client.ready)), options.deadlineMs, 'worker startup');
    return [clients[0]!, clients[1]!];
  }
  async function ordered<T, U>(firstActor: Participant, first: (pause: SharedArrayBuffer) => Promise<T>,
    secondActor: Participant, second: (ack: SharedArrayBuffer) => Promise<U>): Promise<[T, U]> {
    const pause = gate();
    const ack = gate();
    commitAcks.set(firstActor, ack);
    const firstResult = first(pause);
    await wait(firstActor, 'writer-reserved');
    const secondResult = second(ack);
    await wait(secondActor, 'begin-attempt');
    // Never wait for the blocked second writer's reservation. Its native BEGIN
    // is now in flight; release the first writer before SQLite's busy timeout.
    release(pause);
    return deadline(Promise.all([firstResult, secondResult]), options.deadlineMs, 'ordered outcomes');
  }
  return {
    async race(input) {
      const [a, b] = await start();
      await deadline(Promise.all([a.call({ kind: 'login', actor: 'first', credentials: input.commands[0].credentials }),
        b.call({ kind: 'login', actor: 'second', credentials: input.commands[1].credentials })]), options.deadlineMs, 'race login');
      const actors = ['first', 'second'] as const;
      const other = input.first === 0 ? 1 : 0;
      const pair = [a, b] as const;
      const [winner, loser] = await ordered(actors[input.first], pause => pair[input.first].call<HttpOutcome>({
        kind: 'http', actor: actors[input.first], command: input.commands[input.first], pauseAfterReservation: pause,
      }), actors[other], ack => pair[other].call<HttpOutcome>({
        kind: 'http', actor: actors[other], command: input.commands[other], announceAfterCommit: ack,
      }));
      return { outcomes: input.first === 0 ? [winner, loser] : [loser, winner], events: [...events] };
    },
    async permissionOrder(input) {
      const [mutation, maintenance] = await start();
      await deadline(mutation.call({ kind: 'login', actor: 'mutation', credentials: input.command.credentials }), options.deadlineMs, 'permission login');
      let outcome: HttpOutcome;
      if (input.first === 'mutation') {
        [outcome] = await ordered('mutation', pause => mutation.call<HttpOutcome>({ kind: 'http', actor: 'mutation', command: input.command,
          pauseAfterReservation: pause }), 'maintenance', ack => maintenance.call({ kind: 'maintenance', actor: 'maintenance',
          maintenance: input.maintenance, announceAfterCommit: ack }));
      } else {
        const result = await ordered('maintenance', pause => maintenance.call({ kind: 'maintenance', actor: 'maintenance',
          maintenance: input.maintenance, pauseAfterReservation: pause }), 'mutation', ack => mutation.call<HttpOutcome>({ kind: 'http', actor: 'mutation',
          command: input.command, announceAfterCommit: ack }));
        outcome = result[1];
      }
      const afterMaintenance = await deadline(mutation.call<HttpOutcome>({ kind: 'http', actor: 'retry', command: input.command }), options.deadlineMs, 'same-token retry');
      return { outcome, afterMaintenance, maintenanceWorker: await maintenance.ready, events: [...events] };
    },
    async lock(input) {
      const [mutation, lock] = await start();
      await deadline(mutation.call({ kind: 'login', actor: 'mutation', credentials: input.command.credentials }), options.deadlineMs, 'lock login');
      const held = gate();
      const lockResult = lock.call<WorkerIdentity>({ kind: 'lock', stage: input.stage, release: held });
      await wait('lock', 'lock-acquired');
      let outcome: HttpOutcome;
      try {
        outcome = await deadline(mutation.call<HttpOutcome>({ kind: 'http', actor: 'mutation', command: input.command }), options.deadlineMs, 'busy HTTP outcome');
      } finally {
        release(held);
      }
      const lockWorker = await deadline(lockResult, options.deadlineMs, 'lock release');
      return { outcome, lockWorker, events: [...events] };
    },
    async close() {
      if (closed) return;
      closed = true;
      for (const buffer of gates) release(buffer);
      const results = await Promise.allSettled(clients.map(client => client.close()));
      const errors = results.filter(result => result.status === 'rejected').map(result => result.reason as unknown);
      if (errors.length) throw new AggregateError(errors, 'Race worker cleanup failed.');
    },
  };
}
