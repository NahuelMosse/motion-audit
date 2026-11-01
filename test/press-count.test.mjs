// The press count of --click is a safety contract: a recording that leaves nothing to decide costs exactly two presses (four with
// --interrupt) at any cadence; a motion the frames could not judge adds recordings, never beyond the documented cap (eight presses,
// sixteen with --interrupt, counting the re-measures of a flaky aspect), and with --interrupt the count stays even.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CLICK_RESOLVE_RETRIES, CONFIRM_RUNS } from '../skills/motion-audit/scripts/lib/constants.mjs';
import { clickMeasurer } from '../skills/motion-audit/scripts/lib/probes.mjs';
import { EASINGS, FRAME, txElement } from './helpers/curves.mjs';

const ease = EASINGS['ease-in-out'];
// `bump`: a slow ramp with one mild skip of 35 % half-way: a step the speed test cannot settle when the frames are 67 ms apart.
const series = { static: () => 0, easeOut: (t) => 200 * ease(Math.min(1, Math.max(0, t) / 500)), bump: (t) => 200 * (Math.min(1, 0.0012 * Math.max(0, t)) + (t >= 300 ? 0.35 : 0)) };
const cadence = { dense: (n) => Array.from({ length: n }, (_, i) => (i - 3) * FRAME), sparse: (n) => Array.from({ length: n }, (_, i) => (i - 3) * 66.7) };

// A page whose press yields `curve` sampled at `frames`; counts the presses its attempts make.
const page = (curve, frames, interrupt) => {
  const state = { presses: 0, attempts: 0 };
  const makeAttempt = () => async (trace) => {
    state.attempts++;
    state.presses += interrupt ? 2 : 1;
    const t = frames(40);
    const rec = { marks: interrupt ? [t[3], t[8]] : [t[3]], anims: [], mounted: 0, elems: [txElement(t, t.map(curve), { root: false, label: 'div.box' })] };
    return { from: t[0], loaf: [], rec: trace ? rec : null };
  };
  return { state, measure: clickMeasurer({ page: {}, url: 'x', loadOptions: {} }, '#go', interrupt, makeAttempt) };
};

for (const interrupt of [false, true]) {
  const per = interrupt ? 2 : 1;
  test(`a recording that leaves nothing to decide costs exactly ${2 * per} presses at any cadence${interrupt ? ' (interrupt)' : ''}`, async () => {
    for (const [name, frames] of Object.entries(cadence)) {
      for (const [shape, curve] of [['static', series.static], ['smooth ease at 60 Hz', series.easeOut]]) {
        if (shape !== 'static' && name === 'sparse') continue; // a sparse recording of a motion may be unresolved: next test
        const p = page(curve, frames, interrupt);
        await p.measure();
        assert.equal(p.state.presses, 2 * per, `${shape}, ${name} frames`);
      }
    }
  });

  test(`a motion the frames could not judge is recorded again within the cap${interrupt ? ', and the count stays even (interrupt)' : ''}`, async () => {
    const p = page(series.bump, cadence.sparse, interrupt);
    const result = await p.measure();
    assert.ok(result.moved.some((e) => e.moves.some((m) => m.unresolved > 0)), 'the sparse motion is unresolved');
    assert.ok(p.state.attempts > 2, 'it was recorded again');
    const firstMeasure = (2 + CLICK_RESOLVE_RETRIES) * per;
    assert.ok(p.state.presses <= firstMeasure, `${p.state.presses} presses in the first measurement`);
    if (interrupt) assert.equal(p.state.presses % 2, 0);
    // the re-measures of a flaky aspect never retry: two presses (four with --interrupt) each, CONFIRM_RUNS - 1 of them
    const again = page(series.bump, cadence.sparse, interrupt);
    await again.measure(0);
    assert.equal(again.state.presses, 2 * per);
    const worst = firstMeasure + (CONFIRM_RUNS - 1) * 2 * per;
    assert.equal(worst, interrupt ? 16 : 8, 'the documented maximum');
  });
}
