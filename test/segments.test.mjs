import test from 'node:test';
import assert from 'node:assert/strict';
import { interruptionJumps } from '../skills/motion-audit/scripts/lib/continuity.mjs';
import { sparsity } from '../skills/motion-audit/scripts/lib/probes.mjs';
import { analyzeRecording, analyzeSeries } from '../skills/motion-audit/scripts/lib/series.mjs';
import { EASINGS, FRAME, irregularTimes, prng, txElement } from './helpers/curves.mjs';

const withRest = (times) => [-2 * FRAME, -FRAME, ...times];

// A toast: slides in over `inMs`, holds, slides out over `outMs`. `enter(u)` and `leave(u)` are 0..1 curves.
const toast = (times, { inMs, holdMs, outMs, enter, leave, amp = 350 }) => times.map((t) => {
  if (t <= 0) return 0;
  if (t < inMs) return amp * enter(t / inMs);
  if (t < inMs + holdMs) return amp;
  if (t < inMs + holdMs + outMs) return amp * (1 - leave((t - inMs - holdMs) / outMs));
  return 0;
});

test('a toast that teleports in, holds 300 ms and leaves smoothly has a jump on its way in', () => {
  let found = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const times = withRest(irregularTimes(prng(seed), 0, 1600, 1, 1));
    const out = EASINGS['strong ease-out'];
    const v = times.map((t) => {
      if (t <= 0) return 0;
      if (t < 600) return Math.min(350, 200 * (t / 600) + (t > 300 ? 150 : 0));
      if (t < 900) return 350;
      if (t < 1300) return 350 * (1 - out((t - 900) / 400));
      return 0;
    });
    const r = analyzeSeries(times, v, 1);
    assert.equal(r.shape, 'round-trip');
    if (r.jumps.some((j) => Math.abs(j.atMs - 300) < 60 && j.size >= 100)) found++;
  }
  assert.equal(found, 30);
});

test('a toast that leaves with a jump has the jump found on its way out', () => {
  let found = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const times = withRest(irregularTimes(prng(seed * 3), 0, 1800, 1, 1));
    const ease = EASINGS['strong ease-out'];
    const v = times.map((t) => {
      if (t <= 0) return 0;
      if (t < 400) return 300 * ease(t / 400);
      if (t < 700) return 300;
      if (t < 1100) { const u = (t - 700) / 400; return Math.max(0, 300 * (1 - u) - (u > 0.5 ? 120 : 0)); }
      return 0;
    });
    const r = analyzeSeries(times, v, 1);
    if (r.jumps.length) found++;
  }
  assert.equal(found, 30);
});

test('smooth legs with different amplitudes of speed never report a jump at any sampling density', () => {
  for (const [enterName, enter] of Object.entries(EASINGS)) {
    for (const [leaveName, leave] of Object.entries(EASINGS)) {
      for (const [minF, maxF] of [[1, 1], [1, 3], [2, 4]]) {
        let withJumps = 0;
        for (let seed = 1; seed <= 25; seed++) {
          const rand = prng(seed * 7919);
          const inMs = 200 + Math.floor(rand() * 300);
          const outMs = 150 + Math.floor(rand() * 250);
          const times = withRest(irregularTimes(rand, 0, inMs + 300 + outMs + 400, minF, maxF));
          const r = analyzeSeries(times, toast(times, { inMs, holdMs: 300, outMs, enter, leave }), 1);
          if (r?.jumps.length) withJumps++;
        }
        assert.equal(withJumps, 0, `in ${enterName}, out ${leaveName}, sampled every ${minF}-${maxF} frames: ${withJumps} of 25 flagged`);
      }
    }
  }
});

test('a teleport is found when the machine renders 30 fps with stalls, and smooth curves stay clean at that cadence', () => {
  const ease = EASINGS['strong ease-out'];
  let found = 0;
  let falsePositives = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const rand = prng(seed * 31);
    const times = withRest(irregularTimes(rand, 0, 1400, 1, 3)); // 1 to 3 frames: 17 to 50 ms, stalls included
    const jumpy = times.map((t) => (t <= 0 ? 0 : Math.min(350, 200 * Math.min(1, t / 600) + (t > 300 ? 150 : 0))));
    if (analyzeSeries(times, jumpy, 1)?.jumps.length) found++;
    const smooth = times.map((t) => (t <= 0 ? 0 : 350 * ease(t / 600)));
    if (analyzeSeries(times, smooth, 1)?.jumps.length) falsePositives++;
  }
  assert.ok(found >= 54, `${found} of 60 teleports found`);
  assert.equal(falsePositives, 0);
});

test('a rAF ease-in hover sampled every 1 to 6 frames, as on a 30 fps runner, is never a jump', () => {
  let flagged = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const rand = prng(seed * 97);
    const times = withRest(irregularTimes(rand, 0, 700, 1, 6));
    const v = times.map((t) => (t <= 0 ? 0 : -10 * Math.min(1, t / 250) ** 3));
    if (analyzeSeries(times, v, 1)?.jumps.length) flagged++;
  }
  assert.equal(flagged, 0);
});

test('the first moved sample of a series is reported, so a motion started by a click is told from an ambient one at any cadence', () => {
  const times = [-100, -50, 0, 50, 100, 150, 200, 250, 300, 350].map((t) => t + 1000);
  const v = times.map((t) => (t < 1000 + 30 ? 0 : Math.min(100, (t - 1030) * 0.6)));
  const r = analyzeSeries(times, v, 1);
  assert.equal(r.firstT, 1050);
  assert.equal(r.startT, 1000);
});

test('a jump in a frame that overlaps a long frame is the long frame; elsewhere it stays a jump', () => {
  const times = withRest(irregularTimes(prng(4), 0, 1000, 1, 1));
  const v = times.map((t) => (t <= 0 ? 0 : Math.min(350, 200 * Math.min(1, t / 600) + (t > 300 ? 150 : 0))));
  const at = analyzeSeries(times, v, 1).jumps[0].atMs;
  assert.deepEqual(analyzeSeries(times, v, 1, [], [[at - 20, 150]]).jumps, []);
  assert.equal(analyzeSeries(times, v, 1, [], [[900, 80]]).jumps.length, 1);
});

test('sparsity tells a densely sampled motion from one sampled every 50 ms', () => {
  const ease = EASINGS['strong ease-out'];
  const motion = (step) => {
    const times = withRest(Array.from({ length: Math.ceil(900 / step) }, (_, i) => i * step));
    return analyzeRecording({ elems: [txElement(times, times.map((t) => (t <= 0 ? 0 : 100 * ease(t / 400))))], marks: [], anims: [] });
  };
  assert.ok(sparsity(motion(FRAME)) >= 0.9, `dense: ${sparsity(motion(FRAME))}`);
  assert.ok(sparsity(motion(50)) < 0.5, `sparse: ${sparsity(motion(50))}`);
  assert.equal(sparsity([]), Infinity);
});

// ---------- a node removed and a new one mounted in its place (React `key` change) ----------

const bar = (id, times, widths, extra = {}) => {
  const el = txElement(times, times.map(() => 0), { id, parent: 7, label: 'div.bar', tag: 'DIV', width: widths, ow: widths, ...extra });
  return el;
};
const grow = (t, dur, to = 270) => to * (1 - (1 - Math.min(1, Math.max(0, t / dur))) ** 3);

test('a node removed mid-animation and a same-tag node mounted in the same parent form one series that jumps', () => {
  const t1 = Array.from({ length: 22 }, (_, i) => i * FRAME); // old node: sampled until 350 ms
  const t2 = Array.from({ length: 40 }, (_, i) => t1.at(-1) + FRAME + i * FRAME); // new node: from the next frame
  const a = bar(1, t1, t1.map((t) => grow(t, 800)));
  const b = bar(2, t2, t2.map((t) => grow(t - t2[0], 800)));
  const moves = analyzeRecording({ elems: [a, b], marks: [], anims: [] });
  assert.equal(moves.length, 1, 'one element after joining');
  const width = moves[0].moves.find((m) => m.prop === 'width');
  assert.ok(width.jumps.length >= 1, JSON.stringify(width));
  assert.ok(width.jumps[0].size > 100);
});

test('a node that had finished moving and is replaced by a new one that starts over is a new entrance, not a jump', () => {
  const t1 = Array.from({ length: 70 }, (_, i) => i * FRAME);
  const t2 = Array.from({ length: 40 }, (_, i) => t1.at(-1) + FRAME + i * FRAME);
  const a = bar(1, t1, t1.map((t) => grow(t, 400)));
  const b = bar(2, t2, t2.map((t) => grow(t - t2[0], 800)));
  const found = analyzeRecording({ elems: [a, b], marks: [], anims: [] }).flatMap((e) => e.moves.flatMap((m) => m.jumps));
  assert.deepEqual(found, []);
});

test('the join follows a slow sampling interval: a re-mounted node is found when frames come every 50 ms', () => {
  const step = 50;
  const t1 = Array.from({ length: 8 }, (_, i) => i * step);
  const t2 = Array.from({ length: 18 }, (_, i) => t1.at(-1) + step + i * step);
  const a = bar(1, t1, t1.map((t) => grow(t, 800)));
  const b = bar(2, t2, t2.map((t) => grow(t - t2[0], 800)));
  const moves = analyzeRecording({ elems: [a, b], marks: [], anims: [] });
  assert.equal(moves.length, 1);
  assert.ok(moves[0].moves.find((m) => m.prop === 'width').jumps.length >= 1);
});

test('nodes of another tag or another parent are not joined', () => {
  const t1 = Array.from({ length: 22 }, (_, i) => i * FRAME);
  const t2 = Array.from({ length: 40 }, (_, i) => t1.at(-1) + FRAME + i * FRAME);
  const a = bar(1, t1, t1.map((t) => grow(t, 800)));
  const otherTag = bar(2, t2, t2.map((t) => grow(t - t2[0], 800)), { tag: 'SPAN', label: 'span.bar' });
  const otherParent = bar(3, t2, t2.map((t) => grow(t - t2[0], 800)), { parent: 8 });
  assert.equal(analyzeRecording({ elems: [a, otherTag], marks: [], anims: [] }).length, 2);
  assert.equal(analyzeRecording({ elems: [a, otherParent], marks: [], anims: [] }).length, 2);
});

// ---------- a jump right after a long frame is the long frame ----------

// A JS animation on its own clock (`start` fixed before a blocking handler): when the handler ends, the
// value has advanced by the time the handler consumed, in a single frame.
const afterBlockingHandler = () => {
  const times = irregularTimes(prng(9), -3 * FRAME, 900, 1, 1);
  const m = 160;
  const tx = times.map((t) => (t < 0 ? 0 : 250 * Math.min(1, (t <= m ? t : t + 400) / 900)));
  return { m, rec: { marks: [m], elems: [txElement(times, tx)], anims: [] } };
};

test('a step in the frame after a long frame is the long frame, not an interrupt jump', () => {
  const { m, rec } = afterBlockingHandler();
  assert.ok(interruptionJumps(rec, m, { durationMs: 320, small: true }).length > 0, 'without the long frame the step is a jump');
  assert.deepEqual(interruptionJumps(rec, m, { durationMs: 320, small: true, longFrames: [[m - 5, 400]] }), []);
});

test('a long frame that is not next to the step does not hide it', () => {
  const { m, rec } = afterBlockingHandler();
  assert.ok(interruptionJumps(rec, m, { durationMs: 320, small: true, longFrames: [[700, 80]] }).length > 0);
});
