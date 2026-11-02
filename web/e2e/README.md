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
temporary SQLite database with a synthetic teacher. Each test creates its own
private quiz/session through the normal authenticated proxy. No production DB,
OAuth, email, S3 or monitoring credentials are forwarded to those processes.

Next.js builds a disposable source copy in the OS temporary directory, excluding
`.env*`, existing builds and Vercel metadata, and links installed `node_modules`.
This keeps normal development builds and local environment files untouched.
Temporary source/build copies can remain after a run, especially after a forced
shutdown; they contain only source and test configuration. The backend database
is disposable too, and may remain in the OS temp directory after forced Windows
process termination. No reset/seed HTTP endpoint is added to the application.

The teacher cookie is a normally encrypted NextAuth JWT signed only with the
local fixture secret. It verifies authenticated proxy behavior; it does **not**
test the real Google OAuth exchange. Guests join and answer through the UI.

Coverage: invalid PIN/nickname; private source visibility; PIN → lobby → start;
correct/incorrect answers; reload persistence; final score/accuracy and review;
interrupted answer retry; lost-acknowledgement recovery and idempotent answer replay.
The network failure is injected
only into the browser transport; successful requests use the real backend.

Reports, failure screenshots and traces: `web/output/playwright/` (gitignored).
Open the HTML report with `npx playwright show-report output/playwright/report`.
No real staging service is provisioned by this suite. It is an isolated local/CI
release check; staging OAuth and a PostgreSQL backup restore drill remain separate.

Runner configuration follows Playwright's [web server](https://playwright.dev/docs/test-webserver)
and [configuration](https://playwright.dev/docs/test-configuration) documentation.
