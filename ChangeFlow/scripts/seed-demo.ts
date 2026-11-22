import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfig } from '../src/config.js';
import { hashPassword } from '../src/business/auth.js';
import type { Role } from '../src/business/rules.js';
import { openDatabase, readTransaction, writeTransaction } from '../src/persistence/database.js';
import type { SqliteDatabase } from '../src/persistence/database.js';
import { createStore, withStorageErrors } from '../src/persistence/store.js';

export const DEMO_USERS = [
  { username: 'requester-a', roles: ['Requester'] },
  { username: 'requester-b', roles: ['Requester'] },
  { username: 'reviewer-a', roles: ['Reviewer'] },
  { username: 'reviewer-b', roles: ['Reviewer'] },
  { username: 'dual-role', roles: ['Requester', 'Reviewer'] },
] as const satisfies readonly { username: string; roles: readonly Role[] }[];

export async function seedDemoUsers(db: SqliteDatabase): Promise<{ username: string; password: string }[]> {
  const store = createStore(db);
  const absent = withStorageErrors(() => readTransaction(db, () =>
    DEMO_USERS.filter(user => !store.findUserByUsername(user.username))));
  const prepared = [] as { id: string; username: string; password: string; hash: string; roles: readonly Role[] }[];
  for (const user of absent) {
    const password = randomBytes(24).toString('base64');
    prepared.push({ ...user, id: randomUUID(), password, hash: await hashPassword(password) });
  }
  return withStorageErrors(() => writeTransaction(db, () => {
    const created: { username: string; password: string }[] = [];
    const insertUser = db.prepare('INSERT INTO users (id, username, password_hash, active) VALUES (?, ?, ?, 1)');
    const insertRole = db.prepare('INSERT INTO user_roles (user_id, role) VALUES (?, ?)');
    for (const user of prepared) {
      // Another seeder may have committed during password preparation. Preserve it.
      if (store.findUserByUsername(user.username)) continue;
      insertUser.run(user.id, user.username, user.hash);
      for (const role of user.roles) insertRole.run(user.id, role);
      created.push({ username: user.username, password: user.password });
    }
    return created;
  }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  let db: SqliteDatabase | undefined;
  try {
    db = withStorageErrors(() => openDatabase(loadConfig().databasePath, { fileMustExist: true }));
    const created = await seedDemoUsers(db);
    if (created.length) {
      console.log('New local demo credentials (shown only on creation; keep private):');
      for (const user of created) console.log(`${user.username}: ${user.password}`);
    } else console.log('No new demo users; existing credentials and roles preserved.');
  } catch {
    console.error('Demo seeding failed; initialize the schema and check local configuration/storage.');
    process.exitCode = 1;
  } finally { db?.close(); }
}
