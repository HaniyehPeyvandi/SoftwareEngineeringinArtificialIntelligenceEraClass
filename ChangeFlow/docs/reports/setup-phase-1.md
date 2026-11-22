# Phase 1 Setup implementation report

Date: 2026-11-22. Scope: T001–T004 only, under `speckit-implement`.
Host verified: Windows `win32 x64`, Node.js `v22.23.4`, npm `10.9.9`.

## Files

Created: `package.json`, `package-lock.json`, `tsconfig.json`, `tsconfig.build.json`,
`vitest.config.ts`, `.gitignore`, `.env.example`, and this report.
Updated: `specs/001-change-request-workflow/tasks.md` (setup status and four completion markers).
Generated locally: ignored `node_modules/` (144 installed packages).

The main TypeScript configuration checks future application, script, and test sources plus
Vitest configuration using strict NodeNext ESM settings. The small extending build configuration
limits emitted output to application and database scripts, excluding tests and tool configuration.
All required scripts are declared; their future source entry points are intentionally absent.

Vitest uses isolated Node fork workers, explicit imports, non-watch execution, and
`tests/**/*.test.ts` discovery. It clears inherited `DATABASE_PATH` to prevent selecting the demo
database. T009 must still implement independent temporary-file fixtures and explicit app config;
setup alone does not prove database isolation during application tests.

`.env.example` contains local address/path defaults and an empty signing-secret value.
No credentials, passwords, JWT signing key, database file, or schema were generated.

## Installed versions

Direct versions are pinned exactly and recorded in the lockfile, verified with `npm ls --depth=0`.

| Dependency | Installed version |
| --- | --- |
| express | 5.3.0 |
| better-sqlite3 | 13.2.0 |
| jose | 6.2.18 |
| typescript | 7.0.2 |
| tsx | 4.23.15 |
| vitest | 5.1.1 |
| supertest | 7.3.2 |
| @types/node | 22.20.5 |
| @types/express | 5.0.6 |
| @types/better-sqlite3 | 9.6.0 |
| @types/supertest | 7.2.1 |

The resolved runner tree includes Vite 8.3.8, Rolldown 1.2.19 with its Windows x64 MSVC binding,
esbuild 0.28.2 with its Windows x64 binary, and TypeScript's Windows x64 7.0.2 binary.
Installation with `--engine-strict` accepted the installed dependency engine requirements.

## Commands and observed results

| Command | Actual result |
| --- | --- |
| `.specify/scripts/powershell/check-prerequisites.ps1 -Json -RequireTasks -IncludeTasks` | Feature documents found; requirements checklist separately inspected: 17 checked, zero unchecked. |
| `node --version` | `v22.23.4` |
| `npm --version` | `10.9.9` |
| `node -p "process.platform + ' ' + process.arch"` | `win32 x64` |
| `npm config get offline` / `npm config get registry` / `npm config get proxy` / `npm config get https-proxy` | Offline enabled; corporate Nexus registry configured; both proxy values null. Global configuration was not changed. |
| `npm install --offline=false --engine-strict --no-fund --fetch-retries=0 --fetch-timeout=30000` | Exit 0; added 144 packages; generated lockfile. Ran with approved sandbox escalation. |
| `npm ls --depth=0` | Exit 0; exact direct versions shown above. |
| `npm ls vite rolldown @rolldown/binding-win32-x64-msvc @typescript/typescript-win32-x64 @esbuild/win32-x64` | Exit 0; resolved Windows helper tree present. |
| `npm run typecheck` | Exit 0; checks the current Vitest configuration and dependency declarations. No application source exists to check. Also passed on the escalated retry. |
| `npm exec --no -- vitest list --passWithNoTests` | Exit 0, empty discovery output; configuration discovery only, zero application tests executed. Also passed on the escalated retry. |
| `npm exec --no -- tsc --version` | `Version 7.0.2` |
| `npm exec --no -- vitest --version` | `vitest/5.1.1 win32-x64 node-v22.23.4` |
| `npm exec --no -- tsx --version` | `tsx v4.23.15`, `node v22.23.4` |

Native-addon smoke command (exit 0):

```powershell
node --input-type=module -e "import assert from 'node:assert/strict'; import Database from 'better-sqlite3'; const db = new Database(':memory:'); try { const row = db.prepare('SELECT sqlite_version() AS sqliteVersion, 1 + 1 AS result').get(); assert.equal(row.result, 2); console.log(JSON.stringify({node: process.version, platform: process.platform, arch: process.arch, ...row})); } finally { db.close(); }"
```

Observed: `sqliteVersion` was `3.54.1`, `result` was `2`, on `win32 x64` / `v22.23.4`.
This verifies native load, database open/query/close on this host using an ephemeral in-memory
connection. No local compilation was needed or tested; this is not application persistence evidence.

Explicit configuration-import command (passed on the escalated retry):

```powershell
node --import tsx --input-type=module -e "import assert from 'node:assert/strict'; import config from './vitest.config.ts'; const test = config.test; assert.equal(test.environment, 'node'); assert.equal(test.pool, 'forks'); assert.equal(test.isolate, true); assert.equal(test.watch, false); assert.equal(test.passWithNoTests, false); assert.equal(test.env.DATABASE_PATH, ''); console.log('Vitest configuration loads through tsx; Node isolation, non-watch mode and demo database guard verified.');"
```

Additional read-only Node assertions passed for manifest/lock version equality, private ESM package
settings, strict NodeNext compilation, the empty example secret, essential ignore entries, and the
absence of `src/`, `scripts/`, `tests/`, `dist/`, `data/`, and `.env`.
No Git repository exists, so `.gitignore` entries were inspected directly rather than claiming a
successful `git check-ignore` check. No extension-hook configuration exists.

## Failures, recovery, and limits

- Initial `npm view <package> version engines --json` lookups failed with `ENOTCACHED` because
  offline-only mode had no cached responses; the sandbox also denied npm log-directory writes.
- Public-registry retries with `--offline=false --registry=https://registry.npmjs.org` failed
  with `ECONNRESET` (socket hang up). A shorter retry added
  `--fetch-retries=0 --fetch-timeout=15000` and failed the same way.
- Corporate-registry `npm view <package> version engines --json --offline=false --fetch-retries=0
  --fetch-timeout=15000` calls succeeded for Express, better-sqlite3, jose, TypeScript, Vitest,
  Supertest, tsx, `@types/node@22`, `@types/express@5`, `@types/better-sqlite3`, and
  `@types/supertest`. Public npm metadata was also consulted as documentation; local installation
  and the lockfile are the evidence of actual resolved versions.
- The first sandboxed `tsx` configuration import failed with `spawn EPERM` in esbuild. The
  same command succeeded after approved escalation. The initial combined version-check command
  eventually exited 0 because subsequent version checks passed; that exit does not erase the
  earlier import failure. Sandboxed process inspection through `Get-CimInstance` was denied;
  approved read-only inspection found no remaining public-registry lookup process.
- The lockfile records the configured corporate registry's download URLs; another machine needs
  access to that registry or an explicitly reviewed registry/lockfile portability change.
- No unresolved Phase 1 blocker remains. Native compatibility is verified only for this Windows
  x64 / Node 22 host. JWT behavior, HTTP integration, real concurrent workers, and application
  persistence remain unverified and belong to later tasks.
- `npm run build`, `npm test`, `npm run dev`, `npm run db:init`, and `npm run db:seed` were
  deliberately not run: their application sources/tests do not exist. Empty discovery is not a
  passing test suite; the committed runner still fails an empty normal test run.

T001–T004 are complete. T005–T057 remain unchecked. Functional requirements, constitution,
planning decisions, API contracts, and previous analysis reports are unchanged.
