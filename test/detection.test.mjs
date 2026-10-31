import { after, before } from 'node:test';
import { sharded as test } from './helpers/shard.mjs';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { audit, exitCode, fingerprint } from '../skills/motion-audit/scripts/lib/index.mjs';
import { FIXTURES, removeScratch, runCli } from './helpers/cli.mjs';
import { serve } from './helpers/serve.mjs';

let srv;
let browser;
const scratch = mkdtempSync(join(tmpdir(), 'ma-detect-'));
before(async () => {
  process.env.TEMP = scratch;
  process.env.TMP = scratch;
  process.env.TMPDIR = scratch;
  srv = await serve(FIXTURES);
  browser = await chromium.launch();
});
after(async () => {
  await browser.close();
  await srv.close();
  removeScratch();
  rmSync(scratch, { recursive: true, force: true, maxRetries: 5 });
});

const calls = (name) => srv.stats.requests.filter((r) => r === `POST /api/${name}`).length;
const kindsFor = (report, element) => report.findings.filter((f) => f.element.includes(element)).map((f) => `${f.level} ${f.kind}`).sort();

// Not in the fixture matrix: the hover frame is far over 50 ms on any machine, but whether the press and
// focus frames of such a large table pass 50 ms depends on the machine's speed, so only the hover is asserted.
test('a hover that re-lays-out a large table is a long-frame error even though no script ran', async () => {
  const report = await audit(`${srv.url}/relayout-hover.html`, {});
  const long = report.findings.filter((f) => f.kind === 'long-frame' && /during hover/.test(f.detail));
  assert.equal(long.length, 1, JSON.stringify(report.findings.map((f) => [f.kind, f.element, f.detail])));
  assert.equal(long[0].level, 'error');
  assert.match(long[0].detail, /no script attributed/);
  assert.equal(exitCode(report), 1);
});

test('a toast that teleports in, holds and leaves is a jump error', async () => {
  const report = await audit(`${srv.url}/toast-teleport.html`, { click: '#show' });
  const jump = report.findings.find((f) => f.kind === 'jump' && f.element === 'click #show');
  if (jump) {
    assert.equal(jump.level, 'error');
    assert.match(jump.detail, /translateX jumps/);
    return;
  }
  // Frames too sparse to decide: the same rule as the golden files, on every platform.
  const hash = fingerprint({ kind: 'jump', element: 'click #show', key: 'click' }).split(':')[1];
  const unsure = report.findings.find((f) => f.kind === 'inconclusive' && f.id.split(':')[1] === hash);
  assert.ok(unsure, JSON.stringify(report.findings.map((f) => [f.kind, f.element])));
  assert.equal(unsure.level, 'warning');
});

test('a node re-mounted mid-animation is a jump error', async () => {
  const report = await audit(`${srv.url}/remount.html`, { click: '#open' });
  const jump = report.findings.find((f) => f.kind === 'jump' && f.element === 'click #open');
  assert.ok(jump, JSON.stringify(report.findings.map((f) => [f.kind, f.element, f.detail])));
  assert.match(jump.detail, /div\.bar width jumps/);
});

test('controls that appear after the audit started make the run incomplete: exit 2 and a hint for --wait-for', async () => {
  const report = await audit(`${srv.url}/late-controls.html`, {});
  assert.equal(report.coverage.audited, 1);
  assert.equal(report.coverage.late, 12);
  assert.equal(exitCode(report), 2);
  assert.ok(report.notes.some((n) => /12 controls appeared.*--wait-for/.test(n)), report.notes.join(' | '));
  const cli = await runCli([`${srv.url}/late-controls.html`, '--out', join(scratch, 'late-out')]);
  assert.equal(cli.code, 2);
  assert.match(cli.stdout, /INCOMPLETE.*--wait-for/);
  const waited = await audit(`${srv.url}/late-controls.html`, { waitFor: 'button' });
  assert.equal(waited.coverage.audited, 13);
  assert.equal(waited.coverage.late, 0);
  assert.equal(exitCode(waited), 0);
});

test('--click presses the target twice, four times with --interrupt, and at most eight (sixteen) when re-recorded', async () => {
  srv.stats.requests.length = 0;
  await audit(`${srv.url}/click-count.html`, { click: '#save' });
  assert.ok(calls('save') >= 2 && calls('save') <= 8, `${calls('save')} presses`);
  srv.stats.requests.length = 0;
  await audit(`${srv.url}/click-count.html`, { click: '#save', interrupt: true });
  // Every recording presses twice with --interrupt, so the count stays even.
  assert.ok(calls('save') >= 4 && calls('save') <= 16 && calls('save') % 2 === 0, `${calls('save')} presses`);
});

test('audit(page) works on a page from browser.newPage(), whose context refuses further pages', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  try {
    await page.goto(`${srv.url}/shadcn.html`);
    const report = await audit(page, {});
    assert.ok(report.coverage.audited > 0);
    assert.equal(page.context().pages().length, 1, 'the auxiliary pages are closed');
  } finally {
    await page.close();
  }
});

test('a button with a hover but no :active rule has no press feedback in the default mode, as it does with --interact', async () => {
  const report = await audit(`${srv.url}/shadcn.html`, {});
  const press = report.findings.find((f) => f.kind === 'no-press-feedback' && f.element.includes('Save changes'));
  assert.ok(press, JSON.stringify(report.findings.map((f) => [f.kind, f.element])));
  const real = await audit(`${srv.url}/shadcn.html`, { interact: true });
  assert.deepEqual(kindsFor(report, 'Save changes'), kindsFor(real, 'Save changes'));
});

test('kinds.html gives the same findings for "Linear lift" in the default mode and with --interact', async () => {
  const forced = await audit(`${srv.url}/kinds.html`, {});
  const real = await audit(`${srv.url}/kinds.html`, { interact: true });
  assert.deepEqual(kindsFor(forced, 'Linear lift'), kindsFor(real, 'Linear lift'));
  assert.ok(kindsFor(forced, 'Linear lift').includes('warning no-press-feedback'));
});

test('an invalid --only selector is a usage error without a stack trace', async () => {
  const r = await runCli([`${srv.url}/shadcn.html`, '--only', 'button[']);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /--only "button\[" is not a valid selector/);
  assert.doesNotMatch(r.stderr, /\n\s+at /);
});

test('audit(page) leaves the page as it found it: CPU throttle off, tracer stopped, no CDP session kept', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  try {
    await page.goto(`${srv.url}/shadcn.html`);
    const spin = () => page.evaluate(() => { const t = performance.now(); let x = 0; for (let i = 0; i < 4e7; i++) x += i % 7; return performance.now() - t + x * 0; });
    await spin();
    const before = Math.min(await spin(), await spin());
    await audit(page, { url: `${srv.url}/shadcn.html`, cpu: 4, max: 1 });
    const after = Math.min(await spin(), await spin(), await spin());
    assert.ok(after < before * 2, `still throttled: ${Math.round(before)} ms before, ${Math.round(after)} ms after`);
    assert.equal(await page.evaluate(() => typeof window.__mt), 'undefined');
    await page.reload();
    assert.equal(await page.evaluate(() => typeof window.__mt), 'undefined', 'the init script is gone on later navigations');
  } finally {
    await context.close();
  }
});
