import test from 'node:test';
import assert from 'node:assert/strict';
import { inconsistencies, judgeElement } from '../skills/motion-audit/scripts/lib/judge.mjs';
import { KINDS } from '../skills/motion-audit/scripts/lib/kinds.mjs';
import { finalize, validateConfig } from '../skills/motion-audit/scripts/lib/config.mjs';

const transition = (props, ms, easing = 'cubic-bezier(0.23, 1, 0.32, 1)') => ({ properties: props, durations: props.map(() => ms), easings: props.map(() => easing) });
const moment = (over = {}) => ({ changed: [], pixels: false, motion: [], ...over });
const element = (over = {}) => ({ label: 'button "Save"', kind: 'button', selected: false, transition: transition(['background-color'], 150), moments: {}, long: [], ...over });
const levels = (raw) => finalize(raw, validateConfig({})).findings.map((f) => `${f.level} ${f.kind}`);

test('a shadcn-style button (transition: all, no :active) has no errors in the default profile', () => {
  const el = element({ transition: transition(['all'], 150, 'cubic-bezier(0.4, 0, 0.2, 1)'), moments: { hover: moment({ changed: ['background-color'] }), press: moment(), focus: moment({ changed: ['box-shadow'] }) } });
  const out = levels(judgeElement(el));
  assert.ok(!out.some((l) => l.startsWith('error')), out.join(', '));
  assert.deepEqual(out.sort(), ['warning no-press-feedback', 'warning transition-all']);
});

test('a Tailwind-preflight link with no hover or press is a warning at most, and an input is never reported', () => {
  const link = element({ label: 'a "Docs"', kind: 'a', moments: { hover: moment(), press: moment(), focus: moment({ changed: ['outline-style'] }) } });
  assert.deepEqual(levels(judgeElement(link)), ['warning no-feedback']);
  const input = element({ label: 'input "Email"', kind: 'input', moments: { hover: moment(), focus: moment({ changed: ['box-shadow'] }) } });
  assert.deepEqual(levels(judgeElement(input)), []);
});

test('a button that ignores keyboard focus is an error', () => {
  const el = element({ moments: { hover: moment({ changed: ['background-color'] }), focus: moment() } });
  assert.ok(levels(judgeElement(el)).includes('error no-focus-feedback'));
});

test('a control revealed only on hover is reported for its focus state instead of as missing feedback', () => {
  const el = element({ moments: { focus: moment({ hiddenUntilHover: true }) } });
  assert.deepEqual(levels(judgeElement(el)), ['warning hover-only-control']);
});

test('instant layout changes are snaps, not layout-animated; an animated layout property is', () => {
  const instant = element({ transition: transition(['color'], 100), moments: { hover: moment({ changed: ['font-weight'] }) } });
  assert.deepEqual(levels(judgeElement(instant)), ['warning snaps']);
  const animated = element({ transition: transition(['width'], 200), moments: { press: moment({ changed: ['width'] }) } });
  assert.ok(levels(judgeElement(animated)).includes('error layout-animated'));
});

test('duration tokens exempt declared durations from the band and from inconsistency', () => {
  const slow = element({ transition: transition(['background-color'], 70), moments: { hover: moment({ changed: ['background-color'] }) } });
  assert.ok(judgeElement(slow).some((f) => f.kind === 'duration'));
  assert.ok(!judgeElement(slow, { tokens: { durations: [70] } }).some((f) => f.kind === 'duration'));
  const a = element({ label: 'a', transition: transition(['background-color'], 70), moments: { hover: moment({ changed: ['background-color'] }) } });
  const b = element({ label: 'b', transition: transition(['background-color'], 200), moments: { hover: moment({ changed: ['background-color'] }) } });
  assert.equal(inconsistencies([a, b]).length, 1);
  assert.equal(inconsistencies([a, b], { tokens: { durations: [70, 200] } }).length, 0);
});

test('every kind the judge can emit is in the registry', () => {
  const el = element({ moments: { hover: moment(), press: moment(), focus: moment() }, interrupt: [{ label: 'x', prop: 'ty' }], reduced: { moves: 'translate 10 px', residue: 'translate 4 px' } });
  for (const f of judgeElement(el)) assert.ok(KINDS[f.kind], f.kind);
});

test('a sparse recording that cannot be told from an ease-in is inconclusive, with the fingerprint of the ease-in it could not decide', async () => {
  const { analyzeSeries } = await import('../skills/motion-audit/scripts/lib/series.mjs');
  const { fingerprint } = await import('../skills/motion-audit/scripts/lib/config.mjs');
  const { exitCode } = await import('../skills/motion-audit/scripts/lib/audit.mjs');
  // Six samples over 400 ms of a CSS ease-in sampled by a machine that drops frames: a line fits it as well.
  const t = [0, 33, 83, 150, 167, 267, 400, 483, 500, 533, 567, 650, 667, 700, 750, 783, 817];
  const v = [0, 0, 0, 0, 0.3, 12.3, 45.9, 74, 80.1, 93.1, 100, 100, 100, 100, 100, 100, 100];
  const move = { prop: 'translateY', ...analyzeSeries(t, v, 1) };
  assert.equal(move.easeInTie, true, `shape ${move.shape}`);
  const el = element({ label: 'button.js', moments: { hover: moment({ changed: ['transform'], motion: [{ label: 'button.js', moves: [move] }] }) } });
  const raw = judgeElement(el);
  const row = raw.find((f) => f.kind === 'inconclusive');
  assert.ok(row, 'an inconclusive row, not nothing');
  assert.equal(row.check, 'ease-in');
  assert.match(row.detail, /frames too sparse: median .t \d+ ms, max \d+ ms/);
  const { findings } = finalize(raw, validateConfig({}));
  const inconclusive = findings.find((f) => f.kind === 'inconclusive');
  assert.equal(inconclusive.level, 'warning');
  assert.equal(inconclusive.id.split(':')[1], fingerprint({ kind: 'ease-in', element: el.label, key: 'measured button.js' }).split(':')[1]);
  assert.equal(exitCode({ coverage: { candidates: 1, audited: 1 }, findings: [inconclusive] }, { strict: true }), 0);
  // The same check that found the ease-in settles it: no row is left behind.
  const decided = finalize([...raw, { kind: 'ease-in', element: el.label, key: 'measured button.js', detail: 'x' }], validateConfig({})).findings;
  assert.ok(decided.some((f) => f.kind === 'ease-in') && !decided.some((f) => f.kind === 'inconclusive'));
});

// A CSS ease-in measured from frames: at 60 Hz it is an ease-in; sampled sparsely it is that or undecided, never nothing.
test('a declared ease-in whose measured curve is sampled at 60 Hz is an ease-in; sparse samples give ease-in or inconclusive, never nothing', async () => {
  const { analyzeRecording } = await import('../skills/motion-audit/scripts/lib/series.mjs');
  const { FRAME, irregularTimes, prng, txElement } = await import('./helpers/curves.mjs');
  const { fingerprint } = await import('../skills/motion-audit/scripts/lib/config.mjs');
  const judged = (times) => {
    const tx = times.map((t) => (t <= 0 ? 0 : 300 * Math.min(1, t / 600) ** 3));
    const motion = analyzeRecording({ elems: [txElement(times, tx, { root: true, label: 'button "Save"' })], anims: [], marks: [] });
    const el = element({ transition: transition(['transform'], 600, 'ease-in'), moments: { press: moment({ changed: ['transform'], motion, transition: transition(['transform'], 600, 'ease-in') }) } });
    return judgeElement(el).filter((f) => f.key === 'measured button "Save"');
  };
  const measured = { kind: 'ease-in', element: 'button "Save"', key: 'measured button "Save"' };
  const dense = judged([-2 * FRAME, -FRAME, ...Array.from({ length: 45 }, (_, i) => i * FRAME)]);
  assert.deepEqual(dense.map((f) => f.kind), ['ease-in']);
  for (const [minF, maxF] of [[3, 6], [6, 9], [9, 14]]) for (let seed = 1; seed <= 40; seed++) {
    const rows = judged([-4 * FRAME, ...irregularTimes(prng(seed * 977), 0, 800, minF, maxF)]);
    assert.equal(rows.length, 1, `${minF}-${maxF} frames, seed ${seed}: the sparse recording left no row for the measured ease-in`);
    assert.equal(fingerprint(rows[0]).split(':')[1], fingerprint(measured).split(':')[1], `${minF}-${maxF} frames, seed ${seed}: ${rows[0].kind} must carry the fingerprint of the ease-in finding`);
  }
});

test('a declared ease-in whose sparse measured curve was fitted as something else is inconclusive; dense, the fit stands', () => {
  const move = (samples) => ({ prop: 'translateX', shape: 'ease-out', easeInTie: false, durationMs: 600, samples, cadence: { median: 100, max: 180 }, jumps: [], settled: true });
  const judged = (m) => judgeElement(element({
    transition: transition(['transform'], 600, 'ease-in'),
    moments: { press: moment({ changed: ['transform'], transition: transition(['transform'], 600, 'ease-in'), motion: [{ label: 'button "Save"', root: true, moves: [m] }] }) },
  })).filter((f) => f.key === 'measured button "Save"');
  assert.deepEqual(judged(move(5)).map((f) => f.kind), ['inconclusive']);
  assert.deepEqual(judged(move(5))[0].check, 'ease-in');
  assert.deepEqual(judged(move(36)), []);
});

// Every path from a declared ease-in to "no measured row" ends in the ease-in or in an inconclusive row with its fingerprint.
test('a declared ease-in: the measured ease-in is ruled out only by a recording that fitted that motion', async () => {
  const { analyzeRecording } = await import('../skills/motion-audit/scripts/lib/series.mjs');
  const { FRAME, txElement } = await import('./helpers/curves.mjs');
  const { fingerprint } = await import('../skills/motion-audit/scripts/lib/config.mjs');
  const LABEL = 'button.save';
  const frames = (n, step = FRAME) => Array.from({ length: n }, (_, i) => (i - 2) * step);
  const motionOf = (times, curve, extra = {}) => analyzeRecording({ elems: [txElement(times, times.map((t) => (t <= 0 ? 0 : curve(t))), { root: true, label: LABEL, ...extra })], anims: [], marks: [] });
  const judged = (motion, changed = ['transform'], easing = 'ease-in', props = changed) => judgeElement(element({
    transition: transition(props, 600, easing),
    moments: { press: moment({ changed, rootLabel: LABEL, transition: transition(props, 600, easing), motion }) },
  })).filter((f) => f.key === `measured ${LABEL}`);
  const hash = (f) => fingerprint(f).split(':')[1];
  const finding = hash({ kind: 'ease-in', element: 'button "Save"', key: `measured ${LABEL}` });
  const easeIn = (t) => 300 * Math.min(1, t / 600) ** 3;
  // 60 Hz: the ease-in is measured
  assert.deepEqual(judged(motionOf(frames(45), easeIn)).map((f) => f.kind), ['ease-in']);
  // too few samples to produce a move at all (the recording kept three frames), or a re-record that has no such motion
  for (const motion of [motionOf(frames(3, 100), easeIn), [], motionOf(frames(45), () => 0)]) {
    const rows = judged(motion);
    assert.equal(rows.length, 1, JSON.stringify(motion));
    assert.equal(rows[0].kind, 'inconclusive');
    assert.equal(hash(rows[0]), finding);
  }
  // another property moved while the declared one was not recorded
  const opacity = motionOf(frames(45), easeIn).map((e) => ({ ...e, moves: e.moves.map((m) => ({ ...m, prop: 'opacity' })) }));
  // (the measured curve of that other property is an ease-in row of its own; the undecided row for the declared one is dropped by finalize)
  assert.ok(judged(opacity).some((f) => f.kind === 'inconclusive' && hash(f) === finding));
  // a fit on enough dense samples that is not an ease-in rules it out
  assert.deepEqual(judged(motionOf(frames(45), (t) => 300 * (1 - (1 - Math.min(1, t / 600)) ** 3))), []);
  // a declared ease-in on something the tracer does not measure (a colour) asks nothing of the recording
  assert.deepEqual(judged([], ['background-color']), []);
  // a declared ease-out asks nothing either
  assert.deepEqual(judged([], ['transform'], 'cubic-bezier(0.23, 1, 0.32, 1)'), []);
});
