const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');
const { test } = require('node:test');

const from = (parent, dependency) => createRequire(require.resolve(parent))(dependency);

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mathbot-dependency-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const write = (file, content = '') => {
    const target = path.join(dir, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  };
  write('src/plain.js', 'debugger;');
  write('src/nested/example.spec.js', 'console.log(1);');
  write('src/ignored/skip.js', 'debugger;');
  return { dir, write };
}

test('legacy callable matcher preserves path, dotfile, brace and native Windows glob matching', () => {
  const match = from('eslint', 'minimatch');
  assert.equal(typeof match, 'function');
  assert.equal(match('src/a.tsx', 'src/**/*.{ts,tsx}'), true);
  assert.equal(match('src/a.css', 'src/**/*.{ts,tsx}'), false);
  assert.equal(match('src/.hidden.js', '**/*.js'), false);
  assert.equal(match.defaults({ dot: true })('src/.hidden.js', '**/*.js'), true);
  const absolute = path.resolve('src', 'nested', 'a.js').split(path.sep).join('/');
  assert.equal(new match.Minimatch(path.resolve('src', '**', '*.js')).match(absolute), true);
  assert.equal(new match.Minimatch('src/**/*.js').match('other/a.js'), false);
});

test('ESLint glob enumeration, ignores and file-specific overrides still report violations', async (t) => {
  const { dir } = fixture(t);
  const { ESLint } = require('eslint');
  const eslint = new ESLint({
    cwd: dir,
    useEslintrc: false,
    overrideConfig: {
      parserOptions: { ecmaVersion: 2022 },
      ignorePatterns: ['src/ignored/**'],
      rules: { 'no-debugger': 'error' },
      overrides: [{ files: ['**/*.spec.js'], rules: { 'no-console': 'error' } }],
    },
  });
  const results = await eslint.lintFiles([path.join('src', '**', '*.js')]);
  assert.equal(results.length, 2);
  assert.deepEqual(results.flatMap((r) => r.messages.map((m) => m.ruleId)).sort(), ['no-console', 'no-debugger']);
});

test('import rule matcher predicates permit public imports and reject private paths', () => {
  const { Linter } = require('eslint');
  const linter = new Linter();
  linter.defineRule('import/no-internal-modules', require('eslint-plugin-import').rules['no-internal-modules']);
  const config = {
    parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
    rules: { 'import/no-internal-modules': ['error', { forbid: ['blocked/**'] }] },
  };
  assert.equal(linter.verify("import x from 'public/api';", config).length, 0);
  const messages = linter.verify("import x from 'blocked/private';", config);
  assert.deepEqual(messages.map((m) => m.ruleId), ['import/no-internal-modules']);
});

test('React rule callable matcher still honors allowed component patterns', () => {
  const { Linter } = require('eslint');
  const linter = new Linter();
  linter.defineRule('react/forbid-component-props', require('eslint-plugin-react').rules['forbid-component-props']);
  const config = {
    parserOptions: { ecmaVersion: 2022, sourceType: 'module', ecmaFeatures: { jsx: true } },
    rules: { 'react/forbid-component-props': ['error', { forbid: [{ propName: 'secret', allowedForPatterns: ['Safe*'] }] }] },
  };
  assert.equal(linter.verify('const x = <SafeBox secret="ok" />;', config).length, 0);
  assert.deepEqual(linter.verify('const x = <OtherBox secret="no" />;', config).map((m) => m.ruleId), ['react/forbid-component-props']);
});

test('flat-cache deletion uses the scoped rimraf synchronous API', (t) => {
  const { dir } = fixture(t);
  const flatCache = from('file-entry-cache', 'flat-cache');
  const cache = flatCache.load('lint-cache', dir);
  cache.setKey('example', 'value');
  cache.save();
  assert.equal(fs.existsSync(path.join(dir, 'lint-cache')), true);
  cache.destroy();
  assert.equal(fs.existsSync(path.join(dir, 'lint-cache')), false);
  assert.equal(fs.existsSync(path.join(dir, 'src', 'plain.js')), true);
});

test('coverage traversal and modern glob retain sync/async selection and cancellation', async (t) => {
  const { dir } = fixture(t);
  const TestExclude = require('test-exclude');
  const exclude = new TestExclude({ cwd: dir, include: ['src/**/*.js'], exclude: ['**/ignored/**'], extension: ['.js'] });
  const expected = ['src/nested/example.spec.js', 'src/plain.js'];
  const normalized = (files) => files.map((f) => f.split(path.sep).join('/')).sort();
  assert.deepEqual(normalized(exclude.globSync()), expected);
  assert.deepEqual(normalized(await exclude.glob()), expected);
  const glob = from('test-exclude', 'glob');
  await assert.rejects(glob.glob('**/*', { cwd: dir, signal: AbortSignal.abort() }), { name: 'AbortError' });
});
