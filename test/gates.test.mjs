// The "frames too sparse" gates must open only for sparse frames: with 60 Hz data every one of them has to
// yield the finding (or nothing), never an `inconclusive` row, or a stuck gate would hide the finding.
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

// A jump seen in one click recording and not in the re-measures: what it becomes depends on how well each recording could judge.
test('an unconfirmed jump: dropped when a decidable re-measure ruled it out in a sparse sighting, otherwise inconclusive', async () => {
  const { unconfirmedVerdict, decidable, sightedDense } = await import('../skills/motion-audit/scripts/lib/probes.mjs');
  const move = (cadenceMax, extra = {}) => ({ prop: 'translateX', cadence: { median: 17, max: cadenceMax }, jumps: [], unresolved: 0, ...extra });
  const moved = (m) => [{ label: 'div', moves: [m] }];
  const none = (decidableRerun) => ({ jumps: [], decidable: decidableRerun });
  const sparseSighting = { sightedDense: false };
  const denseSighting = { sightedDense: true };
  // 1. sparse sighting, one decidable re-measure without the jump: a decided negative, no row
  assert.equal(unconfirmedVerdict(sparseSighting, [none(false), none(true)]), 'drop');
  // 2. sparse sighting, every re-measure undecidable: undecided
  assert.equal(unconfirmedVerdict(sparseSighting, [none(false), none(false)]), 'inconclusive');
  // 3. clear sighting in dense frames that the re-measures do not reproduce: a flake, undecided
  assert.equal(unconfirmedVerdict(denseSighting, [none(true), none(true)]), 'inconclusive');
  // the predicates behind it
  assert.equal(decidable(moved(move(17))), true);
  assert.equal(decidable(moved(move(17, { unresolved: 1 }))), false);
  assert.equal(decidable(moved(move(110))), false);
  assert.equal(sightedDense(moved(move(20, { jumps: [{ atMs: 1, size: 1 }] }))), true);
  assert.equal(sightedDense(moved(move(70, { jumps: [{ atMs: 1, size: 1 }] }))), false);
  assert.equal(sightedDense(moved(move(20))), false);
});

// Every place a sighting of an interrupt jump can be discarded (the re-measures disagree, the frames cannot follow a restart)
// ends in a row with the finding's fingerprint, unless a decidable re-measure ruled it out.
test('interrupt sightings: undecided rows keep the fingerprint of the finding; a decided negative drops it', async () => {
  const { markCadence } = await import('../skills/motion-audit/scripts/lib/continuity.mjs');
  const { judgeElement } = await import('../skills/motion-audit/scripts/lib/judge.mjs');
  const { fingerprint } = await import('../skills/motion-audit/scripts/lib/config.mjs');
  // markCadence: 60 Hz is dense, a stall is not
  const dense = { marks: [200], elems: [txElement(frames(30), frames(30).map(() => 0))], anims: [] };
  assert.ok(markCadence(dense, 200).max <= DENSE_MAX_MS);
  const stalled = { marks: [200], elems: [txElement([0, 50, 100, 250, 400, 450], [0, 0, 0, 0, 0, 0])], anims: [] };
  assert.ok(markCadence(stalled, 250).max > DENSE_MAX_MS);
  // an element whose hover-interrupt sighting was not confirmed and could not be ruled out
  const el = { label: 'button "Card"', kind: 'button', selected: false, transition: { properties: [], durations: [], easings: [] }, moments: {}, long: [], undecided: [{ check: 'interrupt-jump', key: 'hover', detail: 'hover left mid-way: a jump was seen in one recording and not in the re-measures', cadence: { median: 17, max: 90 } }] };
  const rows = judgeElement(el);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, 'inconclusive');
  const finding = { kind: 'interrupt-jump', element: 'button "Card"', key: 'hover' };
  assert.equal(fingerprint(rows[0]).split(':')[1], fingerprint(finding).split(':')[1]);
});

test('a hover interrupt or element jump dropped by the majority vote becomes an undecided row unless a decidable re-measure ruled it out', async () => {
  const { undecidedOf } = await import('../skills/motion-audit/scripts/lib/audit.mjs');
  const rerun = (decidableRerun) => ({ interrupt: [], interruptUnsure: decidableRerun ? null : { median: 40, max: 120 }, moments: { hover: { motion: [{ label: 'div', moves: [{ prop: 'translateX', jumps: [], unresolved: decidableRerun ? 0 : 1, cadence: { median: 17, max: decidableRerun ? 17 : 120 } }] }] } } });
  const interrupt = (dense) => ({ unconfirmed: ['interrupt'], interruptDense: dense, interruptCadence: { median: 17, max: 60 } });
  const kinds = (el, later) => undecidedOf(el, later).map((u) => `${u.check} ${u.key}`);
  // clear sighting in dense frames, not reproduced by decidable re-measures: a flake, undecided
  assert.deepEqual(kinds(interrupt(true), [rerun(true), rerun(true)]), ['interrupt-jump hover']);
  // sparse sighting, one decidable re-measure without it: decided negative, no row
  assert.deepEqual(kinds(interrupt(false), [rerun(false), rerun(true)]), []);
  // sparse sighting, no re-measure could judge: undecided
  assert.deepEqual(kinds(interrupt(false), [rerun(false), rerun(false)]), ['interrupt-jump hover']);
  // jumps of a gesture's motions follow the same rule, one row per sighting
  const jumped = (max) => ({ unconfirmed: ['jump'], moments: { hover: { motion: [{ label: 'div', moves: [{ prop: 'left', jumps: [{ atMs: 1, size: 9 }], cadence: { median: 17, max } }] }] } } });
  assert.deepEqual(kinds(jumped(17), [rerun(true), rerun(true)]), ['jump hover div left']);
  assert.deepEqual(kinds(jumped(90), [rerun(false), rerun(true)]), []);
  assert.deepEqual(kinds(jumped(90), [rerun(false), rerun(false)]), ['jump hover div left']);
});
