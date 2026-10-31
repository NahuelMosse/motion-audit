// Invariant: a recording whose frames came at 60 Hz (median interval <= 20 ms, none over 34 ms) produces no inconclusive
// row of either kind, neither "frames too sparse" nor "seen once, not reproduced": on dense frames every gate has to
// yield the finding or nothing, and a dense flake in a fixture is a real failure to surface (denseInconclusive).
import test from 'node:test';
import assert from 'node:assert/strict';
import { interruptionJumps, restartUnfollowed } from '../skills/motion-audit/scripts/lib/continuity.mjs';
import { CLICK_UNSURE_MAX_DT_MS, JUMP_MAX_DT_MS } from '../skills/motion-audit/scripts/lib/constants.mjs';
import { clickUnsure, recordingCadence } from '../skills/motion-audit/scripts/lib/probes.mjs';
import { analyzeRecording, analyzeSeries } from '../skills/motion-audit/scripts/lib/series.mjs';
import { DENSE_MAX_MS, DENSE_MEDIAN_MS, denseInconclusive } from './helpers/golden.mjs';
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
  assert.ok(clickUnsure(sparse, recOf(wide, []))?.max > CLICK_UNSURE_MAX_DT_MS);
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

test('an inconclusive row from a 60 Hz recording is a failure; from a sparse one it is not', () => {
  const row = (element) => ({ kind: 'inconclusive', element, detail: 'x' });
  const moves = (cadence) => ({ label: 'button "Go"', moments: { hover: { motion: [{ moves: [{ cadence }] }] } } });
  const at = (median, max) => ({ median, max });
  assert.equal(DENSE_MEDIAN_MS, 20);
  assert.equal(DENSE_MAX_MS, 34);
  assert.equal(denseInconclusive({ findings: [row('click #go')], click: { cadence: at(17, 17) }, elements: [] }).length, 1);
  assert.equal(denseInconclusive({ findings: [row('click #go')], click: { cadence: at(17, 80) }, elements: [] }).length, 0);
  assert.equal(denseInconclusive({ findings: [row('click #go')], click: { cadence: at(40, 40) }, elements: [] }).length, 0);
  assert.equal(denseInconclusive({ findings: [row('button "Go"')], elements: [moves(at(17, 20))] }).length, 1);
  assert.equal(denseInconclusive({ findings: [row('button "Go"')], elements: [moves(at(17, 70))] }).length, 0);
  assert.equal(denseInconclusive({ findings: [{ kind: 'jump', element: 'click #go' }], click: { cadence: at(17, 17) }, elements: [] }).length, 0);
});
