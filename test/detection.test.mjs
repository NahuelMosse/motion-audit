import { after, before } from 'node:test';
import { exact, sharded as test } from './helpers/shard.mjs';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { audit, exitCode, fingerprint } from '../skills/motion-audit/scripts/lib/index.mjs';
import { FIXTURES, removeScratch, runCli } from './helpers/cli.mjs';
import { againstGolden } from './helpers/golden.mjs';
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
  assert.deepEqual(againstGolden(report, [], 0).problems, [], 'an inconclusive row breaks the rule of golden.mjs');
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

exact('a node re-mounted mid-animation is a jump error', async () => {
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

// Nothing moves, so nothing is left to decide: exactly two presses (four with --interrupt), at any cadence (the throttled run is sparse).
test('--click on a target with nothing to decide presses exactly twice, four times with --interrupt, at any cadence', async () => {
  for (const cpu of [1, 4]) {
    srv.stats.requests.length = 0;
    await audit(`${srv.url}/click-static.html`, { click: '#save', cpu });
    assert.equal(calls('save'), 2, `cpu ${cpu}`);
    srv.stats.requests.length = 0;
    await audit(`${srv.url}/click-static.html`, { click: '#save', interrupt: true, cpu });
    assert.equal(calls('save'), 4, `cpu ${cpu}`);
  }
});

// A moving target: a step the frames cannot judge is recorded again (one more press each time, so the count can be odd without
// --interrupt), within the documented cap; with --interrupt every recording presses twice and the count stays even.
test('--click on a moving target stays within the documented cap, and even with --interrupt', async () => {
  srv.stats.requests.length = 0;
  await audit(`${srv.url}/click-count.html`, { click: '#save' });
  assert.ok(calls('save') >= 2 && calls('save') <= 8, `${calls('save')} presses`);
  srv.stats.requests.length = 0;
  await audit(`${srv.url}/click-count.html`, { click: '#save', interrupt: true });
  assert.ok(calls('save') >= 4 && calls('save') <= 16 && calls('save') % 2 === 0, `${calls('save')} presses`);
});

// click-sparse.html blocks the thread mid-motion: the step is undecided in every recording (two more recordings)
// and the long frames are flagged (two re-measures of two recordings each): the count lies between 6 and the documented maximum.
test('--click on a page that stalls mid-motion presses between six and eight times, twelve and sixteen with --interrupt', async () => {
  srv.stats.requests.length = 0;
  const report = await audit(`${srv.url}/click-sparse.html`, { click: '#save' });
  assert.ok(report.findings.some((f) => f.kind === 'long-frame' && f.element === 'click #save'), JSON.stringify(report.findings.map((f) => [f.kind, f.element])));
  // The re-measures of the flagged long frames always run (6 attempts); the undecided step adds up to 2 more, but
  // with --interrupt the reversal can change the step, so the retries are bounded rather than exact.
  assert.ok(calls('save') >= 6 && calls('save') <= 8, `${calls('save')} presses`);
  srv.stats.requests.length = 0;
  await audit(`${srv.url}/click-sparse.html`, { click: '#save', interrupt: true });
  assert.ok(calls('save') >= 12 && calls('save') <= 16 && calls('save') % 2 === 0, `${calls('save')} presses`);
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
    // Every CDP session the audit opens on the caller's context must be detached when it ends.
    const sessions = [];
    const open = context.newCDPSession.bind(context);
    context.newCDPSession = async (target) => {
      const session = await open(target);
      const detach = session.detach.bind(session);
      const entry = { detached: false, rates: [] };
      const send = session.send.bind(session);
      session.send = (method, params) => { if (method === 'Emulation.setCPUThrottlingRate') entry.rates.push(params.rate); return send(method, params); };
      session.detach = async () => { entry.detached = true; return detach(); };
      sessions.push(entry);
      return session;
    };
    await audit(page, { url: `${srv.url}/shadcn.html`, cpu: 4, max: 1 });
    assert.ok(sessions.length >= 2, `${sessions.length} sessions opened (throttle and pseudo-states)`);
    assert.deepEqual(sessions.filter((s) => !s.detached), [], 'a CDP session was left attached');
    // The throttle is read back from the protocol calls, not from timings a busy machine distorts.
    const throttled = sessions.filter((x) => x.rates.length);
    assert.equal(throttled.length, 1, 'one session set the CPU throttle');
    assert.deepEqual([throttled[0].rates[0], throttled[0].rates.at(-1)], [4, 1], `throttle rates sent: ${throttled[0].rates}`);
    assert.equal(await page.evaluate(() => typeof window.__mt), 'undefined');
    await page.reload();
    assert.equal(await page.evaluate(() => typeof window.__mt), 'undefined', 'the init script is gone on later navigations');
  } finally {
    await context.close();
  }
});

// What the judge and the sighting rule rely on, read from the real tracer: no hand-set fields.
test('the real tracer records the root and its label, frame times, animation events and the cadence the rows carry', async () => {
  const { tracer } = await import('../skills/motion-audit/scripts/lib/page-tracer.mjs');
  const { TRACER_CONFIG } = await import('../skills/motion-audit/scripts/lib/browser.mjs');
  const { frameCadence } = await import('../skills/motion-audit/scripts/lib/probes.mjs');
  const { analyzeRecording } = await import('../skills/motion-audit/scripts/lib/series.mjs');
  const { judgeElement } = await import('../skills/motion-audit/scripts/lib/judge.mjs');
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  try {
    await context.addInitScript(tracer, TRACER_CONFIG);
    await page.goto(`${srv.url}/css-transitions.html`);
    await page.waitForTimeout(300);
    const root = await page.$('.box');
    await root.evaluate((n) => window.__mt.begin('m', n));
    await page.evaluate(() => { document.getElementById('lane').classList.add('on'); });
    await page.waitForTimeout(900);
    const rec = await page.evaluate(() => window.__mt.end('m'));
    // the root, labelled the way the judge keys its findings
    const rootElem = rec.elems.find((e) => e.root);
    assert.equal(rootElem.label, 'div.box');
    assert.equal(rec.elems.filter((e) => e.root).length, 1);
    // frame times and the times each sample was read: same length, increasing
    assert.ok(rootElem.t.length > 10 && rootElem.t.length === rootElem.r.length);
    assert.ok(rootElem.t.every((x, i) => i === 0 || x > rootElem.t[i - 1]));
    // the CSS transition of the root, as an animation event of that node
    const own = rec.anims.filter((a) => a.nodeId === rootElem.id && a.type === 'transition');
    assert.ok(own.length > 0 && own.every((a) => Array.isArray(a.props)) && own.some((a) => a.props.includes('left')), JSON.stringify(rec.anims));
    // the motion analysis and the cadence agree with the recorded frames
    const motion = analyzeRecording(rec);
    const left = motion.find((e) => e.root)?.moves.find((m) => m.prop === 'left');
    assert.ok(left && left.samples > 1 && left.cadence.max >= left.cadence.median);
    const cadence = frameCadence(rec);
    assert.ok(cadence.max >= left.cadence.max - 1);
    // through the judge as auditElement hands it over: a declared ease-out asks nothing of the recording
    const transition = (easing) => ({ properties: ['left'], durations: [400], easings: [easing] });
    const gesture = (easing) => ({ label: 'div.box', kind: 'div', selected: false, transition: transition(easing), long: [], moments: { press: { changed: ['left'], pixels: true, rootLabel: rootElem.label, cadence, motion, transition: transition(easing) } } });
    assert.deepEqual(judgeElement(gesture('cubic-bezier(0.23, 1, 0.32, 1)')).filter((f) => f.kind === 'inconclusive' || f.kind === 'ease-in'), []);
    // a declared ease-in is measured in the same recording: an ease-in finding or, if this machine's frames were sparse, a row with a sparse cadence
    const eased = judgeElement(gesture('ease-in')).filter((f) => f.key === 'measured div.box' || f.key === 'declared left');
    assert.ok(eased.some((f) => f.key === 'declared left'));
  } finally {
    await context.close();
  }
});
