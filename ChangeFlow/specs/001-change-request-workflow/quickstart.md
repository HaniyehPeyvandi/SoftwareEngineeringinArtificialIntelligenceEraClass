# ChangeFlow local quickstart

Run these commands from the project root in PowerShell. The application, package scripts and
tests are implemented. [validation.md](validation.md) records actual execution, failed attempts,
platform limits and the final audit; this guide provides the reproducible local workflow.

## Prerequisites and setup

- Windows x64 with Node.js v22.23.4 and npm 10.9.9. The package requires Node >=22.23.4 <23
  and npm >=10.9.9 <11. Verify native compatibility separately on any other platform.
- Local disk writable for a SQLite file; use a temporary path for tests. No external database.
- A cryptographically random JWT secret containing at least 32 bytes after base64 decoding.
  Supply JWT_SECRET_BASE64, DATABASE_PATH, HOST=127.0.0.1, and PORT=3000 through environment
  variables. Never commit the secret or generated demo passwords.

From the project root:

```text
npm ci --ignore-scripts --engine-strict --no-fund --offline=false --fetch-retries=0 --fetch-timeout=30000
npm rebuild esbuild --offline=false --fetch-retries=0 --fetch-timeout=30000
npm run typecheck
npm run build
npm test -- --maxWorkers=2
```

The locked better-sqlite3 13.2.0 package bundles a Windows x64 native binary and declares
gypfile:false. npm 10's clean-install metadata can miss that setting and infer an unnecessary
node-gyp build. The explicit install above avoids that inference, then runs esbuild's required
postinstall. The Windows dependency tree has no other required lifecycle script; fsevents is
optional for macOS. Ignoring scripts alone does not prove compatibility: the native smoke,
typecheck/build and full tests must pass. No TLS verification is disabled.

The lockfile references the assessment environment's artifact registry; a fresh machine needs
access to those URLs. Public-registry installation is not claimed. For EBUSY, close processes
using dependencies or use a fresh directory; do not force-delete unknown files or kill unrelated
processes. For another platform requiring source compilation, satisfy node-gyp's reported
compiler/header and certificate-trust requirements. See the actual clean-install directory and
all failed attempts in validation.md.

Configure a new isolated demo file without replacing existing local data. Use a private terminal:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
$demoDirectory = Join-Path ([IO.Path]::GetTempPath()) ('changeflow-demo-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $demoDirectory | Out-Null
$env:DATABASE_PATH = Join-Path $demoDirectory 'demo.sqlite'
$env:HOST = '127.0.0.1'
$env:PORT = '3000'
$env:JWT_SECRET_BASE64 = node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64'))"
npm run db:init
npm run db:seed
node --input-type=module -e "import Database from 'better-sqlite3'; const db = new Database(':memory:'); console.log(db.prepare('SELECT sqlite_version() AS version').get()); db.close();"
node --env-file-if-exists=.env dist/src/server.js
# Alternatively, for source watch mode: npm run dev
```

The secret is captured, not printed. Never share it or redirect generated passwords to reports.
All database/dev scripts load .env if present; explicit environment values take precedence.
A canonical base64 secret decoding to at least 32 random bytes is required even for database
commands. Defaults are HOST=127.0.0.1, PORT=3000 and DATABASE_PATH=./data/changeflow.sqlite.
There is no npm start script. Startup never initializes/seeds implicitly. Stop with Ctrl+C.
The in-memory smoke verifies native loading only, not workflow persistence.

db:init applies schema initialization without deleting data. db:seed creates absent demo users:
requester-a/requester-b, reviewer-a/reviewer-b and dual-role. Generated passwords are shown once;
save them privately. Reruns preserve passwords, hashes, active state, roles and requests. Tests
use independent temporary databases regardless of the demo DATABASE_PATH. Keep retained demo
files private; close every connection before removing a directory created for this demonstration.

## Manual HTTP journey

Use any HTTP client with JSON bodies and Authorization: Bearer tokens. The exact envelopes and
permissions are in [contracts/README.md](contracts/README.md) and
[openapi.json](contracts/openapi.json); do not invent additional endpoints.

In a second terminal, a private login and create can be performed without printing a password
or token (substitute the generated requester-a password at the secure prompt):

```powershell
$base = 'http://127.0.0.1:3000/api'
$password = Read-Host 'requester-a password' -AsSecureString
$loginBody = @{ username='requester-a'; password=[Net.NetworkCredential]::new('', $password).Password } | ConvertTo-Json
$token = (Invoke-RestMethod -Method Post -Uri "$base/auth/login" -ContentType 'application/json' -Body $loginBody).accessToken
$headers = @{ Authorization = 'Bearer ' + $token }
$proposal = @{ title='Controlled rollout'; description='Deploy in stages.'; reason='Improve reliability.' }
$request = Invoke-RestMethod -Method Post -Uri "$base/change-requests" -Headers $headers -ContentType 'application/json' -Body ($proposal | ConvertTo-Json)
```

Login independent Reviewers and dual-role separately in the same way; keep each token in a
different variable. All nine operations are listed in the [README](../../README.md#api).

1. Login as a generated Requester through POST /api/auth/login; expect 200 and a 900-second token.
2. POST /api/change-requests with valid title, description, and reason. Expect 201 Draft,
   server-owned requesterId, version=1, reviewerComment=null, and Location pointing to its ID.
3. PUT the owned request with all three editable fields and version=1. Expect 200, retained Draft,
   and version=2. Save a stale copy of version=1 for the next step.
4. Retry a different PUT with version=1. Expect 409 VERSION_CONFLICT. Owner GET must still show
   the winning version=2; independently inspect SQLite as described below to verify persistence.
5. Submit with version=2. Expect PendingReview/version=3. Login as an independent Reviewer and
   retrieve the pending list. The owner's Drafts must never appear there.
6. RequestChanges with version=3 and a non-whitespace comment. Expect ChangesRequested/version=4.
   Owner reads the same comment, edits (version=5), and resubmits (version=6); comment is retained.
7. Independently approve with version=6. Expect Approved/version=7 and retained latest comment.
   Owner GET remains allowed; Reviewer-only GET of the Approved request is 403.
8. Owner attempts a valid content edit with version=7. Expect 409 INVALID_STATUS and no changes.
9. On a separate dual-role user's own PendingReview request, attempt Approve and RequestChanges.
   Both must return 403 even with correct Version and a valid return comment.

Submit/Approve bodies contain only version. Edit contains all three proposal fields plus version;
RequestChanges contains only version/comment. For example, Submit after the preceding edit uses
`@{ version=$request.version } | ConvertTo-Json` as the body of POST
`$base/change-requests/$($request.id)/submit`. Expected rejections raise PowerShell HTTP errors;
inspect their status and JSON code, then compare SQLite. Do not automatically replay after 409.
The latest comment survives edits/resubmission/approval and is replaced only on a later return.
Required text maxima are title 200, description 5000, reason/comment 2000 Unicode code points
after surrounding ECMAScript trim. Original valid text is preserved, without normalization or
truncation; the JSON envelope limit is separately 128 KiB.

## Required automated evidence

Run the six separately named AT-01 through AT-06 integration tests and required supplementary
groups from [test-design.md](test-design.md). Each critical test must assert HTTP status/body AND
read actual SQLite state through a separate connection. An HTTP GET alone is not database evidence.
Confirm comment retention/replacement, denied reads, role revocation using an existing token,
exact-max/max+1 text, padded input, astral/combining Unicode, and no silent truncation.

For manual inspection, use a SQLite viewer/CLI if installed, or the independent better-sqlite3
inspection connection used by the integration suite. Inspect change_requests for id, title,
description, reason, requester_id, status, reviewer_comment, and version after each critical step.
Compare rejected operations against before snapshots and check row counts. Reopen the database
to verify persistence across connection closure. Never include passwords, hashes, or JWT secrets
in saved evidence.

For request-only inspection, set DATABASE_PATH in another terminal to the same private demo
file while the server runs. Close the inspection connection afterward:

```powershell
node --env-file-if-exists=.env --input-type=module -e "import Database from 'better-sqlite3'; const db = new Database(process.env.DATABASE_PATH, {readonly:true,fileMustExist:true}); console.log(db.prepare('SELECT id,title,description,reason,requester_id,status,version,reviewer_comment FROM change_requests ORDER BY id').all()); db.close();"
```

True race tests use separate workers/connections and barriers, not only simultaneous promises.
Run the SC-004 20-repetition cases and inspect both outcomes and final row. Test lock timeout as
503 separately from stale-Version 409. Optional injected persistence failure must roll back fully.

## Role freshness demonstration and shutdown

Using a local database maintenance connection or controlled test fixture, delete a user's required
role and commit. Reuse their previously issued token: subsequent protected operations requiring
that role must return 403 with no changes. Setting active=0 must give 401. Do not add a role-editing
HTTP endpoint. Never modify demo roles implicitly on seed reruns.

Stop the server normally; close its SQLite connection. Reopen with the same DATABASE_PATH and
confirm saved requests remain. Only remove files explicitly created by a test fixture after all
workers/connections close; never point destructive test cleanup at the demo database.

Record the command, exit status, observed response/database comparisons, and limitations of every
check actually run. No expected result in this guide is a claim that validation has passed.

The final validation includes the real local TCP journey and an explicit SV-06 disposition.
Fourteen distinct qualified database columns and fifteen constrained OpenAPI text/Version
property occurrences count different sets; neither is a test count. See the final audit for
their enumeration. Limitations include trusted local HTTP/maintenance, no production scale,
backups, TLS deployment, credential-abuse controls or full audit history; see the README.
