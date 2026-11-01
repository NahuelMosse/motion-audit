// Paths where a candidate used to vanish without a row, or a row said something false about its recording.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fingerprint } from '../skills/motion-audit/scripts/lib/config.mjs';
import { judgeElement } from '../skills/motion-audit/scripts/lib/judge.mjs';
import { analyzeRecording, analyzeSeries } from '../skills/motion-audit/scripts/lib/series.mjs';
import { coverageOf } from '../skills/motion-audit/scripts/lib/sightings.mjs';
import { clickRows, toggleRow, undecidedOf } from '../skills/motion-audit/scripts/lib/undecided.mjs';
import { EASINGS, FRAME, bezier, txElement } from './helpers/curves.mjs';
import { againstGolden, isDenseCadence } from './helpers/golden.mjs';

const frames = (n, step = FRAME) => Array.from({ length: n }, (_, i) => i * step);
const withRest = (times) => [-2 * FRAME, -FRAME, ...times];
const transition = (props, ms, easing) => ({ properties: props, durations: props.map(() => ms), easings: props.map(() => easing) });

test('a teleport that Chromium samples in the middle of (the step spread over two dense intervals) is one jump; a steep smooth ease is none', () => {
  const t = withRest(frames(40));
  // linear(0, 0.27 49.99%, 0.73 50%, 1): a slow ramp, 270 px split 120 + 150 over two 17 ms intervals, a slow ramp
  const v = t.map((_, i) => { const k = i - 2; return k < 0 ? 0 : 3 * k + (k >= 19 ? 120 : 0) + (k >= 20 ? 150 : 0); });
  const r = analyzeSeries(t, v, 1);
  assert.equal(r.jumps.length, 1);
  assert.ok(r.jumps[0].size >= 270);
  assert.equal(r.unresolved, 0);
  // steep smooth eases at 60 Hz, at every phase: no jump
  for (const [name, ease] of Object.entries({ ...EASINGS, 'out 5': (u) => 1 - (1 - u) ** 5 })) {
    for (const dur of [100, 150, 250, 400]) {
      for (let phase = 0; phase < 16; phase++) {
        const times = withRest(frames(60).map((x) => x - (phase * FRAME) / 16));
        const out = analyzeSeries(times, times.map((x) => 300 * ease(Math.min(1, Math.max(0, x) / dur))), 1);
        assert.deepEqual(out?.jumps ?? [], [], `${name} ${dur} ms phase ${phase}`);
      }
    }
  }
});

test('a row carries the cadence of its own sighting, not the whole recording: a dense flake never passes as sparse', () => {
  const dense = { median: 17, max: 17 };
  const sighting = { label: 'div.thumb', prop: 'left', dense: true, cadence: dense };
  const first = { jumps: [{ label: 'div.thumb', prop: 'left' }], jumpSightings: [sighting], interrupt: [], interruptSightings: [], unsure: null, interruptUnsure: null, cadence: { median: 17, max: 60 } };
  const seeing = { jumps: [], coverage: { ran: true, mark: null, moves: [{ moment: '', label: 'div.thumb', prop: 'left', samples: 12, unresolved: 0, maxDt: 20 }] } };
  const [row] = clickRows('click #x', first, ['jump'], [seeing, seeing]);
  assert.deepEqual(row.cadence, dense);
  const report = { findings: [{ level: 'warning', kind: 'inconclusive', id: 'inconclusive:aaaaaaaaaa', element: 'click #x', detail: row.detail, cadence: row.cadence }] };
  assert.equal(againstGolden(report, [], 0).problems.length, 1, 'the golden rule sees the dense row as the failure it is');
  // the interrupt of the second click: the cadence around that click
  const around = { median: 17, max: 17 };
  const interrupt = { ...first, jumps: [], jumpSightings: [], interrupt: [{ label: 'div.card', prop: 'translateY' }], interruptSightings: [{ label: 'div.card', prop: 'translateY', dense: true, cadence: around }] };
  assert.deepEqual(clickRows('click #x', interrupt, ['interrupt'], [{ jumps: [], interrupt: [] }])[0].cadence, around);
  // a toggle: the sighting's, not the first reversal's
  const toggle = { label: 'button "Menu"', jumps: [], undecided: 'flake', sightings: [{ label: 'div.panel', prop: 'translateX', dense: true, cadence: dense }], cadence: { median: 40, max: 90 } };
  assert.deepEqual(toggleRow(toggle).cadence, dense);
  assert.equal(isDenseCadence(toggleRow(toggle).cadence), true);
});

test('a focus moment has its own cadence: a dense recording of it is never "too sparse"', () => {
  const press = (cadence) => ({ changed: ['box-shadow'], pixels: true, rootLabel: 'button.go', cadence, motion: [], transition: transition(['box-shadow'], 200, 'ease-in') });
  const el = (focus) => ({ label: 'button "Go"', kind: 'button', selected: false, transition: transition(['box-shadow'], 200, 'ease-in'), long: [], moments: { focus } });
  assert.deepEqual(judgeElement(el(press({ median: 17, max: 17 }))).filter((f) => f.kind === 'inconclusive'), []);
});

test('on a dense recording a declared ease-in whose fit ties with it is the finding, at every phase and duration', () => {
  const curve = bezier(0.42, 0, 1, 1);
  const tr = (d) => transition(['transform'], d, 'cubic-bezier(0.42, 0, 1, 1)');
  const seen = {};
  for (const duration of [120, 160, 200, 300, 450, 600]) {
    for (let phase = 0; phase < 16; phase++) {
      const times = Array.from({ length: 70 }, (_, i) => (i - 3) * FRAME - (phase * FRAME) / 16);
      const v = times.map((t) => (t <= 0 ? 0 : 300 * curve(Math.min(1, t / duration))));
      const motion = analyzeRecording({ elems: [txElement(times, v, { root: true, label: 'b' })], anims: [], marks: [] });
      const out = judgeElement({ label: 'x', kind: 'button', selected: false, transition: tr(duration), long: [], moments: { press: { changed: ['transform'], pixels: true, rootLabel: 'b', cadence: { median: 17, max: 17 }, transition: tr(duration), motion } } });
      const kinds = out.filter((f) => f.key === 'measured b').map((f) => f.kind);
      seen[kinds.join(',') || 'nothing'] = (seen[kinds.join(',') || 'nothing'] ?? 0) + 1;
    }
  }
  assert.deepEqual(seen, { 'ease-in': 96 });
});

test('a step the frames were too coarse to judge in hover, press or focus leaves a row with the jump fingerprint unless a decidable recording ruled it out', () => {
  // a 270 px teleport with the frames 120 ms apart: the step sits in intervals the judge cannot bound
  const t = withRest(frames(30, 120));
  const v = t.map((_, i) => { const k = i - 2; return k < 0 ? 0 : 3 * k * 5 + (k >= 14 ? 270 : 0); });
  const motion = analyzeRecording({ elems: [txElement(t, v, { root: true, label: 'div.thumb' })], anims: [], marks: [] });
  const move = motion[0].moves[0];
  assert.ok(move.unresolved > 0 && move.jumps.length === 0, JSON.stringify({ unresolved: move.unresolved, jumps: move.jumps }));
  const gesture = (name) => ({ label: 'button "Go"', moments: { [name]: { motion, changed: ['left'], pixels: true } } });
  const kinds = (el, later) => undecidedOf(el, later).map((u) => `${u.check} ${u.key}`);
  for (const name of ['hover', 'press', 'focus']) {
    const el = gesture(name);
    assert.deepEqual(kinds(el, [null, null]), [`jump ${name} div.thumb ${move.prop}`], `${name}: nothing could judge it`);
    // a re-measure that followed the same motion frame by frame and saw no jump rules it out
    const smooth = analyzeRecording({ elems: [txElement(withRest(frames(40)), withRest(frames(40)).map((_, i) => 2 * i), { root: true, label: 'div.thumb' })], anims: [], marks: [] });
    const seeing = { moments: { [name]: { motion: smooth } } };
    assert.deepEqual(kinds(el, [seeing, seeing]), []);
    // the row has the fingerprint of the jump finding it stands for, and the cadence of that motion
    const [row] = undecidedOf(el, [null, null]);
    const out = judgeElement({ ...el, kind: 'button', selected: false, transition: transition([], 0, 'ease'), long: [], undecided: [row] });
    assert.equal(out[0].kind, 'inconclusive');
    assert.equal(fingerprint(out[0]).split(':')[1], fingerprint({ kind: 'jump', element: el.label, key: row.key }).split(':')[1]);
    assert.deepEqual(out[0].cadence, move.cadence);
  }
  assert.ok(coverageOf(motion).moves.length > 0);
});

// Joins (a node replaced by another) follow the same rule as any step: judged intervals, by frame time and read time.
test('two nodes joined across a 300 ms cut with a continuous trajectory give no jump, like one node; across a 17 ms cut with an offset they do', () => {
  const ramp = (ts) => ts.map((x) => 0.6 * x);
  const joined = (gap, offset) => {
    const a = frames(30).map((x) => x); // 0 .. ~490 ms
    const b = frames(30).map((x) => x + a.at(-1) + gap);
    const elems = [txElement(a, ramp(a), { id: 1, parent: 5, label: 'div.item' }), txElement(b, ramp(b).map((v) => v + offset), { id: 2, parent: 5, label: 'div.item' })];
    return analyzeRecording({ elems, anims: [], marks: [] })[0].moves.find((m) => m.prop === 'translateX');
  };
  const across = joined(300, 0);
  assert.deepEqual(across.jumps, []);
  assert.ok(across.unresolved > 0, 'the long interval across the join leaves it unresolved');
  const single = frames(30).flatMap((x) => [x]);
  const oneNode = analyzeSeries([...single, ...single.map((x) => x + single.at(-1) + 300)], ramp([...single, ...single.map((x) => x + single.at(-1) + 300)]), 1);
  assert.deepEqual(oneNode.jumps, []);
  const teleport = joined(FRAME, 300);
  assert.equal(teleport.jumps.length, 1, 'a join judged in 17 ms intervals with a 300 px offset is a teleport');
});

// What sparse recordings may and may not do: a step is a jump only when judged, by frame time and by read time, with judged neighbours.
test('sparse recordings never confirm a jump through a step beside long intervals or a value read after a stall', () => {
  let neighbours = 0;
  let reads = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const rand = (k) => { const x = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
    // (a) a sharp step in a 60-95 ms interval with a 120-200 ms interval on each side
    const dts = [40, 40, 40, 40, 120 + rand(1) * 80, 60 + rand(2) * 35, 120 + rand(3) * 80, 40, 40, 40, 40, 40];
    const times = [-2 * FRAME, -FRAME, ...dts.reduce((acc, dt) => [...acc, acc.at(-1) + dt], [0])];
    const stepAt = 2 + 5 + 1;
    const v = times.map((_, i) => (i < 2 ? 0 : 6 * (i - 2) + (i >= stepAt ? 200 : 0)));
    const a = analyzeSeries(times, v, 1);
    if (a.jumps.length) neighbours++;
    assert.ok(a.unresolved > 0, `seed ${seed}: the step is left unresolved`);
    // (b) a ramp whose values were read after random stalls of 110-200 ms while the frame timestamps stayed at 60 Hz
    const frames60 = withRest(frames(50));
    let stall = 0;
    const readAt = frames60.map((x, i) => { if (i > 10 && rand(10 + i) < 0.08) stall += 110 + rand(i) * 90; return x + stall; });
    const ramp = readAt.map((r) => 300 * Math.min(1, Math.max(0, r) / (600 + stall)));
    const b = analyzeSeries(frames60, ramp, 1, [], [], readAt);
    if (b?.jumps.length) reads++;
  }
  assert.equal(neighbours, 0);
  assert.equal(reads, 0);
});
