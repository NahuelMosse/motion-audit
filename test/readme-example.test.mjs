import { after, before } from 'node:test';
import { sharded as test } from './helpers/shard.mjs';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FIXTURES, ROOT, runNode } from './helpers/cli.mjs';
import { serve } from './helpers/serve.mjs';

// The CI example of the README, run the way a consumer runs it: the package installed under
// node_modules, one .ts and one .mjs spec, `npx playwright test`.
const example = /## CI[\s\S]*?```js\n([\s\S]*?)```/.exec(readFileSync(join(ROOT, 'README.md'), 'utf8'))[1];

let srv;
let consumer;
before(async () => {
  srv = await serve(FIXTURES, {
    hooks: { '/orders': (req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(readFileSync(join(FIXTURES, 'good.html'))); } },
  });
  mkdirSync(join(ROOT, 'test-results'), { recursive: true });
  consumer = mkdtempSync(join(ROOT, 'test-results', 'consumer-'));
  // What `npm i` leaves under node_modules: the package files, copied (not linked, so the loader
  // treats them as installed code).
  const installed = join(consumer, 'node_modules', 'motion-audit');
  mkdirSync(installed, { recursive: true });
  cpSync(join(ROOT, 'skills'), join(installed, 'skills'), { recursive: true, filter: (src) => !src.includes('fixtures') });
  cpSync(join(ROOT, 'package.json'), join(installed, 'package.json'));
  writeFileSync(join(consumer, 'package.json'), JSON.stringify({ name: 'consumer', private: true }));
  writeFileSync(join(consumer, 'playwright.config.mjs'), `export default { testDir: '.', testMatch: /motion\\.spec\\.(ts|mjs)$/, reporter: 'line', workers: 1, use: { baseURL: process.env.APP_URL } };\n`);
  writeFileSync(join(consumer, 'motion.spec.mjs'), example);
  writeFileSync(join(consumer, 'motion.spec.ts'), example);
});
after(async () => {
  await srv.close();
  rmSync(consumer, { recursive: true, force: true, maxRetries: 5 });
});

test('the README CI example passes end to end from a consumer project, as .ts and as .mjs', async () => {
  const started = Date.now();
  const r = await runNode([join(ROOT, 'node_modules', '@playwright', 'test', 'cli.js'), 'test', '--config', join(consumer, 'playwright.config.mjs')], { cwd: consumer, env: { APP_URL: srv.url }, timeoutMs: 420000 });
  assert.equal(r.code, 0, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /2 passed/);
  assert.ok(Date.now() - started < 400000);
});
