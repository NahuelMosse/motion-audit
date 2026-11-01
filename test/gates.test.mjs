// Invariant: a recording whose frames came at 60 Hz (median interval <= 20 ms, none over 34 ms) produces no inconclusive
// row of either kind, neither "frames too sparse" nor "seen once, not reproduced": on dense frames every gate has to
// yield the finding or nothing, and a dense flake in a fixture is a real failure to surface (golden.mjs: exact goldens on dense
// recordings, inconclusive rows tolerated only on sparse ones, and only when the row carries a sparse cadence).
import test from 'node:test';
import assert from 'node:assert/strict';
import { interruptionJumps, restartUnfollowed } from '../skills/motion-audit/scripts/lib/continuity.mjs';
import { DENSE_MAX_MS, JUMP_MAX_DT_MS } from '../skills/motion-audit/scripts/lib/constants.mjs';
import { clickUnsure, recordingCadence } from '../skills/motion-audit/scripts/lib/probes.mjs';
import { analyzeRecording, analyzeSeries } from '../skills/motion-audit/scripts/lib/series.mjs';
import { EASINGS, FRAME, irregularTimes, prng, txElement } from './helpers/curves.mjs';

const frames = (n, step = FRAME) => Array.from({ length: n }, (_, i) => i * step);

// A script-driven value (no Animation object covers it): rest, a fast step, a slow settle.
const stepSeries = (times) => times.map((_, i) => [0, 0, 0, 4, 12, 42, 50, 54, 56, 57, 57, 57][i] ?? 57);

const recOf = (times, v, extra = {}) => ({ marks: [times[2]], anims: [], mounted: 0, elems: [txElement(times, v)], ...extra });

test('a step sampled at 60 Hz that is not fast enough to be a jump is settled: nothing is left unresolved', () => {
  const t = frames(12);
  const dense = analyzeSeries(t, stepSeries(t).map((x) => x * 2), 1);
  assert.ok(dense.cadence.max <= DENSE_MAX_MS);
  assert.equal(dense.unresolved, 0);
  assert.deepEqual(dense.jumps, []);
  // The same values with the frames spread out over intervals too long to bound the velocity stay undecided.
  const sparse = analyzeSeries(t.map((x) => x * 3), stepSeries(t).map((x) => x * 2), 1);
  assert.ok(sparse.cadence.max > JUMP_MAX_DT_MS);
  assert.ok(sparse.unresolved > 0);
});

test('click gate: 60 Hz recordings of a script-driven step give no inconclusive cadence; sparse ones do', () => {
  const t = frames(12);
  const dense = analyzeRecording(recOf(t, stepSeries(t).map((x) => x * 2)));
  assert.equal(clickUnsure(dense, recOf(t, [])), null);
  const wide = t.map((x) => x * 5);
  const sparse = analyzeRecording(recOf(wide, stepSeries(t).map((x) => x * 2)));
  assert.ok(clickUnsure(sparse, recOf(wide, []))?.max > DENSE_MAX_MS);
  // frames 40 ms apart (a 25 fps recording) are not dense either: an unresolved step there is undecided, never silent
  const mid = t.map((x) => x * 2.4);
  assert.ok(clickUnsure(analyzeRecording(recOf(mid, stepSeries(t).map((x) => x * 2))), recOf(mid, []))?.max > DENSE_MAX_MS);
});

test('click gate: a script-driven teleport sampled at 60 Hz is a jump, so no inconclusive row follows', () => {
  const t = frames(40);
  const v = t.map((x, i) => (i < 4 ? 0 : i < 20 ? 100 * ((i - 4) / 40) : 100 * ((i - 4) / 40) + 150));
  const rec = recOf(t, v);
  const moved = analyzeRecording(rec);
  assert.ok(moved.some((e) => e.moves.some((m) => m.jumps.length)), 'the teleport is found');
  assert.equal(clickUnsure(moved, rec), null);
});

test('recordingCadence reports the intervals after the click only', () => {
  const t = [0, 100, 200, 216.7, 233.3, 250];
  const rec = { marks: [216.7], elems: [txElement(t, t.map(() => 0))] };
  assert.deepEqual(recordingCadence(rec), { median: 17, max: 17 });
  assert.equal(recordingCadence({ marks: [], elems: [] }), null);
});

// A panel opening, interrupted at the mark; afterwards it restarts at its own `from` value.
const restartRecording = (minF, maxF, seed) => {
  const ease = EASINGS['strong ease-out'];
  const rand = prng(seed);
  const dur = 400;
  const m = dur * 0.3;
  const times = irregularTimes(rand, -3 * FRAME, m + dur + 200, minF, maxF);
  const tx = times.map((x) => (x < 0 ? 0 : x <= m ? 250 * ease(x / dur) : 250 * (1 - ease((x - m) / dur))));
  return { m, rec: { marks: [m], elems: [txElement(times, tx)], anims: [{ t: m + 8, nodeId: 1, type: 'animation', props: ['transform'], explicitFrom: true }] } };
};

test('interrupt gate: at 60 Hz a restart is found as a jump and is never left unfollowed', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const { m, rec } = restartRecording(1, 1, seed);
    assert.ok(interruptionJumps(rec, m, { durationMs: 400 }).length > 0, `seed ${seed}: the restart is a finding`);
    assert.equal(restartUnfollowed(rec, m), null, `seed ${seed}: dense frames follow the value`);
  }
  let unfollowed = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const { m, rec } = restartRecording(3, 4, seed);
    if (restartUnfollowed(rec, m)) unfollowed++;
  }
  assert.ok(unfollowed > 0, 'sparse frames do leave the restart unfollowed');
});

test('the golden rule: dense recordings are exact and allow no inconclusive row; sparse ones tolerate rows that carry a sparse cadence', async () => {
  const { DENSE_MAX_MS: PRODUCT_MAX, DENSE_MEDIAN_MS: PRODUCT_MEDIAN } = await import('../skills/motion-audit/scripts/lib/constants.mjs');
  const { isDense } = await import('../skills/motion-audit/scripts/lib/sightings.mjs');
  const { againstGolden: judge, isDenseCadence } = await import('./helpers/golden.mjs');
  // what the golden rule calls dense is what the product calls dense (the same function, at the same boundaries)
  assert.equal(isDenseCadence, isDense);
  for (const c of [{ median: PRODUCT_MEDIAN, max: PRODUCT_MAX }, { median: PRODUCT_MEDIAN + 1, max: PRODUCT_MAX }, { median: PRODUCT_MEDIAN, max: PRODUCT_MAX + 1 }]) assert.equal(isDenseCadence(c), isDense(c));
  assert.equal(isDense({ median: 17, max: 34 }), true);
  assert.equal(isDense({ median: 17, max: 35 }), false);
  assert.equal(isDense({ median: 21, max: 30 }), false);
  const finding = { level: 'error', kind: 'jump', id: 'jump:aaaaaaaaaa', element: 'click #go', detail: 'x' };
  const row = (cadence, id = 'inconclusive:aaaaaaaaaa', element = 'click #go') => ({ level: 'warning', kind: 'inconclusive', id, element, detail: 'x', ...(cadence ? { cadence } : {}) });
  const at = (median, max) => ({ median, max });
  const expected = ['error|jump:aaaaaaaaaa|click #go'];
  const run = (findings) => judge({ findings }, expected, 1);
  // exact on a dense recording
  assert.deepEqual(run([finding]).findings, expected);
  assert.deepEqual(run([finding]).problems, []);
  // a row on a dense recording is a problem, whether it stands in for the finding or is extra
  assert.equal(run([row(at(17, 17))]).problems.length, 1);
  assert.equal(run([finding, row(at(17, 20), 'inconclusive:bbbbbbbbbb', 'button "Go"')]).problems.length, 1);
  // a row without the cadence of its recording is a problem
  assert.equal(run([row(null)]).problems.length, 1);
  // on a sparse recording the row stands in for the finding, and extra rows are tolerated and set aside
  const stood = run([row(at(40, 90))]);
  assert.deepEqual([stood.findings, stood.problems, stood.standIns], [expected, [], expected]);
  assert.equal(stood.exit, 0);
  const extra = run([finding, row(at(40, 90), 'inconclusive:bbbbbbbbbb', 'button "Go"')]);
  assert.deepEqual([extra.findings, extra.problems, extra.extras.length], [expected, [], 1]);
  // any other difference fails: a lost finding without a row, or a finding that is not expected
  assert.notDeepEqual(run([]).findings, expected);
  assert.notDeepEqual(run([finding, { ...finding, id: 'jump:cccccccccc', element: 'other' }]).findings, expected);
});

test('with MOTION_REQUIRE_DENSE no inconclusive row is tolerated and a run without a dense recording fails', async () => {
  process.env.MOTION_REQUIRE_DENSE = '1';
  try {
    const strict = await import('./helpers/golden.mjs?require-dense');
    const sparseRow = { level: 'warning', kind: 'inconclusive', id: 'inconclusive:aaaaaaaaaa', element: 'click #go', detail: 'x', cadence: { median: 40, max: 90 } };
    assert.equal(strict.REQUIRE_DENSE, true);
    assert.equal(strict.againstGolden({ findings: [sparseRow] }, ['error|jump:aaaaaaaaaa|click #go'], 1).problems.length, 1);
    const report = (cadence) => ({ findings: [], click: { cadence }, elements: [] });
    strict.noteRecording(report({ median: 40, max: 90 }));
    assert.equal(strict.requireSomeDense().length, 1, 'no dense recording yet');
    strict.noteRecording(report({ median: 17, max: 20 }));
    assert.deepEqual(strict.requireSomeDense(), []);
  } finally {
    delete process.env.MOTION_REQUIRE_DENSE;
  }
});
