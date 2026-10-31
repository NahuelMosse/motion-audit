// A jump seen in one recording that the re-measures do not reproduce is dropped only when a re-measure that could see that
// very motion did not see it; otherwise it stays undecided, with a reason that names the cause. Nothing is exempt because of
// what drives the motion (CSS or script).
import test from 'node:test';
import assert from 'node:assert/strict';
import { fingerprint } from '../skills/motion-audit/scripts/lib/config.mjs';
import { markCadence } from '../skills/motion-audit/scripts/lib/continuity.mjs';
import { judgeElement } from '../skills/motion-audit/scripts/lib/judge.mjs';
import { jumpSightingsOf } from '../skills/motion-audit/scripts/lib/probes.mjs';
import { analyzeRecording } from '../skills/motion-audit/scripts/lib/series.mjs';
import { NO_COVERAGE, canSee, coverageOf, unconfirmedVerdict } from '../skills/motion-audit/scripts/lib/sightings.mjs';
import { clickRows, confirmToggle, toggleRow, undecidedOf } from '../skills/motion-audit/scripts/lib/undecided.mjs';
import { FRAME, txElement } from './helpers/curves.mjs';

const frames = (n, step = FRAME) => Array.from({ length: n }, (_, i) => i * step);
// A value that rests, runs and teleports 150 px half-way: the step is a jump at any density. `start` is when it moves.
const teleport = (n) => frames(n).map((_, i) => (i < 4 ? 0 : i < n / 2 ? 4 * (i - 4) : 4 * (i - 4) + 150));
const recOf = (elems, anims = []) => ({ marks: [frames(3)[2]], anims, mounted: 0, elems });
const el = (id, label, t, v) => txElement(t, v, { id, label });

test('canSee: the very motion must be in the recording, judged on enough samples, with the probe run', () => {
  const full = (over = {}) => ({ ran: true, mark: { median: 17, max: 20 }, moves: [{ moment: '', label: 'div.thumb', prop: 'left', samples: 12, unresolved: 0, maxDt: 20, ...over }] });
  const s = { label: 'div.thumb', prop: 'left' };
  assert.equal(canSee(full(), s), true);
  assert.equal(canSee(NO_COVERAGE, s), false, 'the probe did not run');
  assert.equal(canSee({ ran: true, mark: null, moves: [] }, s), false, 'the motion is absent from the re-measure');
  assert.equal(canSee(full({ label: 'div.other' }), s), false, 'another motion is not this one');
  assert.equal(canSee(full({ prop: 'top' }), s), false, 'another property is not this one');
  assert.equal(canSee(full({ samples: 4 }), s), false, 'fewer than five samples are never examined for jumps');
  assert.equal(canSee(full({ unresolved: 1 }), s), false);
  assert.equal(canSee(full({ maxDt: 130 }), s), false, 'an interval too long to bound a velocity');
  assert.equal(canSee(full(), s, { mark: true }), true);
  assert.equal(canSee({ ...full(), mark: null }, s, { mark: true }), false, 'no second gesture was sampled');
  assert.equal(canSee({ ...full(), mark: { median: 40, max: 60 } }, s, { mark: true }), false, 'a second gesture sampled at 30 fps');
  assert.equal(canSee({ ...full(), mark: { median: 17, max: 60 } }, s, { mark: true }), false, 'an interval over 2.5 frames around it');
});

test('verdict: a decided negative drops a sparse sighting; a clear one that is not reproduced, or one nobody could judge, stays', () => {
  const s = { label: 'div.thumb', prop: 'left', dense: false };
  const seeing = { saw: [], coverage: { ran: true, mark: null, moves: [{ moment: '', label: 'div.thumb', prop: 'left', samples: 12, unresolved: 0, maxDt: 20 }] } };
  const blind = { saw: [], coverage: NO_COVERAGE };
  assert.equal(unconfirmedVerdict([s], [blind, seeing]), 'drop');
  assert.equal(unconfirmedVerdict([s], [blind, blind]), 'unseen');
  assert.equal(unconfirmedVerdict([{ ...s, dense: true }], [seeing, seeing]), 'flake');
  assert.equal(unconfirmedVerdict([s], [{ ...seeing, saw: [{ label: 'div.thumb', prop: 'left' }] }, blind]), 'unseen', 'a re-measure that saw it rules nothing out');
});

test('click wiring: a rerun without the motion, a sparse rerun or a target that vanished leave an undecided row; a rerun that saw the motion drops it', () => {
  const t = frames(30);
  // The first recording followed the step every 40 ms (2.4 frames): a jump, but not a clear one in frame-by-frame sampling.
  const first = (anims = []) => {
    const rec = recOf([el(7, 'div.thumb', frames(30, 40), teleport(30))], anims);
    const moved = analyzeRecording(rec);
    return { jumps: moved.flatMap((e) => e.moves.flatMap((m) => m.jumps.map((j) => ({ label: e.label, prop: m.prop, ...j })))), jumpSightings: jumpSightingsOf(moved), interrupt: [], interruptSightings: [], unsure: null, interruptUnsure: null, coverage: coverageOf(moved) };
  };
  const f = first();
  assert.ok(f.jumps.length && f.jumpSightings.length, 'the sighting is real data');
  const rerunOf = (elems) => { const moved = analyzeRecording(recOf(elems)); return { jumps: [], interrupt: [], coverage: coverageOf(moved) }; };
  const rowsFor = (reruns) => clickRows('click #x', f, ['jump'], reruns).map((r) => `${r.check}:${/seen in 1 of 3 recordings; the others could not judge/.test(r.detail) ? 'unseen' : /not reproduced/.test(r.detail) ? 'flake' : r.detail}`);
  // the motion is absent from both re-measures (another element moved)
  assert.deepEqual(rowsFor([rerunOf([el(8, 'div.other', t, teleport(30))]), rerunOf([el(8, 'div.other', t, teleport(30))])]), ['jump:unseen']);
  // two samples at 60 ms: never examined
  const two = frames(2, 60);
  assert.deepEqual(rowsFor([rerunOf([el(7, 'div.thumb', two, [0, 90])]), rerunOf([el(7, 'div.thumb', two, [0, 90])])]), ['jump:unseen']);
  // sparse samples (130 ms apart) of the same motion
  const sparse = frames(8, 130);
  assert.deepEqual(rowsFor([rerunOf([el(7, 'div.thumb', sparse, sparse.map((x, i) => i * 20))])]), ['jump:unseen']);
  // the target was not found in the re-measures, or the probe did not run
  assert.deepEqual(rowsFor([{ jumps: [], interrupt: [] }, { jumps: [], interrupt: [] }]), ['jump:unseen']);
  // a re-measure that followed the same motion frame by frame and saw no jump rules the sighting out
  const smooth = rerunOf([el(7, 'div.thumb', t, t.map((_, i) => (i < 4 ? 0 : 4 * (i - 4))))]);
  assert.deepEqual(rowsFor([rerunOf([el(8, 'div.other', t, teleport(30))]), smooth]), []);
  // the reasons name the cause: a clear step on dense frames that is not reproduced is not "frames too sparse"
  const detail = clickRows('click #x', { ...f, jumpSightings: f.jumpSightings.map((s) => ({ ...s, dense: true })) }, ['jump'], [smooth, smooth])[0].detail;
  assert.match(detail, /seen in 1 of 3 recordings, not reproduced/);
  assert.doesNotMatch(detail, /too sparse/);
});

test('toggle wiring: a probe that returned no label or did not run cannot rule a restart out, and does not throw', () => {
  const sighting = { label: 'div.panel', prop: 'translateX', dense: false };
  const r = { label: 'button "Menu"', jumps: [{ label: 'div.panel', prop: 'translateX' }], sightings: [sighting], unsure: null };
  assert.equal(confirmToggle(r, [{ jumps: [{}] }, { jumps: [] }]), r, 'two of three probes saw it: kept');
  const lost = confirmToggle(r, [{ label: null }, { label: null }]);
  assert.deepEqual([lost.jumps, lost.undecided], [[], 'unseen']);
  assert.match(toggleRow(lost).detail, /the others could not judge/);
  const sees = { jumps: [], coverage: { ran: true, mark: { median: 17, max: 20 }, moves: [{ moment: '', label: 'div.panel', prop: 'translateX', samples: 12, unresolved: 0, maxDt: 20 }] } };
  const dropped = confirmToggle(r, [{ label: null }, sees]);
  assert.deepEqual([dropped.jumps, dropped.undecided], [[], null]);
  assert.equal(toggleRow(dropped), null);
  const clear = confirmToggle({ ...r, sightings: [{ ...sighting, dense: true }] }, [sees, sees]);
  assert.equal(clear.undecided, 'flake');
  assert.match(toggleRow(clear).detail, /seen in 1 of 3 recordings, not reproduced/);
});

test('hover wiring: an interrupt sighting is ruled out only by a probe that ran and followed the second gesture frame by frame', () => {
  const base = { label: 'button "Card"', unconfirmed: ['interrupt'], moments: {}, interruptSightings: [{ label: 'div.card', prop: 'translateY', dense: false }] };
  const cover = (mark) => ({ ran: true, mark, moves: [{ moment: '', label: 'div.card', prop: 'translateY', samples: 14, unresolved: 0, maxDt: 20 }] });
  const rerun = (coverage) => ({ interrupt: [], interruptCoverage: coverage });
  const kinds = (later) => undecidedOf(base, later).map((u) => `${u.check} ${u.key}`);
  assert.deepEqual(kinds([null, rerun(undefined)]), ['interrupt-jump hover'], 'the interrupt probe did not run in the re-measures');
  assert.deepEqual(kinds([rerun(cover({ median: 40, max: 60 })), rerun(cover({ median: 40, max: 60 }))]), ['interrupt-jump hover'], 'a rerun sampled at 30 fps');
  assert.deepEqual(kinds([rerun(cover(null)), rerun(NO_COVERAGE)]), ['interrupt-jump hover'], 'no mark: nothing to judge');
  assert.deepEqual(kinds([rerun(NO_COVERAGE), rerun(cover({ median: 17, max: 20 }))]), []);
  // the row carries the finding's fingerprint, and says why
  const [u] = undecidedOf(base, [null, null]);
  const out = judgeElement({ label: base.label, kind: 'button', selected: false, transition: { properties: [], durations: [], easings: [] }, moments: {}, long: [], undecided: [u] });
  assert.equal(out.length, 1);
  assert.equal(fingerprint(out[0]).split(':')[1], fingerprint({ kind: 'interrupt-jump', element: base.label, key: 'hover' }).split(':')[1]);
  assert.match(out[0].detail, /the others could not judge that motion/);
  assert.ok(markCadence({ marks: [], elems: [txElement(frames(10), frames(10))], anims: [] }, 100).max <= 20);
});

test('a hover jump sighting follows the same rule per gesture, label and property, for script-driven motion only', () => {
  const move = (over) => ({ prop: 'left', jumps: [{ atMs: 1, size: 9 }], samples: 20, unresolved: 0, cadence: { median: 17, max: 17 }, ...over });
  const gesture = (moves) => ({ unconfirmed: ['jump'], moments: { hover: { motion: [{ label: 'div.thumb', moves }] } } });
  const kinds = (first, later) => undecidedOf(first, later).map((u) => `${u.check} ${u.key}`);
  const same = gesture([move({ jumps: [], samples: 20 })]);
  assert.deepEqual(kinds(gesture([move({ cadence: { median: 17, max: 90 } })]), [same, same]), [], 'a re-measure followed the motion and saw no jump');
  assert.deepEqual(kinds(gesture([move({ cadence: { median: 17, max: 90 } })]), [gesture([]), null]), ['jump hover div.thumb left'], 'the motion is absent from the re-measures');
  assert.deepEqual(kinds(gesture([move({ cadence: { median: 17, max: 90 } })]), [gesture([move({ jumps: [], samples: 3 })]), null]), ['jump hover div.thumb left'], 'three samples are never examined');
  assert.deepEqual(kinds(gesture([move({})]), [same, same]), ['jump hover div.thumb left'], 'a clear step on dense frames that is not reproduced');
  // nothing is exempt because of what drives it: a focus move is judged by the same rule
  const focus = { unconfirmed: ['jump'], moments: { focus: { motion: [{ label: 'div.ring', moves: [move({ prop: 'width' })] }] } } };
  assert.deepEqual(kinds(focus, [gesture([]), null]), ['jump focus div.ring width']);
});
