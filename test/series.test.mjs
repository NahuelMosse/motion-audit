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
