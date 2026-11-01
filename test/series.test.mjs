import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSeries, easingKind, unwrap } from '../skills/motion-audit/scripts/lib/series.mjs';
import { EASINGS, FRAME, bezier, irregularTimes, prng } from './helpers/curves.mjs';

const series = (ease, dur, amp, times) => times.map((t) => amp * ease(t / dur));
const withRest = (times) => [-2 * FRAME, -FRAME, ...times];

test('a smooth strong ease-out never reports a jump at any sampling density', () => {
  for (const [name, ease] of Object.entries(EASINGS)) {
    for (const [minF, maxF] of [[1, 1], [1, 3], [2, 4]]) {
      let withJumps = 0;
      for (let seed = 1; seed <= 150; seed++) {
        const rand = prng(seed * 7919);
        const dur = 200 + Math.floor(rand() * 300);
        const times = withRest(irregularTimes(rand, 0, dur + 400, minF, maxF));
        const r = analyzeSeries(times, series(ease, dur, 200, times), 1);
        if (r?.jumps.length) withJumps++;
      }
      assert.equal(withJumps, 0, `${name} sampled every ${minF}-${maxF} frames produced jumps in ${withJumps} of 150 series`);
    }
  }
});

test('a value that teleports mid-motion is a jump when sampled every frame', () => {
  let found = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const rand = prng(seed);
    const times = withRest(irregularTimes(rand, 0, 1000, 1, 1));
    const v = times.map((t) => (t <= 0 ? 0 : Math.min(350, (200 * Math.min(1, t / 600)) + (t > 300 ? 150 : 0))));
    const r = analyzeSeries(times, v, 1);
    if (r?.jumps.length) found++;
  }
  assert.equal(found, 30);
});

test('a toast that fades in, holds and fades out is a round trip with no jumps', () => {
  const ease = EASINGS['strong ease-out'];
  const rand = prng(11);
  const times = withRest(irregularTimes(rand, 0, 1800, 1, 3));
  const v = times.map((t) => (t <= 0 ? 0 : t < 200 ? ease(t / 200) : t < 1200 ? 1 : 1 - ease((t - 1200) / 200)));
  const r = analyzeSeries(times, v, 0.02);
  assert.equal(r.shape, 'round-trip');
  assert.deepEqual(r.jumps, []);
});

test('analyzeSeries classifies the curve shapes of a settled motion', () => {
  const times = withRest(Array.from({ length: 40 }, (_, i) => i * FRAME));
  const shape = (f) => analyzeSeries(times, times.map((t) => 100 * f(Math.max(0, t) / 500)), 1).shape;
  assert.equal(shape((u) => Math.min(1, u)), 'linear');
  assert.equal(shape((u) => 1 - (1 - Math.min(1, u)) ** 3), 'ease-out');
  assert.equal(shape((u) => Math.min(1, u) ** 3), 'ease-in');
  assert.equal(shape(bezier(0.23, 1, 0.32, 1)), 'ease-out');
});

test('a series that does not move produces nothing', () => {
  const times = withRest(Array.from({ length: 10 }, (_, i) => i * FRAME));
  assert.equal(analyzeSeries(times, times.map(() => 5), 1), null);
});

test('easingKind recognises declared curves', () => {
  assert.equal(easingKind('linear'), 'linear');
  assert.equal(easingKind('ease-in'), 'ease-in');
  assert.equal(easingKind('cubic-bezier(0.42, 0, 1, 1)'), 'ease-in');
  assert.equal(easingKind('cubic-bezier(0.23, 1, 0.32, 1)'), 'ok');
  assert.equal(easingKind('cubic-bezier(0.4, 0, 0.2, 1)'), 'ok');
  assert.equal(easingKind('ease'), 'ok');
  assert.equal(easingKind('steps(4, end)'), 'ok');
});

test('unwrap makes a spinning angle continuous', () => {
  assert.deepEqual(unwrap([170, -170, -150]), [170, 190, 210]);
});

// A step becomes a jump only if it was judged in an interval within the jump-judging limit, by frame time and by the time its
// value was read, with both neighbours as short: otherwise it can only leave the motion unresolved.
test('a value read long after its frame started (a long task in between) is not a jump', () => {
  const frames = withRest(Array.from({ length: 50 }, (_, i) => i * FRAME));
  // the frame timestamps are 60 Hz, but from the 12th frame on every value was read 130 ms later than it should have been
  const reads = frames.map((t, i) => t + (i > 14 ? 130 : 0));
  const v = reads.map((r) => 300 * Math.min(1, Math.max(0, r) / 600));
  const viaFrames = analyzeSeries(frames, v, 1);
  assert.ok(viaFrames.jumps.length > 0, 'judged by the frame times alone the stall looks like a teleport');
  const judged = analyzeSeries(frames, v, 1, [], [], reads);
  assert.deepEqual(judged.jumps, []);
  assert.ok(judged.unresolved > 0);
});

test('a step between two intervals longer than the judging limit is unresolved, however sharp; with judged neighbours it is a jump', () => {
  const at = (dts) => dts.reduce((acc, dt) => [...acc, acc.at(-1) + dt], [0]);
  const run = (dts) => {
    const times = [-2 * FRAME, -FRAME, ...at(dts)];
    const step = dts.findIndex((d, i) => d === 60 && i > 3);
    const v = times.map((_, i) => { const k = i - 2; return k < 0 ? 0 : k <= step ? 6 * k : 6 * k + 150; });
    return analyzeSeries(times, v, 1);
  };
  const sparse = run([40, 40, 40, 40, 120, 60, 120, 40, 40, 40, 40, 40, 40]);
  assert.deepEqual(sparse.jumps, []);
  assert.ok(sparse.unresolved > 0);
  const judged = run([40, 40, 40, 40, 50, 60, 50, 40, 40, 40, 40, 40, 40]);
  assert.equal(judged.jumps.length, 1);
});

test('sparse samples (17 to 133 ms apart) of CSS-like eases never end in a confirmed jump', () => {
  const ease = EASINGS['strong ease-out'];
  let jumps = 0;
  for (const [amp, dur, eps] of [[0.03, 120, 0.01], [120, 400, 1], [300, 600, 1]]) {
    for (let seed = 1; seed <= 400; seed++) {
      const times = withRest(irregularTimes(prng(seed * 7919 + dur), 0, dur + 600, 1, 8));
      if (analyzeSeries(times, times.map((t) => amp * ease(Math.max(0, t) / dur)), eps)?.jumps.length) jumps++;
    }
  }
  assert.equal(jumps, 0);
});
