// Synthetic traces for the pure analysis tests.
export const FRAME = 1000 / 60;

export const bezier = (x1, y1, x2, y2) => {
  const at = (s, a, b) => 3 * (1 - s) ** 2 * s * a + 3 * (1 - s) * s ** 2 * b + s ** 3;
  return (u) => {
    if (u <= 0) return 0;
    if (u >= 1) return 1;
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (at(mid, x1, x2) < u) lo = mid; else hi = mid;
    }
    return at((lo + hi) / 2, y1, y2);
  };
};

export const EASINGS = {
  'strong ease-out': bezier(0.23, 1, 0.32, 1),
  'tailwind default': bezier(0.4, 0, 0.2, 1),
  'ease-in-out': bezier(0.42, 0, 0.58, 1),
  'material standard': bezier(0.2, 0, 0, 1),
};

export const prng = (seed) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// Sample times from `from` to `to`, each step a random whole number of frames in [minFrames, maxFrames]
// plus a little jitter: what the tracer sees when the main thread is busy or the CPU is throttled.
export const irregularTimes = (rand, from, to, minFrames, maxFrames) => {
  const out = [];
  let t = from;
  while (t < to) {
    out.push(t);
    t += FRAME * (minFrames + Math.floor(rand() * (maxFrames - minFrames + 1))) + (rand() - 0.5) * 3;
  }
  out.push(t);
  return out;
};

// A tracer element record with only translateX moving.
export const txElement = (t, tx, extra = {}) => {
  const flat = (x) => t.map(() => x);
  return { id: 1, parent: 0, label: 'div.panel', root: false, t, left: flat(0), top: flat(0), width: flat(100), height: flat(100), opacity: flat(1), tx, ty: flat(0), sx: flat(1), sy: flat(1), rot: flat(0), ow: flat(100), oh: flat(100), ...extra };
};
