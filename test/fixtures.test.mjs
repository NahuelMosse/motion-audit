import { after, before } from 'node:test';
import { inShard, sharded as test } from './helpers/shard.mjs';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { audit, exitCode } from '../skills/motion-audit/scripts/lib/index.mjs';
import { CLI_MATRIX } from './fixture-matrix.mjs';
import { FIXTURES, removeScratch, runCli } from './helpers/cli.mjs';
import { GOLDEN_PATH, againstGolden, denseInconclusive, signature } from './helpers/golden.mjs';
import { serve } from './helpers/serve.mjs';

let srv;
let browser;
// Everything this process writes to the temp directory (reports, browser profiles) goes to one folder removed at the end.
const scratch = mkdtempSync(join(tmpdir(), 'ma-fixtures-'));
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

const golden = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8'));

// The golden comparison of every matrix entry. The three-runs job (fixture-runs.mjs) compares each
// of its runs to the same golden file, so a job that runs it sets MA_SKIP_GOLDEN to audit nothing twice.
for (const [position, entry] of CLI_MATRIX.entries()) {
  const skip = process.env.MA_SKIP_GOLDEN ? 'covered by the three-runs job' : !inShard(entry.name, position) && 'other shard';
  test(`fixture ${entry.name} yields exactly the expected findings and exit code`, { skip }, async (t) => {
    const r = await runCli([`${srv.url}/${entry.fixture}`, ...entry.args, '--json']);
    assert.ok(r.report, r.stderr);
    const got = againstGolden(signature(r.report), golden[entry.name].findings, golden[entry.name].exit);
    assert.deepEqual(got.findings, golden[entry.name].findings);
    assert.equal(r.code, got.exit);
    // An inconclusive row stands in for an expected finding only when the recording really was sparse.
    assert.deepEqual(denseInconclusive(r.report), [], 'inconclusive although the recorded frames were dense (60 Hz): a stuck gate hides the finding');
    if (got.inconclusive.length) t.diagnostic(`accepted as inconclusive, the recording was sparse: ${got.inconclusive.join(', ')}`);
  });
}

// A page of the audit's own: its requests and storage show what the audit caused.
const withPage = async (fn) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  try { return await fn(page); } finally { await context.close(); }
};
const apiCalls = () => srv.stats.requests.filter((r) => r.includes('/api/'));

test('the default mode causes no request, no storage write and no state change on controls with side effects', async () => {
  await withPage(async (page) => {
    await page.goto(`${srv.url}/interactive-state.html`);
    srv.stats.requests.length = 0;
    const before = await page.evaluate(() => [localStorage.length, document.body.innerHTML]);
    const report = await audit(page, { url: `${srv.url}/interactive-state.html`, out: undefined });
    assert.ok(report.coverage.audited >= 6);
    assert.equal(report.mode, 'observe-only');
    assert.deepEqual(apiCalls(), []);
    assert.equal(await page.evaluate(() => localStorage.length), before[0]);
    // The fixture reports every change of aria-pressed, aria-expanded and aria-selected while it runs.
    assert.deepEqual(srv.stats.requests.filter((r) => r.includes('/api/state/')), []);
  });
});

test('--interact never touches the delete button, the drag handle or the slider, and toggles end where they started', async () => {
  await withPage(async (page) => {
    await page.goto(`${srv.url}/interactive-state.html`);
    srv.stats.requests.length = 0;
    const report = await audit(page, { url: `${srv.url}/interactive-state.html`, interact: true });
    const calls = apiCalls();
    for (const name of ['delete', 'drag', 'slider']) assert.equal(calls.filter((c) => c.endsWith(`/api/${name}`)).length, 0, `${name} was touched`);
    const follows = calls.filter((c) => c.endsWith('/api/follow')).length;
    assert.ok(follows > 0, 'the aria-pressed toggle was probed');
    assert.equal(follows % 2, 0, `${follows} clicks on a persisted toggle`);
    const states = calls.filter((c) => c.includes('/api/state/follow/aria-pressed'));
    assert.ok(states.length >= follows, 'the state changes of the toggle were recorded');
    assert.notEqual(await page.evaluate(() => localStorage.getItem('follow')), 'true');
    assert.ok(report.coverage.toggles.probed >= 1);
  });
});

test('an overlay appended to body on open is traced: its animated height is found and its nodes are counted', async () => {
  const report = await audit(`${srv.url}/overlay-portal.html`, { click: '#open', out: undefined });
  assert.ok(report.click.mounted > 0, 'mounted nodes were followed');
  assert.ok(report.findings.some((f) => f.kind === 'layout-animated' && f.element === 'click #open'));
});

test('a control covered by a cookie banner is skipped as covered and gets no feedback finding', async () => {
  const report = await audit(`${srv.url}/cookie-banner.html`, {});
  assert.equal(report.coverage.skipped.covered.count, 1);
  assert.match(report.coverage.skipped.covered.examples[0], /Covered control/);
  assert.ok(!report.findings.some((f) => /Covered control/.test(f.element)));
  assert.equal(report.coverage.audited, 3);
});

test('controls inside an inner scroll container are all audited', async () => {
  const report = await audit(`${srv.url}/inner-scroll.html`, { max: 20 });
  assert.equal(report.coverage.audited, 14);
  assert.deepEqual(report.coverage.skipped, {});
});

test('a development build is detected and its long frames are only warnings', async () => {
  const report = await audit(`${srv.url}/dev-build.html`, {});
  assert.deepEqual(report.devServer, ['Vite dev server']);
  const long = report.findings.filter((f) => f.kind === 'long-frame');
  assert.ok(long.length > 0);
  assert.ok(long.every((f) => f.level === 'warning'));
  assert.ok(report.notes.some((n) => /development build/.test(n)));
  assert.equal(exitCode(report), 0);
});

test('a scroll listener that blocks the main thread is a long-frame error on a production build', async () => {
  const report = await audit(`${srv.url}/scroll-jank.html`, {});
  const scroll = report.findings.find((f) => f.element === 'page scroll');
  assert.equal(scroll.level, 'error');
  assert.match(scroll.detail, /scripts: scroll-jank\.html/);
});

test('default-mode toggles are reported as not probed, with their count', async () => {
  const report = await audit(`${srv.url}/drawer-bad.html`, {});
  assert.equal(report.coverage.toggles.probed, 0);
  assert.ok(report.coverage.toggles.skipped['observe-only (use --interact)'] >= 1);
  assert.ok(!report.findings.some((f) => f.kind === 'not-interruptible'));
});

test('audit() accepts a Playwright page and uses its own context', async () => {
  await withPage(async (page) => {
    await page.goto(`${srv.url}/shadcn.html`);
    const report = await audit(page, {});
    assert.equal(report.coverage.audited, 3);
    assert.equal(page.url(), `${srv.url}/shadcn.html`);
  });
});
