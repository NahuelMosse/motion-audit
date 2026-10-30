import test from 'node:test';
import assert from 'node:assert/strict';
import { interruptionJumps } from '../skills/motion-audit/scripts/lib/continuity.mjs';
import { EASINGS, FRAME, irregularTimes, prng, txElement } from './helpers/curves.mjs';

const AMP = 250;

// A panel opening from 0 to 250 px, interrupted at `m` ms. `after(p0, tSinceMark)` is its value afterwards.
const interrupted = ({ ease, dur, share, rand, minF, maxF, after }) => {
  const m = dur * share;
  const p0 = AMP * ease(share);
  const times = irregularTimes(rand, -3 * FRAME, m + dur + 200, minF, maxF);
  const tx = times.map((t) => (t < 0 ? 0 : t <= m ? AMP * ease(t / dur) : after(p0, t - m)));
  return { m, p0, rec: { marks: [m], elems: [txElement(times, tx)], anims: [] } };
};

// CSS reverses from the live value with a shortened duration.
const reverseFromLive = (ease, dur) => (p0, s) => { const d2 = dur * (p0 / AMP); return p0 * (1 - ease(s / d2)); };
// A keyframe class swap: the closing animation starts at its own `from` (fully open).
const restartAtFrom = (ease, dur) => (p0, s) => AMP * (1 - ease(s / dur));

test('a CSS transition reversing from its live value is never flagged, sampled every 1 to 4 frames', () => {
  for (const [name, ease] of Object.entries(EASINGS)) {
    for (const [minF, maxF] of [[1, 1], [1, 3], [2, 4]]) {
      let flagged = 0;
      for (let seed = 1; seed <= 100; seed++) {
        const rand = prng(seed * 104729);
        const dur = 200 + Math.floor(rand() * 300);
        const share = 0.3 + rand() * 0.25;
        const { m, rec } = interrupted({ ease, dur, share, rand, minF, maxF, after: reverseFromLive(ease, dur) });
        rec.anims = [{ t: m + 5, nodeId: 1, type: 'transition', props: ['transform'], explicitFrom: true }];
        if (interruptionJumps(rec, m, { durationMs: dur }).length) flagged++;
      }
      assert.equal(flagged, 0, `${name} sampled every ${minF}-${maxF} frames: ${flagged} of 100 reversals flagged`);
    }
  }
});

test('a reversal with no Animation objects is not flagged when sampling is too coarse to bound velocity', () => {
  for (const [name, ease] of Object.entries(EASINGS)) {
    let flagged = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const rand = prng(seed * 31);
      const dur = 200 + Math.floor(rand() * 300);
      const { m, rec } = interrupted({ ease, dur, share: 0.3 + rand() * 0.25, rand, minF: 2, maxF: 4, after: restartAtFrom(ease, dur) });
      if (interruptionJumps(rec, m, { durationMs: dur }).length) flagged++;
    }
    assert.equal(flagged, 0, `${name}: ${flagged} flagged without evidence`);
  }
});

test('a keyframe animation that restarts at its from value is flagged at any sampling density', () => {
  const ease = EASINGS['strong ease-out'];
  for (const [minF, maxF] of [[1, 1], [1, 3], [2, 4]]) {
    let flagged = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const rand = prng(seed * 17);
      const dur = 300 + Math.floor(rand() * 200);
      const { m, rec } = interrupted({ ease, dur, share: 0.3, rand, minF, maxF, after: restartAtFrom(ease, dur) });
      rec.anims = [{ t: m + 8, nodeId: 1, type: 'animation', props: ['transform'], explicitFrom: true }];
      if (interruptionJumps(rec, m, { durationMs: dur }).length) flagged++;
    }
    assert.equal(flagged, 60, `sampled every ${minF}-${maxF} frames: ${flagged} of 60 restarts found`);
  }
});

test('a restart is attributed to the animated element and its descendants only', () => {
  const ease = EASINGS['strong ease-out'];
  const rand = prng(5);
  const { m, rec } = interrupted({ ease, dur: 400, share: 0.3, rand, minF: 1, maxF: 2, after: restartAtFrom(ease, 400) });
  rec.anims = [{ t: m + 8, nodeId: 99, type: 'animation', props: ['transform'], explicitFrom: true }];
  const fine = interruptionJumps({ ...rec, elems: rec.elems.map((e) => ({ ...e, parent: 0 })) }, m, { durationMs: 400 });
  // Fine sampling still catches the teleport by position, but the evidence is not the unrelated animation.
  assert.ok(fine.every((j) => j.evidence === 'position'));
});

test('a JS-driven value that teleports is flagged when sampled every frame and left alone when sampled coarsely', () => {
  const ease = EASINGS['ease-in-out'];
  const run = (minF, maxF) => {
    let flagged = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const rand = prng(seed * 13);
      const { m, rec } = interrupted({ ease, dur: 400, share: 0.3, rand, minF, maxF, after: restartAtFrom(ease, 400) });
      if (interruptionJumps(rec, m, { durationMs: 400 }).length) flagged++;
    }
    return flagged;
  };
  assert.equal(run(1, 1), 40);
  assert.equal(run(3, 4), 0);
});

test('small mode judges a 12 px hover snap against the property range', () => {
  const times = irregularTimes(prng(3), -3 * FRAME, 500, 1, 1);
  const m = 200;
  const ty = times.map((t) => (t < 0 ? 0 : t <= m ? -12 * (t / 400) : 0));
  const el = txElement(times, times.map(() => 0), { ty });
  const rec = { marks: [m], elems: [el], anims: [{ t: m + 5, nodeId: 1, type: 'cancel', props: ['transform'], explicitFrom: false }] };
  assert.equal(interruptionJumps(rec, m, { durationMs: 400 }).length, 0, 'a 12 px range is below the 24 px step of a toggle panel');
  assert.equal(interruptionJumps(rec, m, { durationMs: 400, small: true }).length, 1);
});
