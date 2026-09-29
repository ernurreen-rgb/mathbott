# Repository Guidelines

## Project Structure & Module Organization

- `bot/`: FastAPI backend, started by `main.py`. Keep endpoints in `routes/`, database access in `repositories/`, shared validation in `utils/`, and SQLite migrations in `migrations/versions/`.
- `web/`: Next.js frontend. `app/` holds pages/API routes, `components/` reusable UI, `lib/` clients/helpers, and `types/` TypeScript contracts.
- Tests: `bot/tests/` and frontend `__tests__/` directories. Assets: `web/public/` and root `images/`.
- Deployment/CI: `deploy/`, root Compose files, and `.github/workflows/`. Keep generated artifacts in ignored `tmp/` or `output/`.

## Build, Test, and Development Commands

Use Python 3.11 and Node.js 20, matching CI. Install Python dependencies in a virtual environment.

| Directory | Command | Purpose |
|---|---|---|
| Root | `docker compose up -d --build` | Start the local stack |
| `bot/` | `pip install -r requirements.txt` | Install backend dependencies |
| `bot/` | `python main.py` | Run the API |
| `bot/` | `python -m pytest tests` | Run backend tests |
| `web/` | `npm ci` | Install locked dependencies |
| `web/` | `npm run dev` | Start Turbopack development server |
| `web/` | `npm run build` | Verify production compilation |
| `web/` | `npm run lint` / `npm run typecheck` | Check ESLint and TypeScript |
| `web/` | `npm test -- --runInBand --watchAll=false` | Run frontend tests once |

On PowerShell, use `npm.cmd` if script execution blocks `npm`.

## Coding Style & Naming Conventions

Use four-space Python indentation and snake_case functions/modules. Use two-space TypeScript indentation, PascalCase React components, and camelCase functions. Follow neighboring code; prefer `@/` frontend imports. ESLint enforces zero warnings; CI also checks Python with Flake8. Preserve Kazakh interface text and mathematical notation.

## Testing Guidelines

Use pytest/pytest-asyncio with `test_*.py`; reuse temporary database fixtures. Use Jest and React Testing Library with `*.test.ts` or `*.test.tsx`. Add regression coverage for changed behavior, especially authentication, grading, and persistence. Never test writes against the working database. `npm run test:coverage` produces coverage; no numeric threshold is configured.

## Commit & Pull Request Guidelines

Use concise imperative subjects, as in existing history: `Fix progress persistence`. Conventional Commit prefixes are not required. Keep commits focused. PRs should explain behavior changes, link relevant issues, list validation results, and include UI screenshots. Preserve unrelated working-tree edits.

## Security & Configuration

Keep secrets in ignored `bot/.env.local`, `web/.env.local`, or `.env.production`. Derive user identity from authenticated proxy data. Consult `DEPLOY.md`: former production targets are reference material, not active deployment destinations.
