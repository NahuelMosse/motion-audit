// Shared by the golden-file test, the three-runs script and the updater.
//
// The rule, the same on every OS:
// - On a recording that is dense (DENSE_MEDIAN_MS / DENSE_MAX_MS, the product's own constants) the golden is exact and no
//   inconclusive row of any kind is allowed.
// - On a sparse recording each expected finding must appear or be replaced by an inconclusive row with its fingerprint, and extra
//   inconclusive rows are tolerated; but every inconclusive row must carry the cadence of the recording it stands on, and that
//   cadence must be sparse. Whether a row is sparse is decided from its cadence only, never from a per-fixture flag.
// - Any other difference fails.
// - MOTION_REQUIRE_DENSE=1 (set in the ubuntu three-runs job, where a slow runner must not turn the whole suite into "everything
//   is tolerated") allows no inconclusive row at all, and the run fails if no recording in it was dense.
import { join } from 'node:path';
import { DENSE_MAX_MS, DENSE_MEDIAN_MS } from '../../skills/motion-audit/scripts/lib/constants.mjs';
import { ROOT } from './cli.mjs';

export { DENSE_MAX_MS, DENSE_MEDIAN_MS };
export const GOLDEN_PATH = join(ROOT, 'test', 'expected-findings.json');
export const REQUIRE_DENSE = Boolean(process.env.MOTION_REQUIRE_DENSE);
export const signature = (report) => report.findings.filter((f) => f.kind !== 'inconclusive').map((f) => `${f.level}|${f.id}|${f.element}`).sort();

export const isDenseCadence = (c) => Boolean(c) && c.median <= DENSE_MEDIAN_MS && c.max <= DENSE_MAX_MS;

// Every cadence a report recorded: the click's frames and every measured motion's.
export const reportCadences = (report) => [
  ...(report.click?.cadence ? [report.click.cadence] : []),
  ...(report.elements ?? []).flatMap((e) => Object.values(e.moments).flatMap((m) => m.motion.flatMap((x) => x.moves.map((mv) => mv.cadence)))),
];
// A report is dense when it recorded something and every recording of it was dense.
export const reportDense = (report) => { const cs = reportCadences(report); return cs.length > 0 && cs.every(isDenseCadence); };

// How many recordings of this process were dense (so a run where none was cannot pass for "exact").
const tally = { reports: 0, dense: 0 };
export const noteRecording = (report) => { tally.reports++; if (reportDense(report)) tally.dense++; };
export const densityTally = () => ({ ...tally });
export const requireSomeDense = () => (REQUIRE_DENSE && tally.reports > 0 && tally.dense === 0 ? [`MOTION_REQUIRE_DENSE is set and none of the ${tally.reports} recordings was dense: this runner is too slow for exact goldens`] : []);

const parts = (sig) => { const [level, id, ...element] = sig.split('|'); return { level, kind: id.split(':')[0], hash: id.split(':')[1], element: element.join('|') }; };

// Compares a report with its golden entry. Returns { findings, exit, standIns, extras, problems }: `findings` is what remains
// once inconclusive rows standing in for an expected finding are replaced by it and extras are set aside; `problems` lists
// every inconclusive row that breaks the rule above.
export const againstGolden = (report, expected, expectedExit) => {
  const rows = report.findings.filter((f) => f.kind === 'inconclusive');
  const actual = report.findings.filter((f) => f.kind !== 'inconclusive').map((f) => `${f.level}|${f.id}|${f.element}`);
  const have = new Set(actual);
  const standIn = new Map();
  for (const e of expected) {
    if (have.has(e)) continue;
    const { hash, element } = parts(e);
    const row = rows.find((f) => f.id.split(':')[1] === hash && f.element === element && !standIn.has(f));
    if (row) standIn.set(row, e);
  }
  const extras = rows.filter((f) => !standIn.has(f));
  const problems = rows.flatMap((f) => {
    const where = `${f.element}: ${f.detail}`;
    if (REQUIRE_DENSE) return [`inconclusive row in a run that requires dense recordings: ${where}`];
    if (!f.cadence) return [`inconclusive row without the cadence of its recording: ${where}`];
    return isDenseCadence(f.cadence) ? [`inconclusive row on a dense recording (median ${f.cadence.median} ms, max ${f.cadence.max} ms): ${where}`] : [];
  });
  const findings = [...actual, ...standIn.values()].sort();
  const lost = [...standIn.values()];
  const exit = lost.length && !expected.some((e) => !lost.includes(e) && e.startsWith('error|')) ? 0 : expectedExit;
  return { findings, exit, standIns: lost, extras, problems };
};
