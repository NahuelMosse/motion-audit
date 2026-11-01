import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './helpers/cli.mjs';

const read = (...p) => readFileSync(join(ROOT, ...p), 'utf8');
const pkg = JSON.parse(read('package.json'));

test('the Playwright dev dependency is a caret range and the lockfile is past 1.43.x, whose browser dependencies miss current Ubuntu', () => {
  assert.match(pkg.devDependencies.playwright, /^\^1\.\d+/);
  const lock = JSON.parse(read('package-lock.json'));
  const [major, minor] = lock.packages['node_modules/playwright'].version.split('.').map(Number);
  assert.ok(major > 1 || minor > 43, `locked playwright ${lock.packages['node_modules/playwright'].version}`);
});

test('the Playwright peer range starts at the minimum the code enforces (1.59: addInitScript returns a Disposable)', async () => {
  const { MIN_PLAYWRIGHT } = await import('../skills/motion-audit/scripts/lib/constants.mjs');
  assert.equal(pkg.peerDependencies.playwright, `>=${MIN_PLAYWRIGHT.join('.')}`);
  assert.deepEqual(MIN_PLAYWRIGHT, [1, 59]);
});

test('every test file is in exactly one of test:unit and test:browser, so no CI job silently drops it', () => {
  const files = readdirSync(join(ROOT, 'test')).filter((f) => f.endsWith('.test.mjs')).map((f) => `test/${f}`).sort();
  const listed = (script) => pkg.scripts[script].split(' ').filter((x) => x.endsWith('.test.mjs')).sort();
  assert.deepEqual([...listed('test:unit'), ...listed('test:browser')].sort(), files);
});

test('engines require a Node that can require() ES modules without a flag', () => {
  assert.equal(pkg.engines.node, '>=22.12');
});

test('the workflow uses current checkout and setup-node majors', () => {
  const ci = read('.github', 'workflows', 'ci.yml');
  assert.ok(!/actions\/(checkout|setup-node)@v[1-4]\b/.test(ci));
  assert.match(ci, /actions\/checkout@v5/);
  assert.match(ci, /actions\/setup-node@v5/);
});

// A stray file at the root (a mis-quoted shell command can create one) must not be committed.
test('the tracked files at the repository root are exactly the expected ones', () => {
  let tracked;
  try { tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean); } catch { return; } // not a git checkout
  const root = tracked.filter((f) => !f.includes('/')).sort();
  assert.deepEqual(root, ['.gitattributes', '.gitignore', 'CHANGELOG.md', 'LICENSE', 'NOTICES.md', 'README.md', 'package-lock.json', 'package.json']);
});
