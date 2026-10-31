// The published package as a consumer gets it: the packed tarball installed into an empty project, the CLI run on a
// fixture page through the installed bin, and `import { audit } from 'motion-audit'` driven by a page from
// `browser.newPage()` in a plain Playwright script.
import { after, before } from 'node:test';
import { sharded as test } from './helpers/shard.mjs';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FIXTURES, ROOT, removeScratch, runCli, runNode } from './helpers/cli.mjs';
import { npm } from './helpers/npm.mjs';
import { serve } from './helpers/serve.mjs';

const work = mkdtempSync(join(tmpdir(), 'ma-install-'));
const project = join(work, 'project');
let srv;
let entry;

before(async () => {
  srv = await serve(FIXTURES);
  const { stdout } = await npm(['pack', '--json', '--ignore-scripts', '--pack-destination', work], ROOT);
  const [packed] = JSON.parse(stdout.slice(stdout.indexOf('[')));
  mkdirSync(project);
  writeFileSync(join(project, 'package.json'), '{"name":"consumer","private":true,"type":"module"}');
  // Playwright is a peer dependency: the consumer gets the copy this repository already has (and its browsers), not a download.
  await npm(['install', '--no-audit', '--no-fund', '--ignore-scripts', '--legacy-peer-deps', join(work, packed.filename)], project);
  for (const name of ['playwright', 'playwright-core']) symlinkSync(join(ROOT, 'node_modules', name), join(project, 'node_modules', name), 'junction');
  const installed = join(project, 'node_modules', 'motion-audit');
  entry = join(installed, ...JSON.parse(readFileSync(join(installed, 'package.json'), 'utf8')).bin['motion-audit'].split('/'));
});
after(async () => {
  await srv.close();
  rmSync(work, { recursive: true, force: true, maxRetries: 5 });
  removeScratch();
});

test('the installed bin runs from an empty project: --help through npm exec, then an audit of a fixture page', async () => {
  assert.ok(existsSync(entry));
  const viaShim = await npm(['exec', '--no-install', '--', 'motion-audit', '--help'], project);
  assert.match(viaShim.stdout, /^motion-audit <url\|file> \[options\]/);
  const bad = await runCli([`${srv.url}/bad.html`, '--json', '--out', join(work, 'out')], { cli: entry, cwd: project });
  assert.equal(bad.code, 1, bad.stdout.slice(0, 2000));
  assert.ok(bad.report.findings.length > 0);
  const good = await runCli([`${srv.url}/good.html`, '--json', '--out', join(work, 'out-good')], { cli: entry, cwd: project });
  assert.equal(good.code, 0, good.stdout.slice(0, 2000));
});

test("import { audit } from 'motion-audit' audits a page from browser.newPage() in a Playwright script", async () => {
  const script = join(project, 'audit.mjs');
  writeFileSync(script, `
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { audit, exitCode } from 'motion-audit';
const [bad, good] = process.argv.slice(2);
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(bad);
  const failing = await audit(page);
  assert.ok(failing.coverage.audited > 0, 'audited nothing');
  assert.ok(failing.findings.length > 0, 'the bad page produced no finding');
  assert.equal(exitCode(failing), 1);
  await page.goto(good);
  const clean = await audit(page);
  assert.ok(clean.coverage.audited > 0, 'audited nothing');
  assert.equal(exitCode(clean), 0, JSON.stringify(clean.findings));
  console.log('API ok');
} finally {
  await browser.close();
}
`);
  const r = await runNode([script, `${srv.url}/bad.html`, `${srv.url}/good.html`], { cwd: project, timeoutMs: 300000 });
  assert.equal(r.code, 0, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /API ok/);
});
