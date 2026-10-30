// Pure trajectory analysis: one property sampled over time, curve classification, jump detection.
import { JUMP_MAX_DT_MS, JUMP_MIN_SHARE, JUMP_PEAK_SLOPE, OVERSHOOT_SPRING_PCT } from './constants.mjs';

export const round = (x, d = 1) => Math.round(x * 10 ** d) / 10 ** d;
export const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  if (!s.length) return 0;
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

export const COLS = ['left', 'top', 'width', 'height', 'opacity', 'tx', 'ty', 'sx', 'sy', 'rot', 'ow', 'oh'];
export const PROP_OF = { left: 'left', top: 'top', width: 'width', height: 'height', opacity: 'opacity', tx: 'translateX', ty: 'translateY', sx: 'scaleX', sy: 'scaleY', rot: 'rotate', ow: 'layoutWidth', oh: 'layoutHeight' };
export const EPS = { left: 1, top: 1, width: 1, height: 1, translateX: 1, translateY: 1, scaleX: 0.01, scaleY: 0.01, rotate: 1, opacity: 0.02, layoutWidth: 1, layoutHeight: 1 };

const SHAPES = [
  ['linear', (u) => u],
  ['ease-out', (u) => 1 - (1 - u) ** 2], ['ease-out', (u) => 1 - (1 - u) ** 3], ['ease-out', (u) => 1 - (1 - u) ** 5],
  ['ease-in', (u) => u ** 2], ['ease-in', (u) => u ** 3],
  ['ease-in-out', (u) => (u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) ** 2)], ['ease-in-out', (u) => (u < 0.5 ? 4 * u ** 3 : 1 - 4 * (1 - u) ** 3)],
];

// Angles read from a matrix wrap at +-180 degrees: unwrap so a spinning element is a smooth series.
export const unwrap = (v) => v.reduce((out, x, i) => {
  if (!i) return [x];
  let y = x;
  while (y - out[i - 1] > 180) y -= 360;
  while (y - out[i - 1] < -180) y += 360;
  return [...out, y];
}, []);

// Jumps of a settled motion. Velocity is taken per millisecond, so irregular sampling does not
// change it; only intervals short enough to bound the instantaneous velocity count. A jump is a
// step that is a sizeable share of the amplitude and moves several times faster than the average
// speed of the whole motion (no easing curve peaks that high after its first interval) and than
// both short neighbours. The first interval is skipped: an ease-out legitimately starts fastest.
const findJumps = (t, v, start, settle, amp, t0, shape) => {
  const jumps = [];
  if (settle - start < 4) return jumps;
  const avgVelocity = amp / Math.max(1, t[settle] - t0);
  const peak = JUMP_PEAK_SLOPE * (shape === 'spring' ? 2 : 1);
  const velocity = (k) => {
    const dt = t[k] - t[k - 1];
    return dt > 0 && dt <= JUMP_MAX_DT_MS ? Math.abs(v[k] - v[k - 1]) / dt : null;
  };
  for (let k = start + 1; k <= settle; k++) {
    const vel = velocity(k);
    if (vel === null) continue;
    const step = Math.abs(v[k] - v[k - 1]);
    if (step < JUMP_MIN_SHARE * amp || vel < peak * avgVelocity) continue;
    const neighbours = [velocity(k - 1), velocity(k + 1)].filter((x) => x !== null);
    if (neighbours.some((x) => vel < 2 * x)) continue;
    jumps.push({ atMs: round(t[k] - t0, 0), size: round(step, 2) });
  }
  return jumps;
};

// One property over time (`t` ms, `v` values): duration, overshoot, curve shape and jumps.
export const analyzeSeries = (t, v, eps) => {
  const n = v.length;
  if (n < 4) return null;
  const first = v[0];
  const final = v[n - 1];
  const range = Math.max(...v) - Math.min(...v);
  if (range < eps) return null;
  const returns = Math.abs(final - first) < eps;
  const amp = returns ? range : Math.abs(final - first);
  const dir = returns ? 1 : Math.sign(final - first);
  const tol = amp * 0.005;
  const start = v.findIndex((x) => Math.abs(x - first) > tol);
  if (start < 1) return null;
  const tail = v.slice(-4);
  const settled = tail.every((x, i) => i === 0 || Math.abs(x - tail[i - 1]) <= tol);
  let settle = n - 1;
  if (settled) while (settle > start && Math.abs(v[settle - 1] - final) <= tol) settle--;
  const t0 = t[start - 1];
  let over = 0;
  if (!returns && settled) for (let j = start; j < n; j++) over = Math.max(over, (v[j] - final) * dir);
  const overshootPct = round((over / amp) * 100);
  let shape;
  if (returns) shape = 'round-trip';
  else if (settle - start < 2) shape = 'step';
  else if (overshootPct > OVERSHOOT_SPRING_PCT) shape = 'spring';
  else {
    const best = new Map();
    for (const [name, f] of SHAPES) {
      let err = 0;
      for (let j = start - 1; j <= settle; j++) err += ((v[j] - v[start - 1]) / (final - v[start - 1]) - f((t[j] - t0) / (t[settle] - t0))) ** 2;
      best.set(name, Math.min(best.get(name) ?? Infinity, err));
    }
    shape = [...best.entries()].sort((a, b) => a[1] - b[1])[0][0];
  }
  // A round trip (a toast in and out) spans several motions: the average speed of the whole series
  // says nothing about any one leg, so it is not judged for jumps.
  const jumps = shape === 'round-trip' ? [] : findJumps(t, v, start, settle, amp, t0, shape);
  return { from: round(v[start - 1], 2), to: round(final, 2), startT: t0, durationMs: round(t[settle] - t0, 0), overshootPct, shape, settled, jumps };
};

export const analyzeElement = (el) => {
  const moves = [];
  for (const c of COLS) {
    const r = analyzeSeries(el.t, c === 'rot' ? unwrap(el[c]) : el[c], EPS[PROP_OF[c]]);
    if (r) moves.push({ prop: PROP_OF[c], ...r });
  }
  return moves.length ? { label: el.label, root: el.root, moves } : null;
};
export const analyzeRecording = (rec) => (rec?.elems ?? []).map(analyzeElement).filter(Boolean);

// 'ease-in' when the curve starts slower than it ends; 'linear'; otherwise 'ok'.
export const easingKind = (e) => {
  if (e === 'linear' || /^linear\(\s*0(?:\s+0%)?\s*,\s*1(?:\s+100%)?\s*\)$/.test(e)) return 'linear';
  if (e === 'ease-in') return 'ease-in';
  const m = e.match(/^cubic-bezier\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)$/);
  if (!m) return 'ok';
  const [x1, y1, x2, y2] = m.slice(1).map(Number);
  if (x1 === y1 && x2 === y2) return 'linear';
  const startSlope = x1 > 0 ? y1 / x1 : Infinity;
  const endSlope = x2 < 1 ? (1 - y2) / (1 - x2) : Infinity;
  return startSlope < 0.5 && endSlope > 1 ? 'ease-in' : 'ok';
};
