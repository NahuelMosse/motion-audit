import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadPlaywright, versionAtLeast } from '../skills/motion-audit/scripts/lib/playwright.mjs';

const roots = [];
after(() => { for (const r of roots) rmSync(r, { recursive: true, force: true }); });

const fakeProject = (pkgSource, version) => {
  const root = mkdtempSync(join(tmpdir(), 'ma-pw-'));
  roots.push(root);
  const dir = join(root, 'node_modules', 'playwright');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'playwright', version, main: 'index.js' }));
  writeFileSync(join(dir, 'index.js'), pkgSource);
  return root;
};

test('versionAtLeast compares major and minor', () => {
  assert.equal(versionAtLeast('1.43.0'), true);
  assert.equal(versionAtLeast('1.56.1'), true);
  assert.equal(versionAtLeast('1.42.9'), false);
  assert.equal(versionAtLeast('2.0.0'), true);
});

test('PLAYWRIGHT_ROOT wins over the working directory', () => {
  const root = fakeProject('module.exports = { chromium: { marker: "from-env" } };', '1.50.0');
  const found = loadPlaywright({ PLAYWRIGHT_ROOT: root }, process.cwd());
  assert.equal(found.chromium.marker, 'from-env');
  assert.equal(found.version, '1.50.0');
});

test('a Playwright that fails to load reports its own error instead of "not found"', () => {
  const root = fakeProject('throw new Error("boom while loading");', '1.50.0');
  assert.throws(() => loadPlaywright({ PLAYWRIGHT_ROOT: root }, process.cwd()), /boom while loading/);
});

test('a Playwright older than 1.43 is refused with the reason', () => {
  const root = fakeProject('module.exports = { chromium: {} };', '1.40.0');
  assert.throws(() => loadPlaywright({ PLAYWRIGHT_ROOT: root }, process.cwd()), /too old.*1\.43/);
});
