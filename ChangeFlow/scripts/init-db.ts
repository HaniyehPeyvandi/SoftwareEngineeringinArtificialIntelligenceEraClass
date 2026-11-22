import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfig } from '../src/config.js';
import { initializeSchema, openDatabase } from '../src/persistence/database.js';
import { withStorageErrors } from '../src/persistence/store.js';

export function initializeDatabaseFile(databasePath: string): void {
  withStorageErrors(() => {
    mkdirSync(dirname(databasePath), { recursive: true });
    const db = openDatabase(databasePath);
    try { initializeSchema(db); } finally { db.close(); }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    initializeDatabaseFile(loadConfig().databasePath);
    console.log('Database schema initialized.');
  } catch {
    console.error('Database initialization failed; check local configuration and storage.');
    process.exitCode = 1;
  }
}
