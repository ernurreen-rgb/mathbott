const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { webURL, apiURL, authSecret, proxySecret, teacherEmail, adminEmail, learnerEmail, otherLearnerEmail } = require('./settings.cjs');

const webRoot = path.resolve(__dirname, '../..');
// Start from OS essentials, rather than forwarding Vercel/database/cloud credentials.
const env = {};
for (const [key, value] of Object.entries(process.env)) {
  if (/^(path|systemroot|windir|temp|tmp|tmpdir|home|userprofile|localappdata|appdata|lang|lc_all)$/i.test(key)) {
    env[key] = value;
  }
}
Object.assign(env, {
  PYTHONUTF8: '1',
  PYTHONUNBUFFERED: '1',
  ENVIRONMENT: 'production',
  INTERNAL_PROXY_SHARED_SECRET: proxySecret,
  ALLOWED_ORIGINS: webURL,
  E2E_TEACHER_EMAIL: teacherEmail,
  E2E_ADMIN_EMAIL: adminEmail,
  E2E_LEARNER_EMAIL: learnerEmail,
  E2E_OTHER_LEARNER_EMAIL: otherLearnerEmail,
  E2E_API_PORT: new URL(apiURL).port,
  NEXTAUTH_URL: webURL,
  NEXTAUTH_SECRET: authSecret,
  GOOGLE_CLIENT_ID: 'local-e2e-unused-client',
  GOOGLE_CLIENT_SECRET: 'local-e2e-unused-secret',
  BACKEND_URL: apiURL,
  NEXT_PUBLIC_API_URL: '/api/backend',
  NEXT_PUBLIC_REALTIME_TRANSPORT: 'polling',
  NEXT_PUBLIC_WS_API_URL: '',
  NEXT_PUBLIC_SENTRY_DSN: '',
  SENTRY_DSN: '',
  SENTRY_AUTH_TOKEN: '',
  NEXT_TELEMETRY_DISABLED: '1',
  CSP_CONNECT_SRC: '',
});

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: 'inherit', windowsHide: true });
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)));
    // Playwright owns the process tree and terminates both servers after the run.
  });
}

async function main() {
  if (process.argv[2] === 'backend') {
    const python = process.env.E2E_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
    process.exitCode = await run(python, [path.join(__dirname, 'backend.py')], path.join(webRoot, '../bot'));
    return;
  }
  if (process.argv[2] !== 'web') throw new Error('Expected backend or web');

  // Next loads .env.local automatically. Build a disposable copy with no local
  // environment files, no existing build and no user data; keep installed deps.
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'mathbot-e2e-web-'));
  const excluded = new Set(['node_modules', '.next', '.vercel', 'output', 'coverage', '.git']);
  fs.cpSync(webRoot, fixture, {
    recursive: true,
    filter: (source) => {
      const name = path.basename(source);
      return source === webRoot || (!excluded.has(name) && !name.startsWith('.env'));
    },
  });
  fs.symlinkSync(path.join(webRoot, 'node_modules'), path.join(fixture, 'node_modules'), 'junction');
  const next = path.join(webRoot, 'node_modules/next/dist/bin/next');
  env.NODE_ENV = 'production';
  const built = await run(process.execPath, [next, 'build'], fixture);
  if (built !== 0) { process.exitCode = built; return; }
  process.exitCode = await run(process.execPath, [next, 'start', '-H', '127.0.0.1', '-p', new URL(webURL).port], fixture);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
