import { after, before } from 'node:test';
import { sharded as test } from './helpers/shard.mjs';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FIXTURES, removeScratch, runCli } from './helpers/cli.mjs';
import { serve } from './helpers/serve.mjs';

let srv;
const scratch = mkdtempSync(join(tmpdir(), 'ma-redirect-'));

before(async () => {
  srv = await serve(FIXTURES, {
    hooks: {
      '/to-shadcn': (req, res) => { res.writeHead(302, { location: '/shadcn.html' }); res.end(); },
    },
  });
});
after(async () => {
  await srv.close();
  rmSync(scratch, { recursive: true, force: true, maxRetries: 5 });
  removeScratch();
});

const run = (path, ...args) => runCli([`${srv.url}${path}`, ...args, '--json', '--out', join(scratch, `out-${Math.random().toString(36).slice(2)}`)]);

test('a script that replaces the location with the login page after load is not audited', async () => {
  const r = await run('/redirect-client.html');
  assert.equal(r.code, 2);
  assert.match(r.stderr, /redirected to .*\/login.*login page/);
  assert.equal(r.report, null);
});

test('a single-page app that rewrites the URL to the login route with replaceState is not audited', async () => {
  const r = await run('/redirect-replace.html');
  assert.equal(r.code, 2);
  assert.match(r.stderr, /redirected to .*\/login.*login page/);
});

test('a server redirect to another page exits 2 unless --allow-redirect is given, and then it is noted', async () => {
  const refused = await run('/to-shadcn');
  assert.equal(refused.code, 2);
  assert.match(refused.stderr, /redirected to .*\/shadcn\.html.*--allow-redirect/);
  const allowed = await run('/to-shadcn', '--allow-redirect');
  assert.equal(allowed.report.coverage.audited, 3);
  assert.equal(allowed.report.finalUrl, `${srv.url}/shadcn.html`);
  assert.ok(allowed.report.notes.some((n) => /redirected to .*shadcn\.html/.test(n)));
});

test('a login redirect stays an error even with --allow-redirect', async () => {
  const r = await run('/redirect-client.html', '--allow-redirect');
  assert.equal(r.code, 2);
  assert.match(r.stderr, /login page/);
});

test('a URL with a hash is the same page: no redirect', async () => {
  const r = await run('/shadcn.html#docs');
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.report.coverage.audited, 3);
  assert.deepEqual(r.report.notes.filter((n) => /redirect/.test(n)), []);
});
