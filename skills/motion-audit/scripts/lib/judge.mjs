// Turns what was measured on one element into findings. Pure: no browser, no config file.
import { BANDS, EASE_IN_MIN_MS, INCONSISTENT_MIN_GAP_MS, INCONSISTENT_RATIO, LAYOUT_PROPS } from './constants.mjs';
import { animatedMove, easingKind } from './series.mjs';

// The declared duration and easing of the transition that animates `prop`, or null if none does.
export const transitionOf = (tr, prop) => {
  const longhand = (p) => p === prop || prop.startsWith(`${p}-`) || p === 'all';
  const i = tr.properties.findIndex(longhand);
  if (i < 0) return null;
  return { duration: tr.durations[i % tr.durations.length], easing: tr.easings[i % tr.easings.length] };
};

const isLink = (kind) => kind === 'a' || kind === 'link';
const isInput = (kind) => kind === 'input';

const closeToToken = (ms, tokens) => (tokens ?? []).some((x) => Math.abs(x - ms) <= 1);

// Findings for one audited element: [{ kind, element, detail, key, level? }]. `key` identifies the
// finding inside its element and kind (moment, property) so fingerprints survive changed numbers.
// `policy`: { bands, tokens }.
export const judgeElement = (el, policy = {}) => {
  const bands = { ...BANDS, ...policy.bands };
  const out = [];
  const seen = new Set();
  const add = (kind, detail, key, level) => {
    if (seen.has(`${kind}|${key}`)) return;
    seen.add(`${kind}|${key}`);
    out.push({ kind, element: el.label, detail, key, ...(level ? { level } : {}) });
  };
  for (const [moment, d] of Object.entries(el.moments)) {
    if (!d) continue;
    const tr = d.transition ?? el.transition;
    if (moment === 'focus' && d.hiddenUntilHover) { add('hover-only-control', 'revealed by hover only: keyboard focus leaves it invisible', 'focus'); continue; }
    const responds = d.changed.length > 0 || d.pixels;
    if (!responds) {
      if (moment === 'focus') add('no-focus-feedback', 'keyboard focus shows nothing', 'focus');
      else if (moment === 'hover' && !el.selected && !isInput(el.kind)) add('no-feedback', 'hover: nothing visible changes', 'hover', isLink(el.kind) ? 'warning' : undefined);
      else if (moment === 'press' && !isLink(el.kind) && !isInput(el.kind)) add('no-press-feedback', 'press: nothing visible changes', 'press');
      continue;
    }
    const visual = d.changed.filter((p) => !/^outline/.test(p));
    const animated = visual.filter((p) => transitionOf(tr, p)?.duration > 0);
    const measured = d.motion.some((m) => m.moves.some(animatedMove));
    if (moment !== 'focus' && visual.length && !animated.length && !measured) add('snaps', `${moment}: ${visual.join(', ')} change with no transition`, moment);
    for (const p of animated) {
      const { duration, easing } = transitionOf(tr, p);
      const [lo, hi] = bands[moment] ?? [0, Infinity];
      if ((duration < lo || duration > hi) && !closeToToken(duration, policy.tokens?.durations)) add('duration', `${moment}: ${p} ${duration} ms, outside ${lo}-${hi} ms`, `${moment} ${p}`);
      const k = easingKind(easing);
      if (k === 'ease-in') add('ease-in', `${moment}: ${p} eases in (${easing}): the response starts late`, `declared ${p}`);
      if (k === 'linear' && /transform|scale|translate|opacity/.test(p)) add('linear', `${moment}: ${p} moves linearly`, p);
    }
    const layout = animated.filter((p) => LAYOUT_PROPS.test(p));
    const measuredLayout = d.motion.flatMap((e) => e.moves.filter((m) => /^layout/.test(m.prop) && animatedMove(m)).map((m) => `${e.label} ${m.prop}`));
    if (layout.length || measuredLayout.length) add('layout-animated', `${moment}: animates layout (${[...layout, ...measuredLayout].join(', ')}): moves neighbours and costs layout every frame`, moment);
    if (!animated.length) {
      for (const e of d.motion) for (const m of e.moves) {
        if (m.shape === 'linear' && /^(translate|scale|opacity)/.test(m.prop) && animatedMove(m)) add('linear', `${moment}: ${e.label} ${m.prop} moves linearly (measured)`, `measured ${e.label} ${m.prop}`);
      }
    }
    for (const e of d.motion) for (const m of e.moves) {
      if (m.shape === 'ease-in' && m.durationMs > EASE_IN_MIN_MS) add('ease-in', `${moment}: ${e.label} ${m.prop} measured ease-in over ${m.durationMs} ms`, `measured ${e.label}`);
      for (const j of m.jumps) add('jump', `${moment}: ${e.label} ${m.prop} jumps ${j.size} at ${j.atMs} ms`, `${moment} ${e.label} ${m.prop}`);
    }
  }
  for (const d of Object.values(el.moments)) {
    const tr = d?.transition ?? el.transition;
    if (tr.properties.includes('all') && tr.durations.some((x) => x > 0)) {
      add('transition-all', '`transition: all` animates whatever changes, layout included', 'all');
      break;
    }
  }
  if (el.interrupt?.length) add('interrupt-jump', `hover left mid-way: ${el.interrupt.map((j) => `${j.label} ${j.prop}`).join(', ')} jump instead of reversing`, 'hover');
  if (el.reduced?.moves) add('reduced-motion-moves', `with prefers-reduced-motion it still moves (${el.reduced.moves})`, 'press');
  if (el.reduced?.residue) add('reduced-motion-residue', `with prefers-reduced-motion a transform stays after release (${el.reduced.residue})`, 'press');
  return out;
};

// Same kind of control, same moment, different declared durations: no single motion grammar.
export const inconsistencies = (elements, policy = {}) => {
  const groups = new Map();
  for (const el of elements) for (const [moment, d] of Object.entries(el.moments)) {
    if (!d || moment === 'focus') continue;
    const tr = d.transition ?? el.transition;
    const durs = d.changed.map((p) => transitionOf(tr, p)?.duration).filter((x) => x > 0);
    if (!durs.length) continue;
    const key = `${el.kind} ${moment}`;
    if (!groups.has(key)) groups.set(key, new Map());
    const top = Math.max(...durs);
    groups.get(key).set(top, [...(groups.get(key).get(top) ?? []), el.label]);
  }
  const out = [];
  for (const [key, byDur] of groups) {
    const ds = [...byDur.keys()].sort((a, b) => a - b);
    if (ds.length < 2 || ds.at(-1) / ds[0] < INCONSISTENT_RATIO || ds.at(-1) - ds[0] < INCONSISTENT_MIN_GAP_MS) continue;
    if (ds.every((x) => closeToToken(x, policy.tokens?.durations))) continue;
    out.push({ kind: 'inconsistent-duration', element: key, key, detail: ds.map((x) => `${x} ms (${byDur.get(x).slice(0, 2).join(', ')}${byDur.get(x).length > 2 ? ', ...' : ''})`).join(' vs ') });
  }
  return out;
};
