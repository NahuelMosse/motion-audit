import { after, before } from 'node:test';
import { sharded as test } from './helpers/shard.mjs';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FIXTURES, ROOT, removeScratch, runCli } from './helpers/cli.mjs';
import { serve } from './helpers/serve.mjs';

let srv;
const scratch = mkdtempSync(join(tmpdir(), 'ma-cli-'));

before(async () => {
  srv = await serve(FIXTURES, {
    hooks: {
      '/account.html': (req, res) => {
        if (!/session=1/.test(req.headers.cookie ?? '')) { res.writeHead(302, { location: '/login' }); return res.end(); }
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end(readFileSync(join(FIXTURES, 'account.html')));
      },
    },
  });
});
after(async () => {
  await srv.close();
  rmSync(scratch, { recursive: true, force: true, maxRetries: 5 });
  removeScratch();
});

const run = (fixture, ...args) => runCli([`${srv.url}/${fixture}`, ...args, '--json', '--out', join(scratch, `out-${Math.random().toString(36).slice(2)}`)]);

test('--help prints the usage and exits 0; unknown options and invalid numbers exit 2', async () => {
  const help = await runCli(['--help']);
  assert.equal(help.code, 0);
  assert.match(help.stdout, /Exit: 0 clean, 1 findings, 2 could not run/);
  const unknown = await runCli(['x.html', '--bogus']);
  assert.equal(unknown.code, 2);
  assert.match(unknown.stderr, /unknown option --bogus/);
  assert.equal((await runCli(['x.html', '--max', 'abc'])).code, 2);
  assert.equal((await runCli(['x.html', '--cpu', 'fast'])).code, 2);
  assert.equal((await runCli([])).code, 2);
});

test('the CLI runs when invoked through a symlink or junction to its scripts folder', async () => {
  const link = join(scratch, 'linked-scripts');
  symlinkSync(join(ROOT, 'skills', 'motion-audit', 'scripts'), link, 'junction');
  const help = await runCli(['--help'], { cli: join(link, 'motion-audit.mjs') });
  assert.equal(help.code, 0);
  assert.match(help.stdout, /motion-audit <url\|file>/);
  const r = await runCli([`${srv.url}/shadcn.html`, '--json', '--out', join(scratch, 'linked-out')], { cli: join(link, 'motion-audit.mjs') });
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.report.schemaVersion, 1);
  assert.equal(r.report.coverage.audited, 3);
});

test('the JSON report carries the schema version, coverage, loafSupported and stable finding ids', async () => {
  const r = await run('shadcn.html');
  assert.equal(r.report.schemaVersion, 1);
  assert.equal(typeof r.report.loafSupported, 'boolean');
  assert.deepEqual(Object.keys(r.report.coverage).sort(), ['audited', 'candidates', 'errored', 'inconclusive', 'late', 'max', 'skipped', 'toggles']);
  assert.ok(r.report.findings.every((f) => new RegExp(`^${f.kind}:[0-9a-f]{10}$`).test(f.id)));
  const again = await run('shadcn.html');
  assert.deepEqual(again.report.findings.map((f) => f.id).sort(), r.report.findings.map((f) => f.id).sort());
});

test('a failing audit exits exactly 1 and a clean one exactly 0', async () => {
  assert.equal((await run('bad.html')).code, 1);
  assert.equal((await run('good.html')).code, 0);
});

test('an --only selector that matches nothing audits nothing and exits 2', async () => {
  const r = await run('shadcn.html', '--only', '#does-not-exist');
  assert.equal(r.code, 2);
  assert.equal(r.report.coverage.audited, 0);
  const text = await runCli([`${srv.url}/shadcn.html`, '--only', '#does-not-exist', '--out', join(scratch, 'text-out')]);
  assert.equal(text.code, 2);
  assert.match(text.stdout, /NOT AUDITED/);
});

test('with more controls than --max the summary says how many were audited, and --min-coverage can fail the run', async () => {
  const text = await runCli([`${srv.url}/many-controls.html`, '--max', '5', '--out', join(scratch, 'many-out')]);
  assert.match(text.stdout, /audited 5 of 200 controls \(not audited: 195 beyond --max 5\)/);
  assert.equal(text.code, 0);
  const strict = await run('many-controls.html', '--max', '5', '--min-coverage', '0.5');
  assert.equal(strict.code, 2);
  assert.equal(strict.report.coverage.skipped['beyond --max 5'].count, 195);
});

test('a redirect to a login page exits 2 and explains it; a storage state gets through', async () => {
  const bare = await runCli([`${srv.url}/account.html`, '--json', '--out', join(scratch, 'login-out')]);
  assert.equal(bare.code, 2);
  assert.match(bare.stderr, /redirected to .*\/login.*--storage-state/);
  const state = join(scratch, 'state.json');
  writeFileSync(state, JSON.stringify({ cookies: [{ name: 'session', value: '1', domain: '127.0.0.1', path: '/', expires: -1, httpOnly: false, secure: false, sameSite: 'Lax' }], origins: [] }));
  const authed = await run('account.html', '--storage-state', state);
  assert.equal(authed.report.coverage.audited, 1);
  assert.equal(authed.report.finalUrl, `${srv.url}/account.html`);
});

test('--wait-for lets a late-rendering page be audited, and the same page without it audits nothing', async () => {
  const without = await run('late.html');
  assert.equal(without.code, 2);
  const withWait = await run('late.html', '--wait-for', '#late');
  assert.equal(withWait.report.coverage.audited, 1);
  const missing = await runCli([`${srv.url}/late.html`, '--wait-for', '#never', '--out', join(scratch, 'wait-out')]);
  assert.equal(missing.code, 2);
  assert.match(missing.stderr, /--wait-for "#never" did not appear/);
});

test('a config suppresses a finding with its reason, and an ignore without a reason exits 2', async () => {
  const first = await run('shadcn.html');
  const target = first.report.findings.find((f) => f.kind === 'transition-all');
  const config = join(scratch, 'suppress.json');
  writeFileSync(config, JSON.stringify({ ignore: [{ id: target.id, reason: 'design system uses transition-all' }] }));
  assert.match(target.id, /^transition-all:/);
  const r = await run('shadcn.html', '--config', config);
  assert.equal(r.report.findings.some((f) => f.id === target.id), false);
  assert.deepEqual(r.report.suppressed.map((s) => [s.id, s.reason]), [[target.id, 'design system uses transition-all']]);
  const bad = join(scratch, 'bad.json');
  writeFileSync(bad, JSON.stringify({ ignore: [{ id: target.id }] }));
  const rejected = await run('shadcn.html', '--config', bad);
  assert.equal(rejected.code, 2);
  assert.match(rejected.stderr, /reason/);
});

test('--baseline hides findings an earlier report had, and compare lists differences between two reports', async () => {
  const out = join(scratch, 'baseline-out');
  const first = await runCli([`${srv.url}/shadcn.html`, '--json', '--out', out]);
  assert.ok(first.report.findings.length > 0);
  const again = await run('shadcn.html', '--baseline', join(out, 'report.json'));
  assert.equal(again.report.findings.length, 0);
  assert.equal(again.report.baselined.length, first.report.findings.length);
});

test('compare lists what a real change fixed: the page with listed transition properties has no transition-all', async () => {
  const refPath = join(scratch, 'ref.json');
  const minePath = join(scratch, 'mine.json');
  const ref = await run('shadcn.html');
  const mine = await run('shadcn-fixed.html');
  assert.ok(ref.report.findings.some((f) => f.kind === 'transition-all'));
  assert.ok(!mine.report.findings.some((f) => f.kind === 'transition-all'));
  writeFileSync(refPath, JSON.stringify(ref.report));
  writeFileSync(minePath, JSON.stringify(mine.report));
  const cmp = await runCli(['compare', refPath, minePath]);
  assert.equal(cmp.code, 0);
  assert.match(cmp.stdout, /gone from mine: transition-all: /);
  assert.match(cmp.stdout, /\d+ of \d+ differ/);
  const same = await runCli(['compare', refPath, refPath]);
  assert.doesNotMatch(same.stdout, /gone from mine|new in mine/);
});
