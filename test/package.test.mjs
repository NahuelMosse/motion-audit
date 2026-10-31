import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

test('engines require a Node that can require() ES modules without a flag', () => {
  assert.equal(pkg.engines.node, '>=22.12');
});

test('the workflow uses current checkout and setup-node majors', () => {
  const ci = read('.github', 'workflows', 'ci.yml');
  assert.ok(!/actions\/(checkout|setup-node)@v[1-4]\b/.test(ci));
  assert.match(ci, /actions\/checkout@v5/);
  assert.match(ci, /actions\/setup-node@v5/);
});
