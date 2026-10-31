// Shared by the golden-file test and its updater.
import { join } from 'node:path';
import { ROOT } from './cli.mjs';

export const GOLDEN_PATH = join(ROOT, 'test', 'expected-findings.json');
export const signature = (report) => report.findings.map((f) => `${f.level}|${f.id}|${f.element}`).sort();

// A recording whose frames came at about 60 Hz (median interval at most 20 ms, none over 34 ms) can follow any
// value: an `inconclusive` row from it is a gate that is stuck, never an honest "too sparse". The same rule
// on every platform; only the recordings that really were sparse may end in an inconclusive row.
export const DENSE_MEDIAN_MS = 20;
export const DENSE_MAX_MS = 34;
const dense = (c) => Boolean(c) && c.median <= DENSE_MEDIAN_MS && c.max <= DENSE_MAX_MS;

// The cadences of the recordings an inconclusive row (named by its element) stands on.
const cadencesOf = (report, element) => {
  if (element.startsWith('click ')) return [report.click?.cadence];
  const moves = report.elements.filter((e) => e.label === element).flatMap((e) => Object.values(e.moments).flatMap((m) => m.motion.flatMap((x) => x.moves)));
  return moves.map((m) => m.cadence);
};
export const denseInconclusive = (report) => report.findings
  .filter((f) => f.kind === 'inconclusive')
  .filter((f) => { const c = cadencesOf(report, f.element); return c.length > 0 && c.every(dense); })
  .map((f) => `${f.element}: ${f.detail}`);

// An expected finding is met by itself or by an `inconclusive` row with the same fingerprint (the frames were
// too sparse to decide it), on every platform. Returns the actual signature with such rows replaced by the
// finding they stand for, and the exit code that follows from what remains.
const parts = (sig) => { const [level, id, ...element] = sig.split('|'); return { level, kind: id.split(':')[0], hash: id.split(':')[1], element: element.join('|') }; };
export const againstGolden = (actual, expected, expectedExit) => {
  const have = new Set(actual);
  const standIn = new Map();
  for (const e of expected) {
    if (have.has(e)) continue;
    const { hash, element } = parts(e);
    const row = actual.find((a) => { const p = parts(a); return p.kind === 'inconclusive' && p.hash === hash && p.element === element; });
    if (row) standIn.set(row, e);
  }
  const findings = actual.map((a) => standIn.get(a) ?? a).sort();
  const lost = expected.filter((e) => [...standIn.values()].includes(e));
  const exit = lost.length && !expected.some((e) => !lost.includes(e) && e.startsWith('error|')) ? 0 : expectedExit;
  return { findings, exit, inconclusive: lost };
};
