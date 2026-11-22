import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import type { Config } from './config.js';
import { openDatabase } from './persistence/database.js';
import { withStorageErrors } from './persistence/store.js';

export async function startServer(config: Config) {
  const db = withStorageErrors(() => openDatabase(config.databasePath, { fileMustExist: true }));
  try {
    // No implicit schema initialization or seeding on startup.
    const app = createApp(config, db);
    const server = app.listen(config.port, config.host);
    await new Promise<void>((accept, reject) => {
      server.once('listening', accept);
      server.once('error', reject);
    });
    let closing: Promise<void> | undefined;
    const close = () => closing ??= new Promise<void>((accept, reject) => {
      server.close(error => {
        try { db.close(); } catch (storageError) { reject(storageError); return; }
        if (error) reject(error);
        else accept();
      });
      server.closeIdleConnections();
    });
    return { server, db, close };
  } catch (error) {
    if (db.open) db.close();
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const running = await startServer(loadConfig());
    const stop = () => { void running.close().catch(() => {
      console.error('Server shutdown failed.'); process.exitCode = 1;
    }); };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    console.log('ChangeFlow authentication foundation listening on the configured local address.');
  } catch {
    console.error('Server startup failed; check configuration, initialized schema, and local storage.');
    process.exitCode = 1;
  }
}
