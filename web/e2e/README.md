# Local browser E2E

These tests run the real production Next.js build, its signed backend proxy and
FastAPI with production authentication/CSRF settings. Chromium runs each scenario
at desktop and Pixel 7 sizes. All URLs are fixed loopback addresses; remote base
URLs and production database credentials are not accepted.

From the repository root, install Python dependencies into a virtualenv:

```sh
python -m venv .venv
# Windows: .venv\Scripts\python -m pip install -r bot/requirements.txt
.venv/bin/python -m pip install -r bot/requirements.txt
```

Then, using Node 24, from `web/`:

```sh
npm ci
npx playwright install chromium
# Linux CI: npx playwright install --with-deps chromium
# Set E2E_PYTHON to the virtualenv Python executable if it is not on PATH.
npm run test:e2e
```

PowerShell example when running from `web/`:

```powershell
$env:E2E_PYTHON = (Resolve-Path ..\.venv\Scripts\python.exe).Path
npm run test:e2e
```

Ports **3100** (web) and **8100** (API) must be free. Existing servers are never
reused. Playwright starts and stops both process trees. The backend creates a new
temporary SQLite database with a synthetic teacher, admin and two learner accounts.
Teachers/learners remain non-admin. Each test creates its own private quiz/session
or trial test through the normal authenticated proxy (trial creation uses the
separate admin). No production DB,
OAuth, email, S3 or monitoring credentials are forwarded to those processes.

Next.js builds a disposable source copy in the OS temporary directory, excluding
`.env*`, existing builds and Vercel metadata, and links installed `node_modules`.
This keeps normal development builds and local environment files untouched.
Temporary source/build copies can remain after a run, especially after a forced
shutdown; they contain only source and test configuration. The backend database
is disposable too, and may remain in the OS temp directory after forced Windows
process termination. No reset/seed HTTP endpoint is added to the application.

Account cookies are normally encrypted NextAuth JWTs signed only with the
local fixture secret. It verifies authenticated proxy behavior; it does **not**
test the real Google OAuth exchange. Guests join/answer through the UI; learners
edit/submit trial answers through the UI, including actual MathLive keyboard input.

Coverage: invalid PIN/nickname; private source visibility; PIN → lobby → start;
correct/incorrect answers; reload persistence; final score/accuracy and review;
interrupted answer retry; lost-acknowledgement recovery and idempotent answer replay.
The network failure is injected
only into the browser transport; successful requests use the real backend.

Trial draft coverage adds four scenarios at both sizes (16 browser tests total):

- Autosave of choice/MathLive answers and current task index; restoration after
  reload; separate account drafts even when query/body email names another user.
- Final saves on Next Link SPA departure and actual tab close, then reopening.
  Playwright's clock pauses the debounce timer before editing, so a periodic
  autosave cannot accidentally make the departure test pass.
- Failed initial draft GET keeps saved answers intact, including during cleanup;
  normal reload restores them after the transport recovers.
- Lost submit acknowledgement recovers the committed attempt, replaying the same
  attempt does not create a second result, the server draft stays cleared, and a
  retake opens with no old answers.

These tests exercise real proxy/database operations. Only time and selected
browser transport failures are controlled; API success payloads are not mocked.

Reports, failure screenshots and traces: `web/output/playwright/` (gitignored).
Open the HTML report with `npx playwright show-report output/playwright/report`.
No real staging service is provisioned by this suite. It is an isolated local/CI
release check; real staging OAuth remains separate. PostgreSQL backup/restore
verification is documented in the [restore runbook](../../deploy/POSTGRES_BACKUP_RESTORE.md).

The runner is imported from the public `playwright/test` export of the direct
**dev** dependency `playwright`. Avoid adding the `@playwright/test` wrapper to
the web root: Next declares it as an optional runtime peer, which makes npm retain
the wrapper and its browser tooling even with `npm ci --omit=dev`. The public
entry point provides the same runner without satisfying that runtime peer.

Runner configuration follows Playwright's [web server](https://playwright.dev/docs/test-webserver)
and [configuration](https://playwright.dev/docs/test-configuration) documentation.
The lifecycle scenario uses the documented [clock controls](https://playwright.dev/docs/clock).
